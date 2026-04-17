package telemetry

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// FiberMiddleware creates a Fiber middleware that instruments HTTP requests with
// OpenTelemetry spans. Each request gets a span with standard HTTP attributes.
func FiberMiddleware(serviceName string) fiber.Handler {
	tracer := otel.Tracer(serviceName)

	return func(c *fiber.Ctx) error {
		spanName := fmt.Sprintf("%s %s", c.Method(), c.Route().Path)

		ctx, span := tracer.Start(c.UserContext(), spanName,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				attribute.String("http.method", c.Method()),
				attribute.String("http.url", c.OriginalURL()),
				attribute.String("http.target", c.Path()),
				attribute.String("http.host", c.Hostname()),
				attribute.String("http.scheme", c.Protocol()),
				attribute.String("net.peer.ip", c.IP()),
				attribute.String("http.user_agent", c.Get("User-Agent")),
			),
		)
		defer span.End()

		// Pass the traced context to downstream handlers
		c.SetUserContext(ctx)

		start := time.Now()
		err := c.Next()
		duration := time.Since(start)

		// Record response attributes
		status := c.Response().StatusCode()
		span.SetAttributes(
			attribute.Int("http.status_code", status),
			attribute.Float64("http.duration_ms", float64(duration.Milliseconds())),
		)

		if status >= 500 {
			span.SetStatus(codes.Error, fmt.Sprintf("HTTP %d", status))
		} else {
			span.SetStatus(codes.Ok, "")
		}

		// Add tenant/user context if available
		if tid, ok := c.Locals("tenant_id").(fmt.Stringer); ok {
			span.SetAttributes(attribute.String("sso.tenant_id", tid.String()))
		}
		if uid, ok := c.Locals("user_id").(fmt.Stringer); ok {
			span.SetAttributes(attribute.String("sso.user_id", uid.String()))
		}

		return err
	}
}
