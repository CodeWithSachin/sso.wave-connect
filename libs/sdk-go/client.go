// Package ssosdk provides a Go client for the WaveConnect SSO platform.
//
// It supports PASETO token verification, introspection, HTTP middleware,
// and ReBAC permission checks.
//
// Example:
//
//	client := &ssosdk.Client{
//	    Config: ssosdk.Config{
//	        Domain:   "http://localhost:8083",
//	        ClientID: "your_client_id",
//	    },
//	}
//
//	claims, err := client.Introspect(ctx, tokenStr)
//	allowed, err := client.Check(ctx, ssosdk.CheckRequest{User: "user:123", Relation: "can_edit", Object: "doc:456"})
package ssosdk

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is the main SSO SDK client.
type Client struct {
	Config     Config
	HTTPClient *http.Client
}

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: 10 * time.Second}
}

func (c *Client) baseURL() string {
	d := c.Config.Domain
	if !strings.HasPrefix(d, "http") {
		d = "https://" + d
	}
	return strings.TrimRight(d, "/")
}

// Introspect validates a token via the SSO service's introspection endpoint.
func (c *Client) Introspect(ctx context.Context, token string) (*IntrospectionResult, error) {
	body := url.Values{"token": {token}}.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL()+"/oauth2/introspect",
		strings.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create introspect request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("introspect request: %w", err)
	}
	defer resp.Body.Close()

	var result IntrospectionResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode introspect response: %w", err)
	}
	return &result, nil
}

// Check performs a ReBAC permission check via the authz service.
func (c *Client) Check(ctx context.Context, check CheckRequest) (*CheckResponse, error) {
	payload, _ := json.Marshal(check)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL()+"/authz/check", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create check request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("check request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("check failed with status %d", resp.StatusCode)
	}

	var result CheckResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode check response: %w", err)
	}
	return &result, nil
}

// ListObjects returns all objects a user has a given relation to.
func (c *Client) ListObjects(ctx context.Context, req ListObjectsRequest) (*ListObjectsResponse, error) {
	payload, _ := json.Marshal(req)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL()+"/authz/list-objects", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create list-objects request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("list-objects request: %w", err)
	}
	defer resp.Body.Close()

	var result ListObjectsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode list-objects response: %w", err)
	}
	return &result, nil
}
