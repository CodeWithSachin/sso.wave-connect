/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((module) => {

module.exports = require("@nestjs/common");

/***/ }),
/* 2 */
/***/ ((module) => {

module.exports = require("@nestjs/core");

/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("@nestjs/swagger");

/***/ }),
/* 4 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppModule = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const prisma_module_1 = __webpack_require__(6);
const tenants_module_1 = __webpack_require__(9);
const users_module_1 = __webpack_require__(16);
const memberships_module_1 = __webpack_require__(22);
const groups_module_1 = __webpack_require__(29);
const idp_module_1 = __webpack_require__(36);
const settings_module_1 = __webpack_require__(42);
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            tenants_module_1.TenantsModule,
            users_module_1.UsersModule,
            memberships_module_1.MembershipsModule,
            groups_module_1.GroupsModule,
            idp_module_1.IdpModule,
            settings_module_1.SettingsModule,
        ],
    })
], AppModule);


/***/ }),
/* 5 */
/***/ ((module) => {

module.exports = require("tslib");

/***/ }),
/* 6 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PrismaModule = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const prisma_service_1 = __webpack_require__(7);
let PrismaModule = class PrismaModule {
};
exports.PrismaModule = PrismaModule;
exports.PrismaModule = PrismaModule = tslib_1.__decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [prisma_service_1.PrismaService],
        exports: [prisma_service_1.PrismaService],
    })
], PrismaModule);


/***/ }),
/* 7 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PrismaService = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const client_1 = __webpack_require__(8);
let PrismaService = class PrismaService extends client_1.PrismaClient {
    async onModuleInit() {
        await this.$connect();
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = tslib_1.__decorate([
    (0, common_1.Injectable)()
], PrismaService);


/***/ }),
/* 8 */
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),
/* 9 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TenantsModule = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const tenants_controller_1 = __webpack_require__(10);
const tenants_service_1 = __webpack_require__(11);
let TenantsModule = class TenantsModule {
};
exports.TenantsModule = TenantsModule;
exports.TenantsModule = TenantsModule = tslib_1.__decorate([
    (0, common_1.Module)({
        controllers: [tenants_controller_1.TenantsController],
        providers: [tenants_service_1.TenantsService],
        exports: [tenants_service_1.TenantsService],
    })
], TenantsModule);


/***/ }),
/* 10 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TenantsController = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const swagger_1 = __webpack_require__(3);
const tenants_service_1 = __webpack_require__(11);
const create_tenant_dto_1 = __webpack_require__(12);
const update_tenant_dto_1 = __webpack_require__(14);
const tenant_response_dto_1 = __webpack_require__(15);
let TenantsController = class TenantsController {
    constructor(tenantsService) {
        this.tenantsService = tenantsService;
    }
    create(dto) {
        return this.tenantsService.create(dto);
    }
    findAll(page, pageSize) {
        return this.tenantsService.findAll(page ? parseInt(page, 10) : 1, pageSize ? parseInt(pageSize, 10) : 20);
    }
    findOne(id) {
        return this.tenantsService.findOne(id);
    }
    update(id, dto) {
        return this.tenantsService.update(id, dto);
    }
    remove(id) {
        return this.tenantsService.remove(id);
    }
};
exports.TenantsController = TenantsController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new tenant' }),
    (0, swagger_1.ApiCreatedResponse)({ type: tenant_response_dto_1.TenantResponseDto, description: 'Tenant created' }),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_b = typeof create_tenant_dto_1.CreateTenantDto !== "undefined" && create_tenant_dto_1.CreateTenantDto) === "function" ? _b : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], TenantsController.prototype, "create", null);
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all tenants (paginated)' }),
    (0, swagger_1.ApiOkResponse)({ type: tenant_response_dto_1.PaginatedTenantsResponseDto }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number, example: 20 }),
    tslib_1.__param(0, (0, common_1.Query)('page')),
    tslib_1.__param(1, (0, common_1.Query)('pageSize')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], TenantsController.prototype, "findAll", null);
tslib_1.__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a tenant by ID' }),
    (0, swagger_1.ApiOkResponse)({ type: tenant_response_dto_1.TenantResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Tenant not found' }),
    tslib_1.__param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", void 0)
], TenantsController.prototype, "findOne", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a tenant (optimistic locking via version)' }),
    (0, swagger_1.ApiOkResponse)({ type: tenant_response_dto_1.TenantResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Tenant not found' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Version conflict — tenant was modified concurrently' }),
    tslib_1.__param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_c = typeof update_tenant_dto_1.UpdateTenantDto !== "undefined" && update_tenant_dto_1.UpdateTenantDto) === "function" ? _c : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], TenantsController.prototype, "update", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Soft-delete a tenant' }),
    (0, swagger_1.ApiOkResponse)({ type: tenant_response_dto_1.TenantResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Tenant not found' }),
    tslib_1.__param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", void 0)
], TenantsController.prototype, "remove", null);
exports.TenantsController = TenantsController = tslib_1.__decorate([
    (0, swagger_1.ApiTags)('tenants'),
    (0, common_1.Controller)('api/v1/tenants'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenants_service_1.TenantsService !== "undefined" && tenants_service_1.TenantsService) === "function" ? _a : Object])
], TenantsController);


/***/ }),
/* 11 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var TenantsService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TenantsService = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const prisma_service_1 = __webpack_require__(7);
let TenantsService = TenantsService_1 = class TenantsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TenantsService_1.name);
    }
    async create(dto) {
        return this.prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: {
                    name: dto.name,
                    slug: dto.slug,
                    displayName: dto.displayName,
                    domain: dto.domain,
                    logoUrl: dto.logoUrl,
                    faviconUrl: dto.faviconUrl,
                    plan: dto.plan,
                    dataResidency: dto.dataResidency,
                    settings: dto.settings ?? undefined,
                    metadata: dto.metadata ?? undefined,
                    maxUsers: dto.maxUsers,
                    maxApps: dto.maxApps,
                    isActive: dto.isActive ?? true,
                },
            });
            await tx.tenantPolicy.create({
                data: { tenantId: tenant.id },
            });
            this.logger.log(`Tenant created: ${tenant.id} (${tenant.slug})`);
            return tenant;
        });
    }
    async findAll(page = 1, pageSize = 20) {
        const skip = (page - 1) * pageSize;
        const where = { deletedAt: null };
        const [data, total] = await Promise.all([
            this.prisma.tenant.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.tenant.count({ where }),
        ]);
        return { data, total, page, pageSize };
    }
    async findOne(id) {
        const tenant = await this.prisma.tenant.findUnique({ where: { id } });
        if (!tenant || tenant.deletedAt) {
            throw new common_1.NotFoundException(`Tenant with id "${id}" not found`);
        }
        return tenant;
    }
    async update(id, dto) {
        const existing = await this.findOne(id);
        if (existing.version !== dto.version) {
            throw new common_1.ConflictException(`Version conflict: expected ${dto.version}, found ${existing.version}. The tenant has been modified by another request.`);
        }
        const { version: _version, ...updateData } = dto;
        const tenant = await this.prisma.tenant.update({
            where: { id },
            data: {
                ...updateData,
                settings: updateData.settings ?? undefined,
                metadata: updateData.metadata ?? undefined,
                version: { increment: 1 },
            },
        });
        this.logger.log(`Tenant updated: ${tenant.id} (v${tenant.version})`);
        return tenant;
    }
    async remove(id) {
        await this.findOne(id);
        const tenant = await this.prisma.tenant.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
        this.logger.log(`Tenant soft-deleted: ${tenant.id}`);
        return tenant;
    }
};
exports.TenantsService = TenantsService;
exports.TenantsService = TenantsService = TenantsService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], TenantsService);


/***/ }),
/* 12 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateTenantDto = exports.DataResidency = exports.TenantPlan = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
var TenantPlan;
(function (TenantPlan) {
    TenantPlan["free"] = "free";
    TenantPlan["starter"] = "starter";
    TenantPlan["pro"] = "pro";
    TenantPlan["enterprise"] = "enterprise";
})(TenantPlan || (exports.TenantPlan = TenantPlan = {}));
var DataResidency;
(function (DataResidency) {
    DataResidency["us"] = "us";
    DataResidency["eu"] = "eu";
    DataResidency["ap"] = "ap";
    DataResidency["global"] = "global";
})(DataResidency || (exports.DataResidency = DataResidency = {}));
class CreateTenantDto {
    constructor() {
        this.plan = TenantPlan.free;
    }
}
exports.CreateTenantDto = CreateTenantDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tenant name', example: 'Acme Corp' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateTenantDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'URL-safe slug (lowercase, alphanumeric, hyphens)',
        example: 'acme-corp',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: 'slug must be lowercase alphanumeric with hyphens only',
    }),
    (0, class_validator_1.MaxLength)(100),
    tslib_1.__metadata("design:type", String)
], CreateTenantDto.prototype, "slug", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Display name', example: 'Acme Corporation' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateTenantDto.prototype, "displayName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Primary domain', example: 'acme.com' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateTenantDto.prototype, "domain", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Logo URL' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateTenantDto.prototype, "logoUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Favicon URL' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateTenantDto.prototype, "faviconUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({
        enum: TenantPlan,
        default: TenantPlan.free,
        description: 'Subscription plan',
    }),
    (0, class_validator_1.IsEnum)(TenantPlan),
    tslib_1.__metadata("design:type", String)
], CreateTenantDto.prototype, "plan", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: DataResidency, description: 'Data residency region' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(DataResidency),
    tslib_1.__metadata("design:type", String)
], CreateTenantDto.prototype, "dataResidency", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Settings JSON object' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    tslib_1.__metadata("design:type", typeof (_a = typeof Record !== "undefined" && Record) === "function" ? _a : Object)
], CreateTenantDto.prototype, "settings", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Metadata JSON object' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    tslib_1.__metadata("design:type", typeof (_b = typeof Record !== "undefined" && Record) === "function" ? _b : Object)
], CreateTenantDto.prototype, "metadata", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum number of users', example: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    tslib_1.__metadata("design:type", Number)
], CreateTenantDto.prototype, "maxUsers", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum number of apps', example: 10 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    tslib_1.__metadata("design:type", Number)
], CreateTenantDto.prototype, "maxApps", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether the tenant is active', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], CreateTenantDto.prototype, "isActive", void 0);


/***/ }),
/* 13 */
/***/ ((module) => {

module.exports = require("class-validator");

/***/ }),
/* 14 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateTenantDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
const swagger_2 = __webpack_require__(3);
const create_tenant_dto_1 = __webpack_require__(12);
class UpdateTenantDto extends (0, swagger_1.PartialType)(create_tenant_dto_1.CreateTenantDto) {
}
exports.UpdateTenantDto = UpdateTenantDto;
tslib_1.__decorate([
    (0, swagger_2.ApiProperty)({
        description: 'Current version for optimistic locking (required)',
        example: 1,
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    tslib_1.__metadata("design:type", Number)
], UpdateTenantDto.prototype, "version", void 0);


/***/ }),
/* 15 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PaginatedTenantsResponseDto = exports.TenantResponseDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
class TenantResponseDto {
}
exports.TenantResponseDto = TenantResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tenant UUID' }),
    tslib_1.__metadata("design:type", String)
], TenantResponseDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tenant name' }),
    tslib_1.__metadata("design:type", String)
], TenantResponseDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL-safe slug' }),
    tslib_1.__metadata("design:type", String)
], TenantResponseDto.prototype, "slug", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Display name' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "displayName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Primary domain' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "domain", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Logo URL' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "logoUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Favicon URL' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "faviconUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Subscription plan' }),
    tslib_1.__metadata("design:type", String)
], TenantResponseDto.prototype, "plan", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Data residency region' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "dataResidency", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Settings JSON' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "settings", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Metadata JSON' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "metadata", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Max users' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "maxUsers", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Max apps' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "maxApps", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether tenant is active' }),
    tslib_1.__metadata("design:type", Boolean)
], TenantResponseDto.prototype, "isActive", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Optimistic lock version' }),
    tslib_1.__metadata("design:type", Number)
], TenantResponseDto.prototype, "version", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Creation timestamp' }),
    tslib_1.__metadata("design:type", typeof (_c = typeof Date !== "undefined" && Date) === "function" ? _c : Object)
], TenantResponseDto.prototype, "createdAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last update timestamp' }),
    tslib_1.__metadata("design:type", typeof (_d = typeof Date !== "undefined" && Date) === "function" ? _d : Object)
], TenantResponseDto.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Soft-delete timestamp' }),
    tslib_1.__metadata("design:type", Object)
], TenantResponseDto.prototype, "deletedAt", void 0);
class PaginatedTenantsResponseDto {
}
exports.PaginatedTenantsResponseDto = PaginatedTenantsResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ type: [TenantResponseDto] }),
    tslib_1.__metadata("design:type", Array)
], PaginatedTenantsResponseDto.prototype, "data", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of tenants' }),
    tslib_1.__metadata("design:type", Number)
], PaginatedTenantsResponseDto.prototype, "total", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current page' }),
    tslib_1.__metadata("design:type", Number)
], PaginatedTenantsResponseDto.prototype, "page", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Page size' }),
    tslib_1.__metadata("design:type", Number)
], PaginatedTenantsResponseDto.prototype, "pageSize", void 0);


/***/ }),
/* 16 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersModule = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const users_controller_1 = __webpack_require__(17);
const users_service_1 = __webpack_require__(18);
let UsersModule = class UsersModule {
};
exports.UsersModule = UsersModule;
exports.UsersModule = UsersModule = tslib_1.__decorate([
    (0, common_1.Module)({
        controllers: [users_controller_1.UsersController],
        providers: [users_service_1.UsersService],
        exports: [users_service_1.UsersService],
    })
], UsersModule);


/***/ }),
/* 17 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersController = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const swagger_1 = __webpack_require__(3);
const users_service_1 = __webpack_require__(18);
const create_user_dto_1 = __webpack_require__(19);
const update_user_dto_1 = __webpack_require__(20);
const user_response_dto_1 = __webpack_require__(21);
let UsersController = class UsersController {
    constructor(usersService) {
        this.usersService = usersService;
    }
    create(tenantId, dto) {
        return this.usersService.create(tenantId, dto);
    }
    findAll(tenantId, page, pageSize) {
        return this.usersService.findAll(tenantId, page ? parseInt(page, 10) : 1, pageSize ? parseInt(pageSize, 10) : 20);
    }
    findOne(tenantId, id) {
        return this.usersService.findOne(tenantId, id);
    }
    update(tenantId, id, dto) {
        return this.usersService.update(tenantId, id, dto);
    }
    remove(tenantId, id) {
        return this.usersService.remove(tenantId, id);
    }
};
exports.UsersController = UsersController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a user in a tenant' }),
    (0, swagger_1.ApiCreatedResponse)({ type: user_response_dto_1.UserResponseDto }),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: 'Invalid or missing token' }),
    (0, swagger_1.ApiForbiddenResponse)({ description: 'Insufficient permissions' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_b = typeof create_user_dto_1.CreateUserDto !== "undefined" && create_user_dto_1.CreateUserDto) === "function" ? _b : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], UsersController.prototype, "create", null);
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List users in a tenant (paginated)' }),
    (0, swagger_1.ApiOkResponse)({ type: user_response_dto_1.PaginatedUsersResponseDto }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number, example: 20 }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Query)('page')),
    tslib_1.__param(2, (0, common_1.Query)('pageSize')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], UsersController.prototype, "findAll", null);
tslib_1.__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a user by ID' }),
    (0, swagger_1.ApiOkResponse)({ type: user_response_dto_1.UserResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found in tenant' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], UsersController.prototype, "findOne", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a user (optimistic locking)' }),
    (0, swagger_1.ApiOkResponse)({ type: user_response_dto_1.UserResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Version conflict' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, typeof (_c = typeof update_user_dto_1.UpdateUserDto !== "undefined" && update_user_dto_1.UpdateUserDto) === "function" ? _c : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], UsersController.prototype, "update", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Soft-delete a user' }),
    (0, swagger_1.ApiOkResponse)({ type: user_response_dto_1.UserResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], UsersController.prototype, "remove", null);
exports.UsersController = UsersController = tslib_1.__decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('api/v1/tenants/:tenantId/users'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof users_service_1.UsersService !== "undefined" && users_service_1.UsersService) === "function" ? _a : Object])
], UsersController);


/***/ }),
/* 18 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var UsersService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersService = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const prisma_service_1 = __webpack_require__(7);
let UsersService = UsersService_1 = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(UsersService_1.name);
    }
    async create(tenantId, dto) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _password, ...userData } = dto;
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                displayName: userData.displayName,
                firstName: userData.firstName,
                lastName: userData.lastName,
                phoneNumber: userData.phoneNumber,
                locale: userData.locale ?? 'en',
                timezone: userData.timezone ?? 'UTC',
                status: userData.status ?? 'pending',
                emailVerified: userData.emailVerified ?? false,
                // passwordHash is set by the identity-service, not the admin-api
            },
        });
        // Create membership linking user to tenant
        await this.prisma.membership.create({
            data: {
                userId: user.id,
                tenantId,
                role: 'member',
                joinedAt: new Date(),
            },
        });
        this.logger.log(`User created: ${user.id} (${user.email}) in tenant ${tenantId}`);
        return this.sanitize(user);
    }
    async findAll(tenantId, page = 1, pageSize = 20) {
        const skip = (page - 1) * pageSize;
        const [data, total] = await Promise.all([
            this.prisma.user.findMany({
                where: {
                    deletedAt: null,
                    memberships: { some: { tenantId, deletedAt: null } },
                },
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.user.count({
                where: {
                    deletedAt: null,
                    memberships: { some: { tenantId, deletedAt: null } },
                },
            }),
        ]);
        return { data: data.map(this.sanitize), total, page, pageSize };
    }
    async findOne(tenantId, id) {
        const user = await this.prisma.user.findFirst({
            where: {
                id,
                deletedAt: null,
                memberships: { some: { tenantId, deletedAt: null } },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException(`User "${id}" not found in this tenant`);
        }
        return this.sanitize(user);
    }
    async update(tenantId, id, dto) {
        const existing = await this.findOne(tenantId, id);
        if (existing.version !== dto.version) {
            throw new common_1.ConflictException(`Version conflict: expected ${dto.version}, found ${existing.version}`);
        }
        const { version: _version, ...updateData } = dto;
        const user = await this.prisma.user.update({
            where: { id },
            data: {
                ...updateData,
                version: { increment: 1 },
            },
        });
        this.logger.log(`User updated: ${user.id} (v${user.version})`);
        return this.sanitize(user);
    }
    async remove(tenantId, id) {
        await this.findOne(tenantId, id);
        const user = await this.prisma.user.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
        this.logger.log(`User soft-deleted: ${user.id}`);
        return this.sanitize(user);
    }
    // Strip sensitive fields from response
    sanitize(user) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _ph, metadata: _m, ...safe } = user;
        return safe;
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], UsersService);


/***/ }),
/* 19 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateUserDto = exports.UserStatus = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
var UserStatus;
(function (UserStatus) {
    UserStatus["active"] = "active";
    UserStatus["inactive"] = "inactive";
    UserStatus["suspended"] = "suspended";
    UserStatus["pending"] = "pending";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
class CreateUserDto {
}
exports.CreateUserDto = CreateUserDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Email address', example: 'jane@acme.com' }),
    (0, class_validator_1.IsEmail)(),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "email", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Initial password (min 8 chars)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "password", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Display name', example: 'Jane Doe' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "displayName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'First name', example: 'Jane' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "firstName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last name', example: 'Doe' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "lastName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Phone number', example: '+1234567890' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "phoneNumber", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Locale', example: 'en', default: 'en' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "locale", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timezone', example: 'UTC', default: 'UTC' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "timezone", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: UserStatus, default: UserStatus.pending }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(UserStatus),
    tslib_1.__metadata("design:type", String)
], CreateUserDto.prototype, "status", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Mark email as verified', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], CreateUserDto.prototype, "emailVerified", void 0);


/***/ }),
/* 20 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateUserDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
const create_user_dto_1 = __webpack_require__(19);
class UpdateUserDto {
}
exports.UpdateUserDto = UpdateUserDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Optimistic lock version', example: 1 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    tslib_1.__metadata("design:type", Number)
], UpdateUserDto.prototype, "version", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Display name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], UpdateUserDto.prototype, "displayName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'First name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    tslib_1.__metadata("design:type", String)
], UpdateUserDto.prototype, "firstName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    tslib_1.__metadata("design:type", String)
], UpdateUserDto.prototype, "lastName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Avatar URL' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateUserDto.prototype, "avatarUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Phone number' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateUserDto.prototype, "phoneNumber", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Locale' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateUserDto.prototype, "locale", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timezone' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateUserDto.prototype, "timezone", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_user_dto_1.UserStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(create_user_dto_1.UserStatus),
    tslib_1.__metadata("design:type", typeof (_a = typeof create_user_dto_1.UserStatus !== "undefined" && create_user_dto_1.UserStatus) === "function" ? _a : Object)
], UpdateUserDto.prototype, "status", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Email verified flag' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdateUserDto.prototype, "emailVerified", void 0);


/***/ }),
/* 21 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PaginatedUsersResponseDto = exports.UserResponseDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
class UserResponseDto {
}
exports.UserResponseDto = UserResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User UUID' }),
    tslib_1.__metadata("design:type", String)
], UserResponseDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Email address' }),
    tslib_1.__metadata("design:type", String)
], UserResponseDto.prototype, "email", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Email verified' }),
    tslib_1.__metadata("design:type", Boolean)
], UserResponseDto.prototype, "emailVerified", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Display name' }),
    tslib_1.__metadata("design:type", Object)
], UserResponseDto.prototype, "displayName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'First name' }),
    tslib_1.__metadata("design:type", Object)
], UserResponseDto.prototype, "firstName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last name' }),
    tslib_1.__metadata("design:type", Object)
], UserResponseDto.prototype, "lastName", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Avatar URL' }),
    tslib_1.__metadata("design:type", Object)
], UserResponseDto.prototype, "avatarUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Phone number' }),
    tslib_1.__metadata("design:type", Object)
], UserResponseDto.prototype, "phoneNumber", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Locale' }),
    tslib_1.__metadata("design:type", Object)
], UserResponseDto.prototype, "locale", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Timezone' }),
    tslib_1.__metadata("design:type", Object)
], UserResponseDto.prototype, "timezone", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User status' }),
    tslib_1.__metadata("design:type", String)
], UserResponseDto.prototype, "status", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last login timestamp' }),
    tslib_1.__metadata("design:type", Object)
], UserResponseDto.prototype, "lastLoginAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Optimistic lock version' }),
    tslib_1.__metadata("design:type", Number)
], UserResponseDto.prototype, "version", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Creation timestamp' }),
    tslib_1.__metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], UserResponseDto.prototype, "createdAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last update timestamp' }),
    tslib_1.__metadata("design:type", typeof (_c = typeof Date !== "undefined" && Date) === "function" ? _c : Object)
], UserResponseDto.prototype, "updatedAt", void 0);
class PaginatedUsersResponseDto {
}
exports.PaginatedUsersResponseDto = PaginatedUsersResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ type: [UserResponseDto] }),
    tslib_1.__metadata("design:type", Array)
], PaginatedUsersResponseDto.prototype, "data", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total count' }),
    tslib_1.__metadata("design:type", Number)
], PaginatedUsersResponseDto.prototype, "total", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current page' }),
    tslib_1.__metadata("design:type", Number)
], PaginatedUsersResponseDto.prototype, "page", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Page size' }),
    tslib_1.__metadata("design:type", Number)
], PaginatedUsersResponseDto.prototype, "pageSize", void 0);


/***/ }),
/* 22 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MembershipsModule = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const memberships_controller_1 = __webpack_require__(23);
const memberships_service_1 = __webpack_require__(24);
let MembershipsModule = class MembershipsModule {
};
exports.MembershipsModule = MembershipsModule;
exports.MembershipsModule = MembershipsModule = tslib_1.__decorate([
    (0, common_1.Module)({
        controllers: [memberships_controller_1.MembershipsController],
        providers: [memberships_service_1.MembershipsService],
        exports: [memberships_service_1.MembershipsService],
    })
], MembershipsModule);


/***/ }),
/* 23 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MembershipsController = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const swagger_1 = __webpack_require__(3);
const memberships_service_1 = __webpack_require__(24);
const invite_member_dto_1 = __webpack_require__(26);
const update_role_dto_1 = __webpack_require__(27);
const membership_response_dto_1 = __webpack_require__(28);
let MembershipsController = class MembershipsController {
    constructor(membershipsService) {
        this.membershipsService = membershipsService;
    }
    invite(tenantId, dto) {
        return this.membershipsService.invite(tenantId, dto);
    }
    findAll(tenantId, page, pageSize) {
        return this.membershipsService.findAll(tenantId, page ? parseInt(page, 10) : 1, pageSize ? parseInt(pageSize, 10) : 20);
    }
    findOne(tenantId, id) {
        return this.membershipsService.findOne(tenantId, id);
    }
    updateRole(tenantId, id, dto) {
        return this.membershipsService.updateRole(tenantId, id, dto);
    }
    remove(tenantId, id) {
        return this.membershipsService.remove(tenantId, id);
    }
};
exports.MembershipsController = MembershipsController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Invite a user to the tenant' }),
    (0, swagger_1.ApiCreatedResponse)({ type: membership_response_dto_1.MembershipResponseDto }),
    (0, swagger_1.ApiConflictResponse)({ description: 'User already a member' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User email not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_b = typeof invite_member_dto_1.InviteMemberDto !== "undefined" && invite_member_dto_1.InviteMemberDto) === "function" ? _b : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], MembershipsController.prototype, "invite", null);
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List tenant memberships (paginated)' }),
    (0, swagger_1.ApiOkResponse)({ type: membership_response_dto_1.PaginatedMembershipsResponseDto }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number, example: 20 }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Query)('page')),
    tslib_1.__param(2, (0, common_1.Query)('pageSize')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], MembershipsController.prototype, "findAll", null);
tslib_1.__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a membership by ID' }),
    (0, swagger_1.ApiOkResponse)({ type: membership_response_dto_1.MembershipResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Membership not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], MembershipsController.prototype, "findOne", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':id/role'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a member role (writes to authz outbox)' }),
    (0, swagger_1.ApiOkResponse)({ type: membership_response_dto_1.MembershipResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Membership not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, typeof (_c = typeof update_role_dto_1.UpdateRoleDto !== "undefined" && update_role_dto_1.UpdateRoleDto) === "function" ? _c : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], MembershipsController.prototype, "updateRole", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a member from the tenant' }),
    (0, swagger_1.ApiOkResponse)({ type: membership_response_dto_1.MembershipResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Membership not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], MembershipsController.prototype, "remove", null);
exports.MembershipsController = MembershipsController = tslib_1.__decorate([
    (0, swagger_1.ApiTags)('memberships'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('api/v1/tenants/:tenantId/memberships'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof memberships_service_1.MembershipsService !== "undefined" && memberships_service_1.MembershipsService) === "function" ? _a : Object])
], MembershipsController);


/***/ }),
/* 24 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var MembershipsService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MembershipsService = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const prisma_service_1 = __webpack_require__(7);
const crypto_1 = __webpack_require__(25);
let MembershipsService = MembershipsService_1 = class MembershipsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(MembershipsService_1.name);
    }
    /**
     * Invite a user to a tenant.
     * Creates the membership + writes an authz_outbox entry in a single transaction.
     */
    async invite(tenantId, dto, inviterId) {
        const role = dto.role ?? 'member';
        // Resolve user by email
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user) {
            throw new common_1.NotFoundException(`User with email "${dto.email}" not found`);
        }
        // Check if already a member
        const existing = await this.prisma.membership.findUnique({
            where: { tenantId_userId: { tenantId, userId: user.id } },
        });
        if (existing && !existing.deletedAt) {
            throw new common_1.ConflictException('User is already a member of this tenant');
        }
        // Get tenant for OpenFGA store ID
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            const membership = existing
                ? await tx.membership.update({
                    where: { id: existing.id },
                    data: {
                        role,
                        invitedBy: inviterId,
                        joinedAt: new Date(),
                        deletedAt: null,
                    },
                })
                : await tx.membership.create({
                    data: {
                        userId: user.id,
                        tenantId,
                        role,
                        invitedBy: inviterId,
                        joinedAt: new Date(),
                    },
                });
            // Write to authz outbox — the outbox worker will sync to OpenFGA
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId: tenant.openfgaStoreId ?? '',
                    operation: 'write',
                    tupleUser: `user:${user.id}`,
                    tupleRelation: role,
                    tupleObject: `organization:${tenantId}`,
                    idempotencyKey: `membership:${membership.id}:${role}:${(0, crypto_1.randomUUID)()}`,
                    actorUserId: inviterId,
                    source: 'admin-api',
                },
            });
            this.logger.log(`Membership created: user=${user.id} tenant=${tenantId} role=${role}`);
            return membership;
        });
    }
    async findAll(tenantId, page = 1, pageSize = 20) {
        const skip = (page - 1) * pageSize;
        const where = { tenantId, deletedAt: null };
        const [data, total] = await Promise.all([
            this.prisma.membership.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { id: true, email: true, displayName: true, avatarUrl: true },
                    },
                },
            }),
            this.prisma.membership.count({ where }),
        ]);
        return { data, total, page, pageSize };
    }
    async findOne(tenantId, id) {
        const membership = await this.prisma.membership.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: {
                user: {
                    select: { id: true, email: true, displayName: true, avatarUrl: true },
                },
            },
        });
        if (!membership) {
            throw new common_1.NotFoundException(`Membership "${id}" not found`);
        }
        return membership;
    }
    /**
     * Update a member's role.
     * Deletes the old tuple and writes the new one to authz_outbox.
     */
    async updateRole(tenantId, id, dto, actorId) {
        const existing = await this.findOne(tenantId, id);
        if (existing.role === dto.role) {
            return existing; // No change needed
        }
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.membership.update({
                where: { id },
                data: { role: dto.role },
                include: {
                    user: {
                        select: { id: true, email: true, displayName: true, avatarUrl: true },
                    },
                },
            });
            const storeId = tenant.openfgaStoreId ?? '';
            const batchId = (0, crypto_1.randomUUID)();
            // Delete old role tuple
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId,
                    operation: 'delete',
                    tupleUser: `user:${existing.userId}`,
                    tupleRelation: existing.role,
                    tupleObject: `organization:${tenantId}`,
                    idempotencyKey: `membership:${id}:del:${existing.role}:${batchId}`,
                    actorUserId: actorId,
                    source: 'admin-api',
                },
            });
            // Write new role tuple
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId,
                    operation: 'write',
                    tupleUser: `user:${existing.userId}`,
                    tupleRelation: dto.role,
                    tupleObject: `organization:${tenantId}`,
                    idempotencyKey: `membership:${id}:add:${dto.role}:${batchId}`,
                    actorUserId: actorId,
                    source: 'admin-api',
                },
            });
            this.logger.log(`Membership role updated: ${id} ${existing.role} -> ${dto.role}`);
            return updated;
        });
    }
    /**
     * Remove a membership.
     * Soft-deletes + writes delete tuple to authz_outbox.
     */
    async remove(tenantId, id, actorId) {
        const existing = await this.findOne(tenantId, id);
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            const deleted = await tx.membership.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId: tenant.openfgaStoreId ?? '',
                    operation: 'delete',
                    tupleUser: `user:${existing.userId}`,
                    tupleRelation: existing.role,
                    tupleObject: `organization:${tenantId}`,
                    idempotencyKey: `membership:${id}:remove:${(0, crypto_1.randomUUID)()}`,
                    actorUserId: actorId,
                    source: 'admin-api',
                },
            });
            this.logger.log(`Membership removed: ${id}`);
            return deleted;
        });
    }
};
exports.MembershipsService = MembershipsService;
exports.MembershipsService = MembershipsService = MembershipsService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], MembershipsService);


