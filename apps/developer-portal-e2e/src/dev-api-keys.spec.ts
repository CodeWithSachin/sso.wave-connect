import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer API Keys', () => {
  test('should load the API Keys page with h2 heading', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.locator('h2').first()).toContainText('API Keys');
  });

  test('should have a Create API Key button', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.getByRole('button', { name: /create api key/i })).toBeVisible();
  });

  test('should display API keys table with Name column', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  });

  test('should open Create API Key dialog', async ({ page }) => {
    await page.goto('/api-keys');
    await page.getByRole('button', { name: /create api key/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
