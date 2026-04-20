import { TestBed } from '@angular/core/testing';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
	InvitationsService,
	type MembershipRow,
	type PaginatedMembershipsResponse,
} from './invitations.service';
import { environment } from '../../environments/environment';

const baseUrl = `${environment.adminApiUrl}/api/v1/memberships`;

describe('InvitationsService', () => {
	let svc: InvitationsService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withInterceptorsFromDi()),
				provideHttpClientTesting(),
			],
		});
		svc = TestBed.inject(InvitationsService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => httpMock.verify());

	it('list() filters by status with pagination params', () => {
		const mock: PaginatedMembershipsResponse = {
			data: [],
			total: 0,
			page: 1,
			pageSize: 50,
		};
		svc.list('pending', 1, 50).subscribe((r) => expect(r).toEqual(mock));
		const req = httpMock.expectOne((r) => r.url === baseUrl);
		expect(req.request.method).toBe('GET');
		expect(req.request.params.get('status')).toBe('pending');
		expect(req.request.params.get('page')).toBe('1');
		expect(req.request.params.get('pageSize')).toBe('50');
		req.flush(mock);
	});

	it('resend() POSTs to /:id/resend', () => {
		const id = 'm1';
		svc.resend(id).subscribe();
		const req = httpMock.expectOne(`${baseUrl}/${id}/resend`);
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual({});
		req.flush({} as MembershipRow);
	});

	it('revoke() DELETEs /:id', () => {
		const id = 'm1';
		svc.revoke(id).subscribe();
		const req = httpMock.expectOne(`${baseUrl}/${id}`);
		expect(req.request.method).toBe('DELETE');
		req.flush({} as MembershipRow);
	});
});