/***/ }),
/* 25 */
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),
/* 26 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InviteMemberDto = exports.MembershipRole = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
var MembershipRole;
(function (MembershipRole) {
    MembershipRole["owner"] = "owner";
    MembershipRole["admin"] = "admin";
    MembershipRole["member"] = "member";
    MembershipRole["billing_manager"] = "billing_manager";
    MembershipRole["readonly"] = "readonly";
})(MembershipRole || (exports.MembershipRole = MembershipRole = {}));
class InviteMemberDto {
}
exports.InviteMemberDto = InviteMemberDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Email of the user to invite', example: 'jane@acme.com' }),
    (0, class_validator_1.IsEmail)(),
    tslib_1.__metadata("design:type", String)
], InviteMemberDto.prototype, "email", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: MembershipRole, default: MembershipRole.member }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(MembershipRole),
    tslib_1.__metadata("design:type", String)
], InviteMemberDto.prototype, "role", void 0);


/***/ }),
/* 27 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateRoleDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
const invite_member_dto_1 = __webpack_require__(26);
class UpdateRoleDto {
}
exports.UpdateRoleDto = UpdateRoleDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ enum: invite_member_dto_1.MembershipRole, description: 'New role' }),
    (0, class_validator_1.IsEnum)(invite_member_dto_1.MembershipRole),
    tslib_1.__metadata("design:type", typeof (_a = typeof invite_member_dto_1.MembershipRole !== "undefined" && invite_member_dto_1.MembershipRole) === "function" ? _a : Object)
], UpdateRoleDto.prototype, "role", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Optimistic lock version (not on membership — use current known state)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    tslib_1.__metadata("design:type", Number)
], UpdateRoleDto.prototype, "version", void 0);


/***/ }),
/* 28 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PaginatedMembershipsResponseDto = exports.MembershipResponseDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
class MembershipResponseDto {
}
exports.MembershipResponseDto = MembershipResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Membership UUID' }),
    tslib_1.__metadata("design:type", String)
], MembershipResponseDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User UUID' }),
    tslib_1.__metadata("design:type", String)
], MembershipResponseDto.prototype, "userId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tenant UUID' }),
    tslib_1.__metadata("design:type", String)
], MembershipResponseDto.prototype, "tenantId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Role' }),
    tslib_1.__metadata("design:type", String)
], MembershipResponseDto.prototype, "role", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Invited by user UUID' }),
    tslib_1.__metadata("design:type", Object)
], MembershipResponseDto.prototype, "invitedBy", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Joined timestamp' }),
    tslib_1.__metadata("design:type", Object)
], MembershipResponseDto.prototype, "joinedAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Creation timestamp' }),
    tslib_1.__metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], MembershipResponseDto.prototype, "createdAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last update timestamp' }),
    tslib_1.__metadata("design:type", typeof (_c = typeof Date !== "undefined" && Date) === "function" ? _c : Object)
], MembershipResponseDto.prototype, "updatedAt", void 0);
class PaginatedMembershipsResponseDto {
}
exports.PaginatedMembershipsResponseDto = PaginatedMembershipsResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ type: [MembershipResponseDto] }),
    tslib_1.__metadata("design:type", Array)
], PaginatedMembershipsResponseDto.prototype, "data", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedMembershipsResponseDto.prototype, "total", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedMembershipsResponseDto.prototype, "page", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedMembershipsResponseDto.prototype, "pageSize", void 0);


/***/ }),
/* 29 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GroupsModule = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const groups_controller_1 = __webpack_require__(30);
const groups_service_1 = __webpack_require__(31);
let GroupsModule = class GroupsModule {
};
exports.GroupsModule = GroupsModule;
exports.GroupsModule = GroupsModule = tslib_1.__decorate([
    (0, common_1.Module)({
        controllers: [groups_controller_1.GroupsController],
        providers: [groups_service_1.GroupsService],
        exports: [groups_service_1.GroupsService],
    })
], GroupsModule);


/***/ }),
/* 30 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GroupsController = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const swagger_1 = __webpack_require__(3);
const groups_service_1 = __webpack_require__(31);
const create_group_dto_1 = __webpack_require__(32);
const add_member_dto_1 = __webpack_require__(33);
const nest_group_dto_1 = __webpack_require__(34);
const group_response_dto_1 = __webpack_require__(35);
let GroupsController = class GroupsController {
    constructor(groupsService) {
        this.groupsService = groupsService;
    }
    create(tenantId, dto) {
        return this.groupsService.create(tenantId, dto);
    }
    findAll(tenantId, page, pageSize) {
        return this.groupsService.findAll(tenantId, page ? parseInt(page, 10) : 1, pageSize ? parseInt(pageSize, 10) : 20);
    }
    findOne(tenantId, id) {
        return this.groupsService.findOne(tenantId, id);
    }
    remove(tenantId, id) {
        return this.groupsService.remove(tenantId, id);
    }
    // --- Members ---
    addMember(tenantId, groupId, dto) {
        return this.groupsService.addMember(tenantId, groupId, dto);
    }
    removeMember(tenantId, groupId, userId) {
        return this.groupsService.removeMember(tenantId, groupId, userId);
    }
    // --- Nesting ---
    nestGroup(tenantId, parentGroupId, dto) {
        return this.groupsService.nestGroup(tenantId, parentGroupId, dto);
    }
    unnestGroup(tenantId, parentGroupId, childGroupId) {
        return this.groupsService.unnestGroup(tenantId, parentGroupId, childGroupId);
    }
};
exports.GroupsController = GroupsController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a group' }),
    (0, swagger_1.ApiCreatedResponse)({ type: group_response_dto_1.GroupResponseDto }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_b = typeof create_group_dto_1.CreateGroupDto !== "undefined" && create_group_dto_1.CreateGroupDto) === "function" ? _b : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], GroupsController.prototype, "create", null);
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List groups (paginated)' }),
    (0, swagger_1.ApiOkResponse)({ type: group_response_dto_1.PaginatedGroupsResponseDto }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Query)('page')),
    tslib_1.__param(2, (0, common_1.Query)('pageSize')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], GroupsController.prototype, "findAll", null);
tslib_1.__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a group with members and nesting' }),
    (0, swagger_1.ApiOkResponse)({ type: group_response_dto_1.GroupResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Group not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], GroupsController.prototype, "findOne", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Soft-delete a group' }),
    (0, swagger_1.ApiOkResponse)({ type: group_response_dto_1.GroupResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Group not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], GroupsController.prototype, "remove", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/members'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a member to a group' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Member added' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, typeof (_c = typeof add_member_dto_1.AddGroupMemberDto !== "undefined" && add_member_dto_1.AddGroupMemberDto) === "function" ? _c : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], GroupsController.prototype, "addMember", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id/members/:userId'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a member from a group' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Member removed' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Member not in group' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], GroupsController.prototype, "removeMember", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/children'),
    (0, swagger_1.ApiOperation)({ summary: 'Nest a child group under this group' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Group nested' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Cannot nest a group under itself' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, typeof (_d = typeof nest_group_dto_1.NestGroupDto !== "undefined" && nest_group_dto_1.NestGroupDto) === "function" ? _d : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], GroupsController.prototype, "nestGroup", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id/children/:childGroupId'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a nested child group' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Nesting removed' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Nesting not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__param(2, (0, common_1.Param)('childGroupId', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], GroupsController.prototype, "unnestGroup", null);
exports.GroupsController = GroupsController = tslib_1.__decorate([
    (0, swagger_1.ApiTags)('groups'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('api/v1/tenants/:tenantId/groups'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof groups_service_1.GroupsService !== "undefined" && groups_service_1.GroupsService) === "function" ? _a : Object])
], GroupsController);


/***/ }),
/* 31 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var GroupsService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GroupsService = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const prisma_service_1 = __webpack_require__(7);
const crypto_1 = __webpack_require__(25);
let GroupsService = GroupsService_1 = class GroupsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GroupsService_1.name);
    }
    async create(tenantId, dto) {
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            const group = await tx.group.create({
                data: {
                    tenantId,
                    name: dto.name,
                    slug: dto.slug,
                    description: dto.description,
                    isManaged: dto.isManaged ?? false,
                    metadata: dto.metadata ?? {},
                },
            });
            // Write group -> organization relation to authz outbox
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId: tenant.openfgaStoreId ?? '',
                    operation: 'write',
                    tupleUser: `group:${group.id}#member`,
                    tupleRelation: 'member',
                    tupleObject: `organization:${tenantId}`,
                    idempotencyKey: `group:${group.id}:create:${(0, crypto_1.randomUUID)()}`,
                    source: 'admin-api',
                },
            });
            this.logger.log(`Group created: ${group.id} (${group.slug}) in tenant ${tenantId}`);
            return group;
        });
    }
    async findAll(tenantId, page = 1, pageSize = 20) {
        const skip = (page - 1) * pageSize;
        const where = { tenantId, deletedAt: null };
        const [data, total] = await Promise.all([
            this.prisma.group.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.group.count({ where }),
        ]);
        return { data, total, page, pageSize };
    }
    async findOne(tenantId, id) {
        const group = await this.prisma.group.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: {
                memberships: {
                    include: {
                        user: {
                            select: { id: true, email: true, displayName: true },
                        },
                    },
                },
                parentOf: { include: { childGroup: true } },
                childOf: { include: { parentGroup: true } },
            },
        });
        if (!group) {
            throw new common_1.NotFoundException(`Group "${id}" not found`);
        }
        return group;
    }
    async remove(tenantId, id) {
        await this.findOne(tenantId, id);
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            const group = await tx.group.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
            // Delete org membership tuple
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId: tenant.openfgaStoreId ?? '',
                    operation: 'delete',
                    tupleUser: `group:${id}#member`,
                    tupleRelation: 'member',
                    tupleObject: `organization:${tenantId}`,
                    idempotencyKey: `group:${id}:delete:${(0, crypto_1.randomUUID)()}`,
                    source: 'admin-api',
                },
            });
            this.logger.log(`Group soft-deleted: ${id}`);
            return group;
        });
    }
    // --- Group Members ---
    async addMember(tenantId, groupId, dto) {
        await this.findOne(tenantId, groupId);
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            const membership = await tx.groupMembership.create({
                data: {
                    groupId,
                    userId: dto.userId,
                    role: dto.role ?? 'member',
                },
            });
            // Write user -> group member tuple
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId: tenant.openfgaStoreId ?? '',
                    operation: 'write',
                    tupleUser: `user:${dto.userId}`,
                    tupleRelation: 'member',
                    tupleObject: `group:${groupId}`,
                    idempotencyKey: `group-member:${groupId}:${dto.userId}:add:${(0, crypto_1.randomUUID)()}`,
                    source: 'admin-api',
                },
            });
            this.logger.log(`User ${dto.userId} added to group ${groupId}`);
            return membership;
        });
    }
    async removeMember(tenantId, groupId, userId) {
        await this.findOne(tenantId, groupId);
        const membership = await this.prisma.groupMembership.findUnique({
            where: { groupId_userId: { groupId, userId } },
        });
        if (!membership) {
            throw new common_1.NotFoundException(`User "${userId}" not in group "${groupId}"`);
        }
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            await tx.groupMembership.delete({
                where: { id: membership.id },
            });
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId: tenant.openfgaStoreId ?? '',
                    operation: 'delete',
                    tupleUser: `user:${userId}`,
                    tupleRelation: 'member',
                    tupleObject: `group:${groupId}`,
                    idempotencyKey: `group-member:${groupId}:${userId}:remove:${(0, crypto_1.randomUUID)()}`,
                    source: 'admin-api',
                },
            });
            this.logger.log(`User ${userId} removed from group ${groupId}`);
            return { removed: true };
        });
    }
    // --- Group Nesting ---
    async nestGroup(tenantId, parentGroupId, dto) {
        await this.findOne(tenantId, parentGroupId);
        await this.findOne(tenantId, dto.childGroupId);
        if (parentGroupId === dto.childGroupId) {
            throw new common_1.ConflictException('Cannot nest a group under itself');
        }
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            const nesting = await tx.groupNesting.create({
                data: {
                    parentGroupId,
                    childGroupId: dto.childGroupId,
                },
            });
            // Write child#member -> parent member tuple for ReBAC inheritance
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId: tenant.openfgaStoreId ?? '',
                    operation: 'write',
                    tupleUser: `group:${dto.childGroupId}#member`,
                    tupleRelation: 'member',
                    tupleObject: `group:${parentGroupId}`,
                    idempotencyKey: `group-nest:${parentGroupId}:${dto.childGroupId}:add:${(0, crypto_1.randomUUID)()}`,
                    source: 'admin-api',
                },
            });
            this.logger.log(`Group ${dto.childGroupId} nested under ${parentGroupId}`);
            return nesting;
        });
    }
    async unnestGroup(tenantId, parentGroupId, childGroupId) {
        const nesting = await this.prisma.groupNesting.findUnique({
            where: {
                parentGroupId_childGroupId: { parentGroupId, childGroupId },
            },
        });
        if (!nesting) {
            throw new common_1.NotFoundException('Group nesting not found');
        }
        const tenant = await this.prisma.tenant.findUniqueOrThrow({
            where: { id: tenantId },
        });
        return this.prisma.$transaction(async (tx) => {
            await tx.groupNesting.delete({ where: { id: nesting.id } });
            await tx.authzOutbox.create({
                data: {
                    tenantId,
                    storeId: tenant.openfgaStoreId ?? '',
                    operation: 'delete',
                    tupleUser: `group:${childGroupId}#member`,
                    tupleRelation: 'member',
                    tupleObject: `group:${parentGroupId}`,
                    idempotencyKey: `group-nest:${parentGroupId}:${childGroupId}:remove:${(0, crypto_1.randomUUID)()}`,
                    source: 'admin-api',
                },
            });
            this.logger.log(`Group ${childGroupId} unnested from ${parentGroupId}`);
            return { removed: true };
        });
    }
};
exports.GroupsService = GroupsService;
exports.GroupsService = GroupsService = GroupsService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], GroupsService);


/***/ }),
/* 32 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateGroupDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
class CreateGroupDto {
}
exports.CreateGroupDto = CreateGroupDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group name', example: 'Engineering' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateGroupDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL-safe slug', example: 'engineering' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: 'slug must be lowercase alphanumeric with hyphens',
    }),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateGroupDto.prototype, "slug", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Description' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateGroupDto.prototype, "description", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether managed by external directory', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], CreateGroupDto.prototype, "isManaged", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Metadata JSON' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    tslib_1.__metadata("design:type", typeof (_a = typeof Record !== "undefined" && Record) === "function" ? _a : Object)
], CreateGroupDto.prototype, "metadata", void 0);


/***/ }),
/* 33 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AddGroupMemberDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
class AddGroupMemberDto {
}
exports.AddGroupMemberDto = AddGroupMemberDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User UUID to add' }),
    (0, class_validator_1.IsUUID)(),
    tslib_1.__metadata("design:type", String)
], AddGroupMemberDto.prototype, "userId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Role within the group', default: 'member' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], AddGroupMemberDto.prototype, "role", void 0);


/***/ }),
/* 34 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NestGroupDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
class NestGroupDto {
}
exports.NestGroupDto = NestGroupDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Child group UUID to nest under this group' }),
    (0, class_validator_1.IsUUID)(),
    tslib_1.__metadata("design:type", String)
], NestGroupDto.prototype, "childGroupId", void 0);


/***/ }),
/* 35 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PaginatedGroupsResponseDto = exports.GroupResponseDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
class GroupResponseDto {
}
exports.GroupResponseDto = GroupResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], GroupResponseDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], GroupResponseDto.prototype, "tenantId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], GroupResponseDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], GroupResponseDto.prototype, "slug", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    tslib_1.__metadata("design:type", Object)
], GroupResponseDto.prototype, "description", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], GroupResponseDto.prototype, "isManaged", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    tslib_1.__metadata("design:type", Object)
], GroupResponseDto.prototype, "source", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    tslib_1.__metadata("design:type", Object)
], GroupResponseDto.prototype, "externalId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], GroupResponseDto.prototype, "version", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], GroupResponseDto.prototype, "createdAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], GroupResponseDto.prototype, "updatedAt", void 0);
class PaginatedGroupsResponseDto {
}
exports.PaginatedGroupsResponseDto = PaginatedGroupsResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ type: [GroupResponseDto] }),
    tslib_1.__metadata("design:type", Array)
], PaginatedGroupsResponseDto.prototype, "data", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedGroupsResponseDto.prototype, "total", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedGroupsResponseDto.prototype, "page", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedGroupsResponseDto.prototype, "pageSize", void 0);


/***/ }),
/* 36 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.IdpModule = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const idp_controller_1 = __webpack_require__(37);
const idp_service_1 = __webpack_require__(38);
let IdpModule = class IdpModule {
};
exports.IdpModule = IdpModule;
exports.IdpModule = IdpModule = tslib_1.__decorate([
    (0, common_1.Module)({
        controllers: [idp_controller_1.IdpController],
        providers: [idp_service_1.IdpService],
        exports: [idp_service_1.IdpService],
    })
], IdpModule);


/***/ }),
/* 37 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.IdpController = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const swagger_1 = __webpack_require__(3);
const idp_service_1 = __webpack_require__(38);
const create_idp_dto_1 = __webpack_require__(39);
const update_idp_dto_1 = __webpack_require__(40);
const idp_response_dto_1 = __webpack_require__(41);
let IdpController = class IdpController {
    constructor(idpService) {
        this.idpService = idpService;
    }
    createSaml(tenantId, dto) {
        return this.idpService.createSaml(tenantId, dto);
    }
    createOidc(tenantId, dto) {
        return this.idpService.createOidc(tenantId, dto);
    }
    findAll(tenantId, page, pageSize) {
        return this.idpService.findAll(tenantId, page ? parseInt(page, 10) : 1, pageSize ? parseInt(pageSize, 10) : 20);
    }
    findOne(tenantId, id) {
        return this.idpService.findOne(tenantId, id);
    }
    update(tenantId, id, dto) {
        return this.idpService.update(tenantId, id, dto);
    }
    remove(tenantId, id) {
        return this.idpService.remove(tenantId, id);
    }
};
exports.IdpController = IdpController;
tslib_1.__decorate([
    (0, common_1.Post)('saml'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a SAML identity provider' }),
    (0, swagger_1.ApiCreatedResponse)({ type: idp_response_dto_1.IdpResponseDto }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_b = typeof create_idp_dto_1.CreateSamlIdpDto !== "undefined" && create_idp_dto_1.CreateSamlIdpDto) === "function" ? _b : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], IdpController.prototype, "createSaml", null);
tslib_1.__decorate([
    (0, common_1.Post)('oidc'),
    (0, swagger_1.ApiOperation)({ summary: 'Create an OIDC identity provider' }),
    (0, swagger_1.ApiCreatedResponse)({ type: idp_response_dto_1.IdpResponseDto }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_c = typeof create_idp_dto_1.CreateOidcIdpDto !== "undefined" && create_idp_dto_1.CreateOidcIdpDto) === "function" ? _c : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], IdpController.prototype, "createOidc", null);
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List identity providers (paginated)' }),
    (0, swagger_1.ApiOkResponse)({ type: idp_response_dto_1.PaginatedIdpsResponseDto }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Query)('page')),
    tslib_1.__param(2, (0, common_1.Query)('pageSize')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], IdpController.prototype, "findAll", null);
tslib_1.__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get an identity provider by ID' }),
    (0, swagger_1.ApiOkResponse)({ type: idp_response_dto_1.IdpResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'IdP not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], IdpController.prototype, "findOne", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update an identity provider' }),
    (0, swagger_1.ApiOkResponse)({ type: idp_response_dto_1.IdpResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'IdP not found' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Version conflict' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, typeof (_d = typeof update_idp_dto_1.UpdateIdpDto !== "undefined" && update_idp_dto_1.UpdateIdpDto) === "function" ? _d : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], IdpController.prototype, "update", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Soft-delete an identity provider' }),
    (0, swagger_1.ApiOkResponse)({ type: idp_response_dto_1.IdpResponseDto }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'IdP not found' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", void 0)
], IdpController.prototype, "remove", null);
exports.IdpController = IdpController = tslib_1.__decorate([
    (0, swagger_1.ApiTags)('identity-providers'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('api/v1/tenants/:tenantId/identity-providers'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof idp_service_1.IdpService !== "undefined" && idp_service_1.IdpService) === "function" ? _a : Object])
], IdpController);


/***/ }),
/* 38 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var IdpService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.IdpService = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const prisma_service_1 = __webpack_require__(7);
let IdpService = IdpService_1 = class IdpService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(IdpService_1.name);
    }
    async createSaml(tenantId, dto) {
        const idp = await this.prisma.identityProvider.create({
            data: {
                tenantId,
                name: dto.name,
                type: 'saml',
                domainHint: dto.domainHint,
                samlEntityId: dto.samlEntityId,
                samlSsoUrl: dto.samlSsoUrl,
                samlSloUrl: dto.samlSloUrl,
                samlCertificate: dto.samlCertificate,
                samlSigningAlgorithm: dto.samlSigningAlgorithm ?? 'RSA-SHA256',
                samlNameIdFormat: dto.samlNameIdFormat,
                attributeMapping: dto.attributeMapping ?? {
                    email: 'email',
                    firstName: 'first_name',
                    lastName: 'last_name',
                    displayName: 'display_name',
                    groups: 'groups',
                },
                jitProvisioning: dto.jitProvisioning ?? true,
                defaultRole: dto.defaultRole ?? 'member',
            },
        });
        this.logger.log(`SAML IdP created: ${idp.id} (${idp.name}) for tenant ${tenantId}`);
        return this.sanitize(idp);
    }
    async createOidc(tenantId, dto) {
        // In production, encrypt the client secret before storing
        const idp = await this.prisma.identityProvider.create({
            data: {
                tenantId,
                name: dto.name,
                type: 'oidc',
                domainHint: dto.domainHint,
                oidcIssuer: dto.oidcIssuer,
                oidcClientId: dto.oidcClientId,
                oidcClientSecretEnc: dto.oidcClientSecret, // TODO: encrypt at rest
                oidcDiscoveryUrl: dto.oidcDiscoveryUrl ??
                    `${dto.oidcIssuer}/.well-known/openid-configuration`,
                oidcScopes: dto.oidcScopes ?? ['openid', 'profile', 'email'],
                attributeMapping: dto.attributeMapping ?? {
                    email: 'email',
                    firstName: 'first_name',
                    lastName: 'last_name',
                    displayName: 'display_name',
                    groups: 'groups',
                },
                jitProvisioning: dto.jitProvisioning ?? true,
                defaultRole: dto.defaultRole ?? 'member',
            },
        });
        this.logger.log(`OIDC IdP created: ${idp.id} (${idp.name}) for tenant ${tenantId}`);
        return this.sanitize(idp);
    }
    async findAll(tenantId, page = 1, pageSize = 20) {
        const skip = (page - 1) * pageSize;
        const where = { tenantId, deletedAt: null };
        const [data, total] = await Promise.all([
            this.prisma.identityProvider.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.identityProvider.count({ where }),
        ]);
        return { data: data.map(this.sanitize), total, page, pageSize };
    }
    async findOne(tenantId, id) {
        const idp = await this.prisma.identityProvider.findFirst({
            where: { id, tenantId, deletedAt: null },
        });
        if (!idp) {
            throw new common_1.NotFoundException(`Identity provider "${id}" not found`);
        }
        return this.sanitize(idp);
    }
    async update(tenantId, id, dto) {
        const existing = await this.prisma.identityProvider.findFirst({
            where: { id, tenantId, deletedAt: null },
        });
        if (!existing) {
            throw new common_1.NotFoundException(`Identity provider "${id}" not found`);
        }
        if (existing.version !== dto.version) {
            throw new common_1.ConflictException(`Version conflict: expected ${dto.version}, found ${existing.version}`);
        }
        const { version: _v, oidcClientSecret, ...updateData } = dto;
        const idp = await this.prisma.identityProvider.update({
            where: { id },
            data: {
                ...updateData,
                // If client secret is being updated, store it (TODO: encrypt)
                ...(oidcClientSecret ? { oidcClientSecretEnc: oidcClientSecret } : {}),
                attributeMapping: updateData.attributeMapping ?? undefined,
                version: { increment: 1 },
            },
        });
        this.logger.log(`IdP updated: ${idp.id} (v${idp.version})`);
        return this.sanitize(idp);
    }
    async remove(tenantId, id) {
        await this.findOne(tenantId, id);
        const idp = await this.prisma.identityProvider.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
        this.logger.log(`IdP soft-deleted: ${idp.id}`);
        return this.sanitize(idp);
    }
    /**
     * Strip sensitive fields (SAML certificates, OIDC client secrets) from responses.
     */
    sanitize(idp) {
        const { samlCertificate: _cert, oidcClientSecretEnc: _secret, ...safe } = idp;
        return safe;
    }
};
exports.IdpService = IdpService;
exports.IdpService = IdpService = IdpService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], IdpService);


