import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer Dashboard', () => {
  test('should load the dashboard page with heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Developer Dashboard');
  });

  test('should display 3 stat cards', async ({ page }) => {
    await page.goto('/');
    const statCards = page.locator('mat-card, .stat-card, [class*="stat"]');
    await expect(statCards).toHaveCount(3);
  });

  test('should display Quick Start section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Quick Start')).toBeVisible();
  });

  test('should have Create API Key link in Quick Start', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /create api key/i })).toBeVisible();
  });

  test('should have View SDK Docs link in Quick Start', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /view sdk docs/i })).toBeVisible();
  });
});
