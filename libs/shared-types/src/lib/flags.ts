// SSO Platform — Frontend Feature Flags
//
// A small compile-time flag surface consumed by admin-console (and, if needed
// later, developer-portal). Each app reads its concrete values from
// `import.meta.env.VITE_FLAG_*` at bootstrap — see
// `apps/admin-console/src/app/environments/flags.ts`.
//
// Flags are orthogonal to capabilities: a page is rendered iff the route
// guard says both `flags.<featureName>` AND `capabilities.includes(<cap>)`.
// Flags let us dark-ship pages (merged, off in prod) without capability churn.

export interface FeatureFlags {
  /** Phase 3 — /platform/admins (super-admin surface). */
  platformAdmins: boolean;
  /** Phase 4 — /domains (DNS TXT verification). */
  domainsPage: boolean;
  /** Phase 5 — /sso (identity providers: SAML + OIDC). */
  ssoPage: boolean;
  /** Phase 6 — /invitations (pending / accepted / expired). */
  invitationsPage: boolean;
  /** Phase 7 — /migrations (post-claim ownership transfer). */
  migrationsPage: boolean;
}
