# Phase 2: Layout and Design System

This document covers the sidebar layout architecture and the Snow UI design system shared by both Angular apps.

---

## 1. Layout Component

Both apps have a layout component that wraps all authenticated routes:

| App | File |
|-----|------|
| admin-console | `apps/admin-console/src/app/layout/layout.component.ts` |
| developer-portal | `apps/developer-portal/src/app/layout/layout.component.ts` |

### 1.1 Structure

The layout is a flex container with two regions:

```
+----------------+------------------------------------------+
|                |  Top Bar (h-14)                          |
|   Sidebar      +------------------------------------------+
|   (w-64/w-16)  |                                          |
|                |  <router-outlet /> (scrollable)          |
|                |                                          |
+----------------+------------------------------------------+
```

### 1.2 Sidebar

The sidebar is a `<aside>` element with:
- **Collapsible width**: toggles between `w-64` (expanded) and `w-16` (collapsed) via a `collapsed` signal.
- **Logo section**: Shows a branded icon ("W" for admin, "</>" for dev portal) and the app name (hidden when collapsed).
- **Navigation**: Iterates over a `navItems` array using `@for`, rendering `<a routerLink>` elements with `routerLinkActive` for active state highlighting.
- **Collapse toggle**: A chevron button at the bottom that calls `collapsed.set(!collapsed())`.

The collapsed state is a simple signal:

```typescript
collapsed = signal(false);
```

### 1.3 Navigation Items

**Admin Console** (`apps/admin-console/src/app/layout/layout.component.ts`):

| Path | Label | Icon |
|------|-------|------|
| `dashboard` | Dashboard | `heroHome` |
| `users` | Users | `heroUsers` |
| `groups` | Groups | `heroUserGroup` |
| `policies` | Policies | `heroShieldCheck` |
| `webhooks` | Webhooks | `heroBolt` |
| `audit` | Audit Log | `heroClipboardDocumentList` |
| `scim` | SCIM | `heroArrowPath` |

**Developer Portal** (`apps/developer-portal/src/app/layout/layout.component.ts`):

| Path | Label | Icon |
|------|-------|------|
| `dashboard` | Dashboard | `heroHome` |
| `api-keys` | API Keys | `heroKey` |
| `oauth-apps` | OAuth Apps | `heroFingerPrint` |
| `docs` | Documentation | `heroBookOpen` |
| `scim` | SCIM Tokens | `heroArrowPath` |

### 1.4 Top Bar

The top bar (`<header>`) contains:
- **Mobile hamburger**: A `heroBars3` icon button (visible on `lg:hidden`) that toggles the sidebar.
- **App title**: "Admin Console" or "Developer Portal".
- **Dark mode toggle**: Switches between `heroSun` (dark mode active) and `heroMoon` (light mode active).
- **User avatar**: A circular div with a letter initial.

Dark mode toggle implementation:

```typescript
isDark = signal(false);

toggleDarkMode() {
  this.isDark.update((v) => !v);
  document.documentElement.classList.toggle('dark');
}
```

### 1.5 Component-Level Providers

The layout component provides `MessageService` and `ConfirmationService` at the component level. This is critical -- all child routes share the same service instances:

```typescript
@Component({
  providers: [MessageService, ConfirmationService],
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon, Toast, ConfirmDialog],
  // ...
})
```

The template includes the global overlay components:

```html
<p-toast position="top-right" />
<p-confirmDialog />
```

**Why component-level?** These services are scoped to the layout. When you inject `MessageService` in a child feature component, you get the same instance that the `<p-toast>` is listening to. This ensures toasts appear in the layout's toast container.

---

## 2. Snow UI Design Tokens

The design system is called "Snow UI" and is implemented entirely through CSS custom properties and the PrimeNG pass-through configuration.

### 2.1 Color Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--primary` | `rgb(30, 157, 241)` (#1E9DF1) | `rgb(59, 130, 246)` | Buttons, links, active states |
| `--success` | `rgb(16, 185, 129)` | `rgb(34, 197, 94)` | Success badges, toasts |
| `--warning` | `rgb(245, 158, 11)` | `rgb(234, 179, 8)` | Warning badges, caution states |
| `--destructive` | `rgb(244, 33, 46)` | `rgb(239, 68, 68)` | Delete buttons, error states |
| `--muted-foreground` | `rgb(100, 116, 139)` | `rgb(156, 163, 175)` | Secondary text, placeholders |

### 2.2 Typography

| Token | Value |
|-------|-------|
| `--font-sans` | `"Inter", system-ui, -apple-system, sans-serif` |
| `--font-mono` | `"JetBrains Mono", "Fira Code", monospace` |

Use `font-sans` for all UI text and `font-mono` for code, API keys, and IDs.

### 2.3 Spacing and Radius

| Token | Value |
|-------|-------|
| `--radius` | `0.75rem` (base) |
| Tailwind `rounded-sm` | `calc(var(--radius) - 4px)` = `0.5rem` |
| Tailwind `rounded-md` | `calc(var(--radius) - 2px)` = `0.5625rem` |
| Tailwind `rounded-lg` | `var(--radius)` = `0.75rem` |
| Tailwind `rounded-xl` | `calc(var(--radius) + 4px)` = `1rem` |

