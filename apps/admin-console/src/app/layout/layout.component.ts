import { Component, computed, inject, signal } from "@angular/core";
import { RouterOutlet, RouterLink, RouterLinkActive } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { NgIcon } from "@ng-icons/core";
import { Toast } from "primeng/toast";
import { ConfirmDialog } from "primeng/confirmdialog";
import { MessageService } from "primeng/api";
import { ConfirmationService } from "primeng/api";
import { firstValueFrom } from "rxjs";
import type { Capability } from "@sso-platform/shared-types";
import { environment } from "../environments/environment";
import { SessionStore } from "../core/session/session.store";

interface NavItem {
	path: string;
	label: string;
	icon: string;
	/**
	 * The user must hold ANY of these capabilities for the entry to render.
	 * Backend enforcement is independent — this only drives UI visibility.
	 */
	caps: Capability[];
}

/**
 * Tenant-mode sidebar — visible whenever `sessionStore.mode() === 'tenant'`.
 * Each entry is filtered against `sessionStore.capabilities()` so a member
 * sees only Overview + Audit log, an admin sees the full set, and so on.
 *
 * Order matters: top-down is the recommended task ordering for an org admin
 * day-to-day. Keep the most-used surfaces above the fold.
 */
const TENANT_NAV: NavItem[] = [
	// Dashboard is auth-only at the router level (it's the redirect target for
	// denied capability checks), so the sidebar entry is always visible too —
	// otherwise a member redirected to /dashboard would have no way to navigate
	// back without typing a URL. Empty `caps` means "no capability gate".
	{ path: "dashboard", label: "Overview", icon: "heroHome", caps: [] },
	{ path: "members", label: "Members", icon: "heroUsers", caps: ["manage_members"] },
	{ path: "invitations", label: "Invitations", icon: "heroEnvelope", caps: ["manage_invitations"] },
	{ path: "groups", label: "Groups", icon: "heroUserGroup", caps: ["manage_members"] },
	{ path: "domains", label: "Domains", icon: "heroGlobeAlt", caps: ["manage_domains"] },
	{ path: "sso", label: "Single sign-on", icon: "heroKey", caps: ["manage_identity_providers"] },
	{ path: "migrations", label: "Migrations", icon: "heroArrowsRightLeft", caps: ["view_migrations"] },
	{ path: "policies", label: "Policies", icon: "heroShieldCheck", caps: ["manage_members"] },
	{ path: "webhooks", label: "Webhooks", icon: "heroBolt", caps: ["manage_members"] },
	{ path: "audit", label: "Audit log", icon: "heroClipboardDocumentList", caps: ["view_audit_log"] },
	{ path: "scim", label: "SCIM", icon: "heroArrowPath", caps: ["manage_identity_providers"] },
];

/**
 * Platform-mode sidebar — visible only when a super-admin (or support)
 * flips the context pill into platform mode. Routes live under /platform/*.
 */
const PLATFORM_NAV: NavItem[] = [
	{ path: "/platform/admins", label: "Platform admins", icon: "heroShieldCheck", caps: ["view_platform_admins"] },
];

