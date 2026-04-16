import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
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
