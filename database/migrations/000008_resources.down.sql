-- Migration 000008 DOWN: Drop resource hierarchy tables

DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON feature_flags;
DROP TRIGGER IF EXISTS trg_api_resources_updated_at ON api_resources;
DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
DROP TRIGGER IF EXISTS trg_folders_updated_at ON folders;

DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS api_resources;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS folders;
