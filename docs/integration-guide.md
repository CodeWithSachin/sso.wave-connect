# Integrating with WaveConnect

This guide walks a company like Miles Masterclass (or any of its corporate
customers — Pinion, Acme Inc., etc.) through bringing their users and
applications onto WaveConnect SSO. There are two audiences:

- **Tenant admin** (your IT lead): sets up the WaveConnect tenant, verifies
  domains, configures policies, optionally connects an enterprise IdP, and
  registers OAuth clients.
- **Application developer** (your engineering team): integrates the app to
  WaveConnect's OAuth 2.1 / OIDC issuer to authenticate users.

Read the [Overview](#overview) once, then jump to either
[Part 1: Tenant onboarding](#part-1--tenant-onboarding-admin) or
[Part 2: App integration](#part-2--app-integration-developer).

> **Note on availability.** Everything in *Part 1* and *Part 2* is shipped
> and supported today. *Part 3: Enterprise IdP federation* is delivered
> incrementally across the next few weeks (see
> [docs/plans](plans/) for the slice plan). The admin-console UI for
> configuring an external IdP is available now; the runtime that exchanges
<!-- TODO-SLICE-4: Remove this whole callout block when all slices ship. -->
> tokens with that IdP is rolling out by slice. If you need SSO via Entra
> or Google Workspace today, talk to us — we'll prioritize your tenant.

---

## Overview

WaveConnect is a multi-tenant identity platform: every customer (Miles, each
of Miles' corporate customers, every other org) gets an isolated **tenant**
with its own users, memberships, OAuth clients, policies, and audit log. Your
applications talk to WaveConnect as a standard OpenID Connect (OIDC) provider
— the same protocol Auth0, Okta, or Entra speaks — so most off-the-shelf
OIDC client libraries work without modification.

### Why this matters for Miles

Miles Masterclass moves its LMS auth to WaveConnect to give corporate
customers a centralized place to:

- Enforce **org-wide MFA** so individual learners cannot disable two-factor
  on their accounts (shipped — see [MFA enforcement](#mfa-enforcement)).
- Plug in their **own corporate SSO** (Entra, Okta, Google Workspace) so
  corporate IT owns account lifecycle (rolling out in Milestone A). <!-- TODO-SLICE-4: drop "(rolling out in Milestone A)" once shipped -->
- Get a **branded sign-in experience** with their logo, display name, and
  verified domain.
- Audit who did what — every policy change, every login, every membership
  edit is recorded.

### Architecture in one diagram

```
                                ┌──────────────────────────┐
                                │  Your App (LMS, portal,  │
                                │  internal tool, …)       │
                                └────────────┬─────────────┘
                                             │ OIDC (auth code + PKCE)
                                             ▼
┌────────────────┐    discover     ┌──────────────────────────┐
│ login-portal   │◀───────────────▶│  identity-service (auth) │
│ (branded UI)   │                 └────────────┬─────────────┘
└────────┬───────┘                              │
         │                                       │ shared `sessions` table
         ▼                                       ▼
┌────────────────┐                  ┌──────────────────────────┐
│ Your Entra /   │  SAML or OIDC    │  sso-service (OAuth/OIDC │
│ Okta / Google  │◀───  (Milestone  │  issuer + RP)            │
└────────────────┘     A, rolling   └──────────────────────────┘
                       out)                     │
                                                │ FGA tuples
                                                ▼
                                  ┌──────────────────────────┐
                                  │  authz-service (OpenFGA) │
                                  └──────────────────────────┘
```

You only ever talk to **two surfaces**: the branded `login-portal` for
sign-in, and the OIDC endpoints on `sso-service`. Everything else is internal.

---

## Part 1 — Tenant onboarding (admin)

### 1.1 Create the tenant

Visit `https://sso.wave-connect.com/signup-org` and complete the org-signup
form. You provide:

| Field | Example | Notes |
|---|---|---|
| Organization name | `Pinion LLC` | Display name shown on the login page |
| Slug | `pinion` | URL-safe; appears in `sso.wave-connect.com/<slug>` |
| Admin email | `it-admin@pinion.com` | First owner of the tenant; must be on a domain you control |
| Admin password | … | Used until you flip on enterprise SSO |
| Domain | `pinion.com` | The DNS domain you'll claim in step 1.2 |

The signup call atomically creates the tenant, an owner membership for you,
a pending `tenant_domains` row, and an email-verification token. You'll
receive two emails: one to verify the admin email, and one with DNS
instructions for the domain claim.

### 1.2 Claim and verify your domain

WaveConnect's email-first discover routes every sign-in by domain. A user
typing `alice@pinion.com` is routed to your tenant only after we've verified
you control `pinion.com`. Verification is a one-time DNS TXT record:

```
Type:  TXT
Name:  _wave-connect.pinion.com
Value: wave-connect-domain-verification=<token-from-signup-email>
TTL:   300
```

Then click **Verify** in the admin console — or hit
`POST /api/v1/tenants/:id/domains/:id/verify`. We re-resolve and confirm
within ~10 seconds. Once verified, your tenant becomes routable by domain
in `/auth/public/discover`.

You can claim **multiple domains** (e.g. `pinion.com` + `pinion-corp.io`).
Each is independently verified. A user's sign-in routes to your tenant if
their email is on any of your verified domains.

### 1.3 Brand the login experience

In the admin console under **Settings → Branding**:

- **Display name** — shown on the login page header
- **Logo URL** — 256×256 PNG/SVG, public HTTPS, served with permissive CORS
- **Primary color** — hex code, used for button + accent

Users typing an email on a domain you've verified see this branding instead
of the generic WaveConnect chrome.

### 1.4 Configure security policies

Under **Settings → Policies**, you control:

| Policy | Effect |
|---|---|
| `password_require_mfa` | If on, every login refuses to issue a session until the user has at least one active MFA enrollment, AND users cannot remove their last MFA method (returns 409 with `allowed_methods`). |
| `allowed_mfa_methods` | Subset of `["totp", "webauthn", "backup_code"]`. Users may only enroll methods in this list. |
| `password_min_length`, `password_require_upper/lower/number/symbol` | Standard complexity rules. Enforced on signup + password change. |
| `password_history_count` | Prevent reusing the last N passwords. |
| `lockout_threshold`, `lockout_duration_min` | Brute-force protection on the login endpoint. |
| `session_max_age_hours`, `idle_timeout_minutes` | Session lifetime gates. |
| `max_sessions_per_user` | Cap concurrent sessions. |
| `ip_allowlist` | CIDRs allowed to reach your tenant's auth endpoints. Empty means open. |
| `allowed_email_domains` | Restrict signup/invitations to specific email domains. Empty means all. |
| `require_sso` | When on, password login is disabled — see [Part 3](#part-3--enterprise-idp-federation-rolling-out). |

Every policy change writes an immutable row to `audit_logs` capturing **who
changed what, when, from where (IP + user-agent), and the before/after
values**. Policy edits require an `owner` or `admin` membership role —
`member`, `billing_manager`, and `readonly` cannot toggle security settings.

### 1.5 Invite or onboard your team

Two paths, choose either or both:

**Direct invitations.** Under **Members → Invite**, enter the new user's
email and role. They receive an invitation link valid for 14 days. The
invite includes the tenant branding so the recipient sees "You're invited
to join Pinion on WaveConnect", not the generic platform name.

**JIT (just-in-time) provisioning.** When you connect an enterprise IdP in
[Part 3](#part-3--enterprise-idp-federation-rolling-out), new users are
created automatically on first SSO sign-in if their email-domain matches
your verified domains AND your IdP has `jit_provisioning=true` (default on).
The IdP's claims map to user attributes via the IdP's `attributeMapping`
JSON.

**Bulk CSV import.** For tenants moving from a legacy system, ask us to run
a one-off import. We accept a CSV of `(email, first_name, last_name, role)`
and create pending memberships in bulk; invitees confirm via the standard
invitation link.

### 1.6 Register OAuth clients for your apps

Each application that authenticates users via WaveConnect needs an OAuth
client registration. Under **Developer → OAuth Clients → New**:

| Field | Example | Notes |
|---|---|---|
| Client name | `Miles Masterclass LMS` | Display name shown to users on consent |
| Redirect URIs | `https://learn.milesmasterclass.com/auth/callback` | Whitelist of allowed post-auth destinations. Exact match. |
| Grant types | `authorization_code`, `refresh_token` | The standard set. |
| Allowed scopes | `openid`, `profile`, `email`, `offline_access` | Determines what claims appear in the ID token. |
| First-party | `true` for your own apps; `false` for third parties | First-party clients skip the consent screen. |
| Require PKCE | `true` (recommended; mandatory for public clients) | |
| Require consent | `false` for first-party | |

You'll receive a `client_id` (public) and `client_secret` (treat as a
password — store in your secret manager, never commit, never log). For
SPAs and mobile apps, request a **public client** which has no secret and
relies on PKCE alone.

---

## Part 2 — App integration (developer)

The standard, recommended flow is **OAuth 2.1 Authorization Code with PKCE**.
Any compliant OIDC client library will work — we've tested the integrations
listed below. If you're using a framework not listed, point its OIDC config
at `https://sso.wave-connect.com/.well-known/openid-configuration` and it
will discover everything automatically.

**Jump to your stack:**
| Stack | Section |
|---|---|
| Django (server-rendered or API) | [2.3 Django backend](#23-django-backend-miles-masterclass-lms) |
| Angular SPA (with a Django BFF, or standalone) | [2.4 Angular SPA](#24-angular-spa-miles-masterclass-web-frontend) |
| Flutter (iOS/Android) | [2.5 Flutter mobile](#25-flutter-mobile-miles-masterclass-mobile-app) |
| Node.js / Go / Java / other | [2.6 Other stacks](#26-other-stacks-nodejs-go-anything-oidc-compliant) |

Read [2.1 Discovery](#21-discovery) and [2.2 The login flow](#22-the-login-flow)
first — they're protocol-level and apply to every stack.

### 2.1 Discovery

```bash
curl https://sso.wave-connect.com/.well-known/openid-configuration
```

Returns the standard OIDC discovery document:

```json
{
  "issuer": "https://sso.wave-connect.com",
  "authorization_endpoint": "https://sso.wave-connect.com/oauth2/authorize",
  "token_endpoint": "https://sso.wave-connect.com/oauth2/token",
  "userinfo_endpoint": "https://sso.wave-connect.com/userinfo",
  "jwks_uri": "https://sso.wave-connect.com/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "id_token_signing_alg_values_supported": ["EdDSA"],
  "code_challenge_methods_supported": ["S256"]
}
```

**Note on signing algorithm.** ID tokens are signed with **Ed25519 (EdDSA)**.
Most modern OIDC libraries handle this; some older libraries default to RS256
and need explicit Ed25519 support enabled.

### 2.2 The login flow

```
1. User clicks "Sign in" on your app
2. Your app redirects to /oauth2/authorize with:
       client_id, redirect_uri, response_type=code,
       scope=openid profile email, state, code_challenge, code_challenge_method=S256
3. WaveConnect's login-portal shows the branded sign-in page
4. User enters email → discover routes to their tenant
5. User authenticates (password / MFA / external IdP, depending on policy)
6. WaveConnect redirects back to redirect_uri with ?code=…&state=…
7. Your app verifies state, then POSTs to /oauth2/token with the code + code_verifier
8. WaveConnect returns access_token, refresh_token, id_token
9. Your app verifies the id_token signature via JWKS, then reads claims
```

### 2.3 Django backend (Miles Masterclass LMS)

The Miles Masterclass LMS is on Django, so this is the canonical server-side
integration. We recommend **Authlib** over the more popular
`mozilla-django-oidc` because Authlib supports EdDSA / Ed25519 ID-token
signatures via its own JOSE implementation, while `mozilla-django-oidc`
requires custom PyJWT plumbing for non-RS256 algs.

```bash
# Recent versions of all four are needed for EdDSA support.
pip install authlib requests cryptography pyjwt
```

```python
# settings.py
import os

WAVECONNECT_ISSUER = "https://sso.wave-connect.com"
WAVECONNECT_CLIENT_ID = os.environ["WAVECONNECT_CLIENT_ID"]
WAVECONNECT_CLIENT_SECRET = os.environ["WAVECONNECT_CLIENT_SECRET"]

# Custom user model
AUTH_USER_MODEL = "learners.Learner"

# Required: Django's login() picks a backend off this list to record on the
# session. Without ModelBackend, the JIT login below raises ValueError.
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
]

# Database-backed sessions (Django's default). The OIDC token storage below
# relies on this — `SESSION_ENGINE = 'django.contrib.sessions.backends.
# signed_cookies'` would put tokens in a signed-but-unencrypted client
# cookie, leaking them to the browser. Either keep the DB default or
# switch to encrypted sessions before storing tokens.
SESSION_ENGINE = "django.contrib.sessions.backends.db"
```

```python
# auth/oauth.py — register the OIDC client once at module load. Authlib's
# Django integration takes the kwargs inline (it does not auto-read from
# settings the way the Flask integration does).
from authlib.integrations.django_client import OAuth
from django.conf import settings

oauth = OAuth()
oauth.register(
    name="waveconnect",
    server_metadata_url=f"{settings.WAVECONNECT_ISSUER}/.well-known/openid-configuration",
    client_id=settings.WAVECONNECT_CLIENT_ID,
    client_secret=settings.WAVECONNECT_CLIENT_SECRET,
    client_kwargs={
        "scope": "openid profile email offline_access",
        # Force PKCE even though we hold the secret — defense in depth
        # against authorization-code interception attacks.
        "code_challenge_method": "S256",
    },
)
```

```python
# auth/views.py
from django.conf import settings
from django.contrib.auth import login, logout
from django.shortcuts import redirect
from django.urls import reverse
from .oauth import oauth
from learners.models import Learner

def login_view(request):
    return oauth.waveconnect.authorize_redirect(
        request, request.build_absolute_uri(reverse("auth_callback"))
    )

def callback_view(request):
    token = oauth.waveconnect.authorize_access_token(request)
    claims = token["userinfo"]  # already JWT-verified by Authlib

    # JIT: create the Learner row on first sign-in. `sub` is the stable
    # WaveConnect user id (typeid like "user_01HXXX..."). Use it as the
    # join key — emails can change, sub doesn't.
    learner, _ = Learner.objects.update_or_create(
        sso_subject=claims["sub"],
        defaults={
            "email": claims["email"],
            "first_name": claims.get("given_name", ""),
            "last_name": claims.get("family_name", ""),
            "display_name": claims.get("name", ""),
            "avatar_url": claims.get("picture", ""),
            "is_active": True,
        },
    )

    # `login()` requires `learner.backend` to be set so Django knows which
    # backend authenticated this user (it stamps that onto the session for
    # subsequent `request.user` hydration). Since we did not call
    # `authenticate()` — we trusted the OIDC token — we set it ourselves.
    learner.backend = "django.contrib.auth.backends.ModelBackend"
    login(request, learner)

    # Tokens land in DB-backed session storage (set in settings.py above).
    # For higher-security tenants, store them in an encrypted column on the
    # learner instead and never let them touch the session.
    request.session["wc_access_token"] = token["access_token"]
    request.session["wc_refresh_token"] = token.get("refresh_token")
    request.session["wc_id_token"] = token["id_token"]
    return redirect("dashboard")

def logout_view(request):
    logout(request)
    # Front-channel logout at WaveConnect — kills the sso_session cookie
    # AND any active external-IdP session if SSO federation is on.
    return redirect(
        f"{settings.WAVECONNECT_ISSUER}/auth/logout"
        f"?return_to={request.build_absolute_uri('/')}"
    )
```

```python
# urls.py
from django.urls import path
from .auth.views import login_view, callback_view, logout_view

urlpatterns = [
    path("auth/login/", login_view, name="auth_login"),
    path("auth/callback/", callback_view, name="auth_callback"),
    path("auth/logout/", logout_view, name="auth_logout"),
]
```

#### Custom user model — store the WaveConnect subject

```python
# learners/models.py
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

class LearnerManager(BaseUserManager):
    def create_user(self, sso_subject, email, **extra):
        learner = self.model(sso_subject=sso_subject, email=self.normalize_email(email), **extra)
        learner.set_unusable_password()  # auth is via WaveConnect, never a local password
        learner.save(using=self._db)
        return learner

class Learner(AbstractBaseUser, PermissionsMixin):
    sso_subject = models.CharField(max_length=64, unique=True, db_index=True)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=120, blank=True)
    last_name = models.CharField(max_length=120, blank=True)
    display_name = models.CharField(max_length=255, blank=True)
    avatar_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # required for Django admin

    objects = LearnerManager()

    USERNAME_FIELD = "sso_subject"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["email"]

    def __str__(self) -> str:
        return f"{self.email} ({self.sso_subject})"
```

`PermissionsMixin` gives you `is_superuser`, `groups`, and `user_permissions`
— required for Django admin, `@permission_required`, and any DRF permission
class to work. `set_unusable_password()` in the manager keeps the row out of
local password-reset flows: there is no password, ever.

`sso_subject` (the OIDC `sub` claim) is the join key for federation. If a
corporate user's email later changes at their IdP, we still recognize them.

#### Refresh tokens for long-lived background jobs

```python
# auth/refresh.py — use this inside Celery tasks or DRF middleware when
# the access_token in session has expired.
def refresh_waveconnect_token(refresh_token: str) -> dict:
    return oauth.waveconnect.fetch_access_token(
        grant_type="refresh_token",
        refresh_token=refresh_token,
    )
```

Refresh tokens are **rotating** — every successful refresh issues a new
refresh token and revokes the previous one. Always overwrite your stored
refresh token with the new one; reusing the old one will revoke the entire
token family.

### 2.4 Angular SPA (Miles Masterclass web frontend)

Two patterns, pick one:

**Recommended: Backend-for-Frontend (BFF) with Django.** Angular never sees
OIDC tokens. The Django backend handles the auth dance, sets a session
cookie, and Angular just calls Django APIs with credentials. This is the
strongest security posture (no tokens in the browser) and matches your
existing stack.

```typescript
// app.config.ts
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withFetch(),
      withInterceptors([credentialsInterceptor]),
    ),
  ],
};

// credentials.interceptor.ts
import type { HttpInterceptorFn } from '@angular/common/http';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  // Every request to the Django backend rides on the session cookie.
  return next(req.clone({ withCredentials: true }));
};

// auth.service.ts — just kicks off the redirect to Django
import { Injectable } from '@angular/core';
import { httpResource } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly me = httpResource<{ id: string; email: string; displayName: string } | null>(
    () => '/api/me/',
  );

  login() {
    window.location.href = `/auth/login/?next=${encodeURIComponent(window.location.pathname)}`;
  }

  logout() {
    window.location.href = '/auth/logout/';
  }
}
```

```typescript
// guards/auth.guard.ts — protect Angular routes
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.me.value()) return true;
  auth.login();
  return false;
};
```

CORS: Django must set `Access-Control-Allow-Credentials: true` and
`Access-Control-Allow-Origin: <your-angular-origin>` (no wildcard with
credentials). If Angular and Django are on the same registrable domain
(e.g. `app.milesmasterclass.com` + `api.milesmasterclass.com`), cookies
just work with `Domain=.milesmasterclass.com`.

**Alternative: Public OIDC client in the SPA.** Use this only if you cannot
host a backend per-frontend. Tokens live in browser memory (never
localStorage — XSS vector). Library: `angular-auth-oidc-client`.

```bash
pnpm add angular-auth-oidc-client
```

```typescript
// app.config.ts
import { provideAuth, LogLevel } from 'angular-auth-oidc-client';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAuth({
      config: {
        authority: 'https://sso.wave-connect.com',
        redirectUrl: window.location.origin + '/auth/callback',
        postLogoutRedirectUri: window.location.origin,
        clientId: 'your-spa-public-client-id', // public client, no secret
        scope: 'openid profile email offline_access',
        responseType: 'code',
        silentRenew: true,
        useRefreshToken: true,
        // EdDSA ID-token signatures — jsrsasign (the library's verifier)
        // supports Ed25519 via its standard JWS module.
        renewTimeBeforeTokenExpiresInSeconds: 30,
        logLevel: LogLevel.Warn,
      },
    }),
  ],
};

// login.component.ts
import { inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';

export class LoginComponent {
  private readonly oidc = inject(OidcSecurityService);
  login() { this.oidc.authorize(); }
}

// callback.component.ts
import { inject, OnInit } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { Router } from '@angular/router';

export class CallbackComponent implements OnInit {
  private readonly oidc = inject(OidcSecurityService);
  private readonly router = inject(Router);
  ngOnInit() {
    this.oidc.checkAuth().subscribe(({ isAuthenticated }) => {
      this.router.navigate([isAuthenticated ? '/dashboard' : '/login']);
    });
  }
}
```

When you register the SPA's OAuth client in the admin console, set
**Require PKCE = true** and leave **Client Secret** unset (public client).

### 2.5 Flutter mobile (Miles Masterclass mobile app)

`flutter_appauth` wraps Google's battle-tested AppAuth library and gives
you SafariViewController on iOS and Chrome Custom Tabs on Android — the
OS-blessed surfaces for OAuth flows. Tokens land in `flutter_secure_storage`
which uses Keychain (iOS) and Keystore (Android).

```yaml
# pubspec.yaml
dependencies:
  flutter_appauth: ^7.0.0
  flutter_secure_storage: ^9.2.0
  http: ^1.2.0
```

```dart
// lib/auth/waveconnect_auth.dart
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class WaveConnectAuth {
  static const _issuer = 'https://sso.wave-connect.com';
  static const _clientId = 'your-mobile-public-client-id';
  // Custom URI scheme registered in Info.plist + AndroidManifest.xml below.
  // This string MUST EXACTLY MATCH one of the entries in the OAuth client's
  // `redirect_uris` array as configured in the WaveConnect admin console —
  // a single trailing slash mismatch produces `redirect_uri_mismatch` 400s.
  // AppAuth accepts both `scheme:/path` and `scheme://path`; pick one and
  // use it consistently in BOTH the platform manifests AND the admin
  // console registration.
  static const _redirectUri = 'com.milesmasterclass.app:/oauth/callback';
  static const _scopes = ['openid', 'profile', 'email', 'offline_access'];

  final _appAuth = const FlutterAppAuth();
  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  Future<AuthResult> login() async {
    final result = await _appAuth.authorizeAndExchangeCode(
      AuthorizationTokenRequest(
        _clientId,
        _redirectUri,
        issuer: _issuer,
        scopes: _scopes,
        // PKCE is automatic — AppAuth always generates a verifier.
        // No clientSecret: mobile apps are public clients.
      ),
    );
    await _persist(result);
    return result;
  }

  Future<TokenResponse?> refresh() async {
    final refresh = await _storage.read(key: 'refresh_token');
    if (refresh == null) return null;
    final result = await _appAuth.token(TokenRequest(
      _clientId,
      _redirectUri,
      issuer: _issuer,
      grantType: 'refresh_token',
      refreshToken: refresh,
    ));
    await _persistRefresh(result);
    return result;
  }

  Future<void> logout() async {
    await _storage.deleteAll();
    // Optional: end-session at WaveConnect via WebView / browser if you
    // want to nuke the sso_session cookie on this device too.
  }

  Future<String?> get accessToken => _storage.read(key: 'access_token');

  Future<void> _persist(AuthorizationTokenResponse r) async {
    await _storage.write(key: 'access_token', value: r.accessToken);
    await _storage.write(key: 'refresh_token', value: r.refreshToken);
    await _storage.write(key: 'id_token', value: r.idToken);
  }

  Future<void> _persistRefresh(TokenResponse r) async {
    await _storage.write(key: 'access_token', value: r.accessToken);
    // CRITICAL: refresh tokens rotate on WaveConnect — overwrite the stored
    // one or you lose the family on the next refresh. Guard against null
    // anyway: some IdPs (Entra v1) do NOT rotate, so a refresh response can
    // omit the field entirely. `flutter_secure_storage.write(value: null)`
    // DELETES the key, which would silently brick subsequent refreshes.
    if (r.refreshToken != null) {
      await _storage.write(key: 'refresh_token', value: r.refreshToken);
    }
  }
}

class AuthResult {
  final String accessToken;
  final String idToken;
  AuthResult(this.accessToken, this.idToken);
}
```

**iOS — `ios/Runner/Info.plist`:**

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.milesmasterclass.app</string>
    </array>
  </dict>
</array>
```

**Android — `android/app/build.gradle`:**

```gradle
android {
    defaultConfig {
        manifestPlaceholders = [
            'appAuthRedirectScheme': 'com.milesmasterclass.app'
        ]
    }
}
```

#### Calling your Django API from Flutter

Send the access token on every API call:

```dart
final http = HttpClient();  // or `package:http`
final token = await auth.accessToken;
final response = await http.get(
  Uri.parse('https://api.milesmasterclass.com/courses'),
  headers: {'Authorization': 'Bearer $token'},
);
```

WaveConnect issues PASETO access tokens (not JWT). Your Django middleware
validates them by calling `/userinfo` on WaveConnect with the bearer
token; cache the result for the access-token lifetime (typically ~15
minutes) so you don't hit `/userinfo` on every request:

```python
# auth/middleware.py
import hashlib
import requests
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

class WaveConnectBearerMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return self.get_response(request)
        token = auth_header[7:]

        # Cache hit: token already validated, user info reused. Use SHA-256
        # over the raw token bytes — Python's built-in `hash()` is
        # PYTHONHASHSEED-randomized and process-local, so the cache hit rate
        # across gunicorn/uvicorn workers (or load-balanced Django pods)
        # would be 0. SHA-256 gives a stable cluster-wide key.
        cache_key = f"wc_userinfo:{hashlib.sha256(token.encode()).hexdigest()}"
        userinfo = cache.get(cache_key)
        if userinfo is None:
            r = requests.get(
                f"{settings.WAVECONNECT_ISSUER}/userinfo",
                headers={"Authorization": f"Bearer {token}"},
                timeout=2,
            )
            if r.status_code != 200:
                return JsonResponse({"error": "invalid_token"}, status=401)
            userinfo = r.json()
            # 5-minute cache. Tighter than the typical 15-min access-token
            # TTL so a revoked token stops working within at most 5 min.
            cache.set(cache_key, userinfo, timeout=300)

        request.wc_user = userinfo
        return self.get_response(request)
```

For higher throughput, fetch WaveConnect's PASETO public key once at boot
from `https://sso.wave-connect.com/.well-known/paseto-keys` and verify the
token locally with `pyseto` — no network hop per request. Authlib does not
yet support PASETO directly; `pyseto` is the canonical Python library.

### 2.6 Other stacks (Node.js, Go, anything OIDC-compliant)

Any OIDC client library that supports **authorization-code-with-PKCE** and
**Ed25519 / EdDSA ID-token signatures** works. Point the library at
`https://sso.wave-connect.com/.well-known/openid-configuration` and it
discovers everything.

#### Node.js / Express example (reference)

```typescript
// npm install passport openid-client express-session
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Issuer, Strategy } from 'openid-client';

const app = express();
app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

const issuer = await Issuer.discover('https://sso.wave-connect.com');
const client = new issuer.Client({
  client_id: process.env.WAVECONNECT_CLIENT_ID!,
  client_secret: process.env.WAVECONNECT_CLIENT_SECRET!,
  redirect_uris: ['https://app.example.com/auth/callback'],
  response_types: ['code'],
});

passport.use('oidc', new Strategy({ client, params: { scope: 'openid profile email offline_access' } },
  (tokenSet, userinfo, done) => done(null, { ...userinfo, tokens: tokenSet }),
));

app.get('/auth/login', passport.authenticate('oidc'));
app.get('/auth/callback', passport.authenticate('oidc', { failureRedirect: '/login' }),
  (_req, res) => res.redirect('/dashboard'));
```

For Go, see [docs/quickstart/go.md](quickstart/go.md). For first-class
support of other languages (Java, Ruby, .NET, …), the Spring Security
OAuth2 client, omniauth-openid-connect, and Microsoft.AspNetCore.Authentication.OpenIdConnect
libraries all interoperate cleanly — they're the same libraries used
against Auth0/Okta/Entra.

### 2.7 Verifying the ID token by hand

If you can't use an OIDC library, here's the verification dance:

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose';

const jwks = createRemoteJWKSet(new URL('https://sso.wave-connect.com/.well-known/jwks.json'));

const { payload } = await jwtVerify(idTokenString, jwks, {
  issuer: 'https://sso.wave-connect.com',
  audience: process.env.WAVECONNECT_CLIENT_ID,
  algorithms: ['EdDSA'],
});

// payload now contains: sub, email, name, picture (if scope granted),
// iss, aud, exp, iat, nonce
```

**Always verify** the signature, issuer, audience, and expiry. Never decode
the JWT and trust the claims without signature verification — that's the
single most common OIDC implementation bug.

### 2.8 Refresh tokens

Pass `scope=offline_access` on the initial authorize call to receive a
refresh token. Refresh tokens are bound to a rotating family — every refresh
issues a new refresh token and revokes the previous one. **Always replace
your stored refresh token** with the new one returned by the token endpoint;
otherwise the next refresh will fail and the user will be logged out.

```bash
curl -X POST https://sso.wave-connect.com/oauth2/token \
  -d grant_type=refresh_token \
  -d refresh_token="$STORED_REFRESH" \
  -u "$CLIENT_ID:$CLIENT_SECRET"
```

### 2.9 Logout

Clear your local session, then redirect to:

```
https://sso.wave-connect.com/auth/logout
```

This revokes the WaveConnect session cookie and the active refresh-token
family. If the user signed in via an external IdP (Part 3), single-logout
to the IdP is invoked as well.

### 2.10 Handling the `tenant_sso` redirect

When a user's email-domain belongs to a tenant with `require_sso=true`, the
discover endpoint returns `mode=tenant_sso` and a `login_url` pointing to
either the IdP's SAML SSO endpoint or our OIDC initiator. The login-portal
handles this transparently — your app does not need to special-case it.

If your app is bypassing login-portal and hitting `/oauth2/authorize`
directly (e.g., a deep link from a corporate Entra "My Apps" tile), pass
the `idp_hint` query parameter to skip the email step:

```
https://sso.wave-connect.com/oauth2/authorize
  ?client_id=…&redirect_uri=…&response_type=code&state=…
  &code_challenge=…&code_challenge_method=S256
  &idp_hint=idp_01HXXXXXXXXX
```

`idp_hint` is validated three ways (signed discover token, email-domain
binding, or interstitial confirm) to prevent IdP-confusion attacks. See
[Part 3.4](#34-deep-linking-from-corporate-tools).

---

<!-- TODO-SLICE-4: Remove "(rolling out)" suffix once SAML SP runtime ships. -->
## Part 3 — Enterprise IdP federation (rolling out)

<!-- TODO-SLICE-4: Replace this status callout with a "Status: Supported" badge once all rows in the matrix below are runtime-complete. -->
> **Status:** Admin-side CRUD endpoints + UI are available today. The
> runtime that actually exchanges tokens with the external IdP rolls out
> across Milestone A slices 2–4 (roughly 4 weeks). Configure your IdP now;
> we'll flip the runtime on per-tenant as it ships and let you know.

### 3.1 Supported IdPs

<!-- TODO-SLICE-2: Change OIDC rows to "Supported" when Slice 2 ships. -->
<!-- TODO-SLICE-4: Change SAML rows to "Supported" when Slice 4 ships. -->
| IdP | Protocol | Status |
|---|---|---|
| Microsoft Entra ID (Azure AD) | SAML 2.0 | Configurable; runtime in Slice 4 |
| Microsoft Entra ID | OIDC | Configurable; runtime in Slice 2 |
| Google Workspace | OIDC | Configurable; runtime in Slice 2 |
| Okta | SAML 2.0 / OIDC | Configurable; runtime in Slice 4 / 2 |
| Generic SAML 2.0 (Keycloak, ADFS, OneLogin, …) | SAML 2.0 | Configurable; runtime in Slice 4 |
| Generic OIDC | OIDC | Configurable; runtime in Slice 2 |

### 3.2 Configure an Entra OIDC IdP

In Entra (admin.microsoft.com):

1. **App registrations → New registration.** Name: `WaveConnect`. Supported
   account types: "Accounts in this organizational directory only".
   Redirect URI: `Web` →
   `https://sso.wave-connect.com/idp/oidc/callback`.
2. Note the **Application (client) ID** and **Directory (tenant) ID** —
   you'll paste these into WaveConnect.
3. **Certificates & secrets → New client secret.** Copy the **Value**
   immediately (Entra hides it after navigation).
4. **API permissions → Microsoft Graph → Delegated**: add `openid`,
   `profile`, `email`. Grant admin consent.

In WaveConnect admin console under **Settings → SSO → New IdP**:

| Field | Value |
|---|---|
| Type | Microsoft Entra (OIDC) |
| Name | `Pinion Entra` |
| Issuer URL | `https://login.microsoftonline.com/<directory-id>/v2.0` |
| Client ID | (from Entra step 2) |
| Client Secret | (from Entra step 3 — encrypted at rest with AES-256-GCM) |
| Domain hint | `pinion.com` — users with this email-domain are routed here |
| Attribute mapping | Defaults work for Entra; edit only if you have custom claims |
| JIT provisioning | `true` — create users on first sign-in |
| Default role | `member` — new JIT users get this membership role |

Click **Test connection**. We probe the discovery URL and validate the
issuer matches what you entered (SSRF-hardened on our side — we refuse to
fetch private-network addresses). On green, click **Activate**.

### 3.3 Configure a SAML IdP (Entra example)

In Entra:

1. **Enterprise applications → New application → Create your own.**
   Name: `WaveConnect`. Integrate any other application.
2. **Single sign-on → SAML.** Configure:
   - Identifier (Entity ID): `https://sso.wave-connect.com/saml/sp/<idp_id>`
     (you'll get this after creating the IdP in WaveConnect first; come back
     and fill it in)
   - Reply URL (ACS): `https://sso.wave-connect.com/idp/saml/<idp_id>/acs`
   - Sign-on URL: leave blank (we send AuthnRequest)
3. **SAML Signing Certificate → Download** the certificate (.cer / .pem).
4. **Set up WaveConnect** section → copy the **Login URL** (SSO endpoint)
   and **Microsoft Entra Identifier** (the IdP entity ID).

In WaveConnect admin console under **Settings → SSO → New IdP**:

| Field | Value |
|---|---|
| Type | Microsoft Entra (SAML) |
| Name | `Pinion Entra SAML` |
| IdP Entity ID | (from Entra step 4) |
| SSO URL | (from Entra step 4) |
| Signing certificate | Paste the contents of the .pem (or upload metadata XML) |
| Name ID format | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` (Entra default) |
| Domain hint | `pinion.com` |

Click **Download SP metadata** — we generate the XML with our entity ID, ACS
URL, and SP signing certificate. Import that into Entra (under SAML
Configuration → Upload metadata file) to complete the round-trip.

Test, then activate.

### 3.4 Deep-linking from corporate tools

Once SSO is active, users can be deep-linked into your app from the
corporate IdP's app catalog (Entra "My Apps", Okta dashboard, etc.):

```
https://sso.wave-connect.com/oauth2/authorize
  ?client_id=<your-app-client-id>
  &redirect_uri=<your-app-callback>
  &response_type=code
  &state=<random>
  &code_challenge=<pkce>
  &code_challenge_method=S256
  &idp_hint=<idp_id>
```

`idp_hint` skips the email-entry step on login-portal. The bare-deep-link
form (no `email` or `discover_token` parameter) renders a brief interstitial
confirming the IdP name before redirecting — this is required to defeat
attacker-supplied deep links and you cannot disable it. Users see one extra
click; security teams sleep at night.

### 3.5 Choose: one tenant per company, or one tenant for Miles?

This is a product decision for Miles to make once. The recommended pattern:

- **One WaveConnect tenant per corporate customer.** Pinion gets its own
  tenant. Acme gets its own tenant. Each has its own admins, its own SSO,
  its own policies. Miles is a separate "platform owner" surface.

The alternative — sub-orgs of a single Miles tenant — is not supported by
the current schema and would require ~2 weeks of migration work. We
recommend against it: corporate customers expect strict tenant isolation
for compliance (SOC 2, GDPR), and per-tenant Entra connections are the
norm in B2B SaaS.

---

## MFA enforcement

> **Status:** Shipped.

When `password_require_mfa=true` on your tenant policy:

1. **Login** refuses to issue a session unless the user has at least one
   active MFA enrollment. The response is `403 Forbidden` with
   `{"error": "mfa_enrollment_required", "allowed_methods": [...]}`. Your
   app should redirect the user to the MFA enrollment flow on login-portal.
2. **Delete enrollment** refuses to remove the last active method.
   Returns `409 Conflict` with
   `{"error": "mfa_required_by_policy", "allowed_methods": [...]}`.
   Users must enroll a replacement first.
3. **Race-freeness** — concurrent delete requests are serialized via row
   locks on the user's enrollment set; only one can succeed when only two
   active methods exist.

Supported methods:

| Method | Status | Notes |
|---|---|---|
| TOTP (RFC 6238) | ✅ | Authenticator apps — Google Auth, 1Password, Authy. |
| WebAuthn / Passkeys | ✅ | Hardware keys + platform authenticators (Touch ID, Face ID, Windows Hello). |
| Backup codes | ✅ | One-time codes for recovery. Always allowed as fallback if any active enrollment exists. |
| SMS | ❌ | Not supported (SMS is no longer considered strong MFA per NIST). |
| Email | ❌ | Not supported. |

Restrict the methods your users can enroll via `allowed_mfa_methods`.

---

## Audit logging

Every state-changing admin action writes an immutable row to `audit_logs`:

- Who (`actor_id`, `actor_type`)
- From where (`actor_ip`, `actor_user_agent`)
- When (`created_at`)
- What changed (`action`, `resource_type`, `resource_id`,
  `old_values`/`new_values` JSON)
- Tenant scope (`tenant_id`)

The table is partition-by-month and append-only at the role level. Available
actions today include `tenant_policy.updated`, `platform_admin.granted`,
`platform_admin.revoked`, `membership.role_changed`, and others. Filter and
export via the admin console under **Audit log**, or query directly:

```bash
curl -H "Cookie: sso_session=…" \
  "https://admin.wave-connect.com/api/v1/audit?action=tenant_policy.updated&from=2026-05-01"
```

---

## SDKs

Optional convenience libraries. The OIDC standard works fine without them.

- [Node.js](quickstart/node-js.md) — Express middleware + permission helpers
- [Go](quickstart/go.md) — Fiber/Gin middleware + permission helpers

Both wrap the same `/userinfo` + JWKS verification + permission-check
endpoints described in Part 2.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `invalid_client` from `/oauth2/token` | Wrong client_id or client_secret, or trailing whitespace | Re-copy from admin console. Secrets are encrypted at rest; you cannot retrieve them after creation — rotate if lost. |
| `redirect_uri_mismatch` | Your callback URL doesn't match the registered set (exact match required, including trailing slash) | Update the OAuth client in admin console. |
| `mfa_enrollment_required` on login | Tenant policy `password_require_mfa=true`, user has no enrollment | Redirect user to MFA setup at `/auth/mfa/setup`. |
| `mfa_required_by_policy` on delete | User trying to delete their last MFA method while policy requires it | Enroll a replacement first, then delete. |
| `sso_required` on `/auth/login` | Tenant policy `require_sso=true`; password login is disabled | Send users through `/auth/public/discover` instead — they'll be routed to your IdP. |
| `ip_not_allowed` | Request came from outside `ip_allowlist` | Add the source CIDR, or remove the allowlist. |
| ID token signature verification fails | Library doesn't support EdDSA | Use a recent version of a library that advertises Ed25519 / EdDSA: Python `authlib` + `cryptography` + `pyjwt` (latest stable trio handles it); Angular `angular-auth-oidc-client` (latest major); Flutter `flutter_appauth` (latest); Node `jose` v5+ or `oidc-client-ts` v3+; Go `github.com/coreos/go-oidc/v3`. Check the library's changelog for the version that added Ed25519 / EdDSA support; pin to that floor or newer. Avoid `mozilla-django-oidc` without an EdDSA shim. |
| Django: `RuntimeWarning: Algorithm not allowed` | `pyjwt`'s `cryptography` backend too old, or `algorithms=["RS256"]` hardcoded somewhere | Upgrade `cryptography` and `pyjwt` to recent versions. Authlib reads the supported algs from the discovery document automatically, so don't hardcode `algorithms=[...]` unless you're verifying a JWT yourself. |
| Angular: redirect loops on `/auth/callback` | Cookie not set across origins | Confirm Django returns `Access-Control-Allow-Credentials: true` and `Set-Cookie: SameSite=Lax; Secure` on the same registrable domain. Or move Angular and Django to the same origin. |
| Flutter: `redirect_uri_mismatch` after biometric login | Custom URI scheme not registered, or doesn't match the OAuth client config | Verify `CFBundleURLSchemes` in `Info.plist` (iOS), `appAuthRedirectScheme` in `build.gradle` (Android), AND the value in admin console OAuth client `redirect_uris`. The path component (`/oauth/callback`) and scheme both must match. |
| Flutter: tokens disappear after app reinstall | Expected — Keychain (iOS) is scoped to app installation | Force re-login on first app launch; refresh tokens revoke on family rotation anyway. |
| `email_not_verified` on login | User signed up but never clicked the verification link | Resend via admin console → Users → Resend verification. |
| Session not persisting across subdomains | `sso_session` cookie domain set to a specific subdomain | Talk to us — cookie domain is a tenant config. |
| Discover returns `mode=consumer` for an internal email | Domain not yet verified for your tenant | Complete the TXT record + click Verify. |

For anything else, the request ID is in the response header `X-Request-ID`
— include it when contacting support.

---

## Where to read next

- [docs/concepts/paseto-tokens.md](concepts/paseto-tokens.md) — how our
  internal session tokens work (you don't need to know this for OIDC
  integration; useful for security review).
- [docs/quickstart/node-js.md](quickstart/node-js.md) /
  [docs/quickstart/go.md](quickstart/go.md) — SDK quickstarts.
- [docs/plans/admin-role-surfaces.md](plans/admin-role-surfaces.md) — the
  capability matrix that determines which admin can do what.
- [OPERATIONS.md](../OPERATIONS.md) — runbook for self-hosted or on-prem
  deployments.

## Contact

- Engineering: engineering@wave-connect.com
- Support: support@wave-connect.com
- Security disclosures: security@wave-connect.com (PGP key on request)
