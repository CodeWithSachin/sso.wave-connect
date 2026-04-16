import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ApiKeysService, ApiKeysResponse, ApiKey } from './api-keys.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3500/api/v1/api-keys';

  const mockApiKey: ApiKey = {
    id: 'ak-001',
    name: 'Test Key',
    keyPrefix: 'wc_test_',
    status: 'active',
    scopes: ['read:users'],
    rateLimitPerMin: 100,
    lastUsedAt: '2026-04-15T10:00:00Z',
    expiresAt: '2027-04-15T10:00:00Z',
    createdAt: '2026-04-01T10:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ApiKeysService],
    });
    service = TestBed.inject(ApiKeysService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list API keys with pagination', () => {
    const mockResponse: ApiKeysResponse = {
      data: [mockApiKey],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    service.list(1, 20).subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.total).toBe(1);
      expect(res.data[0].name).toBe('Test Key');
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should create an API key and return the full key once', () => {
    const dto = { name: 'New Key', scopes: ['read:users', 'write:users'] };
    const mockResponse = {
      id: 'ak-002',
      key: 'wc_live_abc123xyz',
      prefix: 'wc_live_',
      name: 'New Key',
    };

    service.create(dto).subscribe((res) => {
      expect(res.key).toBe('wc_live_abc123xyz');
      expect(res.id).toBe('ak-002');
      expect(res.name).toBe('New Key');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(mockResponse);
  });

  it('should revoke an API key by id', () => {
    const keyId = 'ak-001';

    service.revoke(keyId).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${baseUrl}/${keyId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('should get usage metrics for an API key', () => {
    const keyId = 'ak-001';
    const mockResponse = {
      data: [
        { date: '2026-04-14', requestCount: 150, errorCount: 3 },
        { date: '2026-04-15', requestCount: 200, errorCount: 1 },
      ],
    };

    service.getUsage(keyId).subscribe((res) => {
      expect(res.data.length).toBe(2);
      expect(res.data[0].requestCount).toBe(150);
      expect(res.data[1].errorCount).toBe(1);
    });

    const req = httpMock.expectOne(`${baseUrl}/${keyId}/usage`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should use default pagination values', () => {
    const mockResponse: ApiKeysResponse = {
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    };

    service.list().subscribe((res) => {
      expect(res.total).toBe(0);
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
