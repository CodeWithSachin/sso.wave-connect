package event

import (
	"time"

	"github.com/google/uuid"
)

const (
	TypeUserCreated    = "user.created"
	TypeUserLogin      = "user.login"
	TypeSessionCreated = "session.created"
	TypeSessionRevoked = "session.revoked"
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
