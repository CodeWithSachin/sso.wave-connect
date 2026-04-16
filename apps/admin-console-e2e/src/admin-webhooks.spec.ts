import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Webhooks', () => {
  test('should load the webhooks page with h2 heading', async ({ page }) => {
    await page.goto('/webhooks');
    await expect(page.locator('h2').first()).toContainText('Webhooks');
  });

  test('should have an Add Endpoint button', async ({ page }) => {
    await page.goto('/webhooks');
    await expect(page.getByRole('button', { name: /add endpoint/i })).toBeVisible();
  });

  test('should display webhooks table with URL column', async ({ page }) => {
    await page.goto('/webhooks');
    await expect(page.getByRole('columnheader', { name: 'URL' })).toBeVisible();
  });

  test('should open Add Webhook dialog', async ({ page }) => {
    await page.goto('/webhooks');
    await page.getByRole('button', { name: /add endpoint/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
