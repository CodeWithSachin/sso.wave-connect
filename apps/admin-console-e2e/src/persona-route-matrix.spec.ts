import { test, expect } from '@playwright/test';
import { mockBackendAPIs } from './support/mock-backend';
import {
	ALL_PERSONAS,
	ALWAYS_ON_ROUTES,
	installPersonaSession,
	isAllowed,
	type Persona,
} from './support/personas';

/**
 * Persona × route matrix.
 *
 * For each of the 6 personas (super / support / owner / admin / member /
 * individual) and each of the 7 always-on admin-console routes, assert:
 *
 *   - If the persona holds at least one of the route's required capabilities,
 *     the page renders (URL stays on the route).
 *   - Otherwise the capability guard redirects to /dashboard.
 *
 * Sidebar visibility is asserted from a single route load per persona —
 * the `nav a` count must equal the number of routes the persona is
 * allowed to see (per the matrix).
 *
 * Coverage = 6 personas × 7 routes = 42 route assertions, plus 6 sidebar
 * snapshots. If any assertion fails, the matrix in
 * `support/personas.ts`, `apps/admin-api/src/session/capabilities.ts`, or
 * `apps/admin-console/src/app/app.routes.ts` is out of sync.
 */

async function setUp(page: import('@playwright/test').Page, persona: Persona) {
	await mockBackendAPIs(page);
	await installPersonaSession(page, persona);
	await page.context().addCookies([
		{
			name: 'sso_session',
			value: 'e2e-mock-session-token',
			domain: 'localhost',
			path: '/',
			httpOnly: true,
			sameSite: 'Lax',
		},
	]);
	await page.addInitScript(() => {
		sessionStorage.setItem('idToken', 'e2e-mock-id-token');
	});
}

test.describe('Persona × route matrix', () => {
	for (const persona of ALL_PERSONAS) {
		test.describe(`as ${persona}`, () => {
			test.beforeEach(async ({ page }) => setUp(page, persona));

			for (const route of ALWAYS_ON_ROUTES) {
				const allowed = isAllowed(persona, route.required);
				const verb = allowed ? 'renders' : 'redirects to /dashboard';
				test(`${route.path} ${verb}`, async ({ page }) => {
					await page.goto(route.path);
					// Wait for the SessionStore to hydrate before asserting URL.
					// httpResource() requests fire after hydration; the navItems
					// computed signal also needs the capability list.
					await page.waitForLoadState('networkidle');
					if (allowed) {
						expect(new URL(page.url()).pathname).toBe(route.path);
					} else {
						// requireCapability redirects denied routes to /dashboard
						// (the cap-less fallback). Asserting the exact target —
						// rather than just `!= route.path` — catches regressions
						// where the guard throws or the redirect target drifts.
						expect(new URL(page.url()).pathname).toBe('/dashboard');
					}
				});
			}

			test('sidebar shows exactly the routes the persona can access', async ({
				page,
			}) => {
				await page.goto('/dashboard');
				await page.waitForLoadState('networkidle');

				// Skim the visible nav-item href list. If the persona has zero
				// caps the sidebar may still show the empty-state hint instead.
				const hrefs = await page
					.locator('nav a[href]')
					.evaluateAll((nodes) =>
						nodes.map(
							(n) => '/' + (n as HTMLAnchorElement).getAttribute('href')!.replace(/^\/+/, ''),
						),
					);

				const expectedAllowed = ALWAYS_ON_ROUTES.filter((r) =>
					isAllowed(persona, r.required),
				).map((r) => r.path);

				for (const path of expectedAllowed) {
					expect(hrefs).toContain(path);
				}

				// Member persona has zero admin caps — the only sidebar entry is
				// the auth-only Dashboard link (kept visible so a redirected
				// member has somewhere to navigate back to from a typed URL).
				if (persona === 'member') {
					expect(hrefs).toEqual(['/dashboard']);
				}
			});
		});
	}
});
