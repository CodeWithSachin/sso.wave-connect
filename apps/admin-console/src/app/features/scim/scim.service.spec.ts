import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ScimService } from './scim.service';

describe('ScimService', () => {
  let service: ScimService;
  let httpMock: HttpTestingController;

  const devPortalApiUrl = 'http://localhost:3500';
  const baseUrl = `${devPortalApiUrl}/api/v1/scim-tokens`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ScimService],
    });
    service = TestBed.inject(ScimService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list tokens', () => {
    const mockResponse = {
      data: [
        { id: 't1', tokenPrefix: 'scim_abc', label: 'prod', isActive: true, createdAt: '2025-01-01' },
      ],
    };

    service.listTokens().subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.data[0].id).toBe('t1');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should generate a token without label', () => {
    const mockResponse = { id: 't2', token: 'scim_full_token', prefix: 'scim_ful' };

    service.generateToken().subscribe((res) => {
      expect(res.token).toBe('scim_full_token');
      expect(res.id).toBe('t2');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ label: undefined });
    req.flush(mockResponse);
  });

  it('should generate a token with label', () => {
    const mockResponse = { id: 't3', token: 'scim_labeled_token', prefix: 'scim_lab' };

    service.generateToken('staging').subscribe((res) => {
      expect(res.token).toBe('scim_labeled_token');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ label: 'staging' });
    req.flush(mockResponse);
  });

  it('should revoke a token', () => {
    const tokenId = 't1';

    service.revokeToken(tokenId).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/${tokenId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('should get sync logs with default pagination', () => {
    const mockResponse = { data: [], total: 0 };

    service.getSyncLogs().subscribe((res) => {
      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
    });

    const req = httpMock.expectOne(`${baseUrl}/sync-logs?page=1&pageSize=20`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should get sync logs with custom pagination', () => {
    service.getSyncLogs(3, 50).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/sync-logs?page=3&pageSize=50`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0 });
  });
});
