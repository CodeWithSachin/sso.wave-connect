import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'e2e-mock-token');
    sessionStorage.setItem('tenantId', '01473191-863b-4035-ac65-05782ca6159b');
    sessionStorage.setItem('idToken', 'e2e-mock-id-token');
  });
});

test.describe('Developer SDK Documentation', () => {
  test('should load the docs page with heading', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.locator('h1')).toContainText('SDK Documentation');
  });

  test('should display Node.js SDK card', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('Node.js')).toBeVisible();
  });

  test('should display Go SDK card', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('Go')).toBeVisible();
  });

  test('should show install commands', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText(/npm install|yarn add|go get/)).toBeVisible();
  });

  test('should have code snippets visible', async ({ page }) => {
    await page.goto('/docs');
    const codeBlocks = page.locator('pre, code, .code-block');
    await expect(codeBlocks.first()).toBeVisible();
  });
});
