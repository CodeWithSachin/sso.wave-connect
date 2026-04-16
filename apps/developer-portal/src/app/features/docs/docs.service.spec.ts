import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { DocsService, SdkInfo, CodeExample } from './docs.service';

describe('DocsService', () => {
  let service: DocsService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3500/api/v1/docs';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DocsService],
    });
    service = TestBed.inject(DocsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch SDKs', () => {
    const mockSdks: SdkInfo[] = [
      {
        language: 'TypeScript',
        name: '@wave-connect/sdk',
        version: '1.2.0',
        packageManager: 'npm',
        installCommand: 'npm install @wave-connect/sdk',
        docsUrl: 'https://docs.wave-connect.dev/sdk/typescript',
      },
      {
        language: 'Python',
        name: 'wave-connect',
        version: '0.9.0',
        packageManager: 'pip',
        installCommand: 'pip install wave-connect',
        docsUrl: 'https://docs.wave-connect.dev/sdk/python',
      },
    ];

    service.getSdks().subscribe((sdks) => {
      expect(sdks.length).toBe(2);
      expect(sdks[0].language).toBe('TypeScript');
      expect(sdks[1].name).toBe('wave-connect');
    });

    const req = httpMock.expectOne(`${baseUrl}/sdks`);
    expect(req.request.method).toBe('GET');
    req.flush(mockSdks);
  });

  it('should fetch verify-token example', () => {
    const mockExample: CodeExample = {
      type: 'verify-token',
      title: 'Verify Token',
      description: 'Verify an SSO token issued by Wave Connect.',
      examples: {
        typescript: 'const result = await client.verifyToken(token);',
        python: 'result = client.verify_token(token)',
      },
    };

    service.getExample('verify-token').subscribe((example) => {
      expect(example.type).toBe('verify-token');
      expect(example.title).toBe('Verify Token');
      expect(example.examples['typescript']).toBeDefined();
      expect(example.examples['python']).toBeDefined();
    });

    const req = httpMock.expectOne(`${baseUrl}/examples/verify-token`);
    expect(req.request.method).toBe('GET');
    req.flush(mockExample);
  });

  it('should fetch check-permission example', () => {
    const mockExample: CodeExample = {
      type: 'check-permission',
      title: 'Check Permission',
      description: 'Check if a user has a specific permission.',
      examples: {
        typescript: 'const allowed = await client.checkPermission(userId, perm);',
        python: 'allowed = client.check_permission(user_id, perm)',
      },
    };

    service.getExample('check-permission').subscribe((example) => {
      expect(example.type).toBe('check-permission');
      expect(example.title).toBe('Check Permission');
    });

    const req = httpMock.expectOne(`${baseUrl}/examples/check-permission`);
    expect(req.request.method).toBe('GET');
    req.flush(mockExample);
  });

  it('should handle an empty SDKs response', () => {
    service.getSdks().subscribe((sdks) => {
      expect(sdks).toEqual([]);
    });

    const req = httpMock.expectOne(`${baseUrl}/sdks`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
