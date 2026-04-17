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
  const baseUrl = `${auditServiceUrl}/api/v1/audit-logs`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AuditService],
    });
    service = TestBed.inject(AuditService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
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

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should list audit events with custom pagination', () => {
    service.list({}, 2, 50).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        r.params.get('page') === '2' &&
        r.params.get('pageSize') === '50',
    );
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
      (r) =>
        r.url === baseUrl &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20' &&
        r.params.get('startDate') === '2025-01-01' &&
        r.params.get('endDate') === '2025-01-31',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 1, pageSize: 20 });
  });

  it('should list audit events with action filter', () => {
    const filters = { action: 'user.created' };

    service.list(filters).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20' &&
        r.params.get('action') === 'user.created',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 1, pageSize: 20 });
  });

  it('should list audit events with resourceType filter', () => {
    const filters = { resourceType: 'user' };

    service.list(filters).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20' &&
        r.params.get('resourceType') === 'user',
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
      (r) =>
        r.url === baseUrl &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '10' &&
        r.params.get('startDate') === '2025-03-01' &&
        r.params.get('action') === 'user.login' &&
        r.params.get('actorId') === 'actor-1',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
  });
});
