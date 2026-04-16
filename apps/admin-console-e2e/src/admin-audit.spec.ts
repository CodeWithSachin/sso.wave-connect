import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Audit Log', () => {
  test('should load the audit log page with heading', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.locator('h1')).toContainText('Audit Log');
  });

  test('should display date pickers for filtering', async ({ page }) => {
    await page.goto('/audit');
    const datePickers = page.locator('mat-datepicker-toggle, input[matDatepicker], input[type="date"]');
    await expect(datePickers.first()).toBeVisible();
  });

  test('should have a Search button', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
  });

  test('should display audit log table', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.locator('table')).toBeVisible();
  });

  test('should have filter controls visible', async ({ page }) => {
    await page.goto('/audit');
    const filters = page.locator('mat-form-field, mat-select, input');
    await expect(filters.first()).toBeVisible();
  });
});
