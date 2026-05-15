package grpc

import (
	"context"
	"errors"

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
	tokenSvc     *service.TokenService
	userRepo     *repository.UserRepository
	federatedSvc *service.FederatedService
	log          zerolog.Logger
}

// NewIdentityServer creates a new gRPC identity server. `federatedSvc` may
// be nil if Milestone A isn't enabled — ProvisionFederated then returns
// Unimplemented via the embedded UnimplementedIdentityServiceServer.
func NewIdentityServer(
	tokenSvc *service.TokenService,
	userRepo *repository.UserRepository,
	federatedSvc *service.FederatedService,
	log zerolog.Logger,
) *IdentityServer {
	return &IdentityServer{
		tokenSvc:     tokenSvc,
		userRepo:     userRepo,
		federatedSvc: federatedSvc,
		log:          log.With().Str("component", "grpc-identity").Logger(),
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

// ProvisionFederated is the JIT bridge sso-service calls after a successful
// external IdP authentication (Milestone A Slice 2 for OIDC, Slice 4 for
// SAML). Idempotent on (idp_id, external_user_id) — see federated.go.
func (s *IdentityServer) ProvisionFederated(ctx context.Context, req *pb.ProvisionFederatedRequest) (*pb.ProvisionFederatedResponse, error) {
	if s.federatedSvc == nil {
		return nil, status.Error(codes.Unimplemented, "federated provisioning is not enabled in this deployment")
	}
	if req.IdpId == "" || req.ExternalUserId == "" {
		return nil, status.Error(codes.InvalidArgument, "idp_id and external_user_id are required")
	}
	idpID, err := uuid.Parse(req.IdpId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid idp_id format")
	}

	result, err := s.federatedSvc.ProvisionFederated(ctx, service.ProvisionFederatedRequest{
		IdPID:          idpID,
		ExternalUserID: req.ExternalUserId,
		Email:          req.Email,
		DisplayName:    req.DisplayName,
		Picture:        req.Picture,
		IP:             req.Ip,
		UserAgent:      req.UserAgent,
	})
	if err != nil {
		if errors.Is(err, service.ErrIdPJITDisabled) {
			return nil, status.Error(codes.FailedPrecondition, err.Error())
		}
		s.log.Error().Err(err).Str("idp_id", req.IdpId).Msg("ProvisionFederated failed")
		return nil, status.Errorf(codes.Internal, "provision failed: %v", err)
	}

	return &pb.ProvisionFederatedResponse{
		UserId:           result.UserID.String(),
		TenantId:         result.TenantID.String(),
		SessionToken:     result.SessionToken,
		ExpiresAt:        result.ExpiresAt.Unix(),
		NewlyProvisioned: result.NewlyProvisioned,
	}, nil
}
