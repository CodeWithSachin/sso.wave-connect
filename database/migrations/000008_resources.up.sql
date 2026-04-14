-- Migration 000008: Resource Hierarchy
-- Source: database-schema-v2.sql, Section 6 (Lines 600-684)
-- Tables: folders, documents, api_resources, feature_flags + triggers

CREATE TABLE folders (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id           UUID            REFERENCES folders(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    path                TEXT            NOT NULL DEFAULT '/',
    depth               SMALLINT        NOT NULL DEFAULT 0,
    owner_user_id       UUID            REFERENCES users(id) ON DELETE SET NULL,
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_folders_tenant_path UNIQUE (tenant_id, path),      -- [FIX-2]
    CONSTRAINT ck_folder_depth CHECK (depth BETWEEN 0 AND 20)
);

CREATE TRIGGER trg_folders_updated_at
    BEFORE UPDATE ON folders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


CREATE TABLE documents (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    folder_id           UUID            REFERENCES folders(id) ON DELETE SET NULL,
    owner_user_id       UUID            NOT NULL REFERENCES users(id),
    title               VARCHAR(500)    NOT NULL,
    content_type        VARCHAR(100),
    size_bytes          BIGINT          DEFAULT 0,
    storage_key         TEXT,
    version             INTEGER         NOT NULL DEFAULT 1,       -- [FIX-3] Document version
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT ck_doc_size CHECK (size_bytes >= 0)
);

CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


CREATE TABLE api_resources (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    application_id      UUID            NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    identifier          VARCHAR(500)    NOT NULL,
    description         TEXT,
    available_scopes    TEXT[]          NOT NULL DEFAULT '{}',
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_api_resources_identifier UNIQUE (tenant_id, identifier) -- [FIX-2]
);

CREATE TRIGGER trg_api_resources_updated_at
    BEFORE UPDATE ON api_resources
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


CREATE TABLE feature_flags (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key                 VARCHAR(100)    NOT NULL,
    description         TEXT,
    is_enabled          BOOLEAN         NOT NULL DEFAULT FALSE,
    rollout_percentage  SMALLINT        DEFAULT 0,
    allowed_user_ids    UUID[]          DEFAULT '{}',
    allowed_group_ids   UUID[]          DEFAULT '{}',
    metadata            JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_feature_flags_key UNIQUE (tenant_id, key),         -- [FIX-2]
    CONSTRAINT ck_rollout_pct CHECK (rollout_percentage BETWEEN 0 AND 100)
);

CREATE TRIGGER trg_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
