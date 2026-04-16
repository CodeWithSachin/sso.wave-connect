import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Groups', () => {
  test('should load the groups page with heading', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.locator('h1')).toContainText('Groups');
  });

  test('should have a Create Group button', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.getByRole('button', { name: /create group/i })).toBeVisible();
  });

  test('should display groups table', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.locator('table')).toBeVisible();
  });

  test('should navigate back to dashboard', async ({ page }) => {
    await page.goto('/groups');
    await page.getByText('Dashboard').click();
    await expect(page).toHaveURL(/\/$/);
  });
});
