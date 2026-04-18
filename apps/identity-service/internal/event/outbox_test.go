package event

import (
	"testing"
	"time"
)

// TestBackoffFor asserts the exponential-backoff schedule the event outbox
// dispatcher uses for retrying failed publishes. Regressions here would
// either hammer a flapping downstream (too low) or park an event for hours
// unnecessarily (too high).
func TestBackoffFor(t *testing.T) {
	tests := []struct {
		name    string
		attempt int
		want    time.Duration
	}{
		{"attempt 0 → 2s", 0, 2 * time.Second},
		{"attempt 1 → 4s", 1, 4 * time.Second},
		{"attempt 2 → 8s", 2, 8 * time.Second},
		{"attempt 3 → 16s", 3, 16 * time.Second},
		{"attempt 4 → 32s", 4, 32 * time.Second},
		{"attempt 5 → 64s", 5, 64 * time.Second},
		{"attempt 6 → 128s", 6, 128 * time.Second},
		{"attempt 7 → 256s (still < cap)", 7, 256 * time.Second},
		{"attempt 8 → capped at 5min", 8, 5 * time.Minute},
		{"attempt 9 → capped at 5min", 9, 5 * time.Minute},
		{"attempt 20 → still capped at 5min", 20, 5 * time.Minute},
		{"negative attempt clamps to 0 → 2s", -3, 2 * time.Second},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := BackoffFor(tc.attempt)
			if got != tc.want {
				t.Fatalf("BackoffFor(%d) = %v, want %v", tc.attempt, got, tc.want)
			}
		})
	}
}

// TestClaimLeaseDurationIsReasonable guards against a future edit that
// accidentally sets the lease to a value that interacts badly with the
// per-publish timeout in event_outbox_worker.dispatchOne (5s). The lease
// must be >> publish timeout so legitimate dispatches never get reclaimed
// out from under a healthy dispatcher, but not so long that a crashed
// dispatcher wedges the event for minutes.
func TestClaimLeaseDurationIsReasonable(t *testing.T) {
	const publishTimeout = 5 * time.Second
	if ClaimLeaseDuration <= publishTimeout*2 {
		t.Fatalf("ClaimLeaseDuration %v is too close to the 5s publish timeout — legitimate slow publishes could race reclaims", ClaimLeaseDuration)
	}
	if ClaimLeaseDuration > 5*time.Minute {
		t.Fatalf("ClaimLeaseDuration %v is too long — a crashed dispatcher would wedge the event past the backoff cap", ClaimLeaseDuration)
	}
}
