import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer OAuth Apps', () => {
  test('should load the OAuth Apps page with h2 heading', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.locator('h2').first()).toContainText('OAuth Applications');
  });

  test('should have a Register App button', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.getByRole('button', { name: /register app/i })).toBeVisible();
  });

  test('should display OAuth apps table with App Name column', async ({ page }) => {
    await page.goto('/oauth-apps');
    await expect(page.getByRole('columnheader', { name: 'App Name' })).toBeVisible();
  });

  test('should open Register OAuth App dialog', async ({ page }) => {
    await page.goto('/oauth-apps');
    await page.getByRole('button', { name: /register app/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
