import { Component, Injectable, signal, computed } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'info', duration = 5000): void {
    const id = this.nextId++;
    const toast: Toast = { id, message, type, duration };
    this.toasts.update((t) => [...t, toast]);

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(message: string, duration = 5000): void {
    this.show(message, 'success', duration);
  }

  error(message: string, duration = 7000): void {
    this.show(message, 'error', duration);
  }

  warning(message: string, duration = 5000): void {
    this.show(message, 'warning', duration);
  }

  info(message: string, duration = 5000): void {
    this.show(message, 'info', duration);
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((toast) => toast.id !== id));
  }
}

@Component({
  standalone: true,
  selector: 'ui-toast-container',
  template: `
    <div
      class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-live="polite"
    >
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          [class]="toastClasses(toast.type)"
          role="alert"
        >
          <div class="flex items-start gap-3">
            <span [class]="iconClasses(toast.type)">
              @switch (toast.type) {
                @case ('success') { &check; }
                @case ('error') { &times; }
                @case ('warning') { ! }
                @case ('info') { i }
              }
            </span>
            <p class="flex-1 text-sm">{{ toast.message }}</p>
            <button
              (click)="toastService.dismiss(toast.id)"
              class="text-current opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  constructor(public readonly toastService: ToastService) {}

  toastClasses(type: ToastType): string {
    const base = 'rounded-lg px-4 py-3 shadow-lg border animate-in slide-in-from-top-2';
    const types: Record<ToastType, string> = {
      success: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-950 dark:border-green-800 dark:text-green-100',
      error: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-100',
      warning: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-100',
      info: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100',
    };
    return `${base} ${types[type]}`;
  }

  iconClasses(type: ToastType): string {
    const base = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold';
    const types: Record<ToastType, string> = {
      success: 'bg-green-500 text-white',
      error: 'bg-red-500 text-white',
      warning: 'bg-amber-500 text-white',
      info: 'bg-blue-500 text-white',
    };
    return `${base} ${types[type]}`;
  }
}
