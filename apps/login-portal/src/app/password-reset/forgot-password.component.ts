import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  form,
  FormField,
  submit,
  required,
  email,
} from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Component({
  standalone: true,
  selector: 'app-forgot-password',
  imports: [FormField, RouterLink],
  template: `
    <div
      class="min-h-screen bg-background flex items-center justify-center px-4 font-sans"
    >
      <div
        class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border"
      >
        @if (emailSent()) {
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
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-foreground">Check your email</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              If an account exists with that email, we've sent a password reset
              link. Check your inbox and spam folder.
            </p>
            <a
              routerLink="/login"
              class="mt-6 inline-block text-primary font-medium hover:underline text-sm"
              >Back to login</a
            >
          </div>
        } @else {
          <div class="mb-6 text-center">
            <h1 class="text-2xl font-bold text-foreground">
              Reset your password
            </h1>
            <p class="mt-2 text-sm text-muted-foreground">
              Enter your email address and we'll send you a link to reset your
              password
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
                for="reset-email"
                class="block text-sm font-medium text-foreground mb-1.5"
                >Email</label
              >
              <input
                id="reset-email"
                type="email"
                [formField]="resetForm.email"
                placeholder="you@example.com"
                class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
              />
              @if (
                resetForm.email().touched() &&
                resetForm.email().errors().length
              ) {
                <p class="mt-1 text-xs text-destructive">
                  {{ resetForm.email().errors()[0].message }}
                </p>
              }
            </div>

            <button
              type="submit"
              [disabled]="loading()"
              class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {{ loading() ? 'Sending...' : 'Send reset link' }}
            </button>
          </form>

          <p class="mt-6 text-center text-sm text-muted-foreground">
            Remember your password?
            <a
              routerLink="/login"
              class="text-primary font-medium hover:underline"
              >Sign in</a
            >
          </p>
        }
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private readonly http = inject(HttpClient);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly emailSent = signal(false);

  readonly emailModel = signal({ email: '' });

  readonly resetForm = form(this.emailModel, (s) => {
    required(s.email, { message: 'Please enter your email address.' });
    email(s.email, { message: 'Please enter a valid email address.' });
  });

  onSubmit(): void {
    submit(this.resetForm, async () => {
      this.loading.set(true);
      this.error.set('');
      try {
        await firstValueFrom(
          this.http.post(
            `${environment.identityServiceUrl}/auth/forgot-password`,
            { email: this.emailModel().email },
          ),
        );
        this.emailSent.set(true);
      } catch {
        // Always show success to prevent email enumeration
        this.emailSent.set(true);
      } finally {
        this.loading.set(false);
      }
    });
  }
}
