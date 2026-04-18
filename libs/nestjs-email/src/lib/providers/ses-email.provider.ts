import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type {
  EmailProvider,
  OutboundEmail,
  SendResult,
} from '../email-provider.interface.js';

/**
 * Amazon SES provider stub.
 *
 * Phase 0 ships the class skeleton so DI wiring is in place; the actual SDK
 * call is implemented in Phase 2 when email flows (verify-email, signup)
 * come online. Until then `send()` throws — callers should use
 * `ConsoleEmailProvider` for dev/test and only switch the binding when the
 * environment config requires `EMAIL_PROVIDER_KIND=ses`.
 *
 * When wired, this class should:
 *   1. Accept an `@aws-sdk/client-ses` `SESClient` via DI.
 *   2. Map `OutboundEmail` → `SendEmailCommand` input.
 *   3. Pass `idempotencyKey` as part of `Tags` (SES doesn't have a native
 *      dedupe id) and rely on the caller's outbox for retry dedup.
 *   4. Translate SES errors (Throttling, MessageRejected) into domain
 *      exceptions the caller can recognize.
 */
@Injectable()
export class SesEmailProvider implements EmailProvider {
  readonly name = 'ses';
  private readonly logger = new Logger(SesEmailProvider.name);

  async send(email: OutboundEmail): Promise<SendResult> {
    this.logger.error(
      `SesEmailProvider.send called before Phase 2 wiring (attempted to=${email.to})`,
    );
    throw new InternalServerErrorException(
      'SES email provider is not yet wired. Use ConsoleEmailProvider in dev or bind SES in Phase 2.',
    );
  }
}
