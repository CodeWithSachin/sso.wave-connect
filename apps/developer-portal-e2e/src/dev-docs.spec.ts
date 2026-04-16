import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer SDK Documentation', () => {
  test('should load the Documentation page with h2 heading', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.locator('h2').first()).toContainText('SDK Documentation');
  });

  test('should display Node.js SDK card', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('Node.js / TypeScript')).toBeVisible();
  });

  test('should display Go SDK card', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText(/^Go$/, { exact: false }).first()).toBeVisible();
  });

  test('should display install commands', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText(/@wave-connect\/sso-sdk/).first()).toBeVisible();
    await expect(page.getByText(/github\.com\/wave-connect\/sso-sdk-go/).first()).toBeVisible();
  });

  test('should display API Reference section', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('API Reference')).toBeVisible();
  });
});
