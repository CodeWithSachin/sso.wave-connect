-- Migration 000001 DOWN: Drop functions and extensions in reverse order

DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS typeid_to_uuid(TEXT) CASCADE;

DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "btree_gist";
DROP EXTENSION IF EXISTS "citext";
DROP EXTENSION IF EXISTS "pgcrypto";