/***/ }),
/* 39 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateOidcIdpDto = exports.CreateSamlIdpDto = exports.IdpType = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
const invite_member_dto_1 = __webpack_require__(26);
var IdpType;
(function (IdpType) {
    IdpType["saml"] = "saml";
    IdpType["oidc"] = "oidc";
    IdpType["social_google"] = "social_google";
    IdpType["social_github"] = "social_github";
    IdpType["social_microsoft"] = "social_microsoft";
})(IdpType || (exports.IdpType = IdpType = {}));
class CreateSamlIdpDto {
    constructor() {
        this.type = 'saml';
    }
}
exports.CreateSamlIdpDto = CreateSamlIdpDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Display name', example: 'Okta SAML' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['saml'], default: 'saml' }),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Domain hint for auto-routing', example: 'acme.com' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "domainHint", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'SAML Entity ID' }),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "samlEntityId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'SAML SSO URL' }),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "samlSsoUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'SAML SLO URL' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "samlSloUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Base64-encoded X.509 certificate' }),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "samlCertificate", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Signing algorithm', default: 'RSA-SHA256' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "samlSigningAlgorithm", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'NameID format' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateSamlIdpDto.prototype, "samlNameIdFormat", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Attribute mapping JSON' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    tslib_1.__metadata("design:type", typeof (_a = typeof Record !== "undefined" && Record) === "function" ? _a : Object)
], CreateSamlIdpDto.prototype, "attributeMapping", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Enable JIT provisioning', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], CreateSamlIdpDto.prototype, "jitProvisioning", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: invite_member_dto_1.MembershipRole, default: invite_member_dto_1.MembershipRole.member }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(invite_member_dto_1.MembershipRole),
    tslib_1.__metadata("design:type", typeof (_b = typeof invite_member_dto_1.MembershipRole !== "undefined" && invite_member_dto_1.MembershipRole) === "function" ? _b : Object)
], CreateSamlIdpDto.prototype, "defaultRole", void 0);
class CreateOidcIdpDto {
    constructor() {
        this.type = 'oidc';
    }
}
exports.CreateOidcIdpDto = CreateOidcIdpDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Display name', example: 'Azure AD OIDC' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateOidcIdpDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['oidc'], default: 'oidc' }),
    tslib_1.__metadata("design:type", String)
], CreateOidcIdpDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Domain hint', example: 'acme.com' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateOidcIdpDto.prototype, "domainHint", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'OIDC Issuer URL' }),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], CreateOidcIdpDto.prototype, "oidcIssuer", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Client ID' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateOidcIdpDto.prototype, "oidcClientId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Client secret (will be encrypted at rest)' }),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateOidcIdpDto.prototype, "oidcClientSecret", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Discovery URL (defaults to issuer + .well-known)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    tslib_1.__metadata("design:type", String)
], CreateOidcIdpDto.prototype, "oidcDiscoveryUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Scopes', default: ['openid', 'profile', 'email'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], CreateOidcIdpDto.prototype, "oidcScopes", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Attribute mapping JSON' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    tslib_1.__metadata("design:type", typeof (_c = typeof Record !== "undefined" && Record) === "function" ? _c : Object)
], CreateOidcIdpDto.prototype, "attributeMapping", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Enable JIT provisioning', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], CreateOidcIdpDto.prototype, "jitProvisioning", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: invite_member_dto_1.MembershipRole, default: invite_member_dto_1.MembershipRole.member }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(invite_member_dto_1.MembershipRole),
    tslib_1.__metadata("design:type", typeof (_d = typeof invite_member_dto_1.MembershipRole !== "undefined" && invite_member_dto_1.MembershipRole) === "function" ? _d : Object)
], CreateOidcIdpDto.prototype, "defaultRole", void 0);


/***/ }),
/* 40 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateIdpDto = exports.IdpStatus = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
var IdpStatus;
(function (IdpStatus) {
    IdpStatus["active"] = "active";
    IdpStatus["inactive"] = "inactive";
    IdpStatus["pending_verification"] = "pending_verification";
})(IdpStatus || (exports.IdpStatus = IdpStatus = {}));
class UpdateIdpDto {
}
exports.UpdateIdpDto = UpdateIdpDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Optimistic lock version' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    tslib_1.__metadata("design:type", Number)
], UpdateIdpDto.prototype, "version", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Display name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: IdpStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(IdpStatus),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "status", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Domain hint' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "domainHint", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "samlEntityId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "samlSsoUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "samlSloUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "samlCertificate", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "oidcIssuer", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "oidcClientId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateIdpDto.prototype, "oidcClientSecret", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], UpdateIdpDto.prototype, "oidcScopes", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    tslib_1.__metadata("design:type", typeof (_a = typeof Record !== "undefined" && Record) === "function" ? _a : Object)
], UpdateIdpDto.prototype, "attributeMapping", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdateIdpDto.prototype, "jitProvisioning", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdateIdpDto.prototype, "autoSyncGroups", void 0);


/***/ }),
/* 41 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PaginatedIdpsResponseDto = exports.IdpResponseDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
class IdpResponseDto {
}
exports.IdpResponseDto = IdpResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], IdpResponseDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], IdpResponseDto.prototype, "tenantId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], IdpResponseDto.prototype, "name", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], IdpResponseDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], IdpResponseDto.prototype, "status", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    tslib_1.__metadata("design:type", Object)
], IdpResponseDto.prototype, "domainHint", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    tslib_1.__metadata("design:type", Object)
], IdpResponseDto.prototype, "samlEntityId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    tslib_1.__metadata("design:type", Object)
], IdpResponseDto.prototype, "samlSsoUrl", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    tslib_1.__metadata("design:type", Object)
], IdpResponseDto.prototype, "oidcIssuer", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    tslib_1.__metadata("design:type", Object)
], IdpResponseDto.prototype, "oidcClientId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], IdpResponseDto.prototype, "jitProvisioning", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], IdpResponseDto.prototype, "autoSyncGroups", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], IdpResponseDto.prototype, "defaultRole", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], IdpResponseDto.prototype, "version", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], IdpResponseDto.prototype, "createdAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], IdpResponseDto.prototype, "updatedAt", void 0);
class PaginatedIdpsResponseDto {
}
exports.PaginatedIdpsResponseDto = PaginatedIdpsResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ type: [IdpResponseDto] }),
    tslib_1.__metadata("design:type", Array)
], PaginatedIdpsResponseDto.prototype, "data", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedIdpsResponseDto.prototype, "total", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedIdpsResponseDto.prototype, "page", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PaginatedIdpsResponseDto.prototype, "pageSize", void 0);


/***/ }),
/* 42 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SettingsModule = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const policies_controller_1 = __webpack_require__(43);
const policies_service_1 = __webpack_require__(44);
let SettingsModule = class SettingsModule {
};
exports.SettingsModule = SettingsModule;
exports.SettingsModule = SettingsModule = tslib_1.__decorate([
    (0, common_1.Module)({
        controllers: [policies_controller_1.PoliciesController],
        providers: [policies_service_1.PoliciesService],
        exports: [policies_service_1.PoliciesService],
    })
], SettingsModule);


/***/ }),
/* 43 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PoliciesController = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const swagger_1 = __webpack_require__(3);
const policies_service_1 = __webpack_require__(44);
const update_policy_dto_1 = __webpack_require__(45);
const policy_response_dto_1 = __webpack_require__(46);
let PoliciesController = class PoliciesController {
    constructor(policiesService) {
        this.policiesService = policiesService;
    }
    findOne(tenantId) {
        return this.policiesService.findOne(tenantId);
    }
    update(tenantId, dto) {
        return this.policiesService.update(tenantId, dto);
    }
};
exports.PoliciesController = PoliciesController;
tslib_1.__decorate([
    (0, common_1.Get)('policies'),
    (0, swagger_1.ApiOperation)({ summary: 'Get tenant security policy' }),
    (0, swagger_1.ApiOkResponse)({ type: policy_response_dto_1.PolicyResponseDto }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", void 0)
], PoliciesController.prototype, "findOne", null);
tslib_1.__decorate([
    (0, common_1.Patch)('policies'),
    (0, swagger_1.ApiOperation)({ summary: 'Update tenant security policy (optimistic locking)' }),
    (0, swagger_1.ApiOkResponse)({ type: policy_response_dto_1.PolicyResponseDto }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Version conflict' }),
    tslib_1.__param(0, (0, common_1.Param)('tenantId', common_1.ParseUUIDPipe)),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_b = typeof update_policy_dto_1.UpdatePolicyDto !== "undefined" && update_policy_dto_1.UpdatePolicyDto) === "function" ? _b : Object]),
    tslib_1.__metadata("design:returntype", void 0)
], PoliciesController.prototype, "update", null);
exports.PoliciesController = PoliciesController = tslib_1.__decorate([
    (0, swagger_1.ApiTags)('settings'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('api/v1/tenants/:tenantId/settings'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof policies_service_1.PoliciesService !== "undefined" && policies_service_1.PoliciesService) === "function" ? _a : Object])
], PoliciesController);


/***/ }),
/* 44 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var PoliciesService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PoliciesService = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const prisma_service_1 = __webpack_require__(7);
let PoliciesService = PoliciesService_1 = class PoliciesService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PoliciesService_1.name);
    }
    /**
     * Get the security policy for a tenant.
     * Auto-creates one if it doesn't exist yet.
     */
    async findOne(tenantId) {
        let policy = await this.prisma.tenantPolicy.findFirst({
            where: { tenantId },
        });
        if (!policy) {
            // Auto-create default policy
            policy = await this.prisma.tenantPolicy.create({
                data: { tenantId },
            });
            this.logger.log(`Default policy created for tenant ${tenantId}`);
        }
        return policy;
    }
    /**
     * Update security policy with optimistic locking.
     */
    async update(tenantId, dto) {
        const existing = await this.findOne(tenantId);
        if (existing.version !== dto.version) {
            throw new common_1.ConflictException(`Version conflict: expected ${dto.version}, found ${existing.version}`);
        }
        const { version: _version, ...updateData } = dto;
        const policy = await this.prisma.tenantPolicy.update({
            where: { id: existing.id },
            data: {
                ...updateData,
                version: { increment: 1 },
            },
        });
        this.logger.log(`Policy updated for tenant ${tenantId} (v${policy.version})`);
        return policy;
    }
};
exports.PoliciesService = PoliciesService;
exports.PoliciesService = PoliciesService = PoliciesService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], PoliciesService);


