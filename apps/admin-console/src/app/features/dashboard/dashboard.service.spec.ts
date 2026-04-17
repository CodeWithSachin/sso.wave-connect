import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  const adminApiUrl = 'http://localhost:3100';
  const auditServiceUrl = 'http://localhost:3400';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DashboardService],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch users with default pageSize', () => {
    const mockResponse = { data: [{ id: '1' }], total: 1 };

    service.getUsers().subscribe((res) => {
      expect(res.total).toBe(1);
      expect(res.data.length).toBe(1);
    });

    const req = httpMock.expectOne(
      `${adminApiUrl}/api/v1/users?page=1&pageSize=1`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should fetch users with custom pageSize', () => {
    service.getUsers(5).subscribe();

    const req = httpMock.expectOne(
      `${adminApiUrl}/api/v1/users?page=1&pageSize=5`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0 });
  });

  it('should fetch memberships with default pageSize', () => {
    const mockResponse = { data: [], total: 0 };

    service.getMemberships().subscribe((res) => {
      expect(res.total).toBe(0);
    });

    const req = httpMock.expectOne(
      `${adminApiUrl}/api/v1/memberships?page=1&pageSize=1`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should fetch recent audit events with default limit', () => {
    const mockResponse = { data: [], total: 0 };

    service.getRecentAuditEvents().subscribe((res) => {
      expect(res.data).toEqual([]);
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${auditServiceUrl}/api/v1/audit-logs` &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '10',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should fetch recent audit events with custom limit', () => {
    service.getRecentAuditEvents(25).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${auditServiceUrl}/api/v1/audit-logs` &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '25',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0 });
  });
});
