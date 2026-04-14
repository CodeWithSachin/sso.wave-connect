import { Component, input } from '@angular/core';

export type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  standalone: true,
  selector: 'ui-spinner',
  template: `
    <div [class]="containerClasses()" role="status" aria-label="Loading">
      <svg
        [class]="spinnerClasses()"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        ></path>
      </svg>
      @if (label()) {
        <span class="ml-2 text-sm text-muted-foreground">{{ label() }}</span>
      }
    </div>
  `,
})
export class SpinnerComponent {
  readonly size = input<SpinnerSize>('md');
  readonly label = input('');
  readonly center = input(false);

  containerClasses(): string {
    return this.center()
      ? 'flex items-center justify-center'
      : 'inline-flex items-center';
  }

  spinnerClasses(): string {
    const sizes: Record<SpinnerSize, string> = {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-10 w-10',
    };
    return `animate-spin text-primary ${sizes[this.size()]}`;
  }
}
