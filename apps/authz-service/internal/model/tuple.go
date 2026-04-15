package model

import "time"

// CheckRequest represents a permission check request.
type CheckRequest struct {
	User     string `json:"user" validate:"required"`
	Relation string `json:"relation" validate:"required"`
	Object   string `json:"object" validate:"required"`
}

// CheckResponse represents a permission check result.
type CheckResponse struct {
	Allowed bool `json:"allowed"`
}

// BatchCheckRequest represents a batch permission check.
type BatchCheckRequest struct {
	Checks []CheckRequest `json:"checks" validate:"required,min=1,max=50,dive"`
}

// BatchCheckResponse returns results for each check in order.
type BatchCheckResponse struct {
	Results []CheckResponse `json:"results"`
}

// TupleWrite represents a relationship tuple to write or delete.
type TupleWrite struct {
	User     string `json:"user" validate:"required"`
	Relation string `json:"relation" validate:"required"`
	Object   string `json:"object" validate:"required"`
}

// TupleWriteRequest supports batch writes and deletes.
type TupleWriteRequest struct {
	Writes  []TupleWrite `json:"writes,omitempty"`
	Deletes []TupleWrite `json:"deletes,omitempty"`
}

// ListObjectsRequest lists objects a user has a relation to.
type ListObjectsRequest struct {
	User     string `json:"user" validate:"required"`
	Relation string `json:"relation" validate:"required"`
	Type     string `json:"type" validate:"required"`
}

// ListObjectsResponse returns the matching object IDs.
type ListObjectsResponse struct {
	Objects []string `json:"objects"`
}

// OutboxEntry represents a row in the authz_outbox table.
type OutboxEntry struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	Operation     string    `json:"operation"` // "write" or "delete"
	TupleUser     string    `json:"tuple_user"`
	TupleRelation string    `json:"tuple_relation"`
	TupleObject   string    `json:"tuple_object"`
	IdempotencyKey string   `json:"idempotency_key"`
	CreatedAt     time.Time `json:"created_at"`
	ProcessedAt   *time.Time `json:"processed_at,omitempty"`
	Error         *string   `json:"error,omitempty"`
	RetryCount    int       `json:"retry_count"`
}
