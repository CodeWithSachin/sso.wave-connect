package ssosdk

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const userContextKey contextKey = "sso_user"

// UserFromContext extracts the authenticated user from the request context.
func UserFromContext(ctx context.Context) *IntrospectionResult {
	if u, ok := ctx.Value(userContextKey).(*IntrospectionResult); ok {
		return u
	}
	return nil
}

// Middleware returns an http.Handler middleware that validates Bearer tokens
// via introspection and attaches user info to the request context.
// Compatible with stdlib, Chi, Gorilla mux, and any http.Handler-based router.
func (c *Client) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := r.Header.Get("Authorization")
			if !strings.HasPrefix(auth, "Bearer ") {
				http.Error(w, `{"error":"missing or invalid authorization header"}`, http.StatusUnauthorized)
				return
			}

			token := strings.TrimPrefix(auth, "Bearer ")
			result, err := c.Introspect(r.Context(), token)
			if err != nil || !result.Active {
				http.Error(w, `{"error":"token is not active"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, result)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// FiberMiddleware returns a middleware compatible with Fiber's signature.
// Usage: app.Use(adaptor.HTTPMiddleware(client.Middleware()))
// Or use this directly if adapting manually.
