import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  form,
  FormField,
  submit,
  required,
  email,
  minLength,
  validate,
} from '@angular/forms/signals';
import { AuthStore } from '../store/auth.store';

@Component({
  standalone: true,
  selector: 'app-register',
  imports: [FormField, RouterLink],
  template: `
    <div
      class="min-h-screen bg-background flex items-center justify-center px-4 font-sans"
    >
      <div
        class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border"
      >
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold text-foreground">Create an account</h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Fill in the details below to get started
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
              for="reg-displayName"
              class="block text-sm font-medium text-foreground mb-1.5"
              >Display Name</label
            >
            <input
              id="reg-displayName"
              type="text"
              [formField]="registerForm.displayName"
              placeholder="Your name"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
            />
            @if (
              registerForm.displayName().touched() &&
              registerForm.displayName().errors().length
            ) {
              <p class="mt-1 text-xs text-destructive">
                {{ registerForm.displayName().errors()[0].message }}
              </p>
            }
          </div>

          <div>
            <label
              for="reg-email"
              class="block text-sm font-medium text-foreground mb-1.5"
              >Email</label
            >
            <input
              id="reg-email"
              type="email"
              [formField]="registerForm.email"
              placeholder="you@example.com"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
            />
            @if (
              registerForm.email().touched() &&
              registerForm.email().errors().length
            ) {
              <p class="mt-1 text-xs text-destructive">
                {{ registerForm.email().errors()[0].message }}
              </p>
            }
          </div>

          <div>
            <label
              for="reg-password"
              class="block text-sm font-medium text-foreground mb-1.5"
              >Password</label
            >
            <input
              id="reg-password"
              type="password"
              [formField]="registerForm.password"
              placeholder="Create a password"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
            />
            @if (
              registerForm.password().touched() &&
              registerForm.password().errors().length
            ) {
              <p class="mt-1 text-xs text-destructive">
                {{ registerForm.password().errors()[0].message }}
              </p>
            }

            @if (registerForm.password().value()) {
              <div class="mt-2 flex items-center gap-2">
                <div class="flex-1 flex gap-1">
                  <div
                    class="h-1 rounded-full flex-1"
                    [class]="
                      passwordStrength() >= 1
                        ? 'bg-destructive'
                        : 'bg-muted'
                    "
                  ></div>
                  <div
                    class="h-1 rounded-full flex-1"
                    [class]="
                      passwordStrength() >= 2
                        ? 'bg-chart-3'
                        : 'bg-muted'
                    "
                  ></div>
                  <div
                    class="h-1 rounded-full flex-1"
                    [class]="
                      passwordStrength() >= 3
                        ? 'bg-chart-2'
                        : 'bg-muted'
                    "
                  ></div>
                </div>
                <span class="text-xs text-muted-foreground">{{
                  passwordStrengthLabel()
                }}</span>
              </div>
            }
          </div>

          <div>
            <label
              for="reg-confirmPassword"
              class="block text-sm font-medium text-foreground mb-1.5"
              >Confirm Password</label
            >
            <input
              id="reg-confirmPassword"
              type="password"
              [formField]="registerForm.confirmPassword"
              placeholder="Confirm your password"
              class="bg-input border border-border rounded-md px-4 py-3 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors"
            />
            @if (
              registerForm.confirmPassword().touched() &&
              registerForm.confirmPassword().errors().length
            ) {
              <p class="mt-1 text-xs text-destructive">
                {{ registerForm.confirmPassword().errors()[0].message }}
              </p>
            }
          </div>

          <button
            type="submit"
            [disabled]="store.loading()"
            class="bg-primary text-primary-foreground rounded-md px-4 py-3 w-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {{ store.loading() ? 'Creating account...' : 'Create account' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?
          <a
            routerLink="/login"
            class="text-primary font-medium hover:underline"
            >Sign in</a
          >
        </p>
      </div>
    </div>
  `,
})
export class RegisterComponent {
  readonly store = inject(AuthStore);

  readonly registerModel = signal({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  readonly registerForm = form(this.registerModel, (s) => {
    required(s.displayName, { message: 'Display name is required.' });
    required(s.email, { message: 'Please enter a valid email address.' });
    email(s.email, { message: 'Please enter a valid email address.' });
    required(s.password, {
      message: 'Password must be at least 8 characters.',
    });
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
    const pwd = this.registerForm.password().value();
    if (!pwd) return 0;

    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;

    return score;
  });

  readonly passwordStrengthLabel = computed(() => {
    const strength = this.passwordStrength();
    if (strength <= 0) return '';
    if (strength === 1) return 'Weak';
    if (strength === 2) return 'Medium';
    return 'Strong';
  });

  onSubmit(): void {
    submit(this.registerForm, async () => {
      const { email, password, displayName } = this.registerModel();
      await this.store.register(email, password, displayName);
    });
  }
}
