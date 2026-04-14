-- Migration 000007: Groups & Directory
-- Source: database-schema-v2.sql, Section 5 (Lines 548-592)
-- Tables: groups, group_memberships, group_nesting + triggers + constraints

CREATE TABLE groups (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    slug                VARCHAR(255)    NOT NULL,
    description         TEXT,
    is_managed          BOOLEAN         NOT NULL DEFAULT FALSE,
    source              VARCHAR(50)     DEFAULT 'manual',
    external_id         VARCHAR(500),
    metadata            JSONB           NOT NULL DEFAULT '{}',
    version             INTEGER         NOT NULL DEFAULT 1,       -- [FIX-3]
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_groups_tenant_slug UNIQUE (tenant_id, slug),       -- [FIX-2]
    CONSTRAINT uq_groups_external_id UNIQUE (tenant_id, external_id) -- [FIX-2]
);

CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


CREATE TABLE group_memberships (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id            UUID            NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role                VARCHAR(20)     NOT NULL DEFAULT 'member',
    source              VARCHAR(50)     DEFAULT 'manual',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_group_memberships UNIQUE (group_id, user_id)
);


CREATE TABLE group_nesting (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_group_id     UUID            NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    child_group_id      UUID            NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_group_nesting UNIQUE (parent_group_id, child_group_id),
    CONSTRAINT ck_no_self_nesting CHECK (parent_group_id != child_group_id)
);
