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

test.describe('Developer OAuth Apps', () => {
  test('should load the OAuth Apps page with h2 heading', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.locator('h2').first()).toContainText('OAuth Applications');
  });

  test('should have a Register App button', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.getByRole('button', { name: /register app/i })).toBeVisible();
  });

  test('should display OAuth apps table with App Name column', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.getByRole('columnheader', { name: 'App Name' })).toBeVisible();
  });

  test('should open Register OAuth App dialog', async ({ page }) => {
    await page.goto('/oauth-apps');
    await page.getByRole('button', { name: /register app/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
