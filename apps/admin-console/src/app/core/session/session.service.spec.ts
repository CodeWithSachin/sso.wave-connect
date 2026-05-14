import { TestBed } from '@angular/core/testing';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import type { SessionMeDto } from '@sso-platform/shared-types';
import { SessionService } from './session.service';
import { environment } from '../../environments/environment';

const url = `${environment.adminApiUrl}/api/v1/session/me`;

describe('SessionService', () => {
	let svc: SessionService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withInterceptorsFromDi()),
				provideHttpClientTesting(),
			],
		});
		svc = TestBed.inject(SessionService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => httpMock.verify());

	it('getMe() GETs /api/v1/session/me with credentials', () => {
		const mock: SessionMeDto = {
			user: {
				id: 'u1',
				email: 'admin@acme.test',
				emailVerified: true,
				displayName: 'Acme Admin',
			},
			session: {
				id: 's1',
				expiresAt: '2026-04-20T00:00:00.000Z',
			},
			activeTenant: {
				id: 't1',
				slug: 'acme',
				name: 'Acme Inc.',
				kind: 'organization',
			},
			memberships: [
				{
					tenantId: 't1',
					tenantSlug: 'acme',
					tenantName: 'Acme Inc.',
					tenantKind: 'organization',
					role: 'admin',
					isActive: true,
				},
			],
			platform: null,
			capabilities: [
				'manage_members',
				'manage_domains',
				'view_tenant_settings',
			],
		};
		svc.getMe().subscribe((res) => expect(res).toEqual(mock));
		const req = httpMock.expectOne(url);
		expect(req.request.method).toBe('GET');
		expect(req.request.withCredentials).toBe(true);
		req.flush(mock);
	});
});
