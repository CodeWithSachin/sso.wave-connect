import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  form,
  FormField,
  submit,
  required,
  minLength,
} from '@angular/forms/signals';
import { AuthStore } from '../store/auth.store';

@Component({
  standalone: true,
  selector: 'app-mfa-backup',
  imports: [FormField, RouterLink],
  template: `
    <div
      class="min-h-screen bg-background flex items-center justify-center px-4 font-sans"
    >
      <div
        class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border"
      >
        <div class="mb-6 text-center">
          <div
            class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-7 w-7 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-foreground">Use a backup code</h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Enter one of the backup codes you saved when setting up two-factor
            authentication
          </p>
        </div>

        @if (store.error()) {
          <div
            class="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {{ store.error() }}
          </div>
        }

        <form (submit)="onSubmit(); $event.preventDefault()" class="space-y-5">
          <div>
            <label
              for="backup-code"
              class="block text-sm font-medium text-foreground mb-1.5"
              >Backup code</label
            >
            <input
              id="backup-code"
              type="text"
              [formField]="backupForm.code"
              placeholder="xxxxxxxx"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground font-mono text-center tracking-widest placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
            />
            @if (
              backupForm.code().touched() && backupForm.code().errors().length
            ) {
              <p class="mt-1 text-xs text-destructive">
                {{ backupForm.code().errors()[0].message }}
              </p>
            }
          </div>

          <button
            type="submit"
            [disabled]="store.loading()"
            class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {{ store.loading() ? 'Verifying...' : 'Verify backup code' }}
          </button>
        </form>

        <div class="mt-6 space-y-3 text-center text-sm">
          <p class="text-muted-foreground">
            Have your authenticator?
            <a
              routerLink="/mfa/challenge"
              class="text-primary font-medium hover:underline"
              >Use authenticator code</a
            >
          </p>
          <p class="text-muted-foreground">
            <a
              routerLink="/login"
              (click)="store.clearMfaState()"
              class="text-primary font-medium hover:underline"
              >Back to login</a
            >
          </p>
        </div>
      </div>
    </div>
  `,
})
export class MfaBackupComponent {
  readonly store = inject(AuthStore);

  readonly backupModel = signal({ code: '' });

  readonly backupForm = form(this.backupModel, (s) => {
    required(s.code, { message: 'Please enter a backup code.' });
    minLength(s.code, 6, { message: 'Backup code is too short.' });
  });

  onSubmit(): void {
    submit(this.backupForm, async () => {
      const { code } = this.backupModel();
      await this.store.verifyBackupCode(code);
    });
  }
}
