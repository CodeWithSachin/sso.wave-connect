-- Migration 000006: Identity Providers
-- Source: database-schema-v2.sql, Section 4 (Lines 488-541)
-- Tables: identity_providers, federated_identities + triggers

CREATE TABLE identity_providers (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255)    NOT NULL,
    type                idp_type        NOT NULL,
    status              idp_status      NOT NULL DEFAULT 'pending_verification',
    domain_hint         VARCHAR(255),
    saml_entity_id          TEXT,
    saml_sso_url            TEXT,
    saml_slo_url            TEXT,
    saml_certificate        TEXT,
    saml_signing_algorithm  VARCHAR(20)  DEFAULT 'RSA-SHA256',
    saml_name_id_format     VARCHAR(100) DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    oidc_issuer             TEXT,
    oidc_client_id          VARCHAR(255),
    oidc_client_secret_enc  TEXT,
    oidc_discovery_url      TEXT,
    oidc_scopes             TEXT[]       DEFAULT '{openid, profile, email}',
    attribute_mapping   JSONB           NOT NULL DEFAULT '{"email":"email","firstName":"first_name","lastName":"last_name","displayName":"display_name","groups":"groups"}',
    jit_provisioning    BOOLEAN         NOT NULL DEFAULT TRUE,
    auto_sync_groups    BOOLEAN         NOT NULL DEFAULT FALSE,
    default_role        membership_role NOT NULL DEFAULT 'member',
    metadata            JSONB           NOT NULL DEFAULT '{}',
    version             INTEGER         NOT NULL DEFAULT 1,       -- [FIX-3]
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT uq_idp_tenant_domain UNIQUE (tenant_id, domain_hint)  -- [FIX-2] tenant_id FIRST
);

CREATE TRIGGER trg_identity_providers_updated_at
    BEFORE UPDATE ON identity_providers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


CREATE TABLE federated_identities (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idp_id              UUID            NOT NULL REFERENCES identity_providers(id) ON DELETE CASCADE,
    external_user_id    VARCHAR(500)    NOT NULL,
    external_email      CITEXT,
    external_username   VARCHAR(255),
    profile_data        JSONB           NOT NULL DEFAULT '{}',
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_federated_identity UNIQUE (idp_id, external_user_id)
);

CREATE TRIGGER trg_federated_identities_updated_at
    BEFORE UPDATE ON federated_identities
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
