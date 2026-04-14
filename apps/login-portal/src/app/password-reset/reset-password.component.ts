import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  form,
  FormField,
  submit,
  required,
  minLength,
  validate,
} from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Component({
  standalone: true,
  selector: 'app-reset-password',
  imports: [FormField, RouterLink],
  template: `
    <div
      class="min-h-screen bg-background flex items-center justify-center px-4 font-sans"
    >
      <div
        class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border"
      >
        @if (resetSuccess()) {
          <div class="text-center">
            <div
              class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-7 w-7 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-foreground">
              Password reset successfully
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
              Your password has been updated. You can now sign in with your new
              password.
            </p>
            <a
              routerLink="/login"
              class="mt-6 inline-block bg-primary text-primary-foreground rounded-md px-6 py-2.5 font-medium hover:opacity-90 transition-opacity"
              >Sign in</a
            >
          </div>
        } @else {
          <div class="mb-6 text-center">
            <h1 class="text-2xl font-bold text-foreground">
              Set a new password
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
              Choose a strong password with at least 8 characters
            </p>
          </div>

          @if (error()) {
            <div
              class="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {{ error() }}
            </div>
          }

          <form
            (submit)="onSubmit(); $event.preventDefault()"
            class="space-y-5"
          >
            <div>
              <label
                for="new-password"
                class="block text-sm font-medium text-foreground mb-1.5"
                >New password</label
              >
              <input
                id="new-password"
                type="password"
                [formField]="resetForm.password"
                placeholder="Enter new password"
                class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
              />
              @if (
                resetForm.password().touched() &&
                resetForm.password().errors().length
              ) {
                <p class="mt-1 text-xs text-destructive">
                  {{ resetForm.password().errors()[0].message }}
                </p>
              }

              <!-- Password strength indicator -->
              <div class="mt-2 flex gap-1">
                @for (i of [0, 1, 2, 3]; track i) {
                  <div
                    class="h-1 flex-1 rounded-full transition-colors"
                    [class]="
                      i < passwordStrength()
                        ? strengthColors()[passwordStrength() - 1]
                        : 'bg-border'
                    "
                  ></div>
                }
              </div>
              @if (passwordStrength() > 0) {
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ strengthLabels()[passwordStrength() - 1] }}
                </p>
              }
            </div>

            <div>
              <label
                for="confirm-password"
                class="block text-sm font-medium text-foreground mb-1.5"
                >Confirm password</label
              >
              <input
                id="confirm-password"
                type="password"
                [formField]="resetForm.confirmPassword"
                placeholder="Confirm new password"
                class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
              />
              @if (
                resetForm.confirmPassword().touched() &&
                resetForm.confirmPassword().errors().length
              ) {
                <p class="mt-1 text-xs text-destructive">
                  {{ resetForm.confirmPassword().errors()[0].message }}
                </p>
              }
            </div>

            <button
              type="submit"
              [disabled]="loading()"
              class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {{ loading() ? 'Resetting...' : 'Reset password' }}
            </button>
          </form>
        }
      </div>
    </div>
  `,
})
export class ResetPasswordComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly resetSuccess = signal(false);

  readonly strengthColors = signal([
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
  ]);
  readonly strengthLabels = signal(['Weak', 'Fair', 'Good', 'Strong']);

  readonly resetModel = signal({ password: '', confirmPassword: '' });

  readonly resetForm = form(this.resetModel, (s) => {
    required(s.password, { message: 'Password is required.' });
    minLength(s.password, 8, {
      message: 'Password must be at least 8 characters.',
    });
    required(s.confirmPassword, { message: 'Please confirm your password.' });
    validate(s.confirmPassword, ({ value, valueOf }) => {
      if (value() && valueOf(s.password) !== value()) {
        return { kind: 'mismatch', message: 'Passwords do not match.' };
      }
      return undefined;
    });
  });

  readonly passwordStrength = computed(() => {
    const pw = this.resetForm.password().value();
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    return score;
  });

  onSubmit(): void {
    submit(this.resetForm, async () => {
      this.loading.set(true);
      this.error.set('');

      // Get the reset token from the URL query params
      const token =
        this.route.snapshot.queryParamMap.get('token') ?? '';

      if (!token) {
        this.error.set('Invalid or missing reset token.');
        this.loading.set(false);
        return;
      }

      try {
        await firstValueFrom(
          this.http.post(
            `${environment.identityServiceUrl}/auth/reset-password`,
            {
              token,
              password: this.resetModel().password,
            },
          ),
        );
        this.resetSuccess.set(true);
      } catch (err: unknown) {
        const message =
          (err as { error?: { error?: string } })?.error?.error ||
          'Password reset failed. The link may have expired.';
        this.error.set(message);
      } finally {
        this.loading.set(false);
      }
    });
  }
}
