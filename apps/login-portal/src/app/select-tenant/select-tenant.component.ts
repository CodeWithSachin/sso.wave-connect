import { Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthStore } from '../store/auth.store';

/**
 * Phase 5 multi-tenant session switcher landing page. Mounted at
 * `/select-tenant`. Two entry points:
 *
 *   1. Post-login: when the user has >1 membership, the login flow routes
 *      here with `?return_to=<url>` — the picker redirects there after the
 *      user chooses a tenant.
 *   2. Ad-hoc: a logged-in user navigates here directly (e.g. from a
 *      header menu) to switch between tenants they belong to.
 *
 * Zoneless-native implementation: the initial GET is an `httpResource`
 * (Angular 21's preferred async-reactivity primitive) so loading/error/
 * value are signals the template can read directly — no manual
 * state-machine signal, no OnInit hook. The action handler (onPick) does
 * the one bit that IS mutation — a store method + a navigation — and
 * relies on the store's own signals for button state.
 */
@Component({
  standalone: true,
  selector: 'app-select-tenant',
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4 font-sans">
      <div class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border">
        @if (membershipsResource.isLoading()) {
          <h1 class="text-xl font-semibold">Loading your workspaces…</h1>
          <p class="mt-3 text-sm text-muted-foreground">One moment.</p>
        } @else if (membershipsResource.error() || !membershipsResource.hasValue()) {
          <h1 class="text-xl font-semibold text-destructive" data-testid="select-tenant-error">
            Couldn't load your workspaces
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            Make sure you're signed in and try again.
          </p>
          <button
            type="button"
            (click)="membershipsResource.reload()"
            class="mt-6 bg-primary text-primary-foreground rounded-md px-4 py-2 font-medium hover:opacity-90 cursor-pointer text-sm"
          >
            Retry
          </button>
        } @else {
          <h1 class="text-xl font-semibold" data-testid="select-tenant-ready">
            Choose a workspace
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            You belong to more than one team. Pick which one you want to use right now — you can switch again later.
          </p>

          <ul class="mt-6 grid gap-3">
            @for (m of memberships(); track m.tenant_id) {
              <li>
                <button
                  type="button"
                  (click)="onPick(m.tenant_id)"
                  [disabled]="store.loading()"
                  [attr.data-testid]="'tenant-' + m.tenant_slug"
                  [attr.data-active]="m.is_active"
                  class="w-full text-left border border-border rounded-md px-4 py-3 hover:bg-accent disabled:opacity-50 cursor-pointer"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="font-medium">{{ m.tenant_name }}</div>
                      <div class="text-xs text-muted-foreground">
                        {{ m.tenant_kind }} · {{ m.role }}
                      </div>
                    </div>
                    @if (m.is_active) {
                      <span class="text-xs text-primary font-medium">Current</span>
                    }
                  </div>
                </button>
              </li>
            }
          </ul>

          @if (store.error()) {
            <p class="mt-4 text-sm text-destructive" role="alert">{{ store.error() }}</p>
          }
        }
      </div>
    </div>
  `,
})
export class SelectTenantComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(AuthStore);

  /**
   * Track query params reactively so a user arriving at
   * `/select-tenant?return_to=...` picks up the right target even on
   * client-side navigations. `toSignal` bridges the ActivatedRoute
   * Observable into the signal graph without manual subscription
   * bookkeeping — safe under zoneless because the observable push
   * schedules CD via the consuming template.
   */
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  private readonly returnTo = computed(() => this.queryParams().get('return_to') || '');

  /**
   * Declarative GET for `/auth/session/memberships`. httpResource exposes
   * isLoading/error/value as signals consumed directly in the template —
   * no OnInit, no manual state machine, cancellation on destroy is automatic.
   *
   * withCredentials is set via the credentialsInterceptor in app.config;
   * we only need to name the URL here.
   */
  readonly membershipsResource = httpResource<MembershipsResponse>(
    () => `${environment.identityServiceUrl}/auth/session/memberships`,
  );

  /**
   * Flatten the resource to just the array — computed so template usage
   * stays compact and the template never has to do `?.memberships` chains.
   * Empty array until the resource resolves.
   */
  readonly memberships = computed(() => this.membershipsResource.value()?.memberships ?? []);

  async onPick(tenantId: string): Promise<void> {
    const newActive = await this.store.switchActiveTenant(tenantId);
    if (!newActive) return;
    const rt = this.returnTo();
    if (rt) {
      window.location.href = rt;
    } else {
      await this.router.navigateByUrl('/');
    }
  }
}

/** Wire shape for `/auth/session/memberships`. */
interface MembershipsResponse {
  memberships: Array<{
    tenant_id: string;
    tenant_slug: string;
    tenant_name: string;
    tenant_kind: string;
    role: string;
    is_active: boolean;
  }>;
  active_tenant_id: string;
}
