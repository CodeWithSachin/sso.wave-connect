import { Component, input, output, signal } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ui-input',
  template: `
    <div class="w-full">
      @if (label()) {
        <label [for]="inputId()" class="block text-sm font-medium text-foreground mb-1.5">
          {{ label() }}
          @if (required()) {
            <span class="text-destructive">*</span>
          }
        </label>
      }
      <div class="relative">
        <input
          [id]="inputId()"
          [type]="type()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [value]="value()"
          (input)="onInput($event)"
          (blur)="blurred.emit()"
          class="bg-input border border-border rounded-md px-4 py-2.5 w-full text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          [class.border-destructive]="error()"
          [class.focus:ring-destructive]="error()"
        />
      </div>
      @if (error()) {
        <p class="mt-1 text-xs text-destructive">{{ error() }}</p>
      }
      @if (hint() && !error()) {
        <p class="mt-1 text-xs text-muted-foreground">{{ hint() }}</p>
      }
    </div>
  `,
})
export class InputComponent {
  readonly inputId = input('');
  readonly label = input('');
  readonly type = input('text');
  readonly placeholder = input('');
  readonly value = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly required = input(false);
  readonly error = input('');
  readonly hint = input('');

  readonly valueChange = output<string>();
  readonly blurred = output<void>();

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(value);
  }
}
