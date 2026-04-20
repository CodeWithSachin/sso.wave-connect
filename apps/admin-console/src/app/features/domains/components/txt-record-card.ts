import { Component, input, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Surfaces the TXT record the user must add to their DNS zone for a freshly
 * claimed domain. Two columns: host + value. Each is one-click copyable.
 *
 * Shown in two contexts:
 *   - Inline below the "Add domain" dialog after a successful POST.
 *   - In an expanded row state on the Domains list (future).
 *
 * Pure presentational — no store, no service. Inputs only.
 */
@Component({
	selector: 'wc-txt-record-card',
	standalone: true,
	imports: [NgIcon],
	template: `
		<div class="rounded-md border border-border bg-muted/30 p-4">
			<div class="flex items-start gap-3">
				<div
					class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
				>
					<ng-icon name="heroGlobeAlt" size="0.95rem" />
				</div>
				<div class="min-w-0 flex-1">
					<h3 class="text-sm font-semibold text-foreground">
						Verify {{ domain() }}
					</h3>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Add this TXT record to your DNS. We'll re-check automatically every
						10 minutes — or hit Verify now once it propagates.
					</p>

					<dl class="mt-3 grid grid-cols-[80px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-xs">
						<dt class="font-medium text-muted-foreground">Host</dt>
						<dd
							class="overflow-hidden text-ellipsis whitespace-nowrap rounded border border-border bg-card px-2 py-1 font-mono text-foreground"
						>
							{{ host() }}
						</dd>
						<dd>
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								(click)="copy(host(), 'host')"
							>
								<ng-icon
									[name]="copied() === 'host' ? 'heroCheck' : 'heroClipboard'"
									size="0.7rem"
								/>
								{{ copied() === 'host' ? 'Copied' : 'Copy' }}
							</button>
						</dd>

						<dt class="font-medium text-muted-foreground">Value</dt>
						<dd
							class="overflow-hidden text-ellipsis whitespace-nowrap rounded border border-border bg-card px-2 py-1 font-mono text-foreground"
						>
							{{ value() }}
						</dd>
						<dd>
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								(click)="copy(value(), 'value')"
							>
								<ng-icon
									[name]="copied() === 'value' ? 'heroCheck' : 'heroClipboard'"
									size="0.7rem"
								/>
								{{ copied() === 'value' ? 'Copied' : 'Copy' }}
							</button>
						</dd>
					</dl>

					<p class="mt-3 text-[11px] text-muted-foreground">
						DNS changes can take up to 24 hours to propagate.
					</p>
				</div>
			</div>
		</div>
	`,
})
export class TxtRecordCardComponent {
	readonly domain = input.required<string>();
	readonly value = input.required<string>();
	/** Default to '@' (root). Override for sub-domain claims if backend requests. */
	readonly host = input<string>('@');

	readonly copied = signal<'host' | 'value' | null>(null);

	async copy(text: string, which: 'host' | 'value'): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			this.copied.set(which);
			setTimeout(() => this.copied.set(null), 1500);
		} catch {
			// Clipboard blocked — fall back is to show the text raw, which we
			// already do; no action needed.
		}
	}
}
