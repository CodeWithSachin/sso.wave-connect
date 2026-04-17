# Phase 1: Foundation Setup

This document covers the foundational dependencies, theming, and configuration established in Phase 1. Every Angular app in the monorepo builds on this layer.

---

## 1. Dependencies Installed

| Package | Purpose |
|---------|---------|
| `primeng` | Component library (tables, dialogs, date pickers, charts, etc.) |
| `@primeng/themes` | Pre-built theme presets (we use **Nora**) |
| `chart.js` | Chart rendering engine used by PrimeNG's `p-chart` component |
| `@ng-icons/core` | Framework-agnostic icon engine for Angular |
| `@ng-icons/heroicons` | Heroicons outline icon set |

All packages are in the workspace root `package.json` and shared across apps.

---

## 2. PrimeNG Configuration

Both `admin-console` and `developer-portal` configure PrimeNG identically in their `app.config.ts`:

```typescript
import { providePrimeNG } from 'primeng/config';
import Nora from '@primeng/themes/nora';
import { snowPassThrough } from '../../../../libs/ui-components/src/lib/primeng-passthrough';

providePrimeNG({
  theme: {
    preset: Nora,
    options: {
      darkModeSelector: '.dark',   // PrimeNG watches for this CSS class
    },
  },
  ripple: true,                    // Material-style ripple on interactive elements
  pt: snowPassThrough,             // Pass-through object that maps component parts to Tailwind classes
})
```

Key points:
- **Nora** is the base theme preset. It provides sensible defaults that our pass-through config then overrides with Tailwind classes.
- **`darkModeSelector: '.dark'`** tells PrimeNG to swap to dark palette whenever the `<html>` element has the `dark` class.
- **`pt: snowPassThrough`** is the pass-through object (see Section 5) that replaces PrimeNG's built-in styles with our Tailwind-based design tokens.
- **`ripple: true`** enables click ripple animations on buttons and interactive elements.

---

## 3. ng-icons Configuration

Icons are registered at the app level in `app.config.ts`:

```typescript
import { provideIcons, provideNgIconsConfig } from '@ng-icons/core';
import { heroHome, heroUsers, heroSun, heroMoon, /* ... */ } from '@ng-icons/heroicons/outline';

provideIcons({
  heroHome,
  heroUsers,
  heroSun,
  heroMoon,
  // ... all icons the app needs
}),
provideNgIconsConfig({ size: '1.25rem' })
```

Usage in templates:

```html
<ng-icon name="heroHome" size="1.25rem" />
```

**Important:** Each app registers only the icons it uses. If you add a new feature that needs a new icon, you must add it to the `provideIcons()` call in that app's `app.config.ts`.

### Admin Console icons

`heroHome`, `heroUsers`, `heroUserGroup`, `heroShieldCheck`, `heroBolt`, `heroClipboardDocumentList`, `heroArrowPath`, `heroSun`, `heroMoon`, `heroPlus`, `heroUserPlus`, `heroPencilSquare`, `heroTrash`, `heroEllipsisVertical`, `heroMagnifyingGlass`, `heroFunnel`, `heroArrowTrendingUp`, `heroArrowTrendingDown`, `heroChartBar`, `heroKey`, `heroClipboard`, `heroXMark`, `heroCheck`, `heroExclamationTriangle`, `heroInformationCircle`, `heroChevronLeft`, `heroChevronRight`, `heroBars3`, `heroGlobeAlt`, `heroCog6Tooth`, `heroArrowRightStartOnRectangle`

### Developer Portal icons

`heroHome`, `heroKey`, `heroFingerPrint`, `heroBookOpen`, `heroArrowPath`, `heroSun`, `heroMoon`, `heroPlus`, `heroPencilSquare`, `heroTrash`, `heroEllipsisVertical`, `heroMagnifyingGlass`, `heroClipboard`, `heroXMark`, `heroCheck`, `heroExclamationTriangle`, `heroInformationCircle`, `heroChevronLeft`, `heroChevronRight`, `heroArrowTrendingUp`, `heroChartBar`, `heroCodeBracket`, `heroDocumentText`, `heroArrowTopRightOnSquare`, `heroArrowRightStartOnRectangle`, `heroBars3`, `heroCog6Tooth`, `heroShieldCheck`, `heroBolt`

---

## 4. Tailwind CSS v4 Theme and CSS Variable System

The theming layer lives in each app's `styles.css`. Both apps share the same structure. The file is located at:

```
apps/<app-name>/src/styles.css
```

### 4.1 Structure overview

The file has four sections:

1. **Tailwind imports** and source directives
2. **`:root` block** -- light-mode CSS custom properties
3. **`.dark` block** -- dark-mode overrides
4. **`@theme inline` block** -- bridges CSS variables into Tailwind's utility class system

### 4.2 CSS custom properties (design tokens)

These are the core variables defined on `:root` (light) and overridden in `.dark`:

