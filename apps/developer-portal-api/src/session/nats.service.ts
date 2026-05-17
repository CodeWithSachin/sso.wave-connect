import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { connect, type NatsConnection, StringCodec } from 'nats';
import { Observable, Subject } from 'rxjs';

/**
 * Phase 3 session-invalidation transport. developer-portal-api side —
 * subscribe-only (publishers live in admin-api and identity-service).
 * Mirrors the admin-api shape so future factor-out into a shared lib
 * is mechanical.
 *
 * Subject convention: `sso.events.session.invalidate.<user_id>`.
 * On NATS unavailability the SSE endpoint still works but never emits
 * — the SessionStore's 5 min fallback poll keeps freshness within
 * a reasonable bound.
 */
@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);
  private readonly codec = StringCodec();
  private conn: NatsConnection | null = null;
  private readonly stream = new Subject<{ subject: string; data: string }>();

  async onModuleInit() {
    const url = process.env['NATS_URL'] ?? 'nats://localhost:4222';
    try {
      this.conn = await connect({ servers: url, name: 'developer-portal-api' });
      this.logger.log(`NATS connected: ${url}`);
      void this.consume();
    } catch (err) {
      this.logger.warn(
        `NATS connect failed at ${url}: ${(err as Error).message}. Push notifications disabled; SessionStore poll fallback still works.`,
      );
    }
  }

  async onModuleDestroy() {
    await this.conn?.drain();
    this.conn = null;
  }

  watchUser(userId: string): Observable<string> {
    return new Observable<string>((sub) => {
      const expected = `sso.events.session.invalidate.${userId}`;
      const handle = this.stream.subscribe(({ subject, data }) => {
        if (subject === expected) sub.next(data);
      });
      return () => handle.unsubscribe();
    });
  }

  /**
   * developer-portal-api doesn't publish today — no session-relevant
   * mutations land here. Kept exposed for symmetry; a future MFA-managed
   * endpoint on this service could call it without rewiring.
   */
  async publishInvalidate(userId: string, reason: string) {
    if (!this.conn) return;
    const subject = `sso.events.session.invalidate.${userId}`;
    try {
      this.conn.publish(subject, this.codec.encode(reason));
    } catch (err) {
      this.logger.warn(
        `NATS publish failed for ${subject}: ${(err as Error).message}`,
      );
    }
  }

  private async consume() {
    if (!this.conn) return;
    const subscription = this.conn.subscribe(
      'sso.events.session.invalidate.*',
    );
    for await (const msg of subscription) {
      this.stream.next({
        subject: msg.subject,
        data: this.codec.decode(msg.data),
      });
    }
  }
}
