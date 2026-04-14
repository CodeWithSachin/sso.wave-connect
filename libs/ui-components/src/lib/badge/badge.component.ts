import { Component, input } from '@angular/core';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'outline';

@Component({
  standalone: true,
  selector: 'ui-badge',
  template: `
    <span [class]="badgeClasses()">
      <ng-content />
    </span>
  `,
})
export class BadgeComponent {
  readonly variant = input<BadgeVariant>('default');

  badgeClasses(): string {
    const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';

    const variants: Record<BadgeVariant, string> = {
      default: 'bg-primary/10 text-primary',
      success: 'bg-green-500/10 text-green-700 dark:text-green-400',
      warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      destructive: 'bg-destructive/10 text-destructive',
      outline: 'border border-border text-foreground',
    };

    return `${base} ${variants[this.variant()]}`;
  }
}
