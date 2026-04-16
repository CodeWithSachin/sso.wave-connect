import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Users', () => {
  test('should load the users page with heading', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('h1')).toContainText('Users');
  });

  test('should display user table with correct columns', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('USER')).toBeVisible();
    await expect(page.getByText('STATUS')).toBeVisible();
  });

  test('should have an Invite User button', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByRole('button', { name: /invite user/i })).toBeVisible();
  });

  test('should have a search input that accepts text', async ({ page }) => {
    await page.goto('/users');
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('test@example.com');
    await expect(searchInput).toHaveValue('test@example.com');
  });

  test('should open invite dialog when clicking Invite User', async ({ page }) => {
    await page.goto('/users');
    await page.getByRole('button', { name: /invite user/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
