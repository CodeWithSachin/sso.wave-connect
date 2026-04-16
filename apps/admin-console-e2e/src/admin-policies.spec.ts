import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Security Policies', () => {
  test('should load the policies page with heading', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.locator('h1')).toContainText('Security Policies');
  });

  test('should display Password Policy card', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByText('Password Policy')).toBeVisible();
  });

  test('should have toggle switches for policy settings', async ({ page }) => {
    await page.goto('/policies');
    const toggles = page.locator('mat-slide-toggle');
    await expect(toggles.first()).toBeVisible();
  });

  test('should have a Save button', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible();
  });

  test('should display MFA settings section', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByText(/mfa|multi-factor/i)).toBeVisible();
  });
});
