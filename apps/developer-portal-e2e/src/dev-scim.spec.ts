import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer SCIM Tokens', () => {
  test('should load the SCIM page with h2 heading', async ({ page }) => {
    await page.goto('/scim');
    await expect(page.locator('h2').first()).toContainText('SCIM Provisioning');
  });

  test('should have a Generate Token button', async ({ page }) => {
    await page.goto('/scim');
    await expect(page.getByRole('button', { name: /generate token/i })).toBeVisible();
  });

  test('should display SCIM 2.0 Tokens section', async ({ page }) => {
    await page.goto('/scim');
    await expect(page.getByRole('heading', { name: 'SCIM 2.0 Tokens' })).toBeVisible();
  });

  test('should display Sync Log section', async ({ page }) => {
    await page.goto('/scim');
    await expect(page.getByRole('heading', { name: 'Sync Log' })).toBeVisible();
  });
});
