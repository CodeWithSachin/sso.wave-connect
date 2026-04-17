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

test.describe('Admin Dashboard', () => {
  test('should load the dashboard page with h2 heading', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h2').first()).toContainText('Dashboard');
  });

  test('should display the app header in h1', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1').first()).toContainText('Admin Console');
  });

  test('should display stat cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(page.getByText('Active Members')).toBeVisible();
    await expect(page.getByText('Session Rate')).toBeVisible();
    await expect(page.getByText('MFA Enrolled')).toBeVisible();
  });

  test('should have sidebar with all 7 navigation items', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^users$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /groups/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /policies/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /webhooks/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /audit/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /scim/i })).toBeVisible();
  });

  test('should have Recent Activity section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();
  });
});
