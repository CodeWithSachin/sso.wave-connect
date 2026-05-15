package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrIdPNotFound is returned when no row matches the requested IdP id, or
// when the row is soft-deleted / not active. sso-service treats these as
// equivalent for the OAuth flow: the IdP either exists and is usable, or
// the flow aborts.
var ErrIdPNotFound = errors.New("identity provider not found")

// IdentityProvider is the read-only projection sso-service uses to drive
// external IdP federation. Writes to this table are owned by admin-api;
// sso-service only reads.
//
// Field selection here is the union of OIDC + SAML usage in Slices 2 & 4.
// SAML-only fields stay populated as empty strings for OIDC rows, and vice
// versa — the type column dispatches.
type IdentityProvider struct {
	ID                  uuid.UUID
	TenantID            uuid.UUID
	Name                string
	Type                string // 'saml' | 'oidc' | 'social_*'
	Status              string
	DomainHint          string

	// OIDC config
	OIDCIssuer          string
	OIDCClientID        string
	OIDCClientSecretEnc string // ciphertext; decrypt via SecretsService
	OIDCDiscoveryURL    string
	OIDCScopes          []string

	// SAML config (populated for Slice 4)
	SAMLEntityID        string
	SAMLSSOURL          string
	SAMLSLOURL          string
	SAMLCertificate     string

	// Common
	AttributeMapping    map[string]string
	JITProvisioning     bool
	DefaultRole         string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// IdentityProviderRepository is sso-service's read-only handle on
// `identity_providers`. The table is owned by admin-api (writes go through
// IdpService there); we never write from here.
type IdentityProviderRepository struct {
	pool *pgxpool.Pool
}

func NewIdentityProviderRepository(pool *pgxpool.Pool) *IdentityProviderRepository {
	return &IdentityProviderRepository{pool: pool}
}

// GetActiveByID fetches a single IdP by UUID. Returns ErrIdPNotFound if the
// row is missing, soft-deleted, or not in the `active` status.
func (r *IdentityProviderRepository) GetActiveByID(ctx context.Context, id uuid.UUID) (*IdentityProvider, error) {
	const q = `
		SELECT
			id, tenant_id, name, type::text, status::text,
			COALESCE(domain_hint, ''),
			COALESCE(oidc_issuer, ''),
			COALESCE(oidc_client_id, ''),
			COALESCE(oidc_client_secret_enc, ''),
			COALESCE(oidc_discovery_url, ''),
			COALESCE(oidc_scopes, ARRAY[]::text[]),
			COALESCE(saml_entity_id, ''),
			COALESCE(saml_sso_url, ''),
			COALESCE(saml_slo_url, ''),
			COALESCE(saml_certificate, ''),
			COALESCE(attribute_mapping, '{}'::jsonb)::text,
			jit_provisioning,
			COALESCE(default_role::text, 'member'),
			created_at, updated_at
		FROM identity_providers
		WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
	`
	idp := &IdentityProvider{}
	var attributeMappingJSON string
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&idp.ID, &idp.TenantID, &idp.Name, &idp.Type, &idp.Status,
		&idp.DomainHint,
		&idp.OIDCIssuer, &idp.OIDCClientID, &idp.OIDCClientSecretEnc,
		&idp.OIDCDiscoveryURL, &idp.OIDCScopes,
		&idp.SAMLEntityID, &idp.SAMLSSOURL, &idp.SAMLSLOURL, &idp.SAMLCertificate,
		&attributeMappingJSON,
		&idp.JITProvisioning, &idp.DefaultRole,
		&idp.CreatedAt, &idp.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrIdPNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get idp by id: %w", err)
	}
	if attributeMappingJSON != "" {
		_ = json.Unmarshal([]byte(attributeMappingJSON), &idp.AttributeMapping)
	}
	return idp, nil
}
