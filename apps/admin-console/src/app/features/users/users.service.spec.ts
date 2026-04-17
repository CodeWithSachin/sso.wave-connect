import { TestBed } from "@angular/core/testing";
import {
	HttpTestingController,
	provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { UsersService, CreateUserDto } from "./users.service";

describe("UsersService", () => {
	let service: UsersService;
	let httpMock: HttpTestingController;

	const adminApiUrl = "http://localhost:3100";
	const baseUrl = `${adminApiUrl}/api/v1/users`;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				UsersService,
			],
		});
		service = TestBed.inject(UsersService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpMock.verify();
	});

	it("should be created", () => {
		expect(service).toBeTruthy();
	});

	it("should list users with default pagination", () => {
		const mockResponse = { data: [], total: 0, page: 1, pageSize: 20 };

		service.list().subscribe((res) => {
			expect(res.data).toEqual([]);
			expect(res.total).toBe(0);
		});

		const req = httpMock.expectOne(`${baseUrl}?page=1&pageSize=20`);
		expect(req.request.method).toBe("GET");
		req.flush(mockResponse);
	});

	it("should list users with custom pagination", () => {
		service.list(2, 10).subscribe();

		const req = httpMock.expectOne(`${baseUrl}?page=2&pageSize=10`);
		expect(req.request.method).toBe("GET");
		req.flush({ data: [], total: 0, page: 2, pageSize: 10 });
	});

	it("should create a user", () => {
		const dto: CreateUserDto = {
			email: "new@example.com",
			displayName: "New User",
			firstName: "New",
			lastName: "User",
		};
		const mockUser = { id: "u1", ...dto, status: "active", version: 1 };

		service.create(dto).subscribe((res) => {
			expect(res.id).toBe("u1");
			expect(res.email).toBe(dto.email);
		});

		const req = httpMock.expectOne(baseUrl);
		expect(req.request.method).toBe("POST");
		expect(req.request.body).toEqual(dto);
		req.flush(mockUser);
	});

	it("should update a user", () => {
		const userId = "u1";
		const updateDto = { displayName: "Updated", version: 1 };

		service.update(userId, updateDto).subscribe((res) => {
			expect(res.displayName).toBe("Updated");
		});

		const req = httpMock.expectOne(`${baseUrl}/${userId}`);
		expect(req.request.method).toBe("PATCH");
		expect(req.request.body).toEqual(updateDto);
		req.flush({ id: userId, displayName: "Updated", version: 2 });
	});

	it("should delete a user", () => {
		const userId = "u1";

		service.delete(userId).subscribe();

		const req = httpMock.expectOne(`${baseUrl}/${userId}`);
		expect(req.request.method).toBe("DELETE");
		req.flush({ id: userId });
	});
});
