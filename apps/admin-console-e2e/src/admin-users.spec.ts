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

test.describe('Admin Users', () => {
  test('should load the users page with h2 heading', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('h2').first()).toContainText('Users');
  });

  test('should display user table with correct columns', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'User' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Last Login' })).toBeVisible();
  });

  test('should have an Invite User button', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByRole('button', { name: /invite user/i })).toBeVisible();
  });

  test('should have a search input that accepts text', async ({ page }) => {
    await page.goto('/users');
    const searchInput = page.getByPlaceholder('Search users...');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('test@example.com');
    await expect(searchInput).toHaveValue('test@example.com');
  });

  test('should open invite dialog when clicking Invite User', async ({ page }) => {
    await page.goto('/users');
    await page.getByRole('button', { name: /invite user/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
