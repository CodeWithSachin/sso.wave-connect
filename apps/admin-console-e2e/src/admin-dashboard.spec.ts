import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Admin Dashboard', () => {
  test('should load the dashboard page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should display stat cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(page.getByText('Active Members')).toBeVisible();
    await expect(page.getByText('Session Rate')).toBeVisible();
    await expect(page.getByText('MFA Enrolled')).toBeVisible();
  });

  test('should have sidebar with navigation items', async ({ page }) => {
    await page.goto('/');
    const navItems = page.locator('nav a, nav mat-list-item, nav [mat-list-item]');
    await expect(navItems).toHaveCount(7);
  });

  test('should navigate to users page from sidebar', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Users').click();
    await expect(page).toHaveURL(/\/users/);
  });

  test('should display dashboard heading with correct hierarchy', async ({ page }) => {
    await page.goto('/');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Dashboard');
  });
});
