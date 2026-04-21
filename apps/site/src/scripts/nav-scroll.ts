/**
 * Toggle a `.scrolled` class on the top nav once the user is past 40px,
 * which lights up the blurred background. Passive listener — no jank
 * even if the user scrolls fast.
 */
export function mountNavScroll(): void {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const update = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', update, { passive: true });
  update();
}