@Component({
	selector: "app-layout",
	standalone: true,
	imports: [
		RouterOutlet,
		RouterLink,
		RouterLinkActive,
		NgIcon,
		Toast,
		ConfirmDialog,
	],
	providers: [MessageService, ConfirmationService],
	template: `
		<div class="flex min-h-screen bg-background text-foreground">
			<!-- Sidebar wrapper — relative so the toggle can overflow -->
			<div
				class="sticky top-0 h-screen shrink-0 transition-[width] duration-150 z-20"
				[class.w-60]="!collapsed()"
				[class.w-16]="collapsed()"
			>
				<button
					(click)="collapsed.set(!collapsed())"
					class="absolute -right-3 top-7 z-50 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-muted shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
					[title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
					[attr.aria-label]="
						collapsed() ? 'Expand sidebar' : 'Collapse sidebar'
					"
				>
					<ng-icon
						[name]="collapsed() ? 'heroChevronRight' : 'heroChevronLeft'"
						size="0.7rem"
					/>
				</button>
				<aside
					class="flex h-full w-full flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
				>
					<!-- Logo -->
					<div
						class="flex h-14 items-center gap-2 border-b border-sidebar-border px-4 relative overflow-visible"
						[class.justify-center]="collapsed()"
						[class.px-3]="collapsed()"
					>
						@if (collapsed()) {
							<img
								src="logo-mark.svg"
								alt="Wave Connect"
								class="h-7 w-7 shrink-0"
							/>
						} @else {
							<img src="logo-mark.svg" alt="" class="h-7 w-7 shrink-0" />
							<span
								class="text-[15px] font-semibold tracking-tight text-sidebar-foreground"
							>
								wave<span class="wc-dot">·</span>connect
							</span>
						}
					</div>

					<!--
						Tenant switcher chip — hidden in platform mode because
						"active tenant" is semantically wrong cross-tenant. Hidden
						when the sidebar is collapsed regardless.
					-->
					@if (!collapsed() && session.mode() === "tenant" && session.activeTenant(); as tenant) {
						<button
							type="button"
							class="mx-3 mt-3 flex items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent"
							title="Switch tenant"
						>
							<div
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-primary text-[11px] font-semibold text-primary-foreground"
							>
								{{ tenant.name.charAt(0).toUpperCase() }}
							</div>
							<div class="min-w-0 flex-1 leading-tight">
								<div
									class="truncate text-[13px] font-medium text-sidebar-foreground"
								>
									{{ tenant.name }}
								</div>
								<div class="truncate font-mono text-[10px] text-sidebar-muted">
									{{ tenant.slug }}
								</div>
							</div>
							<ng-icon
								name="heroChevronUpDown"
								class="shrink-0 text-sidebar-muted"
								size="0.8rem"
							/>
						</button>
					}

					<!--
						Platform-mode header — surfaces "you're viewing the platform
						console" so super-admins always know the context they're in.
					-->
					@if (!collapsed() && session.mode() === "platform") {
						<div
							class="mx-3 mt-3 flex items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2"
						>
							<div
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-primary text-[11px] font-semibold text-primary-foreground"
							>
								<ng-icon name="heroShieldCheck" size="0.7rem" />
							</div>
							<div class="min-w-0 flex-1 leading-tight">
								<div class="truncate text-[13px] font-medium text-sidebar-foreground">
									Platform console
								</div>
								<div class="truncate text-[10px] text-sidebar-muted">
									Cross-tenant operations
								</div>
							</div>
						</div>
					}

					<!-- Navigation — items are computed from session capabilities + mode -->
					<nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
						@for (item of navItems(); track item.path) {
							<a
								[routerLink]="item.path"
								routerLinkActive="!bg-sidebar-accent !text-sidebar-accent-foreground font-medium"
								[ariaCurrentWhenActive]="'page'"
								class="flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
								[class.justify-center]="collapsed()"
								[class.px-0]="collapsed()"
								[title]="collapsed() ? item.label : null"
							>
								<ng-icon [name]="item.icon" class="shrink-0" size="0.95rem" />
								@if (!collapsed()) {
									<span>{{ item.label }}</span>
								}
							</a>
						}

						<!-- When the filtered list is empty (e.g. hydrate timeout, member
								 with no admin caps) surface a hint instead of a blank panel. -->
						@if (!collapsed() && navItems().length === 0) {
							<div class="px-2.5 py-3 text-[12px] text-sidebar-muted">
								No accessible sections.
							</div>
						}
					</nav>

					<!-- Footer: user chip + logout -->
					<div class="border-t border-sidebar-border p-3">
						<div
							class="flex items-center gap-2.5 rounded-md px-1.5 py-1"
							[class.justify-center]="collapsed()"
						>
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground"
							>
								{{ userInitials() }}
							</div>
							@if (!collapsed()) {
								<div class="min-w-0 flex-1 leading-tight">
									<div
										class="truncate text-[12px] font-medium text-sidebar-foreground"
									>
										{{ userDisplayName() }}
									</div>
									<div class="truncate text-[11px] text-sidebar-muted">
										{{ userSubtitle() }}
									</div>
								</div>
								<button
									(click)="logout()"
									class="rounded-sm p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
									title="Sign out"
									aria-label="Sign out"
								>
									<ng-icon
										name="heroArrowRightStartOnRectangle"
										size="0.85rem"
									/>
								</button>
							}
						</div>
					</div>
				</aside>
			</div>

			<!-- Main Content -->
			<div class="flex min-w-0 flex-1 flex-col z-10">
				<!-- Top Bar — sticky, translucent cream, search + status -->
				<header
					class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3.5 border-b border-border bg-background/80 px-6 backdrop-blur-sm"
				>
					<div class="relative max-w-100 flex-1">
						<ng-icon
							name="heroMagnifyingGlass"
							class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
							size="0.85rem"
						/>
						<input
							type="search"
							placeholder="Search members, domains, audit events…"
							class="h-8 w-full rounded-md border border-border bg-muted pl-8 pr-12 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/35"
						/>
						<span
							class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
						>
							⌘K
						</span>
					</div>
					<div class="flex-1"></div>

					<!--
						Context pill — visible only to super/support platform admins.
						Toggles the shell between tenant and platform modes; URL
						navigation is purely client-side, no backend call.
					-->
					@if (session.isPlatformAdmin()) {
						<div
							class="hidden items-center gap-0.5 rounded-full border border-border bg-card p-0.5 md:flex"
							role="tablist"
							aria-label="Console context"
						>
							<button
								type="button"
								role="tab"
								(click)="enterTenantMode()"
								[attr.aria-selected]="session.mode() === 'tenant'"
								class="rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors"
								[class.bg-primary]="session.mode() === 'tenant'"
								[class.text-primary-foreground]="session.mode() === 'tenant'"
								[class.text-muted-foreground]="session.mode() !== 'tenant'"
							>
								Tenant
							</button>
							<button
								type="button"
								role="tab"
								(click)="enterPlatformMode()"
								[attr.aria-selected]="session.mode() === 'platform'"
								class="rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors"
								[class.bg-primary]="session.mode() === 'platform'"
								[class.text-primary-foreground]="session.mode() === 'platform'"
								[class.text-muted-foreground]="session.mode() !== 'platform'"
							>
								Platform
							</button>
						</div>
					}

					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] font-medium text-foreground"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-(--wc-success)"></span>
						All systems normal
					</span>
					<button
						(click)="toggleDarkMode()"
						class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						[title]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
						[attr.aria-label]="
							isDark() ? 'Switch to light mode' : 'Switch to dark mode'
						"
					>
						<ng-icon
							[name]="isDark() ? 'heroSun' : 'heroMoon'"
							size="0.95rem"
						/>
					</button>
				</header>

				<!-- Page Content — 1200px inner cap, 24/32 padding -->
				<main class="flex-1">
					<div class="mx-auto max-w-300 px-6 py-6 md:px-8 md:py-8">
						<router-outlet />
					</div>
				</main>
			</div>
		</div>

		<p-toast position="top-right" />
		<p-confirmDialog />
	`,
})
export class LayoutComponent {
	private readonly http = inject(HttpClient);

