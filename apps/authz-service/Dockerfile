# Build stage
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /workspace

# Copy shared libs first (for replace directives in go.mod)
COPY libs/nats/ libs/nats/
COPY libs/telemetry/ libs/telemetry/
COPY libs/ratelimit/ libs/ratelimit/
COPY libs/proto/gen/go/ libs/proto/gen/go/

# Copy service
COPY apps/authz-service/ apps/authz-service/
WORKDIR /workspace/apps/authz-service

RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app ./cmd/server

# Runtime stage
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata
RUN adduser -D -u 1001 appuser

COPY --from=builder /app /usr/local/bin/app

USER appuser
EXPOSE 8080 50051

ENTRYPOINT ["app"]
