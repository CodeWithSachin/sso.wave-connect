variable "aws_region" {
  default = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  default     = "dev"
}
