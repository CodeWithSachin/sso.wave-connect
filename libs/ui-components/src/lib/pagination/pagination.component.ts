import { Component, computed, input, output } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ui-pagination',
  template: `
    <nav
      class="flex items-center justify-between border-t border-border pt-4"
      aria-label="Pagination"
    >
      <p class="text-sm text-muted-foreground">
        Showing {{ startItem() }}–{{ endItem() }} of {{ total() }}
      </p>
      <div class="flex gap-1">
        <button
          (click)="goToPage(currentPage() - 1)"
          [disabled]="currentPage() <= 1"
          class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Previous
        </button>
        @for (page of visiblePages(); track page) {
          @if (page === -1) {
            <span class="px-2 py-1.5 text-sm text-muted-foreground">...</span>
          } @else {
            <button
              (click)="goToPage(page)"
              [class]="
                page === currentPage()
                  ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground cursor-pointer'
                  : 'rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer'
              "
            >
              {{ page }}
            </button>
          }
        }
        <button
          (click)="goToPage(currentPage() + 1)"
          [disabled]="currentPage() >= totalPages()"
          class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>
    </nav>
  `,
})
export class PaginationComponent {
  readonly total = input(0);
  readonly pageSize = input(20);
  readonly currentPage = input(1);

  readonly pageChange = output<number>();

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize()))
  );

  readonly startItem = computed(() =>
    this.total() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1
  );

  readonly endItem = computed(() =>
    Math.min(this.currentPage() * this.pageSize(), this.total())
  );

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    if (current > 3) pages.push(-1); // ellipsis

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (current < total - 2) pages.push(-1); // ellipsis
    pages.push(total);

    return pages;
  });

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.pageChange.emit(page);
    }
  }
}
