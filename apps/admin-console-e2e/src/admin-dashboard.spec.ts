import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
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
