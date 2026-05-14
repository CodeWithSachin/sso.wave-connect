/**
 * Reveal-on-scroll for `[data-r]` elements. Uses IntersectionObserver
 * with a generous root-margin so reveals fire just before the element
 * is fully on-screen — matches the design's "elements drift up into
 * place" intent.
 *
 * Each element is unobserved after triggering so the observer free-runs
 * with monotonically decreasing work even on long pages.
 */
export function mountReveal(): void {
  const targets = document.querySelectorAll<HTMLElement>('[data-r]');
  if (!targets.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
  );

  targets.forEach((el) => io.observe(el));
}
