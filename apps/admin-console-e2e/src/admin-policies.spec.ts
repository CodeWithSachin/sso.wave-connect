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

test.describe('Admin Security Policies', () => {
  test('should load the policies page with h2 heading', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.locator('h2').first()).toContainText('Security Policies');
  });

  test('should display Password Policy section', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByText('Password Policy')).toBeVisible();
  });

  test('should display MFA Policy section', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByText('MFA Policy')).toBeVisible();
  });

  test('should have a Save Policies button', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByRole('button', { name: /save policies/i })).toBeVisible();
  });

  test('should display Session Policy section', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByText('Session Policy')).toBeVisible();
  });
});
