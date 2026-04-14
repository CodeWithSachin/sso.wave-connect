-- Migration 000005 DOWN: Drop OAuth2 tables

DROP TRIGGER IF EXISTS trg_user_consents_updated_at ON user_consents;
DROP TRIGGER IF EXISTS trg_oauth_clients_updated_at ON oauth_clients;

DROP TABLE IF EXISTS refresh_token_families;
DROP TABLE IF EXISTS token_deny_list;
DROP TABLE IF EXISTS user_consents;
DROP TABLE IF EXISTS oauth_client_secrets;
DROP TABLE IF EXISTS oauth_clients;
