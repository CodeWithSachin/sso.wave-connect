import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { connect, type NatsConnection, StringCodec } from 'nats';
import { Observable, Subject } from 'rxjs';

/**
 * Phase 3 session-invalidation transport. NestJS-side wrapper around the
 * official `nats` npm client; both admin-api and developer-portal-api own
 * an instance and use it for the same purpose — push "your session
 * changed, reload" events to the SSE endpoint that each console's
 * SessionStore subscribes to.
 *
 * Subject convention: `sso.events.session.invalidate.<user_id>`.
 * Identity-service (Go) publishes on tenant switch / MFA / password
 * reset; admin-api publishes on membership role + platform-admin
 * mutations. Both subscribe + multiplex into per-user SSE streams.
 *
 * Connection is lazy + best-effort: NATS down doesn't break the API,
 * just degrades push notifications back to polling (the SessionStore
 * keeps a 5 min fallback poll for this reason).
 */
@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);
  private readonly codec = StringCodec();
  private conn: NatsConnection | null = null;
  // Multiplex incoming NATS messages over a single Subject; SSE handlers
  // filter by subject suffix without each opening its own subscription.
  private readonly stream = new Subject<{ subject: string; data: string }>();

  async onModuleInit() {
    const url = process.env['NATS_URL'] ?? 'nats://localhost:4222';
    try {
      this.conn = await connect({ servers: url, name: 'admin-api' });
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

  /**
   * Returns a per-user Observable of invalidation events. The SSE handler
   * subscribes here for the duration of one connection.
   */
  watchUser(userId: string): Observable<string> {
    return new Observable<string>((sub) => {
      const expected = `sso.events.session.invalidate.${userId}`;
      const handle = this.stream.subscribe(({ subject, data }) => {
        if (subject === expected) sub.next(data);
      });
      return () => handle.unsubscribe();
    });
  }

  /** Fire a session-invalidation event for one user. Best-effort. */
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

  /**
   * Wildcard subscription to every per-user invalidation subject. Fanned
   * out to per-connection SSE Observables via the local Subject. Single
   * NATS subscription regardless of connected SSE clients — they share
   * the stream.
   */
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
