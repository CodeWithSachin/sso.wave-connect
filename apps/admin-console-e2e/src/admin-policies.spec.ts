import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Security Policies', () => {
  test('should load the policies page with h2 heading', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.locator('h2').first()).toContainText('Security Policies');
  });

  test('should display Password Policy section', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByText('Password Policy')).toBeVisible();
  });

  test('should display MFA Policy section', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByText('MFA Policy')).toBeVisible();
  });

  test('should have a Save Policies button', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByRole('button', { name: /save policies/i })).toBeVisible();
  });

  test('should display Session Policy section', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByText('Session Policy')).toBeVisible();
  });
});
