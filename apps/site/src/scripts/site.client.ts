/**
 * Wave Connect — site client bundle.
 *
 * One small bundle with all the non-WebGL interactive bits. Loaded with
 * `is:inline` from the page so it executes before the WebGL chunk arrives,
 * ensuring the splash dismisses on schedule even if Three.js fails to
 * download.
 *
 * Heavy / WebGL work lives in `hero-scene.client.ts` and is loaded
 * separately as a dynamic import.
 */

import { mountSplash } from './splash';
import { mountNavScroll } from './nav-scroll';
import { mountReveal } from './reveal';
import { mountUseRowSpotlight } from './use-row-spotlight';
import { mountDemoWidget } from './demo-widget';
import { mountBento } from './bento';

mountSplash();
mountNavScroll();
mountReveal();
mountUseRowSpotlight();
mountDemoWidget();
mountBento();

// Defer the WebGL hero scene so the rest of the page paints first.
// `requestIdleCallback` is widely supported; fallback to setTimeout for
// Safari. Cast through `unknown` since lib.dom.d.ts doesn't include
// requestIdleCallback in `Window` and the alternative — declaring the
// global ourselves — is overkill for one call site.
type IdleScheduler = (cb: () => void, opts?: { timeout: number }) => void;
const w = window as unknown as Window & { requestIdleCallback?: IdleScheduler };

const startHero = () => {
  void import('./hero-scene').then((m) => m.mountHeroScene());
};

if (typeof w.requestIdleCallback === 'function') {
  w.requestIdleCallback(startHero, { timeout: 1500 });
} else {
  window.setTimeout(startHero, 200);
}