### 2.4 Shadows

Four shadow levels: `shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`. Cards typically use `shadow-sm`.

### 2.5 Chart Colors

Five chart colors are defined for Chart.js/`p-chart`:

| Token | Color |
|-------|-------|
| `--chart-1` | Blue (`rgb(30, 157, 241)`) |
| `--chart-2` | Green (`rgb(16, 185, 129)`) |
| `--chart-3` | Amber (`rgb(245, 158, 11)`) |
| `--chart-4` | Purple (`rgb(139, 92, 246)`) |
| `--chart-5` | Pink (`rgb(236, 72, 153)`) |

Access these in TypeScript via `getComputedStyle(document.documentElement).getPropertyValue('--chart-1')`.

---

## 3. The `libs/ui-components` Library

The shared UI library at `libs/ui-components/` exports standalone Angular components that wrap common UI patterns. All components are re-exported from `libs/ui-components/src/lib/index.ts`.

### 3.1 Available Components

| Component | Import | Description |
|-----------|--------|-------------|
| `ButtonComponent` | `ButtonVariant`, `ButtonSize` | Styled button with variant/size support |
| `InputComponent` | -- | Text input with Snow UI styling |
| `BadgeComponent` | `BadgeVariant` | Status badge (success, warning, destructive, etc.) |
| `AvatarComponent` | `AvatarSize` | User avatar with size variants |
| `CardComponent` | -- | Card container with border and shadow |
| `SpinnerComponent` | `SpinnerSize` | Loading spinner |
| `ToastService`, `ToastContainerComponent` | `Toast`, `ToastType` | Custom toast system (separate from PrimeNG toast) |
| `PaginationComponent` | -- | Page navigation control |
| `DataTableComponent` | `TableColumn`, `SortDirection`, `SortEvent` | Sortable data table wrapper |
| `DialogComponent` | -- | Modal dialog wrapper |

### 3.2 Usage

```typescript
import { ButtonComponent, BadgeComponent } from '@libs/ui-components';
```

These are **standalone components** -- import them directly in the `imports` array of any component that needs them. No module declarations needed.

---

## 4. PrimeNG Pass-Through in Detail

The pass-through system (`snowPassThrough` in `libs/ui-components/src/lib/primeng-passthrough.ts`) works by mapping component **parts** to Tailwind classes.

### 4.1 How it integrates

The `snowPassThrough` object is passed to `providePrimeNG()` via the `pt` option:

```typescript
providePrimeNG({
  theme: { preset: Nora, options: { darkModeSelector: '.dark' } },
  ripple: true,
  pt: snowPassThrough,   // <-- this applies globally
})
```

### 4.2 Example: Dialog pass-through

```typescript
dialog: {
  root:        { class: 'rounded-xl bg-card text-card-foreground border border-border shadow-xl max-h-[90vh]' },
  header:      { class: 'flex items-center justify-between px-6 py-4 border-b border-border' },
  title:       { class: 'text-lg font-semibold text-foreground' },
  content:     { class: 'px-6 py-4 overflow-y-auto' },
  footer:      { class: 'flex items-center justify-end gap-3 px-6 py-4 border-t border-border' },
  closeButton: { class: 'rounded-lg p-1 text-muted-foreground hover:bg-muted/50 transition-colors' },
  mask:        { class: 'bg-black/50 backdrop-blur-sm' },
},
```

Each key (`root`, `header`, `title`, etc.) corresponds to an internal DOM element of PrimeNG's `<p-dialog>`. The `class` value replaces PrimeNG's default styling.

### 4.3 Modifying component styles

To change how a PrimeNG component looks:

1. Open `libs/ui-components/src/lib/primeng-passthrough.ts`.
2. Find the component key (e.g., `datatable`, `dialog`, `toast`).
3. Edit the Tailwind classes on the relevant part.
4. Both apps pick up the change immediately since they import the same file.

### 4.4 Components with pass-through coverage

`datatable`, `dialog`, `confirmdialog`, `toast`, `tag`, `card`, `select`, `multiselect`, `inputnumber`, `inputtext`, `textarea`, `toggleswitch`, `datepicker`, `inputchips`, `tabs`, `paginator`, `chart`, `skeleton`, `popover`, `menu`

---

## 5. Applying the Design System in Practice

### 5.1 Standard button styles

The project uses Tailwind utility classes directly rather than a global button class:

```html
<!-- Primary button -->
<button class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
  <ng-icon name="heroPlus" size="1rem" />
  Create
</button>

<!-- Secondary / cancel button -->
<button class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
  Cancel
</button>

<!-- Destructive button -->
<button class="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors">
  Delete
</button>
```

### 5.2 Status badges

```html
<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-success/10 text-success">active</span>
<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">suspended</span>
<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-warning/10 text-warning">pending</span>
```

### 5.3 Form inputs

```html
<input
  type="text"
  placeholder="Search..."
  class="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
/>
```

### 5.4 Card pattern

```html
<div class="rounded-xl border border-border bg-card shadow-sm p-6">
  <h3 class="text-base font-semibold text-foreground">Card Title</h3>
  <p class="text-sm text-muted-foreground mt-1">Card description</p>
</div>
```
