import { site } from '~/lib/colors';

/**
 * Bento card "skeleton" interactivity.
 *
 * Four independent loops, all gated on visibility — the page doesn't
 * burn cycles redrawing the audit log when the user is reading the
 * footer. Each loop is paused via IntersectionObserver: the section
 * registers itself with the observer and the loops only tick while
 * `intersecting === true`.
 *
 * - typeBrowserField: cycles email addresses inside the Hosted Portal
 *   skeleton, mimicking a user typing.
 * - drawMeshConstellation: generates 8 satellite tenant nodes around the
 *   center "YOU" node and draws coral edges between them.
 * - streamAuditLog: prepends a fresh "auth event" row every ~1.4s, with
 *   a hard cap of 6 rows (older rows fall off-screen).
 * - swapSdkLanguage: changes the terminal output when the user clicks
 *   one of the four language tabs.
 */

const FALLBACK_INTERSECTING = true;

function whileVisible(target: Element, tick: () => void, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    if (timer === null) {
      tick();
      timer = setInterval(tick, intervalMs);
    }
  };
  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  if (typeof IntersectionObserver === 'undefined') {
    if (FALLBACK_INTERSECTING) start();
    return stop;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) (e.isIntersecting ? start : stop)();
    },
    { threshold: 0.1 },
  );
  io.observe(target);
  return () => {
    io.disconnect();
    stop();
  };
}

// --- 1. Typing in the Hosted Portal browser skeleton ---
function typeBrowserField(): void {
  const target = document.getElementById('sb-typed');
  const card = target?.closest<HTMLElement>('.b-card');
  if (!target || !card) return;

  const samples = ['ada@acme.com', 'kai@hooli.io', 'lin@initech.dev', 'rio@piedpiper.co'];
  let sIdx = 0;
  let cIdx = 0;
  let phase: 'typing' | 'pausing' | 'erasing' = 'typing';

  const tick = () => {
    const word = samples[sIdx];
    if (phase === 'typing') {
      cIdx++;
      target.textContent = word.slice(0, cIdx);
      if (cIdx === word.length) phase = 'pausing';
    } else if (phase === 'pausing') {
      // Hold for ~10 ticks (1.0s at 100ms cadence) before erasing.
      target.dataset['hold'] = String(Number(target.dataset['hold'] ?? 0) + 1);
      if (Number(target.dataset['hold']) >= 12) {
        target.dataset['hold'] = '0';
        phase = 'erasing';
      }
    } else {
      cIdx--;
      target.textContent = word.slice(0, cIdx);
      if (cIdx === 0) {
        sIdx = (sIdx + 1) % samples.length;
        phase = 'typing';
      }
    }
  };

  whileVisible(card, tick, 95);
}

// --- 2. Mesh constellation: 8 nodes around the center, all wired to YOU ---
function drawMeshConstellation(): void {
  const nodesGroup = document.getElementById('mesh-nodes');
  const edgesGroup = document.getElementById('mesh-edges');
  const card = nodesGroup?.closest<HTMLElement>('.b-card');
  if (!nodesGroup || !edgesGroup || !card) return;

  const ns = 'http://www.w3.org/2000/svg';
  const center = { x: 150, y: 150 };
  const N = 8;
  const labels = ['Acme', 'Hooli', 'Init', 'Pied', 'Umb', 'Tyrell', 'Soy', 'Krea'];

  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const radius = 105;
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;

    const edge = document.createElementNS(ns, 'line');
    edge.setAttribute('x1', String(center.x));
    edge.setAttribute('y1', String(center.y));
    edge.setAttribute('x2', String(x));
    edge.setAttribute('y2', String(y));
    edge.setAttribute('class', 'mesh-edge');
    edgesGroup.appendChild(edge);

    const node = document.createElementNS(ns, 'circle');
    node.setAttribute('cx', String(x));
    node.setAttribute('cy', String(y));
    node.setAttribute('r', '14');
    node.setAttribute('class', i % 3 === 0 ? 'mesh-node coral' : 'mesh-node');
    nodesGroup.appendChild(node);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(x));
    label.setAttribute('y', String(y + 3));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '8');
    label.setAttribute('font-family', 'JetBrains Mono, monospace');
    label.setAttribute('font-weight', '600');
    // Label sits on top of the node circle which uses --site-mint or
    // --wc-cream; either way the dark canvas base reads as the right
    // contrast for small mono text.
    label.setAttribute('fill', site.bg);
    label.textContent = labels[i];
    nodesGroup.appendChild(label);
  }

  // Tiny per-node opacity flicker to keep the constellation feeling alive.
  const circles = nodesGroup.querySelectorAll('circle');
  let phase = 0;
  whileVisible(
    card,
    () => {
      phase++;
      circles.forEach((c, i) => {
        const opacity = 0.55 + 0.4 * Math.abs(Math.sin((phase + i * 0.7) * 0.4));
        c.setAttribute('opacity', opacity.toFixed(2));
      });
    },
    140,
  );
}

