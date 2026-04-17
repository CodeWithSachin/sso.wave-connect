import type { Page } from '@playwright/test';

// E2E tests assert UI rendering only; they don't need live backend data. Intercept
// every cross-origin backend request (anything on localhost:3xxx) and reply with an
// empty-but-authoritative payload. This keeps the global 401 interceptor in
// app.config.ts quiet — a real 401 from SessionCookieGuard would otherwise clear
// sessionStorage and hard-redirect to the SSO login, breaking every spec.
export async function mockBackendAPIs(page: Page): Promise<void> {
  await page.route(/^http:\/\/localhost:3\d{3}\//, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:4302',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-ID',
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:4302',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ data: [], total: 0 }),
    });
  });
}
