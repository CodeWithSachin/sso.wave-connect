-- Rollback: Remove seeded first-party OAuth2 clients
DELETE FROM oauth_clients WHERE client_id IN ('admin-console', 'login-portal');
