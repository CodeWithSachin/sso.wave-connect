import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PoliciesService, TenantPolicy } from './policies.service';

describe('PoliciesService', () => {
  let service: PoliciesService;
  let httpMock: HttpTestingController;

  const adminApiUrl = 'http://localhost:3100';
  const tenantId = 'test-tenant-id';
  const policyUrl = `${adminApiUrl}/api/v1/tenants/${tenantId}/settings/policies`;

  beforeEach(() => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'tenantId') return tenantId;
      if (key === 'accessToken') return 'mock-token';
      return null;
    });

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), PoliciesService],
    });
    service = TestBed.inject(PoliciesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get the tenant policy', () => {
    const mockPolicy: Partial<TenantPolicy> = {
      id: 'p1',
      tenantId,
      passwordMinLength: 8,
      passwordRequireUpper: true,
      passwordRequireLower: true,
      passwordRequireNumber: true,
      passwordRequireSymbol: false,
      sessionMaxAgeHours: 24,
      version: 1,
    };

    service.getPolicy().subscribe((res) => {
      expect(res.id).toBe('p1');
      expect(res.passwordMinLength).toBe(8);
    });

    const req = httpMock.expectOne(policyUrl);
    expect(req.request.method).toBe('GET');
    req.flush(mockPolicy);
  });

  it('should update the tenant policy with version', () => {
    const updateDto = {
      passwordMinLength: 12,
      passwordRequireSymbol: true,
      version: 1,
    };

    service.updatePolicy(updateDto).subscribe((res) => {
      expect(res.passwordMinLength).toBe(12);
      expect(res.version).toBe(2);
    });

    const req = httpMock.expectOne(policyUrl);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(updateDto);
    req.flush({ ...updateDto, id: 'p1', version: 2 });
  });

  it('should send partial policy updates', () => {
    const updateDto = {
      sessionMaxAgeHours: 48,
      idleTimeoutMinutes: 30,
      version: 3,
    };

    service.updatePolicy(updateDto).subscribe();

    const req = httpMock.expectOne(policyUrl);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.sessionMaxAgeHours).toBe(48);
    expect(req.request.body.idleTimeoutMinutes).toBe(30);
    expect(req.request.body.version).toBe(3);
    req.flush({ ...updateDto, id: 'p1', version: 4 });
  });

  it('should update lockout settings', () => {
    const updateDto = {
      lockoutThreshold: 5,
      lockoutDurationMin: 15,
      version: 2,
    };

    service.updatePolicy(updateDto).subscribe((res) => {
      expect(res.lockoutThreshold).toBe(5);
    });

    const req = httpMock.expectOne(policyUrl);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(updateDto);
    req.flush({ ...updateDto, id: 'p1', version: 3 });
  });
});