/***/ }),
/* 45 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdatePolicyDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
const class_validator_1 = __webpack_require__(13);
class UpdatePolicyDto {
}
exports.UpdatePolicyDto = UpdatePolicyDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Optimistic lock version' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    tslib_1.__metadata("design:type", Number)
], UpdatePolicyDto.prototype, "version", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum password length', example: 12 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(8),
    (0, class_validator_1.Max)(128),
    tslib_1.__metadata("design:type", Number)
], UpdatePolicyDto.prototype, "passwordMinLength", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Require uppercase letters' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdatePolicyDto.prototype, "passwordRequireUpper", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Require lowercase letters' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdatePolicyDto.prototype, "passwordRequireLower", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Require numbers' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdatePolicyDto.prototype, "passwordRequireNumber", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Require symbols' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdatePolicyDto.prototype, "passwordRequireSymbol", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Require MFA for all users' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdatePolicyDto.prototype, "passwordRequireMfa", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Allowed MFA methods', example: ['totp', 'webauthn'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], UpdatePolicyDto.prototype, "allowedMfaMethods", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Max session age in hours', example: 24 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(720),
    tslib_1.__metadata("design:type", Number)
], UpdatePolicyDto.prototype, "sessionMaxAgeHours", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Idle timeout in minutes', example: 30 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(5),
    (0, class_validator_1.Max)(1440),
    tslib_1.__metadata("design:type", Number)
], UpdatePolicyDto.prototype, "idleTimeoutMinutes", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'IP allowlist (CIDR notation)', example: ['10.0.0.0/8'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], UpdatePolicyDto.prototype, "ipAllowlist", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Allowed email domains', example: ['acme.com'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], UpdatePolicyDto.prototype, "allowedEmailDomains", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Require SSO for login' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], UpdatePolicyDto.prototype, "requireSso", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Max concurrent sessions per user', example: 5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    tslib_1.__metadata("design:type", Number)
], UpdatePolicyDto.prototype, "maxSessionsPerUser", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Password history count (prevent reuse)', example: 5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(24),
    tslib_1.__metadata("design:type", Number)
], UpdatePolicyDto.prototype, "passwordHistoryCount", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Failed login lockout threshold', example: 5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(3),
    (0, class_validator_1.Max)(20),
    tslib_1.__metadata("design:type", Number)
], UpdatePolicyDto.prototype, "lockoutThreshold", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Lockout duration in minutes', example: 15 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1440),
    tslib_1.__metadata("design:type", Number)
], UpdatePolicyDto.prototype, "lockoutDurationMin", void 0);


/***/ }),
/* 46 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PolicyResponseDto = void 0;
const tslib_1 = __webpack_require__(5);
const swagger_1 = __webpack_require__(3);
class PolicyResponseDto {
}
exports.PolicyResponseDto = PolicyResponseDto;
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], PolicyResponseDto.prototype, "id", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", String)
], PolicyResponseDto.prototype, "tenantId", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PolicyResponseDto.prototype, "passwordMinLength", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], PolicyResponseDto.prototype, "passwordRequireUpper", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], PolicyResponseDto.prototype, "passwordRequireLower", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], PolicyResponseDto.prototype, "passwordRequireNumber", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], PolicyResponseDto.prototype, "passwordRequireSymbol", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], PolicyResponseDto.prototype, "passwordRequireMfa", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Array)
], PolicyResponseDto.prototype, "allowedMfaMethods", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PolicyResponseDto.prototype, "sessionMaxAgeHours", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PolicyResponseDto.prototype, "idleTimeoutMinutes", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Array)
], PolicyResponseDto.prototype, "ipAllowlist", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Array)
], PolicyResponseDto.prototype, "allowedEmailDomains", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Boolean)
], PolicyResponseDto.prototype, "requireSso", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PolicyResponseDto.prototype, "maxSessionsPerUser", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PolicyResponseDto.prototype, "passwordHistoryCount", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PolicyResponseDto.prototype, "lockoutThreshold", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PolicyResponseDto.prototype, "lockoutDurationMin", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", Number)
], PolicyResponseDto.prototype, "version", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], PolicyResponseDto.prototype, "createdAt", void 0);
tslib_1.__decorate([
    (0, swagger_1.ApiProperty)(),
    tslib_1.__metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], PolicyResponseDto.prototype, "updatedAt", void 0);


/***/ }),
/* 47 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var AllExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AllExceptionsFilter = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
let AllExceptionsFilter = AllExceptionsFilter_1 = class AllExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger(AllExceptionsFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let details = undefined;
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            }
            else if (typeof exceptionResponse === 'object') {
                const resp = exceptionResponse;
                message = resp.message ?? message;
                details = resp.details ?? resp.errors ?? undefined;
            }
        }
        else if (exception instanceof Error) {
            message = exception.message;
            this.logger.error(`Unhandled exception on ${request.method} ${request.url}`, exception.stack);
        }
        response.status(status).json({
            error: common_1.HttpStatus[status] ?? 'UNKNOWN_ERROR',
            message,
            statusCode: status,
            ...(details ? { details } : {}),
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = AllExceptionsFilter_1 = tslib_1.__decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);


/***/ }),
/* 48 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var LoggingInterceptor_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LoggingInterceptor = void 0;
const tslib_1 = __webpack_require__(5);
const common_1 = __webpack_require__(1);
const rxjs_1 = __webpack_require__(49);
let LoggingInterceptor = LoggingInterceptor_1 = class LoggingInterceptor {
    constructor() {
        this.logger = new common_1.Logger(LoggingInterceptor_1.name);
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const { method, url } = request;
        const start = Date.now();
        return next.handle().pipe((0, rxjs_1.tap)(() => {
            const response = context.switchToHttp().getResponse();
            const duration = Date.now() - start;
            this.logger.log(`${method} ${url} ${response.statusCode} - ${duration}ms`);
        }));
    }
};
exports.LoggingInterceptor = LoggingInterceptor;
exports.LoggingInterceptor = LoggingInterceptor = LoggingInterceptor_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], LoggingInterceptor);


/***/ }),
/* 49 */
/***/ ((module) => {

module.exports = require("rxjs");

/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
const common_1 = __webpack_require__(1);
const core_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(3);
const app_module_1 = __webpack_require__(4);
const http_exception_filter_1 = __webpack_require__(47);
const logging_interceptor_1 = __webpack_require__(48);
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
    }));
    app.useGlobalFilters(new http_exception_filter_1.AllExceptionsFilter());
    app.useGlobalInterceptors(new logging_interceptor_1.LoggingInterceptor());
    app.enableCors({ origin: 'http://localhost:4200' });
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('SSO Admin API')
        .setDescription('Admin API for the SSO platform — tenant management, users, memberships, groups, identity providers, and security policies')
        .setVersion('2.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'PASETO' })
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('docs', app, document);
    const port = process.env.ADMIN_API_PORT || 3100;
    await app.listen(port);
    common_1.Logger.log(`Admin API is running on: http://localhost:${port}`);
    common_1.Logger.log(`Swagger docs available at: http://localhost:${port}/docs`);
}
bootstrap();

})();

/******/ })()
;
//# sourceMappingURL=main.js.map