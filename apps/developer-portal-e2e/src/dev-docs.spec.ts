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

test.describe('Developer SDK Documentation', () => {
  test('should load the Documentation page with h2 heading', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.locator('h2').first()).toContainText('SDK Documentation');
  });

  test('should display Node.js SDK card', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('Node.js / TypeScript')).toBeVisible();
  });

  test('should display Go SDK card', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText(/^Go$/, { exact: false }).first()).toBeVisible();
  });

  test('should display install commands', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText(/@wave-connect\/sso-sdk/).first()).toBeVisible();
    await expect(page.getByText(/github\.com\/wave-connect\/sso-sdk-go/).first()).toBeVisible();
  });

  test('should display API Reference section', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('API Reference')).toBeVisible();
  });
});
