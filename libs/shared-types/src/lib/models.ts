// SSO Platform — Core Domain Interfaces

import type {
  TenantPlan,
  DataResidency,
  UserStatus,
  MembershipRole,
  SessionStatus,
  MfaMethod,
} from './enums';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  displayName?: string;
  domain?: string;
  logoUrl?: string;
  faviconUrl?: string;
  plan: TenantPlan;
  dataResidency: DataResidency;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  maxUsers: number;
  maxApps: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenantPolicy {
  id: string;
  tenantId: string;
  passwordMinLength: number;
  passwordRequireUpper: boolean;
  passwordRequireLower: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  passwordRequireMfa: boolean;
  allowedMfaMethods: MfaMethod[];
  sessionMaxAgeHours: number;
  idleTimeoutMinutes: number;
  ipAllowlist: string[];
  allowedEmailDomains: string[];
  requireSso: boolean;
  maxSessionsPerUser: number;
  passwordHistoryCount: number;
  lockoutThreshold: number;
  lockoutDurationMin: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  phoneNumber?: string;
  phoneVerified: boolean;
  locale: string;
  timezone: string;
  status: UserStatus;
  metadata: Record<string, unknown>;
  lastLoginAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  tenantId: string;
  role: MembershipRole;
  invitedBy?: string;
  joinedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  status: SessionStatus;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  countryCode?: string;
  city?: string;
  mfaVerified: boolean;
  mfaMethodUsed?: MfaMethod;
  lastActivityAt: string;
  expiresAt: string;
  createdAt: string;
}
