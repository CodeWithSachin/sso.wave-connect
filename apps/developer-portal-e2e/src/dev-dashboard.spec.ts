import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer Dashboard', () => {
  test('should load the dashboard with h2 heading', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h2').first()).toContainText('Developer Dashboard');
  });

  test('should display the app header in h1', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1').first()).toContainText('Developer Portal');
  });

  test('should display stat cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Active API Keys')).toBeVisible();
    await expect(page.getByText('OAuth Applications')).toBeVisible();
    await expect(page.getByText('API Requests (30d)')).toBeVisible();
  });

  test('should display Quick Start section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Quick Start')).toBeVisible();
    await expect(page.getByText('Create an API Key')).toBeVisible();
    await expect(page.getByText('View SDK Docs')).toBeVisible();
  });

  test('should have sidebar with navigation items', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /api keys/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /oauth apps/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /documentation/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /scim/i })).toBeVisible();
  });
});
