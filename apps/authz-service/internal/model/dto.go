package model

// ErrorResponse is the uniform error envelope returned by every authz-service
// failure path. Same shape as the other Go services for cross-service client
// reuse.
type ErrorResponse struct {
	Error string `json:"error" example:"invalid request body"`
}

// TupleWriteResult is the success body for batch tuple writes/deletes.
type TupleWriteResult struct {
	Writes  int `json:"writes"`
	Deletes int `json:"deletes"`
}

// TupleDeleteResult is the success body for tuple delete-only operations.
type TupleDeleteResult struct {
	Deleted int `json:"deleted"`
}
