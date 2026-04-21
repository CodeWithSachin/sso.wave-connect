/**
 * Wave Connect — cross-app link registry.
 *
 * Single source of truth for every URL the marketing site links to.
 * Env-aware: dev defaults match the localhost ports the workspace uses
 * (4300 login, 4301 admin, 4302 developer); prod values come from
 * `PUBLIC_*` env vars at build time so deploys can re-target without
 * touching code.
 *
 * The `PUBLIC_` prefix is what Astro / Vite expose to the client; vars
 * without that prefix stay server-only and won't bake into the static
 * HTML. Don't rename — Astro's filter is hard-coded.
 *
 * Usage from `.astro` and `.ts`:
 *   import { links, externals } from '~/lib/links';
 *   <a href={links.login()}>…</a>
 *
 * Same module is consumed by both build-time `.astro` files and the
 * client-runtime island bundle, so the values are baked in at build —
 * no runtime fetch, no hydration mismatch.
 */

const env = (key: string, fallback: string): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
};

/** Origin URLs of the four apps in the workspace. */
export const origins = {
  site: env('PUBLIC_SITE_URL', 'http://localhost:4400'),
  loginPortal: env('PUBLIC_LOGIN_PORTAL_URL', 'http://localhost:4300'),
  adminConsole: env('PUBLIC_ADMIN_CONSOLE_URL', 'http://localhost:4301'),
  developerPortal: env('PUBLIC_DEVELOPER_PORTAL_URL', 'http://localhost:4302'),
} as const;

/**
 * App routes the marketing site sends users to. Internal pages live
 * in `apps/site/src/pages/` (use a plain string like `/pricing`); cross-
 * app destinations should always go through here so a port / subdomain
 * swap in env is a one-line change.
 */
export const links = {
  // -- Marketing (this app) --
  home: () => '/',
  product: () => '/product',
  pricing: () => '/pricing',
  customers: () => '/customers',
  security: () => '/security',

  // -- Cross-app: login-portal --
  login: () => `${origins.loginPortal}/login`,
  signup: () => `${origins.loginPortal}/signup`,
  signupOrg: () => `${origins.loginPortal}/signup-org`,
  /** Direct deep-link into the consumer signup variant. */
  signupConsumer: () => `${origins.loginPortal}/signup`,

  // -- Cross-app: admin-console --
  adminDashboard: () => `${origins.adminConsole}/dashboard`,

  // -- Cross-app: developer-portal --
  devDashboard: () => `${origins.developerPortal}/dashboard`,
  docs: () => `${origins.developerPortal}/docs`,
  apiReference: () => `${origins.developerPortal}/docs#api`,

  // -- External / hand-rolled --
  contactSales: () => 'mailto:hello@wave-connect.test?subject=Wave%20Connect%20demo',
} as const;

/**
 * URLs that point off-platform. Kept separate from `links` so a glance
 * tells you whether a destination crosses the trust boundary (and may
 * want `rel="noopener"`/`target="_blank"` treatment).
 */
export const externals = {
  status: env('PUBLIC_STATUS_URL', 'https://status.wave-connect.test'),
  github: env('PUBLIC_GITHUB_URL', 'https://github.com/wave-connect'),
  twitter: env('PUBLIC_TWITTER_URL', 'https://twitter.com/waveconnect'),
  changelog: env('PUBLIC_CHANGELOG_URL', 'https://changelog.wave-connect.test'),
} as const;

/**
 * Convenience: returns `target="_blank" rel="noopener noreferrer"` props
 * iff `href` points at a different origin than the site itself. Saves
 * peppering every footer link with the same boilerplate.
 */
export function externalAttrs(href: string): { target?: '_blank'; rel?: string } {
  try {
    const dest = new URL(href, origins.site);
    if (dest.origin !== new URL(origins.site).origin) {
      return { target: '_blank', rel: 'noopener noreferrer' };
    }
  } catch {
    // Relative paths and mailto: throw — those stay same-tab.
  }
  return {};
}
