import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { WebhooksService, CreateWebhookDto } from './webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let httpMock: HttpTestingController;

  const webhookServiceUrl = 'http://localhost:3300';
  const baseUrl = `${webhookServiceUrl}/api/v1/webhooks`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), WebhooksService],
    });
    service = TestBed.inject(WebhooksService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list webhooks with default pagination', () => {
    const mockResponse = { data: [], total: 0 };

    service.list().subscribe((res) => {
      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
    });

    const req = httpMock.expectOne(`${baseUrl}?page=1&pageSize=20`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should list webhooks with custom pagination', () => {
    service.list(2, 10).subscribe();

    const req = httpMock.expectOne(`${baseUrl}?page=2&pageSize=10`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0 });
  });

  it('should create a webhook', () => {
    const dto: CreateWebhookDto = {
      url: 'https://hooks.example.com/wh1',
      description: 'Test webhook',
      subscribedEvents: ['user.created', 'user.deleted'],
    };
    const mockResponse = {
      id: 'wh1',
      ...dto,
      isActive: true,
      failureCount: 0,
      version: 1,
      secret: 'whsec_abc123',
    };

    service.create(dto).subscribe((res) => {
      expect(res.id).toBe('wh1');
      expect(res.secret).toBe('whsec_abc123');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(mockResponse);
  });

  it('should update a webhook', () => {
    const webhookId = 'wh1';
    const updateDto = {
      url: 'https://hooks.example.com/updated',
      isActive: false,
      version: 1,
    };

    service.update(webhookId, updateDto).subscribe((res) => {
      expect(res.url).toBe('https://hooks.example.com/updated');
    });

    const req = httpMock.expectOne(`${baseUrl}/${webhookId}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(updateDto);
    req.flush({ id: webhookId, ...updateDto, version: 2 });
  });

  it('should delete a webhook', () => {
    const webhookId = 'wh1';

    service.delete(webhookId).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/${webhookId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
