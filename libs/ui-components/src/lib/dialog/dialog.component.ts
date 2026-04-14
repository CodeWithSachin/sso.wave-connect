import { Component, input, output } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ui-dialog',
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <!-- Backdrop -->
        <div
          class="fixed inset-0 bg-black/50 backdrop-blur-sm"
          (click)="onBackdropClick()"
        ></div>

        <!-- Dialog panel -->
        <div
          class="relative z-10 bg-card text-card-foreground rounded-lg border border-border shadow-xl w-full max-h-[85vh] overflow-y-auto"
          [class]="sizeClasses()"
          role="dialog"
          [attr.aria-label]="title()"
        >
          <!-- Header -->
          @if (title()) {
            <div class="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 class="text-lg font-semibold text-foreground">{{ title() }}</h2>
              <button
                (click)="closed.emit()"
                class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          }

          <!-- Body -->
          <div class="px-6 py-4">
            <ng-content />
          </div>

          <!-- Footer (projected) -->
          <ng-content select="[dialog-footer]" />
        </div>
      </div>
    }
  `,
})
export class DialogComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly closeOnBackdrop = input(true);

  readonly closed = output<void>();

  sizeClasses(): string {
    const sizes = {
      sm: 'max-w-sm mx-4',
      md: 'max-w-lg mx-4',
      lg: 'max-w-2xl mx-4',
    };
    return sizes[this.size()];
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop()) {
      this.closed.emit();
    }
  }
}
