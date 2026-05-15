package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

type WellKnownHandler struct {
	tokenSvc *service.TokenService
	cfg      config.TokenConfig
}

func NewWellKnownHandler(tokenSvc *service.TokenService, cfg config.TokenConfig) *WellKnownHandler {
	return &WellKnownHandler{tokenSvc: tokenSvc, cfg: cfg}
}

// OpenIDConfiguration returns an OIDC discovery document scaffold.
//
//	@Summary	OpenID Connect discovery
//	@Tags		oidc
//	@Produce	json
//	@Success	200	{object}	map[string]any
//	@Router		/.well-known/openid-configuration [get]
func (h *WellKnownHandler) OpenIDConfiguration(c *fiber.Ctx) error {
	issuer := h.cfg.Issuer
	return c.JSON(fiber.Map{
		"issuer":                 issuer,
		"authorization_endpoint": issuer + "/oauth2/authorize",
		"token_endpoint":         issuer + "/oauth2/token",
		"revocation_endpoint":    issuer + "/oauth2/revoke",
		"jwks_uri":               issuer + "/.well-known/paseto-keys",
		"response_types_supported": []string{"code"},
		"grant_types_supported":    []string{"authorization_code", "refresh_token"},
		"subject_types_supported":  []string{"public"},
		"id_token_signing_alg_values_supported": []string{"EdDSA"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_post"},
		"scopes_supported":                      []string{"openid", "profile", "email"},
	})
}

// PASETOKeys returns the public key for PASETO v4.public token verification.
//
//	@Summary	PASETO public keys
//	@Tags		oidc
//	@Produce	json
//	@Success	200	{object}	map[string]any
//	@Router		/.well-known/paseto-keys [get]
func (h *WellKnownHandler) PASETOKeys(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"keys": []fiber.Map{
			{
				"use":     "sig",
				"alg":     "EdDSA",
				"version": "v4.public",
				"key":     h.tokenSvc.PublicKeyHex(),
			},
		},
	})
}
