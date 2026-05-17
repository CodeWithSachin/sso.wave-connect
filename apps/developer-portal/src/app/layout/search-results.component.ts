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
import type { ApiKey } from '../features/api-keys/api-keys.service';
import { ApiKeysService } from '../features/api-keys/api-keys.service';
import type { OAuthApp } from '../features/oauth-apps/oauth-apps.service';
import { OAuthAppsService } from '../features/oauth-apps/oauth-apps.service';

// Routes whose own components consume SearchService — overlay hidden there.
const SKIP_OVERLAY_PREFIXES = ['/api-keys', '/oauth-apps'];

const PER_SERVICE_PAGE_SIZE = 5;

interface ResultBuckets {
  apiKeys: ApiKey[];
  oauthApps: OAuthApp[];
  loading: boolean;
  errored: boolean;
}

const EMPTY: ResultBuckets = {
  apiKeys: [],
  oauthApps: [],
  loading: false,
  errored: false,
};

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [NgIcon],
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
          @if (buckets().apiKeys.length > 0) {
            <section class="border-b border-border last:border-b-0">
              <header class="bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                API Keys
              </header>
              @for (k of buckets().apiKeys; track k.id) {
                <button
                  type="button"
                  (click)="navigate('/api-keys/' + k.id)"
                  class="block w-full px-4 py-2 text-left text-sm hover:bg-muted/40"
                  role="option"
                >
                  <p class="font-medium text-foreground">{{ k.name }}</p>
                  <p class="text-xs text-muted-foreground font-mono">{{ k.keyPrefix }}</p>
                </button>
              }
            </section>
          }

          @if (buckets().oauthApps.length > 0) {
            <section class="border-b border-border last:border-b-0">
              <header class="bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                OAuth Apps
              </header>
              @for (a of buckets().oauthApps; track a.id) {
                <button
                  type="button"
                  (click)="navigate('/oauth-apps')"
                  class="block w-full px-4 py-2 text-left text-sm hover:bg-muted/40"
                  role="option"
                >
                  <p class="font-medium text-foreground">{{ a.name }}</p>
                  <p class="text-xs text-muted-foreground font-mono">{{ a.clientId }}</p>
                </button>
              }
            </section>
          }

          @if (!buckets().loading && totalCount() === 0 && !buckets().errored) {
            <p class="px-4 py-8 text-center text-xs text-muted-foreground">
              No results across API keys or OAuth apps.
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
  private readonly apiKeysSvc = inject(ApiKeysService);
  private readonly oauthAppsSvc = inject(OAuthAppsService);

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
        const apiKeys$ = this.apiKeysSvc
          .list(1, PER_SERVICE_PAGE_SIZE, q)
          .pipe(
            map((r) => ({ ok: true as const, data: r.data })),
            catchError(() => of({ ok: false as const, data: [] as ApiKey[] })),
          );
        const oauthApps$ = this.oauthAppsSvc
          .list(1, PER_SERVICE_PAGE_SIZE, q)
          .pipe(
            map((r) => ({ ok: true as const, data: r.data })),
            catchError(() =>
              of({ ok: false as const, data: [] as OAuthApp[] }),
            ),
          );
        return combineLatest([apiKeys$, oauthApps$]).pipe(
          map(([k, a]) => ({
            apiKeys: k.data,
            oauthApps: a.data,
            loading: false,
            errored: !k.ok || !a.ok,
          })),
          startWith({ ...EMPTY, loading: true }),
        );
      }),
    ),
    { initialValue: EMPTY },
  );

  readonly totalCount = computed(
    () => this.buckets().apiKeys.length + this.buckets().oauthApps.length,
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
