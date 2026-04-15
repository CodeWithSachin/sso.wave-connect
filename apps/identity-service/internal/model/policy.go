package model

import (
	"net"
	"strings"
	"time"

	"github.com/google/uuid"
)

// TenantPolicy mirrors the tenant_policies table from migration 000003.
type TenantPolicy struct {
	ID                   uuid.UUID `json:"id"`
	TenantID             uuid.UUID `json:"tenant_id"`
	PasswordMinLength    int       `json:"password_min_length"`
	PasswordRequireUpper bool      `json:"password_require_upper"`
	PasswordRequireLower bool      `json:"password_require_lower"`
	PasswordRequireNum   bool      `json:"password_require_number"`
	PasswordRequireSym   bool      `json:"password_require_symbol"`
	PasswordRequireMFA   bool      `json:"password_require_mfa"`
	AllowedMFAMethods    []string  `json:"allowed_mfa_methods"`
	SessionMaxAgeHours   int       `json:"session_max_age_hours"`
	IdleTimeoutMinutes   int       `json:"idle_timeout_minutes"`
	IPAllowlist          []string  `json:"ip_allowlist"`
	AllowedEmailDomains  []string  `json:"allowed_email_domains"`
	RequireSSO           bool      `json:"require_sso"`
	MaxSessionsPerUser   int       `json:"max_sessions_per_user"`
	PasswordHistoryCount int       `json:"password_history_count"`
	LockoutThreshold     int       `json:"lockout_threshold"`
	LockoutDurationMin   int       `json:"lockout_duration_min"`
	Version              int       `json:"version"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// IsIPAllowed checks whether the given IP address falls within one of the
// configured CIDR ranges. An empty allowlist permits all IPs.
func (p *TenantPolicy) IsIPAllowed(ipStr string) bool {
	if len(p.IPAllowlist) == 0 {
		return true
	}
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	for _, cidr := range p.IPAllowlist {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			// Treat bare IPs (e.g. "10.0.0.1") as /32
			if net.ParseIP(cidr) != nil && net.ParseIP(cidr).Equal(ip) {
				return true
			}
			continue
		}
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// IsEmailDomainAllowed checks whether the given email address belongs to one of
// the allowed domains. An empty list permits all domains.
func (p *TenantPolicy) IsEmailDomainAllowed(email string) bool {
	if len(p.AllowedEmailDomains) == 0 {
		return true
	}
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return false
	}
	domain := strings.ToLower(parts[1])
	for _, d := range p.AllowedEmailDomains {
		if strings.ToLower(d) == domain {
			return true
		}
	}
	return false
}

// DefaultPolicy returns sensible defaults matching the DB column defaults.
func DefaultPolicy(tenantID uuid.UUID) *TenantPolicy {
	return &TenantPolicy{
		TenantID:             tenantID,
		PasswordMinLength:    12,
		PasswordRequireUpper: true,
		PasswordRequireLower: true,
		PasswordRequireNum:   true,
		PasswordRequireSym:   false,
		PasswordRequireMFA:   false,
		AllowedMFAMethods:    []string{"totp", "webauthn"},
		SessionMaxAgeHours:   24,
		IdleTimeoutMinutes:   60,
		IPAllowlist:          nil,
		AllowedEmailDomains:  nil,
		RequireSSO:           false,
		MaxSessionsPerUser:   10,
		PasswordHistoryCount: 5,
		LockoutThreshold:     5,
		LockoutDurationMin:   30,
	}
}
