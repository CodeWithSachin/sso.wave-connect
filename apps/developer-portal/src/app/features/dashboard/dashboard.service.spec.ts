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
  const baseUrl = 'http://localhost:3500';

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

  it('should fetch API keys count', () => {
    const mockResponse = { data: [{ id: 'key-1' }], total: 5 };

    service.getApiKeys().subscribe((res) => {
      expect(res.total).toBe(5);
      expect(res.data.length).toBe(1);
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${baseUrl}/api/v1/api-keys` &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '1'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should fetch OAuth apps count', () => {
    const mockResponse = { data: [{ id: 'app-1' }], total: 3 };

    service.getOAuthApps().subscribe((res) => {
      expect(res.total).toBe(3);
      expect(res.data.length).toBe(1);
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${baseUrl}/api/v1/oauth-apps` &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '1'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should handle empty API keys response', () => {
    const mockResponse = { data: [], total: 0 };

    service.getApiKeys().subscribe((res) => {
      expect(res.total).toBe(0);
      expect(res.data).toEqual([]);
    });

    const req = httpMock.expectOne(
      (r) => r.url === `${baseUrl}/api/v1/api-keys`
    );
    req.flush(mockResponse);
  });

  it('should handle empty OAuth apps response', () => {
    const mockResponse = { data: [], total: 0 };

    service.getOAuthApps().subscribe((res) => {
      expect(res.total).toBe(0);
      expect(res.data).toEqual([]);
    });

    const req = httpMock.expectOne(
      (r) => r.url === `${baseUrl}/api/v1/oauth-apps`
    );
    req.flush(mockResponse);
  });
});
