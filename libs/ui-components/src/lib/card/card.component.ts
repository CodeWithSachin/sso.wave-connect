import { Component, input } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ui-card',
  template: `
    <div class="bg-card text-card-foreground rounded-lg border border-border" [class]="padding()">
      @if (title() || subtitle()) {
        <div class="mb-4">
          @if (title()) {
            <h3 class="text-lg font-semibold text-foreground">{{ title() }}</h3>
          }
          @if (subtitle()) {
            <p class="mt-1 text-sm text-muted-foreground">{{ subtitle() }}</p>
          }
        </div>
      }
      <ng-content />
    </div>
  `,
})
export class CardComponent {
  readonly title = input('');
  readonly subtitle = input('');
  readonly padding = input('p-6');
}
