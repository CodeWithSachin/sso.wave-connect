// Package authz is a thin wrapper around the authz-service gRPC Check RPC.
// Identity-service uses it for ReBAC (OpenFGA-backed) admin checks — e.g.
// "is this session's user an admin of the target org?" — without reaching
// into OpenFGA directly. authz-service owns the cache + store_id + model.
//
// Tuple convention matches openfga/model.fga:
//
//	user:<user_uuid>  admin  organization:<tenant_uuid>
//
// so callers pass UUIDs and this package applies the `user:` / `organization:`
// prefixes. Keeps handlers oblivious to OpenFGA string formatting.
package authz

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/wave-connect/sso-platform/libs/proto/gen/go/authz/v1"
)

// ErrAuthzUnavailable — client wasn't wired (empty URL in config). Middleware
// returns 503 so callers know it's a transient infra issue, not a deny.
var ErrAuthzUnavailable = errors.New("authz client not configured")

// Common relations on the `organization` type (see openfga/model.fga).
const (
	RelOwner = "owner"
	RelAdmin = "admin" // owner OR [user] — broadest "manage the org" gate
)

// Client holds the gRPC connection to authz-service. Zero value is a no-op
// client that always returns ErrAuthzUnavailable so test harnesses can skip
// the dependency.
type Client struct {
	grpc   pb.AuthzServiceClient
	conn   *grpc.ClientConn
	log    zerolog.Logger
	target string
}

// DialOptions carries the knobs for Dial. Kept separate from the top-level
// function signature so adding more creds options (ca file, client cert)
// doesn't keep changing callers.
type DialOptions struct {
	// Insecure uses plaintext credentials. Right for localhost-to-localhost
	// dev and for in-cluster traffic where a service-mesh sidecar terminates
	// TLS. Wrong for any cross-host link without such a mesh — Dial logs a
	// Warn when this is true so the choice is visible in prod logs.
	Insecure bool
	// TLSCreds — populated for explicit TLS config. When set, Insecure is
	// ignored. Not plumbed through config yet; hook for future use.
	TLSCreds credentials.TransportCredentials
}

// Dial opens a gRPC connection to authz-service. Nil return for empty url —
// callers must handle that and fail closed in ReBAC-required paths.
func Dial(url string, opts DialOptions, log zerolog.Logger) (*Client, error) {
	if url == "" {
		log.Warn().Msg("authz client disabled: AUTHZ_GRPC_URL empty")
		return nil, nil
	}
	var creds credentials.TransportCredentials
	switch {
	case opts.TLSCreds != nil:
		creds = opts.TLSCreds
	case opts.Insecure:
		log.Warn().Str("url", url).Msg("authz gRPC using INSECURE transport — ok for localhost / in-cluster mesh, never for cross-host prod")
		creds = insecure.NewCredentials()
	default:
		return nil, fmt.Errorf("authz dial: either TLSCreds must be set or Insecure=true")
	}
	conn, err := grpc.NewClient(url, grpc.WithTransportCredentials(creds))
	if err != nil {
		return nil, fmt.Errorf("dial authz-service: %w", err)
	}
	return &Client{
		grpc:   pb.NewAuthzServiceClient(conn),
		conn:   conn,
		log:    log.With().Str("component", "authz_client").Logger(),
		target: url,
	}, nil
}

// Close shuts down the underlying gRPC connection. Safe on nil receiver.
func (c *Client) Close() {
	if c == nil || c.conn == nil {
		return
	}
	_ = c.conn.Close()
}

// CheckOrgRelation returns (allowed, err) for "user has `relation` on
// organization:<orgID>". Pass RelAdmin to cover both owners and explicit
// admins per the FGA model (`define admin: [user] or owner`). Bounded per-
// call timeout so a hung authz-service doesn't block request goroutines.
func (c *Client) CheckOrgRelation(ctx context.Context, userID, orgID uuid.UUID, relation string) (bool, error) {
	if c == nil || c.grpc == nil {
		return false, ErrAuthzUnavailable
	}
	callCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	resp, err := c.grpc.Check(callCtx, &pb.CheckRequest{
		User:     "user:" + userID.String(),
		Relation: relation,
		Object:   "organization:" + orgID.String(),
	})
	if err != nil {
		c.log.Warn().Err(err).
			Str("user_id", userID.String()).
			Str("org_id", orgID.String()).
			Str("relation", relation).
			Msg("authz Check RPC failed")
		return false, fmt.Errorf("authz check: %w", err)
	}
	return resp.GetAllowed(), nil
}
