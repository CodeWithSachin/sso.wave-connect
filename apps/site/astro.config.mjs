import { defineConfig } from 'astro/config';

/**
 * Wave Connect marketing site.
 *
 * Astro 5, static-only output (`output: 'static'`). The whole site compiles
 * to plain HTML + a small JS island for the WebGL hero scene; everything
 * below the fold ships zero JS unless we explicitly opt-in.
 *
 * Output goes to the workspace `dist/apps/site` so it lines up with how
 * the Angular apps build (`dist/apps/<name>`). The nx target reads from
 * the same path for caching.
 */
export default defineConfig({
  output: 'static',
  outDir: '../../dist/apps/site',
  publicDir: 'public',
  build: {
    // Inline tiny CSS files so the page can paint without a second request.
    inlineStylesheets: 'auto',
    // Splash + hero need to be in the initial HTML; let Astro stream the
    // rest as it would normally.
    assets: '_assets',
  },
  vite: {
    server: {
      // Match the Angular dev-server port range so reverse proxies / CSP
      // env files don't have to special-case the marketing site.
      port: 4400,
    },
    build: {
      // Three.js is the only meaningful chunk; let Vite split it out so
      // browsers can cache it independently of the app shell.
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
          },
        },
      },
    },
  },
});
