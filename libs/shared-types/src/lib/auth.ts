// SSO Platform — Auth Request/Response Types

import type { User } from './models';
import type { MfaMethod } from './enums';

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
