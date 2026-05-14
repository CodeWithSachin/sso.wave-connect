import { TestBed } from '@angular/core/testing';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
	MigrationsService,
	type MigrationsListResponse,
} from './migrations.service';
import { environment } from '../../environments/environment';

const tenantId = '00000000-0000-0000-0000-000000000099';
const baseUrl = `${environment.identityServiceUrl}/tenants/${tenantId}/migrations`;

describe('MigrationsService', () => {
	let svc: MigrationsService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withInterceptorsFromDi()),
				provideHttpClientTesting(),
			],
		});
		svc = TestBed.inject(MigrationsService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => httpMock.verify());

	it('list() GETs /tenants/:id/migrations', () => {
		const mock: MigrationsListResponse = { migrations: [] };
		svc.list(tenantId).subscribe((r) => expect(r).toEqual(mock));
		const req = httpMock.expectOne(baseUrl);
		expect(req.request.method).toBe('GET');
		expect(req.request.withCredentials).toBe(true);
		req.flush(mock);
	});

	it('notifyForce() POSTs to /:id/notify-force', () => {
		const id = 'mig1';
		svc.notifyForce(tenantId, id).subscribe();
		const req = httpMock.expectOne(`${baseUrl}/${id}/notify-force`);
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual({});
		req.flush(null);
	});

	it('force() POSTs to /:id/force', () => {
		const id = 'mig1';
		svc.force(tenantId, id).subscribe();
		const req = httpMock.expectOne(`${baseUrl}/${id}/force`);
		expect(req.request.method).toBe('POST');
		req.flush(null);
	});
});
