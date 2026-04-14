-- Migration 000006 DOWN: Drop identity provider tables

DROP TRIGGER IF EXISTS trg_federated_identities_updated_at ON federated_identities;
DROP TRIGGER IF EXISTS trg_identity_providers_updated_at ON identity_providers;

DROP TABLE IF EXISTS federated_identities;
DROP TABLE IF EXISTS identity_providers;
