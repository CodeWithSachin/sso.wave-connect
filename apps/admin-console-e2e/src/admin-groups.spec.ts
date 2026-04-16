import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Groups', () => {
  test('should load the groups page with h2 heading', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.locator('h2').first()).toContainText('Groups');
  });

  test('should have a Create Group button', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.getByRole('button', { name: /create group/i })).toBeVisible();
  });

  test('should display groups table', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.locator('table')).toBeVisible();
  });

  test('should open Create Group dialog', async ({ page }) => {
    await page.goto('/groups');
    await page.getByRole('button', { name: /create group/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
