import { TestBed } from '@angular/core/testing';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
	PlatformAdminsService,
	type GrantPlatformAdminPayload,
	type PlatformAdminListResponse,
	type PlatformAdminRow,
} from './platform-admins.service';
import { environment } from '../../environments/environment';

const baseUrl = `${environment.adminApiUrl}/api/v1/platform/admins`;

describe('PlatformAdminsService', () => {
	let svc: PlatformAdminsService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withInterceptorsFromDi()),
				provideHttpClientTesting(),
			],
		});
		svc = TestBed.inject(PlatformAdminsService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => httpMock.verify());

	it('list() GETs /api/v1/platform/admins with credentials', () => {
		const mock: PlatformAdminListResponse = { data: [], total: 0 };
		svc.list().subscribe((res) => expect(res).toEqual(mock));
		const req = httpMock.expectOne(baseUrl);
		expect(req.request.method).toBe('GET');
		expect(req.request.withCredentials).toBe(true);
		req.flush(mock);
	});

	it('grant() POSTs the payload with credentials', () => {
		const payload: GrantPlatformAdminPayload = {
			userId: '11111111-1111-1111-1111-111111111111',
			role: 'support',
			notes: 'on-call rotation',
		};
		const mockRow: PlatformAdminRow = {
			userId: payload.userId,
			email: 'taylor@acme.test',
			role: 'support',
			grantedAt: '2026-04-19T00:00:00.000Z',
			grantedBy: 'super-admin-uuid',
			revokedAt: null,
			notes: 'on-call rotation',
		};
		svc.grant(payload).subscribe((res) => expect(res).toEqual(mockRow));
		const req = httpMock.expectOne(baseUrl);
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual(payload);
		expect(req.request.withCredentials).toBe(true);
		req.flush(mockRow);
	});

	it('revoke() DELETEs the user-scoped URL with credentials', () => {
		const userId = '22222222-2222-2222-2222-222222222222';
		const mockRow: PlatformAdminRow = {
			userId,
			email: 'former@acme.test',
			role: 'support',
			grantedAt: '2026-04-01T00:00:00.000Z',
			grantedBy: null,
			revokedAt: '2026-04-19T00:00:00.000Z',
			notes: null,
		};
		svc.revoke(userId).subscribe((res) => expect(res.revokedAt).toBeTruthy());
		const req = httpMock.expectOne(`${baseUrl}/${userId}`);
		expect(req.request.method).toBe('DELETE');
		expect(req.request.withCredentials).toBe(true);
		req.flush(mockRow);
	});
});
