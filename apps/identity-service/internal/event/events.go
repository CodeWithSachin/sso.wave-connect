package event

import (
	"time"

	"github.com/google/uuid"
)

const (
	TypeUserCreated      = "user.created"
	TypeUserUpdated      = "user.updated"
	TypeUserDeleted      = "user.deleted"
	TypeUserLogin        = "user.login"
	TypeUserMfaEnrolled  = "user.mfa_enrolled"
	TypeMembershipCreated = "membership.created"
	TypeMembershipDeleted = "membership.deleted"
	TypeGroupCreated     = "group.created"
	TypeGroupUpdated     = "group.updated"
	TypeGroupMemberAdded = "group.member_added"
	TypeGroupMemberRemoved = "group.member_removed"
	TypePermissionGranted = "permission.granted"
	TypePermissionRevoked = "permission.revoked"
	TypeSessionCreated   = "session.created"
	TypeSessionRevoked   = "session.revoked"
	// Phase 2: domain ownership events.
	TypeTenantDomainAdded    = "tenant.domain.added"
	TypeTenantDomainVerified = "tenant.domain.verified"
	TypeTenantDomainExpired  = "tenant.domain.expired"
	// Phase 4: post-claim user migration events.
	TypeUserMigrationOffered    = "user.migration.offered"
	TypeUserMigrationAccepted   = "user.migration.accepted"
	TypeUserMigrationDeclined   = "user.migration.declined"
	TypeUserMigrationForceMoved = "user.migration.force_moved"
)

type Event struct {
	Type      string      `json:"type"`
	Timestamp time.Time   `json:"timestamp"`
	TenantID  uuid.UUID   `json:"tenant_id"`
	ActorID   uuid.UUID   `json:"actor_id"`
	Payload   interface{} `json:"payload"`
}

type UserCreatedPayload struct {
	UserID      uuid.UUID `json:"user_id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
}

type UserLoginPayload struct {
	UserID    uuid.UUID `json:"user_id"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
}

// TenantDomainVerifiedPayload is emitted by DomainVerifyService after a
// `tenant_domains` row flips to status='verified'. Phase 4's post-claim
// migration worker subscribes to this to find consumer users on the
// newly-claimed domain and offer them migration.
type TenantDomainVerifiedPayload struct {
	TenantID   uuid.UUID `json:"tenant_id"`
	DomainID   uuid.UUID `json:"domain_id"`
	Domain     string    `json:"domain"`
	VerifiedAt time.Time `json:"verified_at"`
}

// TenantDomainAddedPayload is emitted when a pending claim is created
// (either at org signup or via the post-signup add-domain endpoint).
type TenantDomainAddedPayload struct {
	TenantID  uuid.UUID `json:"tenant_id"`
	DomainID  uuid.UUID `json:"domain_id"`
	Domain    string    `json:"domain"`
	CreatedBy uuid.UUID `json:"created_by"`
}

type SessionCreatedPayload struct {
	SessionID uuid.UUID `json:"session_id"`
	UserID    uuid.UUID `json:"user_id"`
	IPAddress string    `json:"ip_address"`
}

type SessionRevokedPayload struct {
	SessionID uuid.UUID `json:"session_id"`
	UserID    uuid.UUID `json:"user_id"`
	Reason    string    `json:"reason"`
}

// UserMigrationOfferedPayload is emitted when the migration worker creates a
// new migration offer row for a consumer user on a freshly-verified domain.
type UserMigrationOfferedPayload struct {
	MigrationID  uuid.UUID `json:"migration_id"`
	UserID       uuid.UUID `json:"user_id"`
	Email        string    `json:"email"`
	FromTenantID uuid.UUID `json:"from_tenant_id"`
	ToTenantID   uuid.UUID `json:"to_tenant_id"`
	Domain       string    `json:"domain"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// UserMigrationResolvedPayload is emitted on accept/decline/force_moved. One
// shape covers all three with `Resolution` as the discriminator so downstream
// consumers can filter on a single field.
type UserMigrationResolvedPayload struct {
	MigrationID  uuid.UUID `json:"migration_id"`
	UserID       uuid.UUID `json:"user_id"`
	FromTenantID uuid.UUID `json:"from_tenant_id"`
	ToTenantID   uuid.UUID `json:"to_tenant_id"`
	Domain       string    `json:"domain"`
	Resolution   string    `json:"resolution"` // accepted | declined | force_moved
	ResolvedAt   time.Time `json:"resolved_at"`
}
