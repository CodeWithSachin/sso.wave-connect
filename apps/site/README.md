# site — Wave Connect marketing site

Public-facing marketing site for `sso.wave-connect`. Astro 5, static
output, one page (`/`) with an interactive WebGL hero. Lives alongside
the three Angular apps (`admin-console`, `developer-portal`,
`login-portal`) but uses the framework that fits the use-case rather
than forcing Angular on a content-heavy page.

## Why Astro

- **Static-first** — every section that doesn't need JS ships zero JS.
  The page below the fold is plain HTML + CSS.
- **One small island bundle (~3 KB gzipped)** for splash, nav scroll,
  reveal, demo widget, and bento skeleton interactivity.
- **One lazy WebGL chunk (~120 KB gzipped)** — Three.js + the hero
  scene, dynamic-imported on `requestIdleCallback` so the hero appears
  after the rest of the page has painted.
- **Same brand tokens** — imports
  `libs/ui-components/src/lib/styles/wc-tokens.css` directly. The
  marketing site uses the cream/coral/teal raw tokens but remaps the
  semantic layer to dark surfaces (it's the only dark surface in the
  product).

## Run

```sh
pnpm nx run site:serve     # dev server on :4400
pnpm nx run site:build     # → dist/apps/site/
pnpm nx run site:preview   # serve the built artifact
pnpm nx run site:check     # astro check (TypeScript + .astro)
```

## Layout

```
apps/site/
  src/
    pages/index.astro          ← the page (composes section components)
    layouts/Default.astro      ← <html>/<head>/<body> chrome
    components/                ← Splash, Nav, Hero, Badges, BentoGrid,
                                 UseCases, HowItWorks, Demo, Stats,
                                 Finale, Footer, TrustStrip
    scripts/
      site.client.ts           ← entry — imports + dynamic-loads hero
      splash.ts                ← splash dismiss + message rotator
      nav-scroll.ts            ← .scrolled toggle past 40px
      reveal.ts                ← IntersectionObserver-driven [data-r]
      use-row-spotlight.ts     ← cursor-tracking glow on use-case rows
      demo-widget.ts           ← three-tab fake login widget
      bento.ts                 ← bento skeleton interactivity
                                 (typing, mesh, audit stream, sdk tabs)
      hero-scene.ts            ← Three.js island (jelly/orb/mesh motifs)
    styles/global.css          ← all section styling, imports wc-tokens.css
    assets/                    ← logo + mark SVGs from the design package
  public/                      ← copied verbatim into dist/apps/site/
  astro.config.mjs
  package.json
  project.json
```

## Performance budget

Initial payload (index.html + CSS + main JS, gzipped): **~15 KB**.
Hero WebGL chunk loads on idle, never blocks first paint.

The hero render loop pauses via IntersectionObserver when the canvas
goes off-screen — important on long marketing pages where users scroll
to the footer and leave the tab open. `prefers-reduced-motion: reduce`
users get a single static frame instead of the animation loop.

## Source

Ported from the Wave Connect Design System handoff bundle (the
`wave-connect-design-system/project/site/index.html` prototype).

The bento section (`.bento`, `.b-card`, `.skel-*`) was missing CSS in
the source — those styles were authored here in the established
palette. The skeleton interactivity (typing, mesh constellation,
audit-row streaming, SDK language tabs) was also missing and was
implemented in `src/scripts/bento.ts`.
