import { Component, input, output, computed, contentChildren, TemplateRef, Directive } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
}

export type SortDirection = 'asc' | 'desc' | null;

export interface SortEvent {
  column: string;
  direction: SortDirection;
}

@Component({
  standalone: true,
  selector: 'ui-data-table',
  imports: [NgTemplateOutlet],
  template: `
    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            @for (col of columns(); track col.key) {
              <th
                class="px-4 py-3 text-left font-medium text-muted-foreground"
                [style.width]="col.width ?? 'auto'"
              >
                @if (col.sortable) {
                  <button
                    (click)="toggleSort(col.key)"
                    class="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    {{ col.label }}
                    <span class="text-xs">
                      @if (sortColumn() === col.key && sortDirection() === 'asc') {
                        &uarr;
                      } @else if (sortColumn() === col.key && sortDirection() === 'desc') {
                        &darr;
                      } @else {
                        &updownarrow;
                      }
                    </span>
                  </button>
                } @else {
                  {{ col.label }}
                }
              </th>
            }
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          @if (rows().length === 0) {
            <tr>
              <td
                [attr.colspan]="columns().length"
                class="px-4 py-8 text-center text-muted-foreground"
              >
                {{ emptyMessage() }}
              </td>
            </tr>
          } @else {
            @for (row of rows(); track trackByFn()(row)) {
              <tr class="hover:bg-muted/30 transition-colors">
                @for (col of columns(); track col.key) {
                  <td class="px-4 py-3 text-foreground">
                    @if (cellTemplate()) {
                      <ng-container
                        *ngTemplateOutlet="cellTemplate()!; context: { $implicit: row, column: col.key }"
                      />
                    } @else {
                      {{ row[col.key] }}
                    }
                  </td>
                }
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
  `,
})
export class DataTableComponent {
  readonly columns = input<TableColumn[]>([]);
  readonly rows = input<Record<string, unknown>[]>([]);
  readonly emptyMessage = input('No data available');
  readonly sortColumn = input<string | null>(null);
  readonly sortDirection = input<SortDirection>(null);
  readonly cellTemplate = input<TemplateRef<unknown> | null>(null);
  readonly trackByFn = input<(row: Record<string, unknown>) => unknown>(() => (row) => row['id']);

  readonly sortChange = output<SortEvent>();

  toggleSort(column: string): void {
    const current = this.sortColumn();
    const dir = this.sortDirection();

    let newDirection: SortDirection;
    if (current !== column) {
      newDirection = 'asc';
    } else if (dir === 'asc') {
      newDirection = 'desc';
    } else {
      newDirection = null;
    }

    this.sortChange.emit({ column, direction: newDirection });
  }
}
