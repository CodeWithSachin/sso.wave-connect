package service

import (
	"context"
	"fmt"

	openfga "github.com/openfga/go-sdk/client"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/model"
	ssonats "github.com/wave-connect/sso-platform/libs/nats"
)

// AuthzService wraps the OpenFGA client with caching and NATS event publishing.
type AuthzService struct {
	fga   *openfga.OpenFgaClient
	cache *CacheService
	nats  *ssonats.Client // optional: nil if NATS unavailable
	log   zerolog.Logger
}

// NewAuthzService creates a new authorization service.
func NewAuthzService(fga *openfga.OpenFgaClient, cache *CacheService, nats *ssonats.Client, log zerolog.Logger) *AuthzService {
	return &AuthzService{
		fga:   fga,
		cache: cache,
		nats:  nats,
		log:   log.With().Str("component", "authz-service").Logger(),
	}
}

// Check performs a single permission check with caching.
func (s *AuthzService) Check(ctx context.Context, req model.CheckRequest) (bool, error) {
	// Try cache first
	cacheKey := fmt.Sprintf("check:%s:%s:%s", req.User, req.Relation, req.Object)
	if cached, ok := s.cache.Get(ctx, cacheKey); ok {
		return cached, nil
	}

	body := openfga.ClientCheckRequest{
		User:     req.User,
		Relation: req.Relation,
		Object:   req.Object,
	}

	resp, err := s.fga.Check(ctx).Body(body).Execute()
	if err != nil {
		s.log.Error().Err(err).
			Str("user", req.User).
			Str("relation", req.Relation).
			Str("object", req.Object).
			Msg("OpenFGA check failed")
		return false, fmt.Errorf("openfga check: %w", err)
	}

	allowed := resp.GetAllowed()

	// Cache the result
	s.cache.Set(ctx, cacheKey, allowed)

	return allowed, nil
}

// BatchCheck performs multiple permission checks.
func (s *AuthzService) BatchCheck(ctx context.Context, checks []model.CheckRequest) ([]bool, error) {
	results := make([]bool, len(checks))

	// Check cache for each, collect misses
	type miss struct {
		index int
		req   model.CheckRequest
	}
	var misses []miss

	for i, req := range checks {
		cacheKey := fmt.Sprintf("check:%s:%s:%s", req.User, req.Relation, req.Object)
		if cached, ok := s.cache.Get(ctx, cacheKey); ok {
			results[i] = cached
		} else {
			misses = append(misses, miss{index: i, req: req})
		}
	}

	if len(misses) == 0 {
		return results, nil
	}

	// Build batch request for cache misses with correlation IDs
	batchItems := make([]openfga.ClientBatchCheckItem, len(misses))
	correlationMap := make(map[string]int, len(misses)) // correlationID -> misses index
	for i, m := range misses {
		corrID := fmt.Sprintf("c%d", i)
		batchItems[i] = openfga.ClientBatchCheckItem{
			User:          m.req.User,
			Relation:      m.req.Relation,
			Object:        m.req.Object,
			CorrelationId: corrID,
		}
		correlationMap[corrID] = i
	}

	batchReq := openfga.ClientBatchCheckRequest{Checks: batchItems}
	resp, err := s.fga.BatchCheck(ctx).Body(batchReq).Execute()
	if err != nil {
		s.log.Error().Err(err).Int("count", len(misses)).Msg("OpenFGA batch check failed")
		return nil, fmt.Errorf("openfga batch check: %w", err)
	}

	for corrID, r := range resp.GetResult() {
		missIdx, ok := correlationMap[corrID]
		if !ok {
			continue
		}
		allowed := r.GetAllowed()
		idx := misses[missIdx].index
		results[idx] = allowed

		m := misses[missIdx].req
		cacheKey := fmt.Sprintf("check:%s:%s:%s", m.User, m.Relation, m.Object)
		s.cache.Set(ctx, cacheKey, allowed)
	}

	return results, nil
}

// WriteTuples writes relationship tuples to OpenFGA.
func (s *AuthzService) WriteTuples(ctx context.Context, writes []model.TupleWrite) error {
	if len(writes) == 0 {
		return nil
	}

	body := openfga.ClientWriteRequest{}
	tuples := make([]openfga.ClientTupleKey, len(writes))
	for i, w := range writes {
		tuples[i] = openfga.ClientTupleKey{
			User:     w.User,
			Relation: w.Relation,
			Object:   w.Object,
		}
	}
	body.Writes = tuples

	_, err := s.fga.Write(ctx).Body(body).Execute()
	if err != nil {
		s.log.Error().Err(err).Int("count", len(writes)).Msg("OpenFGA write failed")
		return fmt.Errorf("openfga write: %w", err)
	}

	// Invalidate related cache entries locally + broadcast via NATS
	for _, w := range writes {
		cacheKey := fmt.Sprintf("check:%s:%s:%s", w.User, w.Relation, w.Object)
		s.cache.Delete(ctx, cacheKey)
		s.publishCacheInvalidation(w.User, w.Relation, w.Object)
	}

	return nil
}

// DeleteTuples removes relationship tuples from OpenFGA.
func (s *AuthzService) DeleteTuples(ctx context.Context, deletes []model.TupleWrite) error {
	if len(deletes) == 0 {
		return nil
	}

	body := openfga.ClientWriteRequest{}
	tuples := make([]openfga.ClientTupleKeyWithoutCondition, len(deletes))
	for i, d := range deletes {
		tuples[i] = openfga.ClientTupleKeyWithoutCondition{
			User:     d.User,
			Relation: d.Relation,
			Object:   d.Object,
		}
	}
	body.Deletes = tuples

	_, err := s.fga.Write(ctx).Body(body).Execute()
	if err != nil {
		s.log.Error().Err(err).Int("count", len(deletes)).Msg("OpenFGA delete failed")
		return fmt.Errorf("openfga delete: %w", err)
	}

	// Invalidate related cache entries locally + broadcast via NATS
	for _, d := range deletes {
		cacheKey := fmt.Sprintf("check:%s:%s:%s", d.User, d.Relation, d.Object)
		s.cache.Delete(ctx, cacheKey)
		s.publishCacheInvalidation(d.User, d.Relation, d.Object)
	}

	return nil
}

// ListObjects lists objects of a given type that a user has a relation to.
func (s *AuthzService) ListObjects(ctx context.Context, req model.ListObjectsRequest) ([]string, error) {
	body := openfga.ClientListObjectsRequest{
		User:     req.User,
		Relation: req.Relation,
		Type:     req.Type,
	}

	resp, err := s.fga.ListObjects(ctx).Body(body).Execute()
	if err != nil {
		s.log.Error().Err(err).
			Str("user", req.User).
			Str("relation", req.Relation).
			Str("type", req.Type).
			Msg("OpenFGA list objects failed")
		return nil, fmt.Errorf("openfga list objects: %w", err)
	}

	return resp.GetObjects(), nil
}

// publishCacheInvalidation broadcasts a cache invalidation event via NATS.
// Fails silently — cache will expire naturally via TTL if NATS is unavailable.
func (s *AuthzService) publishCacheInvalidation(user, relation, object string) {
	if s.nats == nil {
		return
	}
	msg := map[string]string{
		"user":     user,
		"relation": relation,
		"object":   object,
	}
	if err := s.nats.Publish(ssonats.SubjectCacheInvalidateAuthz, msg); err != nil {
		s.log.Warn().Err(err).Msg("failed to publish cache invalidation via NATS")
	}
}
