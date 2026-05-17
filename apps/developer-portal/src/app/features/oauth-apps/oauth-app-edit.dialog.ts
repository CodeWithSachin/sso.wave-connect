import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { OAuthAppsStore } from './oauth-apps.store';

const AVAILABLE_SCOPES = [
	'openid',
	'profile',
	'email',
	'offline_access',
	'admin:read',
	'admin:write',
];

/**
 * Edit dialog for OAuth applications. Visibility is driven by
 * `store.editing()` — opening sets it, closing clears it.
 *
 * Fields editable: name, redirect URIs (dynamic list), allowed scopes.
 * Client ID / secret hash / flags (is_first_party, is_public, require_pkce)
 * are immutable post-creation. To rotate the secret, the parent component
 * still uses the rotate button — this dialog is metadata only.
 */
@Component({
	selector: 'app-oauth-app-edit-dialog',
	standalone: true,
	imports: [FormsModule, DialogModule],
	template: `
		<p-dialog
			[visible]="!!store.editing()"
			(visibleChange)="$event ? null : store.closeEdit()"
			[modal]="true"
			[closable]="!store.updating()"
			[draggable]="false"
			[resizable]="false"
			styleClass="w-full max-w-lg"
			header="Edit OAuth app"
		>
			@if (store.editing(); as app) {
				<form
					(submit)="$event.preventDefault(); onSubmit(app.id)"
					class="space-y-4"
				>
					<div>
						<label class="block text-xs font-medium text-muted-foreground mb-1.5">Client ID</label>
						<code class="block rounded-md bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground select-all">{{ app.clientId }}</code>
					</div>

					<div>
						<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="oauth-edit-name">Name</label>
						<input
							id="oauth-edit-name"
							type="text"
							[(ngModel)]="name"
							name="name"
							required
							class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
						/>
					</div>

					<div>
						<label class="block text-xs font-medium text-muted-foreground mb-1.5">Redirect URIs</label>
						<div class="space-y-2">
							@for (uri of uris(); track $index; let i = $index) {
								<div class="flex items-center gap-2">
									<input
										type="url"
										[ngModel]="uri"
										(ngModelChange)="updateUri(i, $event)"
										[name]="'uri-' + i"
										placeholder="https://app.example.com/callback"
										class="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
									/>
									<button
										type="button"
										(click)="removeUri(i)"
										[disabled]="uris().length <= 1"
										class="rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/30 disabled:opacity-40"
										title="Remove URI"
									>
										×
									</button>
								</div>
							}
							<button
								type="button"
								(click)="addUri()"
								class="text-xs text-primary hover:underline"
							>
								+ Add URI
							</button>
						</div>
					</div>

					<div>
						<label class="block text-xs font-medium text-muted-foreground mb-1.5">Allowed scopes</label>
						<div class="grid grid-cols-2 gap-2">
							@for (scope of availableScopes; track scope) {
								<label class="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
									<input
										type="checkbox"
										[checked]="scopes().includes(scope)"
										(change)="toggleScope(scope)"
										class="accent-primary"
									/>
									<span class="text-xs font-mono text-foreground">{{ scope }}</span>
								</label>
							}
						</div>
					</div>

					<div class="flex items-center justify-end gap-2 pt-2">
						<button
							type="button"
							(click)="store.closeEdit()"
							[disabled]="store.updating()"
							class="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							[disabled]="store.updating() || !canSave()"
							class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
						>
							{{ store.updating() ? 'Saving…' : 'Save changes' }}
						</button>
					</div>
				</form>
			}
		</p-dialog>
	`,
})
export class OAuthAppEditDialogComponent {
	readonly store = inject(OAuthAppsStore);
	readonly availableScopes = AVAILABLE_SCOPES;

	readonly name = signal('');
	readonly uris = signal<string[]>([]);
	readonly scopes = signal<string[]>([]);

	readonly canSave = computed(() => {
		const n = this.name().trim();
		return n.length > 0 && this.uris().filter((u) => u.trim()).length > 0;
	});

	constructor() {
		// Sync local form state every time a different app is opened for edit.
		// effect() reruns when the store's `editing` signal changes.
		effect(() => {
			const app = this.store.editing();
			if (app) {
				this.name.set(app.name);
				this.uris.set([...(app.redirectUris ?? [])]);
				this.scopes.set([...(app.allowedScopes ?? [])]);
			}
		});
	}

	updateUri(index: number, value: string): void {
		this.uris.update((arr) => arr.map((u, i) => (i === index ? value : u)));
	}

	addUri(): void {
		this.uris.update((arr) => [...arr, '']);
	}

	removeUri(index: number): void {
		if (this.uris().length <= 1) return;
		this.uris.update((arr) => arr.filter((_, i) => i !== index));
	}

	toggleScope(scope: string): void {
		this.scopes.update((arr) =>
			arr.includes(scope) ? arr.filter((s) => s !== scope) : [...arr, scope],
		);
	}

	onSubmit(id: string): void {
		const trimmedUris = this.uris().map((u) => u.trim()).filter(Boolean);
		this.store.updateApp(id, {
			name: this.name().trim(),
			redirect_uris: trimmedUris,
			allowed_scopes: this.scopes(),
		});
	}
}
