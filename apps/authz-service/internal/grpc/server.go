package grpc

import (
	"context"

	"github.com/rs/zerolog"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "github.com/wave-connect/sso-platform/libs/proto/gen/go/authz/v1"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/service"
)

// AuthzServer implements the gRPC AuthzServiceServer interface.
type AuthzServer struct {
	pb.UnimplementedAuthzServiceServer
	authzSvc *service.AuthzService
	log      zerolog.Logger
}

// NewAuthzServer creates a new gRPC authz server.
func NewAuthzServer(authzSvc *service.AuthzService, log zerolog.Logger) *AuthzServer {
	return &AuthzServer{
		authzSvc: authzSvc,
		log:      log.With().Str("component", "grpc-authz").Logger(),
	}
}

// Check performs a single permission check.
func (s *AuthzServer) Check(ctx context.Context, req *pb.CheckRequest) (*pb.CheckResponse, error) {
	if req.User == "" || req.Relation == "" || req.Object == "" {
		return nil, status.Error(codes.InvalidArgument, "user, relation, and object are required")
	}

	allowed, err := s.authzSvc.Check(ctx, model.CheckRequest{
		User:     req.User,
		Relation: req.Relation,
		Object:   req.Object,
	})
	if err != nil {
		s.log.Error().Err(err).Msg("gRPC Check failed")
		return nil, status.Errorf(codes.Internal, "check failed: %v", err)
	}

	return &pb.CheckResponse{Allowed: allowed}, nil
}

// BatchCheck performs multiple permission checks.
func (s *AuthzServer) BatchCheck(ctx context.Context, req *pb.BatchCheckRequest) (*pb.BatchCheckResponse, error) {
	results := make([]*pb.CheckResponse, len(req.Checks))
	for i, check := range req.Checks {
		allowed, err := s.authzSvc.Check(ctx, model.CheckRequest{
			User:     check.User,
			Relation: check.Relation,
			Object:   check.Object,
		})
		if err != nil {
			s.log.Error().Err(err).Int("index", i).Msg("gRPC BatchCheck item failed")
			results[i] = &pb.CheckResponse{Allowed: false}
			continue
		}
		results[i] = &pb.CheckResponse{Allowed: allowed}
	}
	return &pb.BatchCheckResponse{Results: results}, nil
}

// WriteTuple creates a relationship tuple.
func (s *AuthzServer) WriteTuple(ctx context.Context, req *pb.WriteTupleRequest) (*pb.WriteTupleResponse, error) {
	if req.Tuple == nil {
		return nil, status.Error(codes.InvalidArgument, "tuple is required")
	}

	err := s.authzSvc.WriteTuples(ctx, []model.TupleWrite{{
		User:     req.Tuple.User,
		Relation: req.Tuple.Relation,
		Object:   req.Tuple.Object,
	}})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "write tuple failed: %v", err)
	}
	return &pb.WriteTupleResponse{}, nil
}

// DeleteTuple removes a relationship tuple.
func (s *AuthzServer) DeleteTuple(ctx context.Context, req *pb.DeleteTupleRequest) (*pb.DeleteTupleResponse, error) {
	if req.Tuple == nil {
		return nil, status.Error(codes.InvalidArgument, "tuple is required")
	}

	err := s.authzSvc.DeleteTuples(ctx, []model.TupleWrite{{
		User:     req.Tuple.User,
		Relation: req.Tuple.Relation,
		Object:   req.Tuple.Object,
	}})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "delete tuple failed: %v", err)
	}
	return &pb.DeleteTupleResponse{}, nil
}

// ListObjects lists objects of a type that a user has a relation to.
func (s *AuthzServer) ListObjects(ctx context.Context, req *pb.ListObjectsRequest) (*pb.ListObjectsResponse, error) {
	if req.User == "" || req.Relation == "" || req.Type == "" {
		return nil, status.Error(codes.InvalidArgument, "user, relation, and type are required")
	}

	objects, err := s.authzSvc.ListObjects(ctx, model.ListObjectsRequest{
		User:     req.User,
		Relation: req.Relation,
		Type:     req.Type,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list objects failed: %v", err)
	}
	return &pb.ListObjectsResponse{Objects: objects}, nil
}
