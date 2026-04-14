package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

type SessionService struct {
	repo       *repository.SessionRepository
	publisher  event.Publisher
	log        zerolog.Logger
	sessionTTL time.Duration
}

func NewSessionService(
	repo *repository.SessionRepository,
	publisher event.Publisher,
	log zerolog.Logger,
	sessionTTL time.Duration,
) *SessionService {
	return &SessionService{
		repo:       repo,
		publisher:  publisher,
		log:        log.With().Str("component", "session_service").Logger(),
		sessionTTL: sessionTTL,
	}
}

func (s *SessionService) Create(ctx context.Context, userID, tenantID uuid.UUID, ip, ua string) (*model.Session, error) {
	now := time.Now().UTC()

	tokenHash, err := model.GenerateTokenHash()
	if err != nil {
		return nil, fmt.Errorf("generate token hash: %w", err)
	}

	sess := &model.Session{
		ID:             uuid.New(),
		UserID:         userID,
		TenantID:       tenantID,
		TokenHash:      tokenHash,
		Status:         "active",
		IPAddress:      ip,
		UserAgent:      ua,
		LastActivityAt: now,
		CreatedAt:      now,
		ExpiresAt:      now.Add(s.sessionTTL),
	}

	if err := s.repo.Create(ctx, sess); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	_ = s.publisher.Publish(ctx, event.Event{
		Type:      event.TypeSessionCreated,
		Timestamp: now,
		TenantID:  tenantID,
		ActorID:   userID,
		Payload: event.SessionCreatedPayload{
			SessionID: sess.ID,
			UserID:    userID,
			IPAddress: ip,
		},
	})

	return sess, nil
}

func (s *SessionService) ListForUser(ctx context.Context, userID, tenantID uuid.UUID) ([]model.Session, error) {
	return s.repo.ListByUser(ctx, userID, tenantID)
}

func (s *SessionService) Revoke(ctx context.Context, sessionID, userID, tenantID uuid.UUID) error {
	sess, err := s.repo.GetByID(ctx, sessionID)
	if err != nil {
		return err
	}

	if sess.UserID != userID || sess.TenantID != tenantID {
		return repository.ErrSessionNotFound
	}

	if err := s.repo.Revoke(ctx, sessionID, "user_initiated"); err != nil {
		return err
	}

	_ = s.publisher.Publish(ctx, event.Event{
		Type:      event.TypeSessionRevoked,
		Timestamp: time.Now().UTC(),
		TenantID:  tenantID,
		ActorID:   userID,
		Payload: event.SessionRevokedPayload{
			SessionID: sessionID,
			UserID:    userID,
			Reason:    "user_initiated",
		},
	})

	return nil
}
