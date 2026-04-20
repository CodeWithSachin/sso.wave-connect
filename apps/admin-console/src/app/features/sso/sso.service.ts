import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type IdpType =
	| 'saml'
	| 'oidc'
	| 'social_google'
	| 'social_github'
	| 'social_microsoft';

/**
 * IdP row as returned by /api/v1/identity-providers. Mirrors the sanitized
 * shape from `apps/admin-api/src/identity-providers/idp.service.ts` —
 * `samlCertificate` and `oidcClientSecretEnc` are stripped server-side.
 */
export interface IdentityProvider {
	id: string;
	tenantId: string;
	name: string;
	type: IdpType;
	domainHint?: string | null;
	samlEntityId?: string | null;
	samlSsoUrl?: string | null;
	samlSloUrl?: string | null;
	samlSigningAlgorithm?: string | null;
	samlNameIdFormat?: string | null;
	oidcIssuer?: string | null;
	oidcClientId?: string | null;
	oidcDiscoveryUrl?: string | null;
	oidcScopes?: string[];
	attributeMapping?: Record<string, string>;
	jitProvisioning: boolean;
	defaultRole: 'owner' | 'admin' | 'member' | 'billing_manager' | 'readonly';
	createdAt: string;
	updatedAt: string;
	version: number;
}

export interface PaginatedIdpResponse {
	data: IdentityProvider[];
	total: number;
	page: number;
	pageSize: number;
}

export interface CreateSamlPayload {
	name: string;
	type: 'saml';
	domainHint?: string;
	samlEntityId: string;
	samlSsoUrl: string;
	samlSloUrl?: string;
	samlCertificate: string;
	samlSigningAlgorithm?: string;
	samlNameIdFormat?: string;
	attributeMapping?: Record<string, string>;
	jitProvisioning?: boolean;
}

export interface CreateOidcPayload {
	name: string;
	type: 'oidc';
	domainHint?: string;
	oidcIssuer: string;
	oidcClientId: string;
	oidcClientSecret: string;
	oidcDiscoveryUrl?: string;
	oidcScopes?: string[];
	attributeMapping?: Record<string, string>;
	jitProvisioning?: boolean;
}

export interface IdpTestResult {
	ok: boolean;
	details?: string;
}

/**
 * Thin HttpClient wrapper for /api/v1/identity-providers (admin-api).
 *
 * The IdP CRUD endpoints have existed; the only new wire is `POST :id/test`
 * added in Phase 5A.
 */
@Injectable({ providedIn: 'root' })
export class SsoService {
	private readonly http = inject(HttpClient);
	private readonly base = `${environment.adminApiUrl}/api/v1/identity-providers`;

	list(page = 1, pageSize = 20): Observable<PaginatedIdpResponse> {
		return this.http.get<PaginatedIdpResponse>(this.base, {
			withCredentials: true,
			params: { page, pageSize },
		});
	}

	createSaml(payload: CreateSamlPayload): Observable<IdentityProvider> {
		return this.http.post<IdentityProvider>(`${this.base}/saml`, payload, {
			withCredentials: true,
		});
	}

	createOidc(payload: CreateOidcPayload): Observable<IdentityProvider> {
		return this.http.post<IdentityProvider>(`${this.base}/oidc`, payload, {
			withCredentials: true,
		});
	}

	delete(id: string): Observable<IdentityProvider> {
		return this.http.delete<IdentityProvider>(`${this.base}/${id}`, {
			withCredentials: true,
		});
	}

	test(id: string): Observable<IdpTestResult> {
		return this.http.post<IdpTestResult>(
			`${this.base}/${id}/test`,
			{},
			{ withCredentials: true },
		);
	}
}
