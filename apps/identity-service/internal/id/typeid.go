package id

import (
	"fmt"

	"github.com/google/uuid"
	"go.jetify.com/typeid"
)

const (
	PrefixUser       = "user"
	PrefixTenant     = "ten"
	PrefixSession    = "ses"
	PrefixMembership = "mem"
	PrefixToken      = "tok"
)

func New(prefix string) (uuid.UUID, string) {
	tid, _ := typeid.WithPrefix(prefix)
	uid, _ := uuid.Parse(tid.UUID())
	return uid, tid.String()
}

func Format(prefix string, uid uuid.UUID) string {
	tid, _ := typeid.FromUUIDWithPrefix(prefix, uid.String())
	return tid.String()
}

func Parse(s string) (uuid.UUID, string, error) {
	tid, err := typeid.FromString(s)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("invalid typeid %q: %w", s, err)
	}
	uid, err := uuid.Parse(tid.UUID())
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("invalid uuid in typeid %q: %w", s, err)
	}
	return uid, tid.Prefix(), nil
}
