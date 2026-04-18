import { Component, inject, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { environment } from "../environments/environment";

/**
 * OAuth2 callback handler.
 * Receives the authorization code from sso-service, exchanges it for tokens via PKCE,
 * stores tokens in sessionStorage, and navigates to the dashboard.
 */
@Component({
	selector: "app-callback",
	standalone: true,
	template: `
		<div class="flex h-screen items-center justify-center bg-background">
			<div class="text-center">
				<div
					class="mb-4 h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent"
				></div>
				<p class="text-sm text-muted-foreground">{{ message }}</p>
			</div>
		</div>
	`,
})
export class CallbackComponent implements OnInit {
	message = "Completing sign-in...";
	private readonly router = inject(Router);

	async ngOnInit() {
		try {
			await this.handleCallback();
		} catch (err) {
			this.message = `Authentication failed: ${(err as Error).message}`;
		}
	}

	private async handleCallback(): Promise<void> {
		const params = new URLSearchParams(window.location.search);
		const code = params.get("code");
		const state = params.get("state");
		const error = params.get("error");

		if (error) {
			throw new Error(params.get("error_description") || error);
		}

		if (!code || !state) {
			throw new Error("Missing authorization code or state");
		}

		// Verify state to prevent CSRF
		const savedState = sessionStorage.getItem("oauth_state");
		if (state !== savedState) {
			throw new Error("State mismatch — possible CSRF attack");
		}

		// Retrieve PKCE verifier
		const verifier = sessionStorage.getItem("pkce_verifier");
		if (!verifier) {
			throw new Error("Missing PKCE verifier — session may have expired");
		}

		// Exchange authorization code for tokens
		const tokenBody = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: environment.oauthRedirectUri,
			client_id: environment.oauthClientId,
			code_verifier: verifier,
		});

		const response = await fetch(`${environment.ssoServiceUrl}/oauth2/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: tokenBody.toString(),
		});

		if (!response.ok) {
			const err = await response
				.json()
				.catch(() => ({}) as Record<string, string>);
			const errObj = err as Record<string, string>;
			throw new Error(
				errObj["error_description"] ||
					errObj["error"] ||
					`Token exchange failed (${response.status})`,
			);
		}

		const tokens = (await response.json()) as {
			access_token: string;
			refresh_token?: string;
			id_token?: string;
			expires_in: number;
			scope?: string;
			tenant_id?: string;
		};

		// API auth uses the sso_session HttpOnly cookie — we do not store the access_token
		// or refresh_token in sessionStorage. Per the PASETO spec, these tokens are for
		// single-use handoffs (machine-to-machine) and should not be reused per request.
		//
		// We keep the id_token for UI display (user name, email, tenant name) only.
		if (tokens.id_token) {
			sessionStorage.setItem("idToken", tokens.id_token);
		}
		const userId = this.extractClaim(tokens.id_token, "sub");
		if (userId) {
			sessionStorage.setItem("userId", userId);
		}
		const tenantId = this.extractClaim(tokens.id_token, "tid");
		if (tenantId) {
			// Stored for display purposes (e.g., "Switch tenant" UI). NOT used for API auth.
			sessionStorage.setItem("tenantId", tenantId);
		}

		// Clean up PKCE state
		sessionStorage.removeItem("pkce_verifier");
		sessionStorage.removeItem("oauth_state");

		// Clean the URL and navigate to dashboard
		this.router.navigateByUrl("/dashboard");
	}

	/**
	 * Extract a claim from a PASETO v4.public or JWT token payload.
	 *
	 * PASETO v4.public format: 'v4.public.{base64url(JSON_message + 64_byte_signature)}[.footer]'
	 * JWT format:              '{header}.{payload}.{signature}'
	 *
	 * For PASETO, the decoded payload contains JSON followed by binary signature bytes,
	 * so we must slice from the first '{' to the matching last '}' before JSON.parse.
	 */
	private extractClaim(
		token: string | undefined,
		claim: string,
	): string | undefined {
		if (!token) return undefined;
		try {
			const parts = token.split(".");
			// PASETO: parts = ['v4', 'public'|'local', payloadB64, footerB64?]
			// JWT:    parts = [headerB64, payloadB64, signatureB64]
			const isPaseto =
				parts.length >= 3 &&
				parts[0].startsWith("v") &&
				/^(public|local)$/.test(parts[1]);
			const payloadB64 = isPaseto ? parts[2] : parts[1];

			const normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
			const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
			const raw = atob(padded);

			// Extract the JSON object (PASETO has 64 binary signature bytes after the JSON)
			const start = raw.indexOf("{");
			const end = raw.lastIndexOf("}");
			if (start < 0 || end < 0 || end < start) return undefined;
			const decoded = JSON.parse(raw.substring(start, end + 1));
			const value = decoded?.[claim];
			return typeof value === "string" ? value : undefined;
		} catch {
			return undefined;
		}
	}
}
