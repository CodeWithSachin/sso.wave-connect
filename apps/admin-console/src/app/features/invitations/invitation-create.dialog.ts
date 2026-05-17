import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import type { MembershipRole } from '@sso-platform/shared-types';
import { InvitationsStore } from './invitations.store';

/**
 * Invitation-create dialog. Renders inside the `/invitations` page; visibility
 * is driven by `store.createOpen()`. Submitting calls `store.create()` which
 * also closes the dialog on success and bumps the list-mutation version so
 * the resource() in the parent reloads.
 *
 * Roles offered here are the subset a tenant admin can grant — `owner` is
 * reserved for the platform-admin path. Server-side `class-validator` is the
 * authoritative gate; this list just shapes the UX.
 */
@Component({
	selector: 'app-invitation-create-dialog',
	standalone: true,
	imports: [FormsModule, DialogModule],
	template: `
		<p-dialog
			[visible]="store.createOpen()"
			(visibleChange)="$event ? null : store.closeCreate()"
			[modal]="true"
			[closable]="!store.createSubmitting()"
			[draggable]="false"
			[resizable]="false"
			styleClass="w-full max-w-md"
			header="Invite a member"
		>
			<form
				(submit)="$event.preventDefault(); onSubmit()"
				class="space-y-4"
			>
				<div>
					<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="invite-email">
						Email
					</label>
					<input
						id="invite-email"
						type="email"
						required
						[(ngModel)]="email"
						name="email"
						placeholder="jane@acme.com"
						autocomplete="off"
						class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-muted-foreground mb-1.5" for="invite-role">
						Role
					</label>
					<select
						id="invite-role"
						[(ngModel)]="role"
						name="role"
						class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="member">Member — standard access</option>
						<option value="admin">Admin — manage members + settings</option>
						<option value="billing_manager">Billing manager</option>
						<option value="readonly">Read-only — view only</option>
					</select>
					<p class="mt-1 text-xs text-muted-foreground">
						The invitee receives an email with a 14-day verification link.
					</p>
				</div>

				@if (store.createError()) {
					<div
						class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
						role="alert"
					>
						{{ store.createError() }}
					</div>
				}

				<div class="flex items-center justify-end gap-2 pt-2">
					<button
						type="button"
						(click)="store.closeCreate()"
						[disabled]="store.createSubmitting()"
						class="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						[disabled]="!email() || store.createSubmitting()"
						class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
					>
						{{ store.createSubmitting() ? 'Sending…' : 'Send invitation' }}
					</button>
				</div>
			</form>
		</p-dialog>
	`,
})
export class InvitationCreateDialogComponent {
	readonly store = inject(InvitationsStore);
	readonly email = signal('');
	readonly role = signal<MembershipRole>('member');

	async onSubmit(): Promise<void> {
		const value = this.email().trim();
		if (!value) return;
		const ok = await this.store.create({ email: value, role: this.role() });
		if (ok) {
			this.email.set('');
			this.role.set('member');
		}
	}
}
