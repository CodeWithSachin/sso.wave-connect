import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  form,
  FormField,
  submit,
  required,
  minLength,
  maxLength,
} from '@angular/forms/signals';
import { AuthStore } from '../store/auth.store';

@Component({
  standalone: true,
  selector: 'app-mfa-challenge',
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
            class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-7 w-7 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-foreground">
            Two-factor authentication
          </h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app
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
              for="totp-code"
              class="block text-sm font-medium text-foreground mb-1.5"
              >Verification code</label
            >
            <input
              id="totp-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              [formField]="codeForm.code"
              placeholder="000000"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground text-center text-2xl tracking-[0.5em] font-mono placeholder:text-muted-foreground placeholder:tracking-[0.5em] focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
            />
            @if (codeForm.code().touched() && codeForm.code().errors().length) {
              <p class="mt-1 text-xs text-destructive">
                {{ codeForm.code().errors()[0].message }}
              </p>
            }
          </div>

          <button
            type="submit"
            [disabled]="store.loading()"
            class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {{ store.loading() ? 'Verifying...' : 'Verify' }}
          </button>
        </form>

        <div class="mt-6 space-y-3 text-center text-sm">
          @if (store.mfaAllowedMethods().includes('backup_code')) {
            <p class="text-muted-foreground">
              Lost access to your authenticator?
              <a
                routerLink="/mfa/backup"
                class="text-primary font-medium hover:underline"
                >Use a backup code</a
              >
            </p>
          }
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
export class MfaChallengeComponent {
  readonly store = inject(AuthStore);

  readonly codeModel = signal({ code: '' });

  readonly codeForm = form(this.codeModel, (s) => {
    required(s.code, { message: 'Please enter the 6-digit code.' });
    minLength(s.code, 6, { message: 'Code must be exactly 6 digits.' });
    maxLength(s.code, 6, { message: 'Code must be exactly 6 digits.' });
  });

  onSubmit(): void {
    submit(this.codeForm, async () => {
      const { code } = this.codeModel();
      await this.store.verifyMfa(code);
    });
  }
}
