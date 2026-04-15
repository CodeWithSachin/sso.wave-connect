package grpc

import (
	"context"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "github.com/wave-connect/sso-platform/libs/proto/gen/go/identity/v1"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

// IdentityServer implements the gRPC IdentityServiceServer interface.
type IdentityServer struct {
	pb.UnimplementedIdentityServiceServer
	tokenSvc *service.TokenService
	userRepo *repository.UserRepository
	log      zerolog.Logger
}

// NewIdentityServer creates a new gRPC identity server.
func NewIdentityServer(tokenSvc *service.TokenService, userRepo *repository.UserRepository, log zerolog.Logger) *IdentityServer {
	return &IdentityServer{
		tokenSvc: tokenSvc,
		userRepo: userRepo,
		log:      log.With().Str("component", "grpc-identity").Logger(),
	}
}

// ValidateToken decrypts and validates a PASETO access token.
func (s *IdentityServer) ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	if req.Token == "" {
		return nil, status.Error(codes.InvalidArgument, "token is required")
	}

	claims, err := s.tokenSvc.ValidateTokenGeneric(ctx, req.Token)
	if err != nil {
		return &pb.ValidateTokenResponse{Valid: false}, nil
	}

	return &pb.ValidateTokenResponse{
		Valid:     true,
		UserId:   claims.Subject.String(),
		TenantId: claims.TenantID.String(),
		Email:    claims.Email,
		Scopes:   claims.Scopes,
		ExpiresAt: claims.Expiry.Unix(),
	}, nil
}

// GetUser retrieves user information by ID.
func (s *IdentityServer) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.GetUserResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id format")
	}

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "user not found: %v", err)
	}

	return &pb.GetUserResponse{
		Id:          user.ID.String(),
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Status:      user.Status,
	}, nil
}
