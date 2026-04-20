import { TestBed } from '@angular/core/testing';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
	SsoService,
	type CreateOidcPayload,
	type CreateSamlPayload,
	type IdpTestResult,
	type IdentityProvider,
} from './sso.service';
import { environment } from '../../environments/environment';

const baseUrl = `${environment.adminApiUrl}/api/v1/identity-providers`;

describe('SsoService', () => {
	let svc: SsoService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withInterceptorsFromDi()),
				provideHttpClientTesting(),
			],
		});
		svc = TestBed.inject(SsoService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => httpMock.verify());

	it('list() GETs with pagination params', () => {
		svc.list(2, 10).subscribe();
		const req = httpMock.expectOne((r) => r.url === baseUrl);
		expect(req.request.method).toBe('GET');
		expect(req.request.params.get('page')).toBe('2');
		expect(req.request.params.get('pageSize')).toBe('10');
		req.flush({ data: [], total: 0, page: 2, pageSize: 10 });
	});

	it('createSaml() POSTs to /saml', () => {
		const payload: CreateSamlPayload = {
			name: 'Okta',
			type: 'saml',
			samlEntityId: 'urn:acme',
			samlSsoUrl: 'https://idp.acme.com/sso',
			samlCertificate: 'CERT',
		};
		svc.createSaml(payload).subscribe();
		const req = httpMock.expectOne(`${baseUrl}/saml`);
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual(payload);
		req.flush({} as IdentityProvider);
	});

	it('createOidc() POSTs to /oidc', () => {
		const payload: CreateOidcPayload = {
			name: 'Google',
			type: 'oidc',
			oidcIssuer: 'https://accounts.google.com',
			oidcClientId: 'cid',
			oidcClientSecret: 'sec',
		};
		svc.createOidc(payload).subscribe();
		const req = httpMock.expectOne(`${baseUrl}/oidc`);
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual(payload);
		req.flush({} as IdentityProvider);
	});

	it('test() POSTs to /:id/test and returns ok pill data', () => {
		const id = 'idp1';
		const result: IdpTestResult = { ok: true };
		svc.test(id).subscribe((r) => expect(r).toEqual(result));
		const req = httpMock.expectOne(`${baseUrl}/${id}/test`);
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual({});
		req.flush(result);
	});

	it('delete() DELETEs /:id', () => {
		const id = 'idp1';
		svc.delete(id).subscribe();
		const req = httpMock.expectOne(`${baseUrl}/${id}`);
		expect(req.request.method).toBe('DELETE');
		req.flush({} as IdentityProvider);
	});
});
