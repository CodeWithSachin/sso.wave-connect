import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ScimService, ScimToken, ScimSyncLog } from './scim.service';

describe('ScimService', () => {
  let service: ScimService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3500/api/v1/scim-tokens';

  const mockToken: ScimToken = {
    id: 'st-001',
    tokenPrefix: 'scim_abc_',
    label: 'Production IdP',
    isActive: true,
    lastUsedAt: '2026-04-15T12:00:00Z',
    expiresAt: '2027-04-15T12:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  };

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

  it('should list SCIM tokens', () => {
    const mockResponse = { data: [mockToken] };

    service.listTokens().subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.data[0].label).toBe('Production IdP');
      expect(res.data[0].isActive).toBe(true);
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should generate a SCIM token and return the token once', () => {
    const mockResponse = {
      id: 'st-002',
      token: 'scim_live_fulltoken123',
      prefix: 'scim_live_',
    };

    service.generateToken('Staging IdP').subscribe((res) => {
      expect(res.token).toBe('scim_live_fulltoken123');
      expect(res.id).toBe('st-002');
      expect(res.prefix).toBe('scim_live_');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ label: 'Staging IdP' });
    req.flush(mockResponse);
  });

  it('should generate a SCIM token without a label', () => {
    const mockResponse = {
      id: 'st-003',
      token: 'scim_live_nolabel456',
      prefix: 'scim_live_',
    };

    service.generateToken().subscribe((res) => {
      expect(res.token).toBe('scim_live_nolabel456');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ label: undefined });
    req.flush(mockResponse);
  });

  it('should revoke a SCIM token by id', () => {
    const tokenId = 'st-001';

    service.revokeToken(tokenId).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${baseUrl}/${tokenId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('should get sync logs with pagination', () => {
    const mockLogs: ScimSyncLog[] = [
      {
        id: 'log-001',
        operation: 'CREATE',
        resourceType: 'User',
        resourceId: 'usr-100',
        status: 'success',
        createdAt: '2026-04-15T10:00:00Z',
      },
      {
        id: 'log-002',
        operation: 'UPDATE',
        resourceType: 'Group',
        resourceId: 'grp-50',
        status: 'failure',
        errorMessage: 'Group not found',
        createdAt: '2026-04-15T11:00:00Z',
      },
    ];
    const mockResponse = { data: mockLogs, total: 2 };

    service.getSyncLogs(1, 20).subscribe((res) => {
      expect(res.data.length).toBe(2);
      expect(res.total).toBe(2);
      expect(res.data[0].operation).toBe('CREATE');
      expect(res.data[1].status).toBe('failure');
      expect(res.data[1].errorMessage).toBe('Group not found');
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${baseUrl}/sync-logs` &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '20'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
