import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let httpMock: HttpTestingController;

  const auditServiceUrl = 'http://localhost:3400';
  const tenantId = 'test-tenant-id';
  const baseUrl = `${auditServiceUrl}/api/v1/tenants/${tenantId}/audit-logs`;

  beforeEach(() => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'tenantId') return tenantId;
      if (key === 'accessToken') return 'mock-token';
      return null;
    });

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AuditService],
    });
    service = TestBed.inject(AuditService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list audit events with no filters', () => {
    const mockResponse = { data: [], total: 0, page: 1, pageSize: 20 };

    service.list({}).subscribe((res) => {
      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
    });

    const req = httpMock.expectOne(`${baseUrl}?page=1&pageSize=20`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should list audit events with custom pagination', () => {
    service.list({}, 2, 50).subscribe();

    const req = httpMock.expectOne(`${baseUrl}?page=2&pageSize=50`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 2, pageSize: 50 });
  });

  it('should list audit events with date range filters', () => {
    const filters = {
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    };

    service.list(filters).subscribe();

    const req = httpMock.expectOne(
      `${baseUrl}?page=1&pageSize=20&startDate=2025-01-01&endDate=2025-01-31`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 1, pageSize: 20 });
  });

  it('should list audit events with action filter', () => {
    const filters = { action: 'user.created' };

    service.list(filters).subscribe();

    const req = httpMock.expectOne(
      `${baseUrl}?page=1&pageSize=20&action=user.created`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 1, pageSize: 20 });
  });

  it('should list audit events with resourceType filter', () => {
    const filters = { resourceType: 'user' };

    service.list(filters).subscribe();

    const req = httpMock.expectOne(
      `${baseUrl}?page=1&pageSize=20&resourceType=user`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 1, pageSize: 20 });
  });

  it('should list audit events with multiple filters combined', () => {
    const filters = {
      startDate: '2025-03-01',
      action: 'user.login',
      actorId: 'actor-1',
    };

    service.list(filters, 1, 10).subscribe();

    const req = httpMock.expectOne(
      `${baseUrl}?page=1&pageSize=10&startDate=2025-03-01&action=user.login&actorId=actor-1`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
  });
});
