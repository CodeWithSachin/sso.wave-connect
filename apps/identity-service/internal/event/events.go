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
