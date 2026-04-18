// Package dns wraps `net.Resolver` with the conventions we need for domain
// verification: explicit 3-second deadline, pure-Go resolver (no libc surprises
// on systems where /etc/resolv.conf is wonky), eTLD+1 enforcement, and a tiny
// observation hook so the verifier can record "last checked at" regardless of
// outcome.
//
// This package intentionally does NOT know what a "verification token" is —
// it just returns the list of TXT strings for a given domain. Matching logic
// lives in the domain-verification service.
package dns

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"golang.org/x/net/publicsuffix"
)

// DefaultLookupTimeout bounds every DNS lookup. Kept small because:
//   1. Verification retries run on a 10-minute cron — waiting minutes per
//      lookup would drain the worker pool.
//   2. TXT records are small and cached aggressively; resolvers that can't
//      answer within 3s are effectively down for our purposes.
const DefaultLookupTimeout = 3 * time.Second

// VerifySubdomain is the prefix where we expect verification TXT records to
// live. Keeps the zone-apex TXT record clean for other uses (SPF, etc.).
// Producers of verification instructions must use the same value.
const VerifySubdomain = "_wave-connect-verify"

// ErrInvalidDomain — the input didn't look like a public domain (e.g. bare
// "com", unicode, trailing dots, leading wildcards). Callers should surface
// this to users before hitting the resolver.
var ErrInvalidDomain = errors.New("invalid domain")

// ErrNotETLD1 — the input is a subdomain of a public suffix (e.g. "foo.acme.com")
// rather than an eTLD+1 ("acme.com"). Phase 2 only accepts eTLD+1 claims.
var ErrNotETLD1 = errors.New("domain must be an eTLD+1 (e.g. acme.com, not foo.acme.com)")

// Resolver is the minimum contract used by the verifier. Stub-able from tests
// without a live DNS server.
type Resolver interface {
	LookupTXT(ctx context.Context, host string) ([]string, error)
}

// NetResolver wraps Go's std `net.Resolver` with PreferGo=true to avoid any
// cgo-based resolver quirks. Default timeout is `DefaultLookupTimeout`.
type NetResolver struct {
	timeout time.Duration
	r       *net.Resolver
}

// NewNetResolver returns a NetResolver with the given per-lookup timeout.
// Pass 0 to use DefaultLookupTimeout. If `serverAddr` is non-empty, all
// lookups dial that resolver explicitly — overrides /etc/resolv.conf. Useful
// in production when identity-service needs to point at an in-cluster DNS
// (e.g. CoreDNS at 10.96.0.10:53) or a public resolver (1.1.1.1:53) rather
// than the pod's default which may not resolve external public domains.
//
// Phase 2 review fix #9.
func NewNetResolver(timeout time.Duration, serverAddr string) *NetResolver {
	if timeout <= 0 {
		timeout = DefaultLookupTimeout
	}
	r := &net.Resolver{PreferGo: true}
	if serverAddr != "" {
		// Force all DNS queries through this resolver. `network` is "udp"|"tcp";
		// net.Resolver calls us for the first attempt then again with "tcp"
		// if truncation is detected — we forward both.
		r.Dial = func(ctx context.Context, network, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: timeout}
			return d.DialContext(ctx, network, serverAddr)
		}
	}
	return &NetResolver{timeout: timeout, r: r}
}

// LookupTXT fetches every TXT record at `host`, applying the resolver's
// timeout. A DNS "name not found" error is not suppressed — callers should
// decide whether it maps to a retry or a hard failure.
func (n *NetResolver) LookupTXT(ctx context.Context, host string) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, n.timeout)
	defer cancel()
	return n.r.LookupTXT(ctx, host)
}

// NormalizeDomain accepts user-typed input and returns a lowercase, trimmed,
// dot-free domain suitable for storage and DNS lookup. Rejects unicode (IDNs
// are out of scope for Phase 2), wildcards, and sub-suffixes of public
// suffixes.
//
// Example:
//
//	NormalizeDomain("  Acme.COM. ")   → ("acme.com", nil)
//	NormalizeDomain("foo.acme.com")   → ("", ErrNotETLD1)
//	NormalizeDomain("co.uk")          → ("", ErrInvalidDomain)  -- public suffix
func NormalizeDomain(input string) (string, error) {
	d, err := normalizeHostname(input)
	if err != nil {
		return "", err
	}
	// publicsuffix.EffectiveTLDPlusOne returns an error for bare suffixes
	// ("com", "co.uk") and for inputs that are themselves a public suffix.
	etld1, err := publicsuffix.EffectiveTLDPlusOne(d)
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrInvalidDomain, err.Error())
	}
	if etld1 != d {
		return "", ErrNotETLD1
	}
	return d, nil
}

// NormalizeHostname is the subset of NormalizeDomain that only trims +
// lowercases + rejects obvious garbage, WITHOUT the publicsuffix eTLD+1
// enforcement. Use this for inputs that can legitimately be a subdomain —
// notably email-address domains (`mail.acme.com` is a valid sender host even
// if the tenant is claiming `acme.com`).
//
// Phase 2 review fix #8.
func NormalizeHostname(input string) (string, error) {
	return normalizeHostname(input)
}

func normalizeHostname(input string) (string, error) {
	d := strings.ToLower(strings.TrimSpace(input))
	d = strings.TrimSuffix(d, ".")
	if d == "" || strings.ContainsAny(d, " \t\n/\\") || strings.Contains(d, "*") {
		return "", ErrInvalidDomain
	}
	for _, r := range d {
		if r > 0x7F {
			return "", ErrInvalidDomain
		}
	}
	return d, nil
}

// VerifyHost returns the hostname we expect to query for a given claim.
// For `acme.com` that's `_wave-connect-verify.acme.com`. Exposed so the
// UI can render identical instructions to what the verifier queries.
func VerifyHost(domain string) string {
	return VerifySubdomain + "." + strings.ToLower(strings.TrimSpace(domain))
}

// ContainsToken tests whether any TXT record in `records` contains the
// expected verification assertion (`wave-connect-verify=<token>`). TXT
// providers can fragment long strings; we normalize by joining on '' which
// mirrors how DNS concatenates, though in practice our nonce is short enough
// to fit in a single string.
func ContainsToken(records []string, token string) bool {
	needle := "wave-connect-verify=" + token
	for _, rec := range records {
		if strings.Contains(strings.TrimSpace(rec), needle) {
			return true
		}
	}
	return false
}
