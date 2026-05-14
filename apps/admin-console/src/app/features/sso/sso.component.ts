import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { ConfirmationService } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { firstValueFrom } from 'rxjs';
import { SsoService, type IdentityProvider } from './sso.service';
import { SsoStore } from './sso.store';

/**
 * /sso — manage tenant identity providers (SAML + OIDC).
 *
 * Layout:
 *   - One row per IdP: name, type, domain hint, last test result, actions.
 *   - Add dialog with two tabs: SAML / OIDC.
 *   - Per-row "Test" button calls POST :id/test on admin-api (added in Phase 5A).
 *
 * Backend enforces tenant scoping + auth via PrimeNG-shared SessionCookieGuard;
 * UI mirrors with `manage_identity_providers` capability.
 */
@Component({
	selector: 'app-sso',
	standalone: true,
	imports: [DatePipe, FormsModule, NgIcon, Dialog],
	providers: [SsoStore, ConfirmationService],
	template: `
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-foreground">Single sign-on</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Wire SAML or OIDC identity providers. Once configured, users on
						the matching email domain are routed to the IdP at login.
					</p>
				</div>
				@if (store.canMutate()) {
					<div class="flex items-center gap-2">
						<button
							(click)="store.openDialog('oidc')"
							class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[color:var(--wc-coral-hover)]"
						>
							<ng-icon name="heroPlus" size="1rem" />
							Add OIDC
						</button>
						<button
							(click)="store.openDialog('saml')"
							class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
						>
							<ng-icon name="heroPlus" size="1rem" />
							Add SAML
						</button>
					</div>
				}
			</div>

			@if (store.error()) {
				<div
					class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					role="alert"
				>
					{{ store.error() }}
					<button class="ml-2 underline" (click)="store.clearError()">Dismiss</button>
				</div>
			}

			<div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border bg-muted/30">
						<tr>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Provider
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Type
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Domain hint
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Last test
							</th>
							<th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Created
							</th>
							<th class="w-40 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						@switch (listState()) {
							@case ('loading') {
								@for (i of [1, 2]; track i) {
									<tr>
										<td colspan="6" class="px-4 py-3">
											<div class="h-5 animate-pulse rounded bg-muted/50"></div>
										</td>
									</tr>
								}
							}
							@case ('error') {
								<tr>
									<td colspan="6" class="px-4 py-6 text-center text-sm text-destructive">
										Failed to load identity providers.
										<button type="button" class="ml-2 underline" (click)="reload()">
											Retry
										</button>
									</td>
								</tr>
							}
							@case ('empty') {
								<tr>
									<td colspan="6" class="px-4 py-10 text-center text-sm text-muted-foreground">
										No identity providers yet.
										@if (store.canMutate()) {
											Add one to enable enterprise SSO for your tenant.
										}
									</td>
								</tr>
							}
							@default {
								@for (row of rows(); track row.id) {
									<tr class="transition-colors hover:bg-muted/20">
										<td class="px-4 py-3">
											<div class="flex items-center gap-2.5">
												<ng-icon name="heroKey" size="0.95rem" class="text-muted-foreground" />
												<span class="font-medium text-foreground">{{ row.name }}</span>
											</div>
										</td>
										<td class="px-4 py-3">
											<span class="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium uppercase text-foreground">
												{{ row.type }}
											</span>
										</td>
										<td class="px-4 py-3 font-mono text-xs text-muted-foreground">
											{{ row.domainHint || '—' }}
										</td>
										<td class="px-4 py-3 text-xs">
											@if (store.testResults()[row.id]; as result) {
												<span
													class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
													[class]="
														result.ok
															? 'bg-[color:var(--wc-success)]/10 text-[color:var(--wc-success)]'
															: 'bg-destructive/10 text-destructive'
													"
												>
													<span
														class="h-1.5 w-1.5 rounded-full"
														[class]="result.ok ? 'bg-[color:var(--wc-success)]' : 'bg-destructive'"
													></span>
													{{ result.ok ? 'OK' : (result.details || 'Failed') }}
												</span>
											} @else {
												<span class="text-muted-foreground">never</span>
											}
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{{ row.createdAt | date: 'mediumDate' }}
										</td>
										<td class="px-4 py-3 text-right">
											@if (store.canMutate()) {
												<div class="flex items-center justify-end gap-1">
													<button
														type="button"
														(click)="store.test(row.id)"
														[disabled]="store.testingId() === row.id"
														class="rounded-sm px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
													>
														@if (store.testingId() === row.id) {
															Testing…
														} @else {
															Test
														}
													</button>
													<button
														type="button"
														(click)="confirmDelete(row)"
														[disabled]="store.submitting()"
														class="rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
													>
														Delete
													</button>
												</div>
											}
										</td>
									</tr>
								}
							}
						}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Create dialog: dynamic per variant -->
		<p-dialog
			[visible]="store.dialogOpen()"
			(visibleChange)="$event ? null : store.closeDialog()"
			[modal]="true"
			[draggable]="false"
			[closable]="!store.submitting()"
			[style]="{ width: '560px' }"
			[header]="store.formVariant() === 'saml' ? 'Add SAML provider' : 'Add OIDC provider'"
		>
			<form class="space-y-4" (submit)="$event.preventDefault(); submit()">
				<!-- Tab toggle so user can flip variant without closing -->
				<div role="tablist" class="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
					<button
						type="button"
						role="tab"
						(click)="store.setVariant('oidc'); reset()"
						[attr.aria-selected]="store.formVariant() === 'oidc'"
						class="rounded px-3 py-1 text-xs font-medium transition-colors"
						[class.bg-card]="store.formVariant() === 'oidc'"
						[class.text-foreground]="store.formVariant() === 'oidc'"
						[class.text-muted-foreground]="store.formVariant() !== 'oidc'"
					>
						OIDC
					</button>
					<button
						type="button"
						role="tab"
						(click)="store.setVariant('saml'); reset()"
						[attr.aria-selected]="store.formVariant() === 'saml'"
						class="rounded px-3 py-1 text-xs font-medium transition-colors"
						[class.bg-card]="store.formVariant() === 'saml'"
						[class.text-foreground]="store.formVariant() === 'saml'"
						[class.text-muted-foreground]="store.formVariant() !== 'saml'"
					>
						SAML
					</button>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<label class="col-span-2 block">
						<span class="mb-1 block text-xs font-medium text-foreground">Display name</span>
						<input
							type="text" required maxlength="255"
							[(ngModel)]="formName" name="name"
							placeholder="Okta SAML"
							class="block w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
						/>
					</label>
					<label class="col-span-2 block">
						<span class="mb-1 block text-xs font-medium text-foreground">Domain hint (optional)</span>
						<input
							type="text" maxlength="255"
							[(ngModel)]="formDomainHint" name="domainHint"
							placeholder="acme.com"
							autocomplete="off" spellcheck="false"
							class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
						/>
						<p class="mt-1 text-[11px] text-muted-foreground">
							Users on this email domain are routed to this IdP at login.
						</p>
					</label>

					@if (store.formVariant() === 'oidc') {
						<label class="col-span-2 block">
							<span class="mb-1 block text-xs font-medium text-foreground">Issuer URL</span>
							<input
								type="url" required
								[(ngModel)]="formOidcIssuer" name="oidcIssuer"
								placeholder="https://login.acme.com"
								class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
							/>
						</label>
						<label class="block">
							<span class="mb-1 block text-xs font-medium text-foreground">Client ID</span>
							<input
								type="text" required
								[(ngModel)]="formOidcClientId" name="oidcClientId"
								class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
							/>
						</label>
						<label class="block">
							<span class="mb-1 block text-xs font-medium text-foreground">Client secret</span>
							<input
								type="password" required
								[(ngModel)]="formOidcClientSecret" name="oidcClientSecret"
								class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
							/>
						</label>
						<label class="col-span-2 block">
							<span class="mb-1 block text-xs font-medium text-foreground">Scopes</span>
							<input
								type="text"
								[(ngModel)]="formOidcScopes" name="oidcScopes"
								placeholder="openid profile email"
								class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
							/>
							<p class="mt-1 text-[11px] text-muted-foreground">Space-separated. Defaults to <code>openid profile email</code>.</p>
						</label>
					}

					@if (store.formVariant() === 'saml') {
						<label class="col-span-2 block">
							<span class="mb-1 block text-xs font-medium text-foreground">SAML SSO URL</span>
							<input
								type="url" required
								[(ngModel)]="formSamlSsoUrl" name="samlSsoUrl"
								placeholder="https://idp.acme.com/sso"
								class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
							/>
						</label>
						<label class="col-span-2 block">
							<span class="mb-1 block text-xs font-medium text-foreground">Entity ID</span>
							<input
								type="text" required
								[(ngModel)]="formSamlEntityId" name="samlEntityId"
								placeholder="urn:acme:idp"
								class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
							/>
						</label>
						<label class="col-span-2 block">
							<span class="mb-1 block text-xs font-medium text-foreground">X.509 certificate (base64)</span>
							<textarea
								required rows="4"
								[(ngModel)]="formSamlCertificate" name="samlCertificate"
								placeholder="MIIDpDCCAoygAwIBAgIJ..."
								class="block w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/35"
							></textarea>
						</label>
					}
				</div>

				@if (store.error()) {
					<p class="text-sm text-destructive">{{ store.error() }}</p>
				}

				<div class="flex items-center justify-end gap-2 pt-2">
					<button
						type="button"
						(click)="store.closeDialog()"
						[disabled]="store.submitting()"
						class="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						[disabled]="store.submitting()"
						class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[color:var(--wc-coral-hover)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						@if (store.submitting()) {
							Saving…
						} @else {
							Create
						}
					</button>
				</div>
			</form>
		</p-dialog>
	`,
})
export class SsoComponent {
	readonly store = inject(SsoStore);
	private readonly svc = inject(SsoService);
	private readonly confirm = inject(ConfirmationService);

