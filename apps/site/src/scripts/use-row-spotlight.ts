/**
 * Mouse-follow coral glow spotlight on the use-case rows. Writes
 * `--mx` / `--my` CSS variables so the existing `.use-row::after`
 * radial-gradient picks them up — no JS animation loop, just two
 * setProperty calls per move.
 */
export function mountUseRowSpotlight(): void {
  document.querySelectorAll<HTMLElement>('[data-hover]').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
    });
  });
}
