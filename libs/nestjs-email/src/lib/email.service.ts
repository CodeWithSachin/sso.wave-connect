import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
  type OutboundEmail,
  type SendResult,
} from './email-provider.interface.js';

/**
 * Thin facade over the injected `EmailProvider`. Adds structured logging and
 * a central place to later layer things that should apply to every provider:
 *  - Template rendering (once we ship templates in Phase 2)
 *  - Default From/ReplyTo based on tenant branding
 *  - Bounce-suppression list lookups
 *  - Metrics
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  async send(email: OutboundEmail): Promise<SendResult> {
    const started = Date.now();
    try {
      const result = await this.provider.send(email);
      this.logger.log(
        `email.sent provider=${this.provider.name} to=${email.to} messageId=${result.messageId} durationMs=${Date.now() - started}`,
      );
      return result;
    } catch (err) {
      this.logger.error(
        `email.failed provider=${this.provider.name} to=${email.to} error=${(err as Error).message}`,
      );
      throw err;
    }
  }
}
