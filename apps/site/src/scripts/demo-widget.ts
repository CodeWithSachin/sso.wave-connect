/**
 * Demo login widget — three tabs (consumer / workspace / saml) with a
 * fake submit that simulates an authentication round-trip.
 *
 * The "auth" is purely cosmetic — we never POST anywhere, never set
 * cookies. The widget exists to demonstrate the design + interaction
 * model, not to do real auth.
 */
export function mountDemoWidget(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('#w-tabs button');
  const state = document.getElementById('w-state');
  const pw = document.getElementById('w-pw');
  const email = document.getElementById('w-email') as HTMLInputElement | null;
  const submit = document.getElementById('w-submit');
  if (!submit || !state || !email) return;

  type Tab = 'consumer' | 'workspace' | 'saml';
  const onTab = (v: Tab) => {
    if (v === 'saml') {
      if (pw) pw.style.display = 'none';
      state.textContent = 'saml · will redirect to your idp';
      email.placeholder = 'you@company.com';
    } else if (v === 'workspace') {
      if (pw) pw.style.display = '';
      state.textContent = 'workspace · invited members only';
      email.placeholder = 'you@company.com';
    } else {
      if (pw) pw.style.display = '';
      state.textContent = 'consumer · passwordless email or provider';
      email.placeholder = 'hello@you.com';
    }
  };

  tabs.forEach((b) =>
    b.addEventListener('click', () => {
      tabs.forEach((x) => {
        x.classList.remove('on');
        x.setAttribute('aria-selected', 'false');
      });
      b.classList.add('on');
      b.setAttribute('aria-selected', 'true');
      onTab((b.dataset['tab'] ?? 'consumer') as Tab);
    }),
  );

  submit.addEventListener('click', (ev) => {
    ev.preventDefault();
    state.innerHTML = 'authenticating…';
    window.setTimeout(() => {
      state.innerHTML = '<span class="ok">✓ signed in · propagated to 3 tenants</span>';
    }, 800);
  });
}