	/**
	 * Public so the template can read it. SessionStore is the single source
	 * of truth for `mode`, `capabilities`, `user`, `activeTenant`,
	 * `platformAdmin`. The store is hydrated by APP_INITIALIZER (see
	 * app.config.ts) before any route resolves.
	 */
	readonly session = inject(SessionStore);

	collapsed = signal(false);
	isDark = signal(false);

	/**
	 * The sidebar entries the current user is allowed to see.
	 *
	 *   1. Pick TENANT_NAV or PLATFORM_NAV based on the shell mode.
	 *   2. Filter to entries whose `caps[]` intersects the user's capabilities.
	 *
	 * If the SessionStore hydration timed out (`capabilities()` is empty),
	 * this returns an empty list and the template surfaces a fallback hint.
	 */
	readonly navItems = computed<NavItem[]>(() => {
		const source = this.session.mode() === "platform" ? PLATFORM_NAV : TENANT_NAV;
		const caps = this.session.capabilities();
		return source.filter(
			// Empty caps[] means "always show" (auth-only entry, e.g. dashboard).
			// Otherwise: union — at least one required cap must be held.
			(item) => item.caps.length === 0 || item.caps.some((c) => caps.includes(c)),
		);
	});

	readonly userDisplayName = computed(
		() => this.session.user()?.displayName?.trim() || this.session.user()?.email || "Loading…",
	);

	readonly userSubtitle = computed(() => {
		const platform = this.session.platformAdmin();
		if (this.session.mode() === "platform" && platform) {
			return platform.role === "superadmin" ? "Super admin" : platform.role === "support" ? "Platform support" : "Platform readonly";
		}
		const m = this.session.activeMembership();
		if (!m) return this.session.user()?.email ?? "";
		// Capitalize role for display (owner → Owner).
		return m.role.charAt(0).toUpperCase() + m.role.slice(1);
	});

	readonly userInitials = computed(() => {
		const name = this.session.user()?.displayName ?? this.session.user()?.email ?? "?";
		// Split on whitespace, '@', '.', '_', '-' so we get sensible initials
		// for both a "Jane Doe" displayName and a "jane.doe@acme" email
		// fallback (both → "JD"). Without '.', the latter would yield "J".
		const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
		const a = parts[0]?.[0] ?? "?";
		const b = parts[1]?.[0] ?? "";
		return (a + b).toUpperCase().slice(0, 2);
	});

	enterTenantMode(): void {
		this.session.setMode("tenant");
	}

	enterPlatformMode(): void {
		this.session.setMode("platform");
	}

	toggleDarkMode() {
		this.isDark.update((v) => !v);
		document.documentElement.classList.toggle("dark");
	}

	async logout(): Promise<void> {
		try {
			await firstValueFrom(
				this.http.post(
					`${environment.identityServiceUrl}/auth/logout`,
					{},
					{ withCredentials: true },
				),
			);
		} catch {
			// /auth/logout is idempotent and clears the cookie on any outcome;
			// swallow network/transport errors so we still drop local state.
		}
		// Tear down the in-memory session before navigating so any final
		// render in this tab can't briefly show stale data.
		this.session.clear();
		sessionStorage.clear();
		// Hard-navigate to the login portal. Going to '/' would hit the SSO
		// auth guard, and if the sso_session cookie is still live (stale cache,
		// different origin, slow revocation propagation) the guard would silently
		// re-auth the user and bounce them straight back to the dashboard — which
		// is what "logout is broken" looked like. The login portal has no guard
		// and is the canonical signed-out surface.
		//
		// We pass ?return_to=<current URL> so that after a successful re-login
		// the login portal sends the user back to where they were.
		const returnTo = encodeURIComponent(`${window.location.origin}/dashboard`);
		window.location.href = `${environment.loginPortalUrl}?return_to=${returnTo}`;
	}
}
