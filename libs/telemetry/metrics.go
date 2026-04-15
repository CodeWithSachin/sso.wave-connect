package telemetry

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics holds Prometheus metric instruments for the SSO platform.
type Metrics struct {
	RequestsTotal   *prometheus.CounterVec
	RequestDuration *prometheus.HistogramVec
	CacheHitsTotal  *prometheus.CounterVec
	CacheMissTotal  *prometheus.CounterVec
	AuthzCheckDur   *prometheus.HistogramVec
	ActiveSessions  prometheus.Gauge
}

// NewMetrics registers and returns Prometheus metrics.
func NewMetrics(serviceName string) *Metrics {
	namespace := "sso"

	return &Metrics{
		RequestsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "requests_total",
			Help:      "Total HTTP requests by method, path, and status",
		}, []string{"service", "method", "path", "status"}),

		RequestDuration: promauto.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: namespace,
			Name:      "request_duration_seconds",
			Help:      "HTTP request latency in seconds",
			Buckets:   prometheus.DefBuckets,
		}, []string{"service", "method", "path"}),

		CacheHitsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "cache_hits_total",
			Help:      "Total cache hits by layer and service",
		}, []string{"service", "layer"}), // layer: l1, l2, l3

		CacheMissTotal: promauto.NewCounterVec(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "cache_misses_total",
			Help:      "Total cache misses by service",
		}, []string{"service"}),

		AuthzCheckDur: promauto.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: namespace,
			Name:      "authz_check_duration_seconds",
			Help:      "Authorization check latency in seconds",
			Buckets:   []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0},
		}, []string{"cached"}), // cached: "true" or "false"

		ActiveSessions: promauto.NewGauge(prometheus.GaugeOpts{
			Namespace: namespace,
			Name:      "active_sessions",
			Help:      "Number of active user sessions",
		}),
	}
}

// PrometheusHandler returns a Fiber handler that serves /metrics.
func PrometheusHandler() fiber.Handler {
	handler := promhttp.HandlerFor(prometheus.DefaultGatherer, promhttp.HandlerOpts{})
	return adaptor.HTTPHandler(http.Handler(handler))
}
