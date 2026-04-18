/**
 * Minimal transactional-email interface shared by all providers.
 *
 * Implementations must be pure-function-ish at the boundary: no retries, no
 * queueing, no templating. Retries and outbox live in the caller (see NATS
 * outbox pattern in migration 000012). Templates are rendered before `send()`
 * is called.
 *
 * Phase 0 ships a single provider (`ConsoleEmailProvider`) that only logs. Real
 * providers (SES, SMTP/Mailpit) land in Phase 2 when verify-email is wired.
 */
export interface OutboundEmail {
  /** Single "to" address; bcc/cc intentionally omitted for transactional email. */
  to: string;
  /** Display name + address on the From header. Falls back to provider default. */
  from?: string;
  /** Reply-to address. Falls back to From. */
  replyTo?: string;
  subject: string;
  /** Plain-text body. Always required; HTML is optional fallback. */
  text: string;
  /** Optional HTML body. If absent, providers render text-only. */
  html?: string;
  /**
   * Idempotency key — providers that support it (SES SendEmail `MessageDeduplicationId`
   * equivalent, or SMTP Message-ID) use this to dedupe retries. Callers should
   * pass a stable hash of the underlying event (e.g. verification token hash)
   * so a retried outbox row doesn't re-send.
   */
  idempotencyKey?: string;
  /** Arbitrary metadata for audit/logging. Not sent in the email. */
  tags?: Record<string, string>;
}

export interface SendResult {
  /** Provider-assigned message id (SES MessageId, SMTP queue id, etc.). */
  messageId: string;
  /** Timestamp provider accepted the message. */
  acceptedAt: Date;
}

export interface EmailProvider {
  /**
   * Deliver one email. MUST resolve on accept-for-delivery (not on actual
   * inbox delivery) and throw on hard failures. The caller is responsible
   * for retry logic via the outbox.
   */
  send(email: OutboundEmail): Promise<SendResult>;

  /**
   * Short provider name used for logs/metrics. e.g. `console`, `ses`, `smtp`.
   */
  readonly name: string;
}

/** Nest DI token for the active EmailProvider. */
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
