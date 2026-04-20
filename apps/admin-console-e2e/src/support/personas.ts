import type { Page } from '@playwright/test';
import type {
	Capability,
	MembershipRole,
	PlatformAdminRole,
	SessionMeDto,
	TenantKind,
} from '@sso-platform/shared-types';

/**
 * Five personas the route-matrix spec walks through. The capability set on
 * each must mirror the matrix in:
 *
 *   - apps/admin-api/src/session/capabilities.ts  (server-side derivation)
 *   - docs/plans/admin-role-surfaces.md           (canonical source of truth)
 *
 * If any of the three drift, the matrix spec breaks loudly — exactly what we
 * want.
 */
export type Persona =
	| 'super'
	| 'support'
	| 'owner'
	| 'admin'
	| 'member'
	| 'individual';

interface PersonaShape {
	platformRole: PlatformAdminRole | null;
	tenantKind: TenantKind;
	role: MembershipRole;
	capabilities: Capability[];
}

const TENANT_ID = '01473191-863b-4035-ac65-05782ca6159b';

const PERSONAS: Record<Persona, PersonaShape> = {
	super: {
		platformRole: 'superadmin',
		tenantKind: 'organization',
		role: 'admin',
		capabilities: [
			'view_platform_admins',
			'manage_platform_admins',
			'view_tenant_settings',
			'view_audit_log',
			'manage_members',
			'manage_domains',
			'manage_identity_providers',
			'manage_invitations',
			'view_migrations',
		],
	},
	support: {
		platformRole: 'support',
		tenantKind: 'organization',
		role: 'admin',
		capabilities: [
			'view_platform_admins',
			'view_tenant_settings',
			'view_audit_log',
			'manage_members',
			'manage_domains',
			'manage_identity_providers',
			'manage_invitations',
			'view_migrations',
		],
	},
	owner: {
		platformRole: null,
		tenantKind: 'organization',
		role: 'owner',
		capabilities: [
			'view_tenant_settings',
			'manage_members',
			'manage_domains',
			'manage_identity_providers',
			'manage_invitations',
			'view_migrations',
			'force_migration',
			'view_audit_log',
		],
	},
	admin: {
		platformRole: null,
		tenantKind: 'organization',
		role: 'admin',
		capabilities: [
			'view_tenant_settings',
			'manage_members',
			'manage_domains',
			'manage_identity_providers',
			'manage_invitations',
			'view_migrations',
			'view_audit_log',
		],
	},
	member: {
		platformRole: null,
		tenantKind: 'organization',
		role: 'member',
		capabilities: [],
	},
	individual: {
		platformRole: null,
		tenantKind: 'personal',
		role: 'owner',
		capabilities: ['view_tenant_settings'],
	},
};

/**
 * Build a `SessionMeDto` payload for the given persona. The spec installs
 * this as the canned response for GET /api/v1/session/me.
 */
export function sessionMeFor(persona: Persona): SessionMeDto {
	const p = PERSONAS[persona];
	return {
		user: {
			id: '11111111-1111-1111-1111-1111' + persona.padEnd(8, '0').slice(0, 8).replace(/[^a-z0-9]/g, '0'),
			email: `${persona}@acme.test`,
			emailVerified: true,
			displayName: persona.charAt(0).toUpperCase() + persona.slice(1),
		},
		session: {
			id: 'sess-' + persona,
			expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
		},
		activeTenant: {
			id: TENANT_ID,
			slug: p.tenantKind === 'personal' ? 'personal' : 'acme',
			name: p.tenantKind === 'personal' ? 'Personal' : 'Acme Inc.',
			kind: p.tenantKind,
		},
		memberships: [
			{
				tenantId: TENANT_ID,
				tenantSlug: p.tenantKind === 'personal' ? 'personal' : 'acme',
				tenantName: p.tenantKind === 'personal' ? 'Personal' : 'Acme Inc.',
				tenantKind: p.tenantKind,
				role: p.role,
				isActive: true,
			},
		],
		platform: p.platformRole
			? { role: p.platformRole, grantedAt: '2026-01-01T00:00:00.000Z' }
			: null,
		capabilities: p.capabilities,
	};
}

/**
 * Routes whose visibility we assert against capabilities. Only the
 * always-on routes (no `requireFlag`) are included, so the matrix runs
 * deterministically without needing VITE_FLAG_* env vars set.
 *
 * /dashboard intentionally has `required: []` (auth-only) because it is
 * the redirect target the capability guard sends denied requests to —
 * gating it would create an infinite redirect loop for personas with no
 * caps (member, individual on a tenant route).
 *
 * For each route: the `requireCapability(...)` argument from app.routes.ts.
 * Flag-gated pages (domains, sso, invitations, migrations, platform/admins)
 * are intentionally excluded — they require flipping their flag on, which
 * is exercised in a separate flag-rollout spec rather than the persona
 * matrix.
 */
export const ALWAYS_ON_ROUTES: { path: string; required: Capability[] }[] = [
	// /dashboard is auth-only (no capability gate). It's the redirect target
	// requireCapability sends denied requests to — gating it would create an
	// infinite loop for personas with no caps.
	{ path: '/dashboard', required: [] },
	{ path: '/members', required: ['manage_members'] },
	{ path: '/groups', required: ['manage_members'] },
	{ path: '/policies', required: ['manage_members'] },
	{ path: '/webhooks', required: ['manage_members'] },
	{ path: '/audit', required: ['view_audit_log'] },
	{ path: '/scim', required: ['manage_identity_providers'] },
];

/**
 * True iff the persona holds at least one of the route's required
 * capabilities — mirrors the union semantics of `requireCapability([...])`.
 * An empty `required` array means auth-only (always allowed).
 */
export function isAllowed(
	persona: Persona,
	required: Capability[],
): boolean {
	if (required.length === 0) return true;
	const caps = sessionMeFor(persona).capabilities;
	return required.some((c) => caps.includes(c));
}

/**
 * Install a persona-aware backend mock. Returns a Page-scoped helper that
 * extends the existing mock-backend with a canned /api/v1/session/me
 * response for the chosen persona.
 */
export async function installPersonaSession(
	page: Page,
	persona: Persona,
): Promise<void> {
	const dto = sessionMeFor(persona);
	await page.route(
		/^http:\/\/localhost:3100\/api\/v1\/session\/me$/,
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				headers: {
					'Access-Control-Allow-Origin': 'http://localhost:4301',
					'Access-Control-Allow-Credentials': 'true',
				},
				body: JSON.stringify(dto),
			}),
	);
}

export const ALL_PERSONAS: Persona[] = [
	'super',
	'support',
	'owner',
	'admin',
	'member',
	'individual',
];
