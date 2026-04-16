import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer OAuth Apps', () => {
  test('should load the OAuth Apps page with heading', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.locator('h1')).toContainText('OAuth Apps');
  });

  test('should have a Register App button', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.getByRole('button', { name: /register app/i })).toBeVisible();
  });

  test('should display OAuth apps table', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.locator('table')).toBeVisible();
  });

  test('should open register dialog when clicking Register App', async ({ page }) => {
    await page.goto('/oauth-apps');
    await page.getByRole('button', { name: /register app/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
