import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import type { Capability } from '@sso-platform/shared-types';
import { requireCapability } from './require-capability.guard';
import { SessionStore } from '../core/session/session.store';

/**
 * Stub-shaped SessionStore exposing just the slice the guard reads.
 * The real SessionStore is a signalStore; the guard only touches `capabilities()`.
 */
function fakeSessionStoreWithCaps(caps: Capability[]) {
	return { capabilities: signal(caps) };
}

function runGuardWith(
	caps: Capability[],
	required: Capability[],
): true | { toString(): string } {
	TestBed.configureTestingModule({
		providers: [
			provideRouter([]),
			{ provide: SessionStore, useValue: fakeSessionStoreWithCaps(caps) },
		],
	});
	const guard = requireCapability(required);
	return TestBed.runInInjectionContext(() => {
		const result = guard(
			{} as unknown as Parameters<typeof guard>[0],
			{} as unknown as Parameters<typeof guard>[1],
		);
		return result as true | { toString(): string };
	});
}

describe('requireCapability guard', () => {
	it('allows activation when the user holds at least one required capability', () => {
		const result = runGuardWith(
			['view_tenant_settings', 'manage_members'],
			['manage_members'],
		);
		expect(result).toBe(true);
	});

	it('redirects to /dashboard when the user holds none of the required capabilities', () => {
		const result = runGuardWith(['view_tenant_settings'], ['manage_domains']);
		// createUrlTree returns a UrlTree whose toString() begins with the target.
		expect(typeof result).toBe('object');
		expect(String(result)).toBe('/dashboard');
	});

	it('treats the requirement as a union — any single match suffices', () => {
		const result = runGuardWith(
			['view_audit_log'],
			['manage_members', 'view_audit_log'],
		);
		expect(result).toBe(true);
	});

	it('handles an empty capability list as a deny', () => {
		const result = runGuardWith([], ['manage_members']);
		expect(typeof result).toBe('object');
	});
});

describe('Router.createUrlTree wired through the test bed', () => {
	it('produces a /dashboard tree when the guard fails', () => {
		TestBed.configureTestingModule({
			providers: [
				provideRouter([]),
				{ provide: SessionStore, useValue: fakeSessionStoreWithCaps([]) },
			],
		});
		const router = TestBed.inject(Router);
		expect(router.createUrlTree(['/dashboard']).toString()).toBe('/dashboard');
	});
});
