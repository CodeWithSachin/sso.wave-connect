// SSO Platform — Auth Request/Response Types

import type { User, Tenant } from './models.js';
import type {
  Capability,
  MembershipRole,
  MfaMethod,
  PlatformAdminRole,
  TenantKind,
} from './enums.js';

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  tenantSlug?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
  mfaRequired?: boolean;
  mfaChallengeToken?: string;
  mfaMethods?: MfaMethod[];
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RevokeTokenRequest {
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
  methods: MfaMethod[];
}

// --- Session "me" — single bootstrap payload for admin-console (plan v2) ---
// Source: GET /api/v1/session/me on admin-api. Consumed by SessionStore.

/** A user's membership as rendered on the session payload. */
export interface SessionMeMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantKind: TenantKind;
  role: MembershipRole;
  /** True for the tenant that matches sessions.active_tenant_id. */
  isActive: boolean;
}

/** Present iff the caller holds a non-revoked row in platform_admins. */
export interface SessionMePlatform {
  role: PlatformAdminRole;
  grantedAt: string;
}

/**
 * Single source of truth the client needs to render the shell.
 * Returned by `GET /api/v1/session/me`. Stale after 30s — client polls.
 */
export interface SessionMeDto {
  user: Pick<User, 'id' | 'email' | 'emailVerified'> & {
    displayName?: string;
    avatarUrl?: string;
  };
  session: {
    id: string;
    expiresAt: string;
  };
  /** Null while the session has no active tenant (rare — pre-select-tenant). */
  activeTenant: (Pick<Tenant, 'id' | 'slug' | 'name'> & { kind: TenantKind }) | null;
  memberships: SessionMeMembership[];
  /** Null for non-platform-admins. */
  platform: SessionMePlatform | null;
  /** Pre-computed capability list. Frontend reads verbatim — no re-derivation. */
  capabilities: Capability[];
}
