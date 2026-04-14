import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface ConsentData {
  clientName: string;
  clientLogoUrl?: string;
  clientHomepageUrl?: string;
  requestedScopes: string[];
  scopeDescriptions: Record<string, string>;
}

@Component({
  standalone: true,
  selector: 'app-consent',
  template: `
    <div
      class="min-h-screen bg-background flex items-center justify-center px-4 font-sans"
    >
      <div
        class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border"
      >
        @if (loading()) {
          <div class="text-center py-8">
            <div
              class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
            ></div>
            <p class="mt-4 text-sm text-muted-foreground">Loading...</p>
          </div>
        } @else if (error()) {
          <div class="text-center">
            <div
              class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-7 w-7 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <p class="text-sm text-destructive">{{ error() }}</p>
          </div>
        } @else if (consentData()) {
          <div class="text-center mb-6">
            @if (consentData()!.clientLogoUrl) {
              <img
                [src]="consentData()!.clientLogoUrl"
                [alt]="consentData()!.clientName"
                class="mx-auto h-16 w-16 rounded-lg mb-4 object-contain"
              />
            } @else {
              <div
                class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10"
              >
                <span class="text-2xl font-bold text-primary">{{
                  consentData()!.clientName.charAt(0).toUpperCase()
                }}</span>
              </div>
            }

            <h1 class="text-xl font-bold text-foreground">
              {{ consentData()!.clientName }}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
              wants to access your account
            </p>
          </div>

          <div class="mb-6">
            <h2 class="text-sm font-medium text-foreground mb-3">
              This will allow the application to:
            </h2>
            <ul class="space-y-2">
              @for (scope of consentData()!.requestedScopes; track scope) {
                <li class="flex items-start gap-3 text-sm">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="mt-0.5 h-4 w-4 shrink-0 text-primary"
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
                  <span class="text-foreground">{{
                    consentData()!.scopeDescriptions[scope] || scope
                  }}</span>
                </li>
              }
            </ul>
          </div>

          @if (consentData()!.clientHomepageUrl) {
            <p class="mb-6 text-xs text-muted-foreground text-center">
              By approving, you allow this app to use your info in accordance
              with their
              <a
                [href]="consentData()!.clientHomepageUrl"
                target="_blank"
                rel="noopener"
                class="text-primary hover:underline"
                >terms of service</a
              >.
            </p>
          }

          <div class="flex gap-3">
            <button
              (click)="deny()"
              [disabled]="submitting()"
              class="flex-1 rounded-md border border-border px-4 py-3 font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
            >
              Deny
            </button>
            <button
              (click)="approve()"
              [disabled]="submitting()"
              class="flex-1 rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {{ submitting() ? 'Approving...' : 'Approve' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class ConsentComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly consentData = signal<ConsentData | null>(null);

  private consentChallenge = '';

  ngOnInit(): void {
    this.consentChallenge =
      this.route.snapshot.queryParamMap.get('consent_challenge') ?? '';

    if (!this.consentChallenge) {
      this.error.set('Missing consent challenge parameter.');
      this.loading.set(false);
      return;
    }

    this.loadConsentData();
  }

  private async loadConsentData(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<ConsentData>(
          `${environment.identityServiceUrl}/oauth2/consent`,
          { params: { consent_challenge: this.consentChallenge } },
        ),
      );
      this.consentData.set(data);
    } catch {
      this.error.set('Failed to load consent details.');
    } finally {
      this.loading.set(false);
    }
  }

  async approve(): Promise<void> {
    this.submitting.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<{ redirectTo: string }>(
          `${environment.identityServiceUrl}/oauth2/consent`,
          {
            consent_challenge: this.consentChallenge,
            grant: true,
            scopes: this.consentData()?.requestedScopes ?? [],
          },
        ),
      );

      // Redirect to the OAuth2 callback URL with the authorization code
      window.location.href = response.redirectTo;
    } catch {
      this.error.set('Failed to grant consent.');
      this.submitting.set(false);
    }
  }

  async deny(): Promise<void> {
    this.submitting.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<{ redirectTo: string }>(
          `${environment.identityServiceUrl}/oauth2/consent`,
          {
            consent_challenge: this.consentChallenge,
            grant: false,
          },
        ),
      );

      window.location.href = response.redirectTo;
    } catch {
      this.error.set('Failed to deny consent.');
      this.submitting.set(false);
    }
  }
}
