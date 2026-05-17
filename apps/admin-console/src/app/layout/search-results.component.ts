import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NgIcon } from '@ng-icons/core';
import { NavigationEnd, Router } from '@angular/router';
import {
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';

import { SearchService } from '../core/search/search.service';
import type { AuditEvent } from '../features/audit/audit.service';
import { AuditService } from '../features/audit/audit.service';
import type { Group } from '../features/groups/groups.service';
import { GroupsService } from '../features/groups/groups.service';
import type { User } from '../features/members/members.service';
import { MembersService } from '../features/members/members.service';

// Routes whose own components consume SearchService — overlay stays hidden
// there because the per-page filter is doing the same job over the loaded
// page; Phase 2's overlay exists for /dashboard, /settings, and friends.
const SKIP_OVERLAY_PREFIXES = ['/members', '/groups', '/audit'];

// Cap each per-service request to keep the panel from drowning in big tenants.
const PER_SERVICE_PAGE_SIZE = 5;

interface ResultBuckets {
  members: User[];
  groups: Group[];
  audit: AuditEvent[];
  loading: boolean;
  errored: boolean;
}

const EMPTY: ResultBuckets = {
  members: [],
  groups: [],
  audit: [],
  loading: false,
  errored: false,
};

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [NgIcon],
  // Floats below the top bar (Linear/Vercel style). The host fixes it just
  // under the 56 px top bar so the page content underneath stays put while
  // results layer on top.
  template: `
    @if (active() && (buckets().loading || totalCount() > 0 || buckets().errored)) {
      <div
        class="absolute left-1/2 top-14 z-50 w-full max-w-2xl -translate-x-1/2 rounded-lg border border-border bg-card shadow-lg ring-1 ring-black/5"
        role="listbox"
      >
        <div class="flex items-center justify-between border-b border-border px-4 py-2">
          <p class="text-xs font-medium text-muted-foreground">
            @if (buckets().loading) { Searching… }
            @else { {{ totalCount() }} result(s) for "{{ search.query() }}" }
          </p>
          <button
            type="button"
            (click)="dismiss()"
            class="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Close search results"
          >
            <ng-icon name="heroXMark" size="0.85rem" />
          </button>
        </div>

        @if (buckets().errored && !buckets().loading) {
          <p class="px-4 py-6 text-center text-xs text-destructive">
            Some services failed to respond — showing partial results.
          </p>
        }

        <div class="max-h-[60vh] overflow-y-auto">
          @if (buckets().members.length > 0) {
            <section class="border-b border-border last:border-b-0">
              <header class="bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Members
              </header>
              @for (m of buckets().members; track m.id) {
                <button
                  type="button"
                  (click)="navigate('/members/' + m.id)"
                  class="block w-full px-4 py-2 text-left text-sm hover:bg-muted/40"
                  role="option"
                >
                  <p class="font-medium text-foreground">{{ m.displayName || m.email }}</p>
                  <p class="text-xs text-muted-foreground">{{ m.email }}</p>
                </button>
              }
            </section>
          }

          @if (buckets().groups.length > 0) {
            <section class="border-b border-border last:border-b-0">
              <header class="bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Groups
              </header>
              @for (g of buckets().groups; track g.id) {
                <button
                  type="button"
                  (click)="navigate('/groups/' + g.id)"
                  class="block w-full px-4 py-2 text-left text-sm hover:bg-muted/40"
                  role="option"
                >
                  <p class="font-medium text-foreground">{{ g.name }}</p>
                  <p class="text-xs text-muted-foreground">{{ g.slug }}{{ g.description ? ' — ' + g.description : '' }}</p>
                </button>
              }
            </section>
          }

          @if (buckets().audit.length > 0) {
            <section class="border-b border-border last:border-b-0">
              <header class="bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Audit events
              </header>
              @for (a of buckets().audit; track a.id) {
                <button
                  type="button"
                  (click)="navigate('/audit')"
                  class="block w-full px-4 py-2 text-left text-sm hover:bg-muted/40"
                  role="option"
                >
                  <p class="font-medium text-foreground">{{ a.action }}</p>
                  <p class="text-xs text-muted-foreground">
                    {{ a.resourceType }} · {{ a.resourceId }} · {{ a.actorId }}
                  </p>
                </button>
              }
            </section>
          }

          @if (!buckets().loading && totalCount() === 0 && !buckets().errored) {
            <p class="px-4 py-8 text-center text-xs text-muted-foreground">
              No results across members, groups, or audit events.
            </p>
          }
        </div>
      </div>
    }
  `,
})
export class SearchResultsComponent {
  readonly search = inject(SearchService);
  private readonly router = inject(Router);
  private readonly membersSvc = inject(MembersService);
  private readonly groupsSvc = inject(GroupsService);
  private readonly auditSvc = inject(AuditService);

  // Manual dismiss flag — user can close the panel even if the query is still
  // populated. Re-typing in the search box clears the dismiss (handled below).
  private readonly dismissed = signal(false);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly active = computed(() => {
    if (this.dismissed()) return false;
    const q = this.search.query().trim();
    if (!q) return false;
    const url = this.currentUrl();
    return !SKIP_OVERLAY_PREFIXES.some(
      (p) => url === p || url.startsWith(p + '/') || url.startsWith(p + '?'),
    );
  });

  readonly buckets = toSignal(
    combineLatest([
      toObservable(this.search.query).pipe(
        debounceTime(220),
        map((s) => s.trim()),
        distinctUntilChanged(),
      ),
      toObservable(this.active).pipe(distinctUntilChanged()),
    ]).pipe(
      switchMap(([q, active]) => {
        if (!active || !q) return of(EMPTY);
        // Fire all three list endpoints in parallel; treat failures
        // independently so one slow service doesn't blank the panel.
        const members$ = this.membersSvc
          .list(1, PER_SERVICE_PAGE_SIZE, q)
          .pipe(
            map((r) => ({ ok: true as const, data: r.data })),
            catchError(() => of({ ok: false as const, data: [] as User[] })),
          );
        const groups$ = this.groupsSvc
          .list(1, PER_SERVICE_PAGE_SIZE, q)
          .pipe(
            map((r) => ({ ok: true as const, data: r.data })),
            catchError(() => of({ ok: false as const, data: [] as Group[] })),
          );
        const audit$ = this.auditSvc
          .list({ search: q }, 1, PER_SERVICE_PAGE_SIZE)
          .pipe(
            map((r) => ({ ok: true as const, data: r.data })),
            catchError(() =>
              of({ ok: false as const, data: [] as AuditEvent[] }),
            ),
          );
        return combineLatest([members$, groups$, audit$]).pipe(
          map(([m, g, a]) => ({
            members: m.data,
            groups: g.data,
            audit: a.data,
            loading: false,
            errored: !m.ok || !g.ok || !a.ok,
          })),
          startWith({ ...EMPTY, loading: true }),
        );
      }),
    ),
    { initialValue: EMPTY },
  );

  readonly totalCount = computed(
    () =>
      this.buckets().members.length +
      this.buckets().groups.length +
      this.buckets().audit.length,
  );

  navigate(path: string) {
    this.search.clear();
    this.dismissed.set(false);
    void this.router.navigateByUrl(path);
  }

  dismiss() {
    this.dismissed.set(true);
  }
}
