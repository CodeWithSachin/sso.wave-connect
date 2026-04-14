import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  form,
  FormField,
  submit,
  required,
  email,
  minLength,
} from '@angular/forms/signals';
import { AuthStore } from '../store/auth.store';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [FormField, RouterLink],
  template: `
    <div
      class="min-h-screen bg-background flex items-center justify-center px-4 font-sans"
    >
      <div
        class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border"
      >
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold text-foreground">
            Sign in to your account
          </h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Enter your credentials to continue
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
              for="login-email"
              class="block text-sm font-medium text-foreground mb-1.5"
              >Email</label
            >
            <input
              id="login-email"
              type="email"
              [formField]="loginForm.email"
              placeholder="you@example.com"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
            />
            @if (
              loginForm.email().touched() &&
              loginForm.email().errors().length
            ) {
              <p class="mt-1 text-xs text-destructive">
                {{ loginForm.email().errors()[0].message }}
              </p>
            }
          </div>

          <div>
            <label
              for="login-password"
              class="block text-sm font-medium text-foreground mb-1.5"
              >Password</label
            >
            <input
              id="login-password"
              type="password"
              [formField]="loginForm.password"
              placeholder="Enter your password"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
            />
            @if (
              loginForm.password().touched() &&
              loginForm.password().errors().length
            ) {
              <p class="mt-1 text-xs text-destructive">
                {{ loginForm.password().errors()[0].message }}
              </p>
            }
          </div>

          <div class="flex justify-end">
            <a
              routerLink="/forgot-password"
              class="text-sm text-primary font-medium hover:underline"
              >Forgot password?</a
            >
          </div>

          <button
            type="submit"
            [disabled]="store.loading()"
            class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {{ store.loading() ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?
          <a
            routerLink="/register"
            class="text-primary font-medium hover:underline"
            >Create one</a
          >
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  readonly store = inject(AuthStore);

  readonly loginModel = signal({
    email: '',
    password: '',
  });

  readonly loginForm = form(this.loginModel, (s) => {
    required(s.email, { message: 'Please enter a valid email address.' });
    email(s.email, { message: 'Please enter a valid email address.' });
    required(s.password, { message: 'Password must be at least 8 characters.' });
    minLength(s.password, 8, {
      message: 'Password must be at least 8 characters.',
    });
  });

  onSubmit(): void {
    submit(this.loginForm, async () => {
      const { email, password } = this.loginModel();
      await this.store.login(email, password);
    });
  }
}
