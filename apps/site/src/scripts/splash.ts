/**
 * Splash dismiss + rotating message strip.
 *
 * Pairs with `Splash.astro` — the inline gate script there adds
 * `html.splash-skip` before paint when the user has seen the splash in
 * the last 30 days. When that class is present we:
 *   - skip the message loop entirely
 *   - skip writing to localStorage (already recent)
 *   - exit without touching the DOM (the CSS rule already hid it)
 *
 * For first-time users:
 *   - rotate the strapline every 600 ms
 *   - dismiss at 3 s (matches the `splashFill` CSS animation)
 *   - stamp `wc:splash-seen` with Date.now() on dismiss
 */
const STORAGE_KEY = 'wc:splash-seen';

export function mountSplash(): void {
  const splash = document.getElementById('splash');
  const text = document.getElementById('splash-text');
  if (!splash || !text) return;

  // Inline gate already hid this; nothing to animate.
  if (document.documentElement.classList.contains('splash-skip')) return;

  const messages = [
    'Loading experience…',
    'Weaving identity mesh…',
    'Spinning up tenants…',
    'Signing sessions…',
    'Almost there…',
  ];

  let i = 0;
  const tick = window.setInterval(() => {
    i = (i + 1) % messages.length;
    text.textContent = messages[i];
  }, 600);

  window.setTimeout(() => {
    window.clearInterval(tick);
    splash.classList.add('done');
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Private mode / cookie policies — not worth surfacing; next visit
      // just shows the splash again, which is a tolerable degradation.
    }
  }, 3000);
}
