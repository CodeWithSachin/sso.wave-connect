export interface SSOConfig {
  domain: string;
  clientId: string;
  clientSecret?: string;
  symmetricKey?: Buffer; // For v4.local decryption
}

export interface TokenClaims {
  sub: string;
  tid: string;
  email: string;
  scopes: string[];
  jti: string;
  iat: string;
  exp: string;
}

export interface IntrospectionResult {
  active: boolean;
  sub?: string;
  tenant_id?: string;
  email?: string;
  scopes?: string[];
  exp?: number;
}

export interface CheckRequest {
  user: string;
  relation: string;
  object: string;
}

export interface CheckResponse {
  allowed: boolean;
}

export interface ListObjectsRequest {
  user: string;
  relation: string;
  type: string;
}

export interface ListObjectsResponse {
  objects: string[];
}
