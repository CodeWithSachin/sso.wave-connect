package nats

// NATS subject constants for the SSO platform.
// Convention: sso.<domain>.<action>

const (
	// Cache invalidation subjects — broadcast to all replicas (regular subscribe, not queue group)
	SubjectCacheInvalidateAuthz  = "sso.cache.invalidate.authz"
	SubjectCacheInvalidatePolicy = "sso.cache.invalidate.policy"
	SubjectCacheInvalidateTenant = "sso.cache.invalidate.tenant"

	// Domain event subjects — delivered to one consumer per queue group
	SubjectEventUserCreated      = "sso.events.user.created"
	SubjectEventUserUpdated      = "sso.events.user.updated"
	SubjectEventUserDeleted      = "sso.events.user.deleted"
	SubjectEventUserLogin        = "sso.events.user.login"
	SubjectEventUserMfaEnrolled  = "sso.events.user.mfa_enrolled"
	SubjectEventMembershipCreate = "sso.events.membership.created"
	SubjectEventMembershipDelete = "sso.events.membership.deleted"
	SubjectEventSessionCreated   = "sso.events.session.created"
	SubjectEventSessionRevoked   = "sso.events.session.revoked"
	SubjectEventPermissionGrant  = "sso.events.permission.granted"
	SubjectEventPermissionRevoke = "sso.events.permission.revoked"

	// Queue group names — ensures only one consumer in the group processes each message
	QueueWebhookDelivery = "webhook-delivery"
	QueueAuditLog        = "audit-log"

	// Phase 3 session invalidation. Per-user subject suffix so the
	// NestJS SSE relay can wildcard-subscribe once and fan out to the
	// connected console for that user. Format:
	//   sso.events.session.invalidate.<user_id_uuid>
	SubjectEventSessionInvalidatePrefix = "sso.events.session.invalidate."
)
