import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { OAuthAppsService, OAuthApp, OAuthAppsResponse } from './oauth-apps.service';

describe('OAuthAppsService', () => {
  let service: OAuthAppsService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3500/api/v1/oauth-apps';

  const mockApp: OAuthApp = {
    id: 'oa-001',
    clientId: 'client_abc123',
    name: 'My App',
    redirectUris: ['http://localhost:4200/callback'],
    allowedScopes: ['openid', 'profile'],
    isActive: true,
    createdAt: '2026-04-01T10:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), OAuthAppsService],
    });
    service = TestBed.inject(OAuthAppsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list OAuth apps with pagination', () => {
    const mockResponse: OAuthAppsResponse = {
      data: [mockApp],
      total: 1,
    };

    service.list(1, 20).subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.total).toBe(1);
      expect(res.data[0].name).toBe('My App');
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

  it('should create an OAuth app and return client_id and client_secret', () => {
    const dto = {
      name: 'New App',
      redirect_uris: ['http://localhost:4200/callback'],
      allowed_scopes: ['openid'],
    };
    const mockResponse = {
      id: 'oa-002',
      client_id: 'client_new456',
      client_secret: 'secret_xyz789',
      name: 'New App',
    };

    service.create(dto).subscribe((res) => {
      expect(res.client_id).toBe('client_new456');
      expect(res.client_secret).toBe('secret_xyz789');
      expect(res.name).toBe('New App');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(mockResponse);
  });

  it('should rotate the client secret for an OAuth app', () => {
    const appId = 'oa-001';
    const mockResponse = { client_secret: 'secret_rotated_abc' };

    service.rotateSecret(appId).subscribe((res) => {
      expect(res.client_secret).toBe('secret_rotated_abc');
    });

    const req = httpMock.expectOne(`${baseUrl}/${appId}/rotate-secret`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(mockResponse);
  });

  it('should delete an OAuth app by id', () => {
    const appId = 'oa-001';

    service.delete(appId).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${baseUrl}/${appId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('should use default pagination values', () => {
    const mockResponse: OAuthAppsResponse = { data: [], total: 0 };

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