| Token | Light Value | Purpose |
|-------|-------------|---------|
| `--background` | `#f3f4f6` | Page background |
| `--foreground` | `rgb(15, 20, 25)` | Primary text color |
| `--card` / `--card-foreground` | white / dark text | Card surfaces |
| `--primary` / `--primary-foreground` | `rgb(30, 157, 241)` / white | Primary action color (blue) |
| `--destructive` | `rgb(244, 33, 46)` | Danger / delete actions (red) |
| `--success` | `rgb(16, 185, 129)` | Success states (green) |
| `--warning` | `rgb(245, 158, 11)` | Warning states (amber) |
| `--muted` / `--muted-foreground` | light gray / slate | Secondary text, disabled states |
| `--border` | `rgb(229, 231, 235)` | All border colors |
| `--input` | `rgb(249, 250, 251)` | Form input backgrounds |
| `--ring` | `rgb(29, 161, 242)` | Focus ring color |
| `--chart-1` through `--chart-5` | blue, green, amber, purple, pink | Chart.js color palette |
| `--sidebar` / `--sidebar-*` | Various | Sidebar-specific colors |
| `--font-sans` | `"Inter", system-ui, sans-serif` | Body font |
| `--font-mono` | `"JetBrains Mono", "Fira Code", monospace` | Code font |
| `--radius` | `0.75rem` | Base border radius |
| `--shadow-sm` through `--shadow-lg` | Various | Shadow scale |

### 4.3 The `@theme inline` block

This is a Tailwind CSS v4 feature that registers CSS variables as Tailwind utility values:

```css
@theme inline {
  --color-primary: var(--primary);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --radius-lg: var(--radius);
  --font-sans: var(--font-sans);
  /* ... */
}
```

After this registration, you can use Tailwind classes like `bg-primary`, `text-foreground`, `border-border`, `rounded-lg`, `font-sans`, and `shadow-md` -- all of which resolve to the CSS variables and automatically adapt to dark mode.

### 4.4 Custom variant for dark mode

```css
@custom-variant dark (&:is(.dark *));
```

This tells Tailwind v4 that the `dark:` variant should match elements inside a `.dark` ancestor. Usage: `dark:bg-card`, `dark:text-foreground`, etc.

---

## 5. The Snow UI Pass-Through File

**File:** `libs/ui-components/src/lib/primeng-passthrough.ts`

This file exports a `snowPassThrough` object that maps every PrimeNG component part to Tailwind CSS classes. It is the bridge between PrimeNG's component structure and our Snow UI design system.

### How it works

PrimeNG's pass-through (PT) API lets you assign CSS classes to internal parts of every component. For example, the DataTable pass-through:

```typescript
export const snowPassThrough = {
  datatable: {
    root: { class: 'rounded-xl border border-border bg-card shadow-sm overflow-hidden' },
    thead: { class: 'bg-muted/30' },
    headerCell: { class: 'px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider' },
    bodyRow: { class: 'hover:bg-muted/20 transition-colors' },
    bodyCell: { class: 'px-4 py-3 text-sm text-foreground' },
    // ...
  },
  dialog: { /* ... */ },
  toast: { /* ... */ },
  // ... more components
};
```

### Components with pass-through mappings

`datatable`, `dialog`, `confirmdialog`, `toast`, `tag`, `card`, `select`, `multiselect`, `inputnumber`, `inputtext`, `textarea`, `toggleswitch`, `datepicker`, `inputchips`, `tabs`, `paginator`, `chart`, `skeleton`, `popover`, `menu`

### Why this matters

- All PrimeNG components automatically inherit the Snow UI look-and-feel without per-component CSS.
- Dark mode works automatically because the Tailwind classes reference CSS variables that flip in the `.dark` scope.
- To customize a PrimeNG component's appearance, you edit `snowPassThrough` -- not component-level styles.

---

## 6. Dark Mode

Dark mode is toggled by adding/removing the `dark` class on `<html>`:

```typescript
document.documentElement.classList.toggle('dark');
```

When `.dark` is present:
1. The `.dark { }` block in `styles.css` overrides all CSS custom properties with dark values.
2. Tailwind utilities like `bg-card`, `text-foreground` resolve to the dark palette automatically.
3. PrimeNG respects dark mode via `darkModeSelector: '.dark'` in the provider config.

The toggle is in the layout component's top bar (see Phase 2 docs for details).

---

## 7. Shared Configuration Pattern

Both `admin-console` and `developer-portal` follow the same pattern in `app.config.ts`:

```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),    // No Zone.js -- pure signal-based change detection
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([/* app-specific interceptors */])),
    provideAnimationsAsync(),
    providePrimeNG({ /* Nora + snowPassThrough */ }),
    provideIcons({ /* app-specific icon set */ }),
    provideNgIconsConfig({ size: '1.25rem' }),
  ],
};
```

The only differences between apps are:
- **Interceptors**: admin-console has `bearerInterceptor` + `tenantInterceptor`; developer-portal has `bearerInterceptor` only.
- **Icons registered**: Each app registers its own subset of Heroicons.
- **Routes**: Each app defines its own `appRoutes`.
