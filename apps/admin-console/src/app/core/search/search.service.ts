import { Injectable, signal } from '@angular/core';

/**
 * Tiny global search-query bus — mirrors developer-portal exactly so the
 * pattern is identical across the two consoles.
 *
 * The admin-console layout's search input feeds this signal; any
 * list-shaped feature component (members, groups, audit, etc.) reads it
 * and filters its rows client-side. Server-side search is a future
 * follow-up — the current API surface returns small list pages where an
 * in-browser filter is sufficient.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  readonly query = signal('');

  setQuery(q: string): void {
    this.query.set(q.trim());
  }

  clear(): void {
    this.query.set('');
  }
}