	// Local form state — kept on the component (not the store) to keep the
	// store thin and uncoupled from form fields. Both variants share name +
	// domainHint, then split into per-variant fields.
	formName = '';
	formDomainHint = '';
	formOidcIssuer = '';
	formOidcClientId = '';
	formOidcClientSecret = '';
	formOidcScopes = '';
	formSamlSsoUrl = '';
	formSamlEntityId = '';
	formSamlCertificate = '';

	readonly listResource = resource({
		params: () => ({ v: this.store.mutationVersion() }),
		loader: () => firstValueFrom(this.svc.list(1, 50)),
	});

	readonly rows = computed<IdentityProvider[]>(
		() => this.listResource.value()?.data ?? [],
	);

	readonly listState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
		if (this.listResource.isLoading()) return 'loading';
		if (this.listResource.error()) return 'error';
		return this.rows().length === 0 ? 'empty' : 'ready';
	});

	reset(): void {
		this.formName = '';
		this.formDomainHint = '';
		this.formOidcIssuer = '';
		this.formOidcClientId = '';
		this.formOidcClientSecret = '';
		this.formOidcScopes = '';
		this.formSamlSsoUrl = '';
		this.formSamlEntityId = '';
		this.formSamlCertificate = '';
	}

	async submit(): Promise<void> {
		if (this.store.formVariant() === 'oidc') {
			const ok = await this.store.submitOidc({
				type: 'oidc',
				name: this.formName.trim(),
				domainHint: this.formDomainHint.trim() || undefined,
				oidcIssuer: this.formOidcIssuer.trim(),
				oidcClientId: this.formOidcClientId.trim(),
				oidcClientSecret: this.formOidcClientSecret,
				oidcScopes: this.formOidcScopes.trim()
					? this.formOidcScopes.trim().split(/\s+/)
					: undefined,
			});
			if (ok) this.reset();
		} else {
			const ok = await this.store.submitSaml({
				type: 'saml',
				name: this.formName.trim(),
				domainHint: this.formDomainHint.trim() || undefined,
				samlSsoUrl: this.formSamlSsoUrl.trim(),
				samlEntityId: this.formSamlEntityId.trim(),
				samlCertificate: this.formSamlCertificate.trim(),
			});
			if (ok) this.reset();
		}
	}

	confirmDelete(row: IdentityProvider): void {
		this.confirm.confirm({
			message: `Remove ${row.name}? Users routed to this IdP will fall back to password login until you configure another provider for ${row.domainHint ?? 'this tenant'}.`,
			header: 'Delete identity provider',
			icon: 'pi pi-exclamation-triangle',
			acceptLabel: 'Delete',
			rejectLabel: 'Cancel',
			acceptButtonStyleClass: 'p-button-danger',
			accept: () => {
				void this.store.delete(row.id);
			},
		});
	}

	reload(): void {
		this.listResource.reload();
	}
}
