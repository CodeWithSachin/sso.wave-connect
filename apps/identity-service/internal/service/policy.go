package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

const policyCacheTTL = 30 * time.Second
const policyCachePrefix = "tenant_policy:"

type PolicyService struct {
	repo *repository.PolicyRepository
	rdb  *redis.Client
	log  zerolog.Logger
}

func NewPolicyService(repo *repository.PolicyRepository, rdb *redis.Client, log zerolog.Logger) *PolicyService {
	return &PolicyService{
		repo: repo,
		rdb:  rdb,
		log:  log.With().Str("component", "policy_service").Logger(),
	}
}

// GetPolicy returns the tenant's policy, checking Redis cache first.
// If no policy row exists, returns sensible defaults.
func (s *PolicyService) GetPolicy(ctx context.Context, tenantID uuid.UUID) (*model.TenantPolicy, error) {
	cacheKey := policyCachePrefix + tenantID.String()

	// 1. Check Redis cache
	cached, err := s.rdb.Get(ctx, cacheKey).Bytes()
	if err == nil {
		var p model.TenantPolicy
		if json.Unmarshal(cached, &p) == nil {
			return &p, nil
		}
	}

	// 2. Fetch from DB
	p, err := s.repo.GetByTenantID(ctx, tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrPolicyNotFound) {
			return model.DefaultPolicy(tenantID), nil
		}
		return nil, fmt.Errorf("get policy: %w", err)
	}

	// 3. Cache result
	if data, err := json.Marshal(p); err == nil {
		if cacheErr := s.rdb.Set(ctx, cacheKey, data, policyCacheTTL).Err(); cacheErr != nil {
			s.log.Warn().Err(cacheErr).Msg("failed to cache tenant policy")
		}
	}

	return p, nil
}

// InvalidateCache removes the cached policy for a tenant.
func (s *PolicyService) InvalidateCache(ctx context.Context, tenantID uuid.UUID) {
	cacheKey := policyCachePrefix + tenantID.String()
	s.rdb.Del(ctx, cacheKey)
}