// --- 3. Audit log stream — prepend a row every 1.4s, cap at 6 rows ---
function streamAuditLog(): void {
  const list = document.getElementById('skel-audit');
  const card = list?.closest<HTMLElement>('.b-card');
  if (!list || !card) return;

  const events = [
    'session.create',
    'mfa.verify',
    'token.refresh',
    'idp.callback',
    'policy.apply',
    'tenant.switch',
    'invite.accept',
    'session.revoke',
  ];
  const tenants = ['acme', 'hooli', 'initech', 'piedpiper', 'umbrella', 'tyrell'];
  const MAX_ROWS = 6;

  const fmtTime = (d: Date) =>
    `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d
      .getSeconds()
      .toString()
      .padStart(2, '0')}`;

  // Seed with 4 rows so the card isn't empty before the first tick fires.
  for (let i = 0; i < 4; i++) addRow();

  function addRow() {
    const row = document.createElement('div');
    row.className = 'au-row';
    const event = events[Math.floor(Math.random() * events.length)];
    const tenant = tenants[Math.floor(Math.random() * tenants.length)];
    const ok = Math.random() > 0.12;
    row.innerHTML = `
      <span class="au-time">${fmtTime(new Date())}</span>
      <span class="au-status${ok ? '' : ' fail'}">${ok ? '200' : '401'}</span>
      <span class="au-event">${event}</span>
      <span class="au-tenant">${tenant}</span>
    `;
    list?.prepend(row);
    while ((list?.childElementCount ?? 0) > MAX_ROWS) list?.lastElementChild?.remove();
  }

  whileVisible(card, addRow, 1400);
}

// --- 4. SDK terminal — swap the snippet on language-tab click ---
function swapSdkLanguage(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('#sdk-tabs button');
  const out = document.getElementById('term-code');
  if (!tabs.length || !out) return;

  const SNIPPETS: Record<string, string> = {
    ts: `<span class="c">// app.ts — guard a route in 8 lines</span>
<span class="k">import</span> { wave } <span class="k">from</span> <span class="s">'@wave/sdk'</span>;

<span class="k">export const</span> handler = wave
  .session()
  .require(<span class="s">'admin'</span>)
  .withMfa(<span class="k">true</span>)
  .build();

<span class="c">// 1 session · ∞ tenants</span>`,
    py: `<span class="c"># app.py — same guard, six lines</span>
<span class="k">from</span> wave <span class="k">import</span> session

<span class="f">handler</span> = (
    session()
    .require(<span class="s">"admin"</span>)
    .with_mfa(<span class="k">True</span>)
)`,
    go: `<span class="c">// main.go — middleware-style</span>
<span class="k">package</span> main

<span class="k">import</span> <span class="s">"github.com/wave/sdk"</span>

<span class="k">var</span> handler = wave.Session().
    Require(<span class="s">"admin"</span>).
    WithMFA(<span class="k">true</span>)`,
    rb: `<span class="c"># app.rb — Rack-friendly</span>
<span class="k">require</span> <span class="s">"wave"</span>

handler = Wave.session
  .require(<span class="s">"admin"</span>)
  .with_mfa(<span class="k">true</span>)`,
  };

  const apply = (lang: string) => {
    out.innerHTML = SNIPPETS[lang] ?? SNIPPETS['ts'];
  };

  tabs.forEach((b) =>
    b.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      apply(b.dataset['lang'] ?? 'ts');
    }),
  );
  apply('ts');
}

export function mountBento(): void {
  typeBrowserField();
  drawMeshConstellation();
  streamAuditLog();
  swapSdkLanguage();
}
