/**
 * Wave Connect — color tokens for JS consumers (Three.js, canvas, SVG
 * attribute injection).
 *
 * CSS custom properties can't cross into JS easily — WebGL expects raw
 * hex strings or numbers, and reading `getComputedStyle()` before the
 * stylesheet parses would race with first paint. This module mirrors
 * the CSS tokens as plain TS constants.
 *
 * **KEEP IN SYNC** with:
 *   - libs/ui-components/src/lib/styles/wc-tokens.css  (brand primitives)
 *   - apps/site/src/styles/site-tokens.css             (marketing layer)
 *
 * If you find yourself reaching for a hex literal elsewhere, add it
 * here first. A literal hex in a `.ts` file outside this module is a
 * drift and should be flagged in review.
 */

/** Brand primitives — identical on every surface (cream + dark). */
export const brand = {
  coral: '#fb513b',
  coralHover: '#e63a24',
  coralSoft: '#fae0dc',
  cream: '#f6f4ee',
  creamPaper: '#fbfaf4',
  creamMuted: '#ede8d9',
  teal: '#1d3a44',
  tealMuted: '#4e6b74',
  success: '#1b986d',
  warning: '#f5a809',
} as const;

/** Marketing-site-only accents. Do not use in the Angular apps. */
export const site = {
  // Dark canvas surfaces
  bg: '#0a0a12',
  bgElev1: '#11111c',
  bgElev2: '#14141f',
  bgDeep: '#0c0c14',
  bgTile: '#0d0d18',
  bgTealDark: '#0e1e24',

  // Marketing accents (tweak palette from the design source).
  // Note: the 3D hero uses brand.teal + brand.tealMuted, not these.
  coralHoverLight: '#ff7a64',
  coralShade: '#c02e1c',
  violet: '#a569ff',
  mint: '#5fd99a',

  // macOS traffic-light dots (only used in the browser-chrome skeleton)
  osRed: '#ff5f57',
  osYellow: '#ffbd2e',
  osGreen: '#28c840',
} as const;

export type BrandColor = keyof typeof brand;
export type SiteColor = keyof typeof site;
