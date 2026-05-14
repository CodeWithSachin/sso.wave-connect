import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Tenant-domain row shape returned by GET /tenants/:tenantId/domains.
 * Mirrors the JSON the Go handler emits in
 * `apps/identity-service/internal/handler/signup_org.go`.
 *
 * `verification_token` is only present on `pending` rows when the caller
 * holds owner/admin — the backend redacts it for members + verified rows.
 */
export interface TenantDomain {
	id: string;
	domain: string;
	status: 'pending' | 'verifying' | 'verified' | 'failed' | 'expired';
	is_primary: boolean;
	verification_method: 'dns_txt' | 'http' | string;
	verification_token?: string;
	verified_at: string | null;
	last_checked_at: string | null;
	check_attempts: number;
	expires_at: string | null;
	created_at: string;
}

export interface DomainsListResponse {
	domains: TenantDomain[];
	/** Caller's role in the tenant — used to gate UI affordances. */
	role: 'owner' | 'admin' | 'member' | 'billing_manager' | 'readonly';
}

export interface AddDomainPayload {
	domain: string;
}

/**
 * Created by POST. Always exposes the `verification_token` even for
 * subsequent reads via List (which redacts after creation), so the UI can
 * show the TXT record card immediately after Add without a follow-up
 * privileged GET.
 */
export interface NewTenantDomain {
	id: string;
	domain: string;
	status: TenantDomain['status'];
	verification_method: string;
	verification_token: string;
	expires_at: string | null;
}

export interface VerifyOutcome {
	/** 'verified' | 'pending' | 'failed' | 'rate_limited' (server-defined). */
	outcome: string;
}

/**
 * Thin HttpClient wrapper for tenant domain claims.
 *
 * Backend lives on identity-service (port 3000), not admin-api — domain
 * verification cooperates closely with the DNS verification cron, which
 * lives in identity-service.
 *
 * Tenant scope: all routes are rooted at /tenants/:tenantId/. The backend
 * additionally validates that the URL `:tenantId` matches the session's
 * active tenant; a mismatched URL returns 403 (anti-confused-deputy).
 */
@Injectable({ providedIn: 'root' })
export class DomainsService {
	private readonly http = inject(HttpClient);
	private readonly origin = environment.identityServiceUrl;

	private base(tenantId: string): string {
		return `${this.origin}/tenants/${tenantId}/domains`;
	}

	list(tenantId: string): Observable<DomainsListResponse> {
		return this.http.get<DomainsListResponse>(this.base(tenantId), {
			withCredentials: true,
		});
	}

	add(tenantId: string, payload: AddDomainPayload): Observable<NewTenantDomain> {
		return this.http.post<NewTenantDomain>(this.base(tenantId), payload, {
			withCredentials: true,
		});
	}

	verify(tenantId: string, domainId: string): Observable<VerifyOutcome> {
		return this.http.post<VerifyOutcome>(
			`${this.base(tenantId)}/${domainId}/verify`,
			{},
			{ withCredentials: true },
		);
	}

	delete(tenantId: string, domainId: string): Observable<void> {
		return this.http.delete<void>(`${this.base(tenantId)}/${domainId}`, {
			withCredentials: true,
		});
	}
}
