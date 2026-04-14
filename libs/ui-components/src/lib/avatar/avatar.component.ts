import { Component, computed, input } from '@angular/core';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  standalone: true,
  selector: 'ui-avatar',
  template: `
    @if (src()) {
      <img
        [src]="src()"
        [alt]="alt()"
        [class]="avatarClasses()"
      />
    } @else {
      <div [class]="placeholderClasses()">
        <span>{{ initials() }}</span>
      </div>
    }
  `,
})
export class AvatarComponent {
  readonly src = input<string | null>(null);
  readonly alt = input('');
  readonly name = input('');
  readonly size = input<AvatarSize>('md');

  readonly initials = computed(() => {
    const n = this.name();
    if (!n) return '?';
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.substring(0, 2).toUpperCase();
  });

  avatarClasses(): string {
    const sizes: Record<AvatarSize, string> = {
      sm: 'h-8 w-8',
      md: 'h-10 w-10',
      lg: 'h-12 w-12',
      xl: 'h-16 w-16',
    };
    return `${sizes[this.size()]} rounded-full object-cover`;
  }

  placeholderClasses(): string {
    const sizes: Record<AvatarSize, string> = {
      sm: 'h-8 w-8 text-xs',
      md: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
      xl: 'h-16 w-16 text-lg',
    };
    return `${sizes[this.size()]} rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium`;
  }
}
