# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-audit.spec.ts >> Admin Audit Log >> should load the audit log page with h2 heading
- Location: src/admin-audit.spec.ts:25:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h2').first()
Expected substring: "Audit Log"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('h2').first()

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.beforeEach(async ({ context, page }) => {
  4  |   // Inject a stub sso_session cookie — the real SessionCookieGuard in the NestJS
  5  |   // backend will reject this, but these E2E tests only assert UI rendering and
  6  |   // don't hit the live backend. The cookie just needs to exist so the Angular
  7  |   // auth guard + credentialsInterceptor behave normally.
  8  |   await context.addCookies([
  9  |     {
  10 |       name: 'sso_session',
  11 |       value: 'e2e-mock-session-token',
  12 |       domain: 'localhost',
  13 |       path: '/',
  14 |       httpOnly: true,
  15 |       sameSite: 'Lax',
  16 |     },
  17 |   ]);
  18 |   // auth.guard.ts now checks for idToken (proxy for "OAuth flow completed")
  19 |   await page.addInitScript(() => {
  20 |     sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  21 |   });
  22 | });
  23 | 
  24 | test.describe('Admin Audit Log', () => {
  25 |   test('should load the audit log page with h2 heading', async ({ page }) => {
  26 |     await page.goto('/audit');
> 27 |     await expect(page.locator('h2').first()).toContainText('Audit Log');
     |                                              ^ Error: expect(locator).toContainText(expected) failed
  28 |   });
  29 | 
  30 |   test('should have a Search button', async ({ page }) => {
  31 |     await page.goto('/audit');
  32 |     await expect(page.getByRole('button', { name: /^search$/i })).toBeVisible();
  33 |   });
  34 | 
  35 |   test('should have a Clear button', async ({ page }) => {
  36 |     await page.goto('/audit');
  37 |     await expect(page.getByRole('button', { name: /clear/i })).toBeVisible();
  38 |   });
  39 | 
  40 |   test('should display filter labels', async ({ page }) => {
  41 |     await page.goto('/audit');
  42 |     await expect(page.getByText('Start Date')).toBeVisible();
  43 |     await expect(page.getByText('End Date')).toBeVisible();
  44 |   });
  45 | });
  46 | 
```