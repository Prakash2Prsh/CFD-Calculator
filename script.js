/* ==========================================================
   APP CORE — navigation, formatting, form wiring, UI glue
   ========================================================== */

/* ---------- Python-style number formatting helpers ---------- */
const Fmt = (() => {
  // Mimic Python's f"{x:g}" — shortest representation, ~6 significant digits,
  // switches to exponential outside a normal range, strips trailing zeros.
  function g(x, precision = 6) {
    if (!Number.isFinite(x)) return String(x);
    if (x === 0) return '0';
    const exp = Math.floor(Math.log10(Math.abs(x)));
    let s;
    if (exp < -4 || exp >= precision) {
      s = x.toExponential(precision - 1);
      let [mant, e] = s.split('e');
      mant = mant.replace(/0+$/, '').replace(/\.$/, '');
      const eNum = parseInt(e, 10);
      s = `${mant}e${eNum >= 0 ? '+' : ''}${eNum}`;
    } else {
      const decimals = Math.max(precision - 1 - exp, 0);
      s = x.toFixed(decimals);
      if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return s;
  }
  function fixed(x, n) {
    if (!Number.isFinite(x)) return String(x);
    return x.toFixed(n);
  }
  function commas(x) {
    return Math.round(x).toLocaleString('en-US');
  }
  return { g, fixed, commas };
})();

/* ---------- Signature hero visual: geometric inflation-layer diagram ---------- */
const HERO_SVG = `
<svg viewBox="0 0 460 360" width="100%" height="auto" role="img" aria-label="Diagram of geometrically growing mesh inflation layers rising from a wall, with a Y+ marker on the first cell.">
  <defs>
    <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a212c"/>
      <stop offset="1" stop-color="#0a0d12"/>
    </linearGradient>
    <linearGradient id="cellGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#22d3ee" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#4f8cff" stop-opacity="0.15"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="460" height="360" rx="24" fill="url(#wallGrad)" stroke="#202836"/>

  <!-- floor / wall -->
  <line x1="40" y1="300" x2="420" y2="300" stroke="#3a4557" stroke-width="2"/>
  <text x="40" y="320" fill="#6b7686" font-family="JetBrains Mono, monospace" font-size="11">WALL (y = 0)</text>

  <!-- geometric layer stack, r ≈ 1.22, first cell exaggerated for legibility -->
  <g id="layerStack"></g>

  <!-- y+ callout on first cell -->
  <g id="yplusCallout" opacity="0.95">
    <line x1="66" y1="300" x2="66" y2="292" stroke="#22d3ee" stroke-width="1.5"/>
    <circle cx="66" cy="288" r="3" fill="#22d3ee">
      <animate attributeName="r" values="3;4.4;3" dur="2.4s" repeatCount="indefinite"/>
    </circle>
    <text x="76" y="292" fill="#22d3ee" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600">y⁺ ≈ 1</text>
  </g>

  <!-- growth rate label with animated scan line -->
  <text x="230" y="60" fill="#eef2f7" font-family="Space Grotesk, sans-serif" font-size="15" font-weight="600" text-anchor="middle">r = 1.22 geometric growth</text>
  <text x="230" y="80" fill="#6b7686" font-family="JetBrains Mono, monospace" font-size="11" text-anchor="middle">Δy · (1 − r^N) / (1 − r) = L</text>

  <line id="scanLine" x1="40" y1="90" x2="40" y2="300" stroke="#4f8cff" stroke-width="1" opacity="0.5">
    <animate attributeName="x1" values="40;420;40" dur="5s" repeatCount="indefinite"/>
    <animate attributeName="x2" values="40;420;40" dur="5s" repeatCount="indefinite"/>
  </line>
</svg>`;

(function buildLayerStack() {
  // Build the geometric bar stack as a string, injected into HERO_SVG at render time.
  const bars = [];
  let x = 60, w0 = 12, gap = 4, h = 6, r = 1.22, baseY = 300;
  for (let i = 0; i < 11; i++) {
    const hgt = Math.min(h, 150);
    bars.push(`<rect x="${x.toFixed(1)}" y="${(baseY - hgt).toFixed(1)}" width="${w0.toFixed(1)}" height="${hgt.toFixed(1)}" rx="1.5" fill="url(#cellGrad)" stroke="#22d3ee" stroke-opacity="0.25">
      <animate attributeName="opacity" values="0.55;1;0.55" dur="3s" begin="${(i * 0.12).toFixed(2)}s" repeatCount="indefinite"/>
    </rect>`);
    x += w0 + gap;
    h *= r;
  }
  window.HERO_SVG = HERO_SVG.replace('<g id="layerStack"></g>', `<g id="layerStack">${bars.join('')}</g>`);
})();

/* ---------- Navigation ---------- */
const Nav = (() => {
  const views = document.querySelectorAll('.view');
  const navBtns = document.querySelectorAll('.nav-btn');
  const rail = document.getElementById('rail');
  const scrim = document.getElementById('scrim');

  function go(id) {
    views.forEach(v => v.classList.toggle('active', v.id === `view-${id}`));
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.target === id));
    closeMobile();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    history.replaceState(null, '', `#${id}`);
  }

  function openMobile() { rail.classList.add('open'); scrim.classList.add('show'); }
  function closeMobile() { rail.classList.remove('open'); scrim.classList.remove('show'); }

  function init() {
    navBtns.forEach(b => b.addEventListener('click', () => go(b.dataset.target)));
    scrim.addEventListener('click', closeMobile);
    document.getElementById('burger').addEventListener('click', openMobile);
    document.querySelectorAll('[data-goto]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.goto));
    });
    const initial = (location.hash || '#home').slice(1);
    go(document.getElementById(`view-${initial}`) ? initial : 'home');
  }

  return { init, go };
})();

/* ---------- Toast ---------- */
function toast(msg) {
  const el = document.getElementById('toast');
  el.querySelector('span').textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- Field helpers ---------- */
function readNumber(id) {
  const el = document.getElementById(id);
  const v = parseFloat(el.value);
  const wrap = el.closest('.field');
  const errEl = wrap ? wrap.querySelector('.err-msg') : null;
  if (el.value.trim() === '' || Number.isNaN(v)) {
    el.classList.add('invalid');
    if (errEl) errEl.classList.add('show');
    return null;
  }
  el.classList.remove('invalid');
  if (errEl) errEl.classList.remove('show');
  return v;
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  el.classList.remove('invalid');
  const wrap = el.closest('.field');
  const errEl = wrap ? wrap.querySelector('.err-msg') : null;
  if (errEl) errEl.classList.remove('show');
}

function liveValidateBinding() {
  document.querySelectorAll('input[type=number]').forEach(el => {
    el.addEventListener('input', () => clearFieldError(el.id));
  });
}

/* ---------- Segmented control + switch helpers ---------- */
function bindSeg(segId, onChange) {
  const seg = document.getElementById(segId);
  const btns = seg.querySelectorAll('button');
  btns.forEach(b => {
    b.addEventListener('click', () => {
      btns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      onChange(b.dataset.value, seg);
    });
  });
}
function segValue(segId) {
  return document.getElementById(segId).querySelector('button.active').dataset.value;
}

function bindSwitch(swId, onChange) {
  const sw = document.getElementById(swId);
  sw.addEventListener('click', () => {
    sw.classList.toggle('on');
    onChange(sw.classList.contains('on'));
  });
  sw.setAttribute('tabindex', '0');
  sw.setAttribute('role', 'switch');
  sw.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sw.click(); }
  });
}
function switchOn(swId) {
  return document.getElementById(swId).classList.contains('on');
}

/* ---------- Copy results ---------- */
function bindCopy(btnId, panelId) {
  document.getElementById(btnId).addEventListener('click', () => {
    const panel = document.getElementById(panelId);
    const rows = [...panel.querySelectorAll('.result-row')].map(r => {
      const k = r.querySelector('.rk').textContent.trim();
      const v = r.querySelector('.rv').textContent.trim();
      return `${k}: ${v}`;
    });
    const groups = [...panel.querySelectorAll('.result-group-title')].map(g => g.textContent.trim());
    const text = rows.join('\n');
    navigator.clipboard.writeText(text).then(() => toast('Results copied to clipboard'))
      .catch(() => toast('Could not copy — select and copy manually'));
  });
}

/* ---------- Reset ---------- */
function bindReset(btnId, formIds, afterReset) {
  document.getElementById(btnId).addEventListener('click', () => {
    formIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.dataset.default !== undefined) el.value = el.dataset.default;
      else if (el) el.value = '';
      clearFieldError(id);
    });
    if (afterReset) afterReset();
    toast('Inputs reset');
  });
}

/* ---------- Shared output-panel helpers ---------- */
function infoIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>';
}
function warnIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l9.5 17H2.5L12 3z"/><path d="M12 9v5M12 17h.01"/></svg>';
}
function renderEmpty(panelId, msg, isError) {
  const panel = document.getElementById(panelId);
  if (isError) {
    panel.innerHTML = `<div class="note">${warnIcon()}<span>${msg}</span></div>`;
    return;
  }
  panel.innerHTML = `
    <div class="output-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19V5a2 2 0 012-2h8l6 6v10a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M14 3v6h6M9 13h6M9 17h6"/></svg>
      <span>${msg}</span>
    </div>
  `;
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  Nav.init();
  liveValidateBinding();
  if (window.initBiasCalc) window.initBiasCalc();
  if (window.initCflCalc) window.initCflCalc();
  if (window.initInflationCalc) window.initInflationCalc();
});
