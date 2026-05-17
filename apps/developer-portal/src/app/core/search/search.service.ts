import { Injectable, signal } from '@angular/core';

/**
 * Tiny global search-query bus.
 *
 * The developer-portal layout's search input feeds this signal; any list-
 * shaped feature component (api-keys, oauth-apps, future webhooks) reads it
 * and filters its rows client-side. Server-side search is a future
 * follow-up — the current API surface returns small list pages where
 * in-browser filter is sufficient.
 *
 * One signal, one shape, no per-feature plumbing: features only need to
 * `inject(SearchService).query()` and run their own match.
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
