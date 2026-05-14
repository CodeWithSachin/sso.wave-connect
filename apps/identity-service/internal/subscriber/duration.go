package subscriber

import "time"

// secondsDuration converts integer seconds to a time.Duration. Extracted so
// the subscriber file stays free of an extra time import at the top.
func secondsDuration(s int) time.Duration {
	return time.Duration(s) * time.Second
}
