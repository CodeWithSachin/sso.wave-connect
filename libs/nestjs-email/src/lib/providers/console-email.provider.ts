import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  EmailProvider,
  OutboundEmail,
  SendResult,
} from '../email-provider.interface.js';

/**
 * Dev-default provider: logs the email to stdout and returns a synthetic
 * message id. Guaranteed zero network I/O — safe for unit tests and e2e
 * fixtures. Production must swap to `SesEmailProvider` or similar via the
 * `EMAIL_PROVIDER` DI token.
 *
 * The logged format is deliberately stable (`[email] to=... subject=...`) so
 * e2e tests can grep the server log when a full mail-inbox fixture isn't
 * needed.
 */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async send(email: OutboundEmail): Promise<SendResult> {
    const messageId = `console-${randomUUID()}`;
    const idempotency = email.idempotencyKey ? ` idempotency=${email.idempotencyKey}` : '';
    this.logger.log(
      `[email] to=${email.to} from=${email.from ?? 'noreply@wave-connect.local'} subject=${JSON.stringify(email.subject)} messageId=${messageId}${idempotency}`,
    );
    // Full body only at debug level to avoid log spam in production-ish envs.
    this.logger.debug(`[email body] ${email.text.replace(/\s+/g, ' ').slice(0, 500)}`);
    return { messageId, acceptedAt: new Date() };
  }
}
