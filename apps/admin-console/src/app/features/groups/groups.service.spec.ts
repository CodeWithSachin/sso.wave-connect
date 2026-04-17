import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  let service: GroupsService;
  let httpMock: HttpTestingController;

  const adminApiUrl = 'http://localhost:3100';
  const baseUrl = `${adminApiUrl}/api/v1/groups`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), GroupsService],
    });
    service = TestBed.inject(GroupsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list groups with default pagination', () => {
    const mockResponse = { data: [], total: 0, page: 1, pageSize: 20 };

    service.list().subscribe((res) => {
      expect(res.data).toEqual([]);
    });

    const req = httpMock.expectOne(`${baseUrl}?page=1&pageSize=20`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should list groups with custom pagination', () => {
    service.list(3, 15).subscribe();

    const req = httpMock.expectOne(`${baseUrl}?page=3&pageSize=15`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0, page: 3, pageSize: 15 });
  });

  it('should get a group by id', () => {
    const groupId = 'g1';
    const mockGroup = { id: groupId, name: 'Admins', slug: 'admins', version: 1 };

    service.get(groupId).subscribe((res) => {
      expect(res.id).toBe(groupId);
      expect(res.name).toBe('Admins');
    });

    const req = httpMock.expectOne(`${baseUrl}/${groupId}`);
    expect(req.request.method).toBe('GET');
    req.flush(mockGroup);
  });

  it('should create a group', () => {
    const dto = { name: 'Developers', slug: 'developers', description: 'Dev team' };
    const mockGroup = { id: 'g2', ...dto, version: 1 };

    service.create(dto).subscribe((res) => {
      expect(res.name).toBe('Developers');
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(mockGroup);
  });

  it('should delete a group', () => {
    const groupId = 'g1';

    service.delete(groupId).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/${groupId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ id: groupId });
  });

  it('should add a member to a group', () => {
    const groupId = 'g1';
    const userId = 'u1';

    service.addMember(groupId, userId, 'admin').subscribe();

    const req = httpMock.expectOne(`${baseUrl}/${groupId}/members`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'u1', role: 'admin' });
    req.flush({ id: 'mem1', userId, role: 'admin' });
  });

  it('should add a member with default role', () => {
    const groupId = 'g1';
    const userId = 'u2';

    service.addMember(groupId, userId).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/${groupId}/members`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'u2', role: 'member' });
    req.flush({ id: 'mem2', userId, role: 'member' });
  });

  it('should remove a member from a group', () => {
    const groupId = 'g1';
    const userId = 'u1';

    service.removeMember(groupId, userId).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/${groupId}/members/${userId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
