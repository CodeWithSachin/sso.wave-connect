# SSO Platform — Infrastructure as Code
# Provider: AWS (adaptable to GCP/Azure)

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "sso-platform-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# --- VPC ---
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "sso-platform-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = var.environment != "prod"

  tags = local.common_tags
}

# --- EKS Cluster ---
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "sso-platform-${var.environment}"
  cluster_version = "1.31"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  eks_managed_node_groups = {
    go_services = {
      instance_types = ["c7g.large"]    # ARM Graviton for Go
      min_size       = var.environment == "prod" ? 5 : 1
      max_size       = var.environment == "prod" ? 20 : 3
      desired_size   = var.environment == "prod" ? 5 : 1
    }
    nestjs_services = {
      instance_types = ["m7g.large"]    # ARM Graviton for Node.js
      min_size       = var.environment == "prod" ? 3 : 1
      max_size       = var.environment == "prod" ? 10 : 2
      desired_size   = var.environment == "prod" ? 3 : 1
    }
  }

  tags = local.common_tags
}

# --- RDS PostgreSQL ---
module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "sso-platform-${var.environment}"
  engine     = "postgres"
  engine_version = "16.4"
  instance_class = var.environment == "prod" ? "db.r7g.xlarge" : "db.t4g.micro"

  allocated_storage     = var.environment == "prod" ? 100 : 20
  max_allocated_storage = var.environment == "prod" ? 500 : 50

  db_name  = "sso_${var.environment}"
  username = "sso_admin"

  multi_az               = var.environment == "prod"
  create_db_subnet_group = true
  subnet_ids             = module.vpc.private_subnets
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Read replicas for prod
  create_db_instance_read_replicas = var.environment == "prod" ? 2 : 0

  tags = local.common_tags
}

# --- ElastiCache Redis ---
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "sso-${var.environment}"
  description          = "SSO Platform Redis"
  node_type            = var.environment == "prod" ? "cache.r7g.large" : "cache.t4g.micro"
  num_cache_clusters   = var.environment == "prod" ? 6 : 1

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = local.common_tags
}

# --- Security Groups ---
resource "aws_security_group" "rds" {
  name_prefix = "sso-rds-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "sso-redis-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "sso-redis-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

# --- Locals ---
locals {
  common_tags = {
    Project     = "sso-platform"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
