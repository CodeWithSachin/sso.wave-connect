import { TestBed } from '@angular/core/testing';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
	DomainsService,
	type DomainsListResponse,
	type NewTenantDomain,
	type VerifyOutcome,
} from './domains.service';
import { environment } from '../../environments/environment';

const tenantId = '00000000-0000-0000-0000-000000000099';
const baseUrl = `${environment.identityServiceUrl}/tenants/${tenantId}/domains`;

describe('DomainsService', () => {
	let svc: DomainsService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withInterceptorsFromDi()),
				provideHttpClientTesting(),
			],
		});
		svc = TestBed.inject(DomainsService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => httpMock.verify());

	it('list() GETs /tenants/:id/domains with credentials', () => {
		const mock: DomainsListResponse = { domains: [], role: 'admin' };
		svc.list(tenantId).subscribe((r) => expect(r).toEqual(mock));
		const req = httpMock.expectOne(baseUrl);
		expect(req.request.method).toBe('GET');
		expect(req.request.withCredentials).toBe(true);
		req.flush(mock);
	});

	it('add() POSTs the domain', () => {
		const created: NewTenantDomain = {
			id: 'd1',
			domain: 'acme.com',
			status: 'pending',
			verification_method: 'dns_txt',
			verification_token: 'wave-connect-verify=abc',
			expires_at: '2026-05-01T00:00:00.000Z',
		};
		svc.add(tenantId, { domain: 'acme.com' }).subscribe((r) =>
			expect(r).toEqual(created),
		);
		const req = httpMock.expectOne(baseUrl);
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual({ domain: 'acme.com' });
		req.flush(created);
	});

	it('verify() POSTs the per-domain verify URL', () => {
		const id = 'd1';
		const outcome: VerifyOutcome = { outcome: 'verified' };
		svc.verify(tenantId, id).subscribe((r) => expect(r).toEqual(outcome));
		const req = httpMock.expectOne(`${baseUrl}/${id}/verify`);
		expect(req.request.method).toBe('POST');
		req.flush(outcome);
	});

	it('delete() DELETEs the per-domain URL', () => {
		const id = 'd1';
		svc.delete(tenantId, id).subscribe();
		const req = httpMock.expectOne(`${baseUrl}/${id}`);
		expect(req.request.method).toBe('DELETE');
		req.flush(null);
	});
});
