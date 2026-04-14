-- SSO Platform — Dev Database Initialization
-- This runs on first container creation only

-- Create the OpenFGA database
CREATE DATABASE openfga;

-- Create application role
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_readwrite') THEN
    CREATE ROLE app_readwrite LOGIN PASSWORD 'dev';
  END IF;
END $$;

-- Grant permissions on sso_dev
GRANT ALL PRIVILEGES ON DATABASE sso_dev TO app_readwrite;

-- Create extensions in sso_dev
\c sso_dev
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_readwrite;
