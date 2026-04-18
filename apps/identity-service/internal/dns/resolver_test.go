package dns

import (
	"context"
	"errors"
	"testing"
)

// mockResolver is a tiny stub used both here and by the service tests. Keeps
// table-driven verification tests independent of live DNS.
type mockResolver struct {
	records map[string][]string
	errs    map[string]error
}

func (m *mockResolver) LookupTXT(_ context.Context, host string) ([]string, error) {
	if err, ok := m.errs[host]; ok {
		return nil, err
	}
	return m.records[host], nil
}

func TestNormalizeDomain(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		want     string
		wantErr  error
	}{
		{"simple", "acme.com", "acme.com", nil},
		{"upper-with-trailing-dot", "Acme.COM.", "acme.com", nil},
		{"whitespace", "  acme.com  ", "acme.com", nil},
		{"subdomain-rejected", "foo.acme.com", "", ErrNotETLD1},
		{"public-suffix-rejected", "co.uk", "", ErrInvalidDomain},
		{"empty", "", "", ErrInvalidDomain},
		{"wildcard", "*.acme.com", "", ErrInvalidDomain},
		{"unicode", "acmé.com", "", ErrInvalidDomain},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeDomain(tc.input)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("want err %v, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected err: %v", err)
			}
			if got != tc.want {
				t.Fatalf("want %q, got %q", tc.want, got)
			}
		})
	}
}

func TestVerifyHost(t *testing.T) {
	if got := VerifyHost("acme.com"); got != "_wave-connect-verify.acme.com" {
		t.Fatalf("unexpected: %s", got)
	}
}

func TestContainsToken(t *testing.T) {
	token := "abc123"
	tests := []struct {
		name    string
		records []string
		want    bool
	}{
		{"match", []string{"wave-connect-verify=abc123"}, true},
		{"match-with-spaces", []string{"  wave-connect-verify=abc123  "}, true},
		{"other-txt-records-present", []string{"v=spf1 include:mail", "wave-connect-verify=abc123", "google-site-verification=xxx"}, true},
		{"wrong-token", []string{"wave-connect-verify=other"}, false},
		{"no-records", []string{}, false},
		{"unrelated", []string{"v=spf1 -all"}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := ContainsToken(tc.records, token); got != tc.want {
				t.Fatalf("want %v, got %v", tc.want, got)
			}
		})
	}
}

func TestMockResolver_NoDNS(t *testing.T) {
	// Sanity: the mock itself behaves like a real resolver for our tests.
	m := &mockResolver{
		records: map[string][]string{
			"_wave-connect-verify.acme.com": {"wave-connect-verify=xyz"},
		},
	}
	got, err := m.LookupTXT(context.Background(), "_wave-connect-verify.acme.com")
	if err != nil {
		t.Fatal(err)
	}
	if !ContainsToken(got, "xyz") {
		t.Fatal("expected token match")
	}
}
