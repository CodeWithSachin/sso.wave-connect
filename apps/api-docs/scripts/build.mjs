#!/usr/bin/env node
// Build the API docs portal as a fully self-contained static site.
//
// Inputs:
//   - apps/api-docs/src/                                 (index.html template)
//   - docs/api/<svc>/openapi.json                        (committed per-service specs)
//   - docs/api/grpc/services.yaml                        (single source of truth)
//   - node_modules/@scalar/api-reference/dist/browser/   (self-hosted bundle)
//
// Output: dist/apps/api-docs/ with:
//   - index.html              referencing relative URLs only
//   - scalar/standalone.js    self-hosted Scalar bundle (no CDN dependency)
//   - specs/<svc>.json        per-service OpenAPI specs
//   - grpc/services.yaml      gRPC reference
//
// This removes three risks vs the previous runtime-aggregating approach:
//   1. CORS coupling — relative URLs are same-origin.
//   2. Service-availability coupling — specs are baked at build time.
//   3. Supply-chain CDN risk — bundle is local.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const workspaceRoot = resolve(projectRoot, '..', '..');
const distDir = resolve(workspaceRoot, 'dist', 'apps', 'api-docs');
const specsDir = resolve(workspaceRoot, 'docs', 'api');

// Locate the self-hosted Scalar standalone bundle. The package's `exports`
// field doesn't list this subpath, so `require.resolve` is blocked — point
// at the hoisted node_modules symlink directly. pnpm ensures the symlink
// exists once `@scalar/api-reference` is installed at the workspace root.
const scalarBundleSrc = join(
  workspaceRoot,
  'node_modules',
  '@scalar',
  'api-reference',
  'dist',
  'browser',
  'standalone.js',
);
if (!existsSync(scalarBundleSrc)) {
  throw new Error(
    `Scalar standalone bundle not found at ${scalarBundleSrc}. Run \`pnpm install\` at the workspace root.`,
  );
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
mkdirSync(join(distDir, 'scalar'), { recursive: true });
mkdirSync(join(distDir, 'specs'), { recursive: true });
mkdirSync(join(distDir, 'grpc'), { recursive: true });

// 1. Copy the Scalar standalone bundle (self-host, no CDN).
cpSync(scalarBundleSrc, join(distDir, 'scalar', 'standalone.js'));

// 2. Discover every per-service spec under docs/api/<svc>/openapi.json.
//    Order is alphabetical for deterministic builds. The portal config lists
//    services in display order via a curated SOURCE_ORDER below.
const SOURCE_ORDER = [
  ['Admin API', 'admin-api'],
  ['Identity Service', 'identity-service'],
  ['SSO Service', 'sso-service'],
  ['Authz Service', 'authz-service'],
  ['Directory (SCIM)', 'directory-service'],
  ['Webhook Service', 'webhook-service'],
  ['Audit Service', 'audit-service'],
  ['Developer Portal API', 'developer-portal-api'],
];

const present = new Set(readdirSync(specsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
const sources = [];
for (const [title, slug] of SOURCE_ORDER) {
  if (!present.has(slug)) {
    console.warn(`skip ${slug} (no docs/api/${slug}/openapi.json — run pnpm docs:export first)`);
    continue;
  }
  const src = join(specsDir, slug, 'openapi.json');
  const dst = join(distDir, 'specs', `${slug}.json`);
  try {
    cpSync(src, dst);
    sources.push({ title, slug, url: `./specs/${slug}.json` });
  } catch (err) {
    console.warn(`skip ${slug}:`, err.message);
  }
}

// 3. gRPC reference — single source of truth at docs/api/grpc/services.yaml.
const grpcSrc = join(specsDir, 'grpc', 'services.yaml');
cpSync(grpcSrc, join(distDir, 'grpc', 'services.yaml'));
sources.push({ title: 'gRPC Services', slug: 'grpc', url: './grpc/services.yaml' });

// Mark the first available source as default so Scalar auto-selects it
// instead of opening with "No document selected".
if (sources.length > 0) {
  sources[0] = { ...sources[0], default: true };
}

// 4. Render index.html with the resolved sources list and a relative script src.
const template = readFileSync(join(projectRoot, 'src', 'index.html.tmpl'), 'utf8');
const html = template
  .replace('__SOURCES_JSON__', JSON.stringify({ theme: 'default', layout: 'modern', sources }, null, 2))
  .replace('__SCALAR_BUNDLE__', './scalar/standalone.js');
writeFileSync(join(distDir, 'index.html'), html);

console.log(`built api-docs -> ${distDir} (${sources.length} sources)`);
