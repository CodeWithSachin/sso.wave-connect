// SSO Platform — public surface of @sso-platform/shared-types.
//
// Re-exports the domain-typed modules so consumers can write:
//   import { SessionMeDto, Capability, FeatureFlags } from '@sso-platform/shared-types';
//
// Keep this file as pure re-exports. Domain definitions live in their
// respective modules (enums.ts, auth.ts, models.ts, …).

export * from './api.js';
export * from './audit.js';
export * from './auth.js';
export * from './enums.js';
export * from './flags.js';
export * from './models.js';
export * from './scim.js';
export * from './webhook.js';
