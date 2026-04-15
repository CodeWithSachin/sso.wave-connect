package ratelimit

import "time"

// Tier represents a rate limit configuration for a tenant plan.
type Tier struct {
	Limit  int
	Window time.Duration
}

// Plan-based rate limit tiers (per guidev2.md Step 16).
var (
	TierFree       = Tier{Limit: 100, Window: time.Minute}
	TierStarter    = Tier{Limit: 500, Window: time.Minute}
	TierPro        = Tier{Limit: 1000, Window: time.Minute}
	TierEnterprise = Tier{Limit: 10000, Window: time.Minute}

	// Global rate limit across all tenants
	TierGlobal = Tier{Limit: 10000, Window: time.Second}

	// Per-user auth endpoint limit
	TierPerUser = Tier{Limit: 60, Window: time.Minute}

	// Per-IP brute force protection
	TierPerIPLogin = Tier{Limit: 20, Window: time.Minute}
)

// TierForPlan returns the rate limit tier for a given tenant plan.
func TierForPlan(plan string) Tier {
	switch plan {
	case "enterprise":
		return TierEnterprise
	case "pro":
		return TierPro
	case "starter":
		return TierStarter
	default:
		return TierFree
	}
}
