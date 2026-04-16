import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer API Keys', () => {
  test('should load the API Keys page with heading', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.locator('h1')).toContainText('API Keys');
  });

  test('should have a Create API Key button', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.getByRole('button', { name: /create api key/i })).toBeVisible();
  });

  test('should display table with NAME and KEY PREFIX columns', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('NAME')).toBeVisible();
    await expect(page.getByText('KEY PREFIX')).toBeVisible();
  });

  test('should open create dialog when clicking Create API Key', async ({ page }) => {
    await page.goto('/api-keys');
    await page.getByRole('button', { name: /create api key/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
