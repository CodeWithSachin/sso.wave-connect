import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-error',
  imports: [RouterLink],
  template: `
    <div
      class="min-h-screen bg-background flex items-center justify-center px-4 font-sans"
    >
      <div
        class="bg-card text-card-foreground rounded-lg p-8 w-full max-w-md border border-border text-center"
      >
        <div
          class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"
        >
          <svg
            class="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 class="text-2xl font-bold text-foreground mb-2">
          Authentication Error
        </h1>

        <p class="text-sm text-muted-foreground mb-2">
          {{ errorCode() }}
        </p>

        <p class="text-sm text-foreground mb-6">
          {{ errorDescription() }}
        </p>

        <a
          routerLink="/login"
          class="inline-block bg-primary text-primary-foreground rounded-md px-6 py-3 font-medium hover:opacity-90 transition-opacity"
        >
          Back to Sign In
        </a>
      </div>
    </div>
  `,
})
export class ErrorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  readonly errorCode = signal('unknown_error');
  readonly errorDescription = signal(
    'An unexpected error occurred. Please try again.',
  );

  ngOnInit(): void {
    this.route.queryParams.subscribe((params: any) => {
      if (params['error']) {
        this.errorCode.set(params['error']);
      }
      if (params['error_description']) {
        this.errorDescription.set(params['error_description']);
      }
    });
  }
}
