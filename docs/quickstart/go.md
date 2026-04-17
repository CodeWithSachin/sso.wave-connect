# Go Quickstart

## Install

```bash
go get github.com/wave-connect/sso-sdk-go
```

## Setup

```go
import ssosdk "github.com/wave-connect/sso-sdk-go"

client := &ssosdk.Client{
    Config: ssosdk.Config{
        Domain:   "sso.wave-connect.com",
        ClientID: "your_client_id",
    },
}
```

## HTTP Middleware (stdlib)

```go
mux := http.NewServeMux()
mux.HandleFunc("/api/profile", profileHandler)

// Wrap with auth middleware
protected := client.Middleware()(mux)
http.ListenAndServe(":8080", protected)
```

## Permission Checks

```go
result, err := client.Check(ctx, ssosdk.CheckRequest{
    User:     "user:abc123",
    Relation: "can_edit",
    Object:   "document:doc456",
})
if result.Allowed {
    // User can edit the document
}
```
