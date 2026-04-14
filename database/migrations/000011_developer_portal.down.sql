-- Migration 000011 DOWN: Drop developer portal tables

DROP TABLE IF EXISTS scim_sync_log;
DROP TABLE IF EXISTS scim_tokens;
DROP TABLE IF EXISTS api_key_usage;
DROP TABLE IF EXISTS api_keys;
