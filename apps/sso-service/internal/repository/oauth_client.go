package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/model"
)

var ErrClientNotFound = errors.New("oauth client not found")

type OAuthClientRepository struct {
	pool *pgxpool.Pool
}

func NewOAuthClientRepository(pool *pgxpool.Pool) *OAuthClientRepository {
	return &OAuthClientRepository{pool: pool}
}

func (r *OAuthClientRepository) GetByClientID(ctx context.Context, clientID string) (*model.OAuthClient, error) {
	const q = `SELECT id, tenant_id, client_id, client_secret_hash, name, redirect_uris,
		post_logout_redirect_uris, allowed_grant_types, allowed_scopes,
		token_endpoint_auth_method, access_token_ttl_seconds, refresh_token_ttl_seconds,
		id_token_ttl_seconds, is_first_party, is_public, require_pkce, require_consent,
		is_active, metadata, created_at, updated_at
		FROM oauth_clients WHERE client_id = $1`

	c := &model.OAuthClient{}
	err := r.pool.QueryRow(ctx, q, clientID).Scan(
		&c.ID, &c.TenantID, &c.ClientID, &c.ClientSecretHash, &c.Name,
		&c.RedirectURIs, &c.PostLogoutRedirectURIs, &c.AllowedGrantTypes,
		&c.AllowedScopes, &c.TokenEndpointAuthMethod, &c.AccessTokenTTLSeconds,
		&c.RefreshTokenTTLSeconds, &c.IDTokenTTLSeconds, &c.IsFirstParty,
		&c.IsPublic, &c.RequirePKCE, &c.RequireConsent, &c.IsActive,
		&c.Metadata, &c.CreatedAt, &c.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrClientNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get oauth client by client_id: %w", err)
	}
	return c, nil
}

func (r *OAuthClientRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.OAuthClient, error) {
	const q = `SELECT id, tenant_id, client_id, client_secret_hash, name, redirect_uris,
		post_logout_redirect_uris, allowed_grant_types, allowed_scopes,
		token_endpoint_auth_method, access_token_ttl_seconds, refresh_token_ttl_seconds,
		id_token_ttl_seconds, is_first_party, is_public, require_pkce, require_consent,
		is_active, metadata, created_at, updated_at
		FROM oauth_clients WHERE id = $1`

	c := &model.OAuthClient{}
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&c.ID, &c.TenantID, &c.ClientID, &c.ClientSecretHash, &c.Name,
		&c.RedirectURIs, &c.PostLogoutRedirectURIs, &c.AllowedGrantTypes,
		&c.AllowedScopes, &c.TokenEndpointAuthMethod, &c.AccessTokenTTLSeconds,
		&c.RefreshTokenTTLSeconds, &c.IDTokenTTLSeconds, &c.IsFirstParty,
		&c.IsPublic, &c.RequirePKCE, &c.RequireConsent, &c.IsActive,
		&c.Metadata, &c.CreatedAt, &c.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrClientNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get oauth client by id: %w", err)
	}
	return c, nil
}
