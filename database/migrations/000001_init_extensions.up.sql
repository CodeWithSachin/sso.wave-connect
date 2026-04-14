-- Migration 000001: Extensions & Prerequisites
-- Source: database-schema-v2.sql, Section 0 (Lines 43-70)
-- Extensions: pgcrypto, citext, btree_gist, pg_trgm
-- Functions: typeid_to_uuid(), trigger_set_updated_at()

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 0.1 SHARED DOMAIN TYPES
-- ============================================================================
-- [FIX-1] Store native UUID, expose TypeID via generated column.
-- This gives us 16-byte PKs for index performance + human-readable TypeID for APIs.

-- Helper: extract UUIDv7 from a TypeID string (for API input validation)
CREATE OR REPLACE FUNCTION typeid_to_uuid(tid TEXT) RETURNS UUID AS $$
BEGIN
    -- In production, use the pg-typeid extension or decode Crockford base32 -> UUID
    -- This is a placeholder showing the pattern
    RETURN gen_random_uuid(); -- Replace with actual Crockford base32 decode
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
