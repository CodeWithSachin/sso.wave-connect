import { test, expect } from '@playwright/test';
import { mockBackendAPIs } from './support/mock-backend';

test.beforeEach(async ({ context, page }) => {
  await mockBackendAPIs(page);
  // Inject a stub sso_session cookie — the real SessionCookieGuard in the NestJS
  // backend will reject this, but these E2E tests only assert UI rendering and
  // don't hit the live backend. The cookie just needs to exist so the Angular
  // auth guard + credentialsInterceptor behave normally.
  await context.addCookies([
    {
      name: 'sso_session',
      value: 'e2e-mock-session-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  // auth.guard.ts now checks for idToken (proxy for "OAuth flow completed")
  await page.addInitScript(() => {
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Audit Log', () => {
  test('should load the audit log page with h2 heading', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.locator('h2').first()).toContainText('Audit Log');
  });

  test('should have a Search button', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByRole('button', { name: /^search$/i })).toBeVisible();
  });

  test('should have a Clear button', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByRole('button', { name: /clear/i })).toBeVisible();
  });

  test('should display filter labels', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByText('Start Date')).toBeVisible();
    await expect(page.getByText('End Date')).toBeVisible();
  });
});
