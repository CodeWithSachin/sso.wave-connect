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
          'Access-Control-Allow-Origin': 'http://localhost:4301',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-ID',
        },
      });
      return;
    }
    const url = req.url();
    const body = bodyFor(url);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:4301',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify(body),
    });
  });
}

// Match the URL against known endpoints that expect a specific payload shape.
// Anything we don't recognize gets a generic paginated-list shape, which is a
// superset of what most list endpoints in this app consume.
function bodyFor(url: string): unknown {
  if (url.includes('/settings/policies')) {
    return {
      id: 'pol-mock',
      tenantId: '01473191-863b-4035-ac65-05782ca6159b',
      passwordMinLength: 8,
      passwordRequireUpper: false,
      passwordRequireLower: false,
      passwordRequireNumber: false,
      passwordRequireSymbol: false,
      passwordRequireMfa: false,
      allowedMfaMethods: [],
      sessionMaxAgeHours: 24,
      idleTimeoutMinutes: 30,
      maxSessionsPerUser: 5,
      ipAllowlist: [],
      allowedEmailDomains: [],
      requireSso: false,
      passwordHistoryCount: 0,
      lockoutThreshold: 5,
      lockoutDurationMin: 30,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  return { data: [], total: 0 };
}
