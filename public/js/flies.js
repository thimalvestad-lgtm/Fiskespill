// Cartoon illustrations of the flies in the fly box, as inline SVG.

const HOOK = '#5b6166';

function hook() {
  return `<path d="M24 40 H86 a11 11 0 0 1 0 22 h-12" stroke="${HOOK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M74 62 l5 -5" stroke="${HOOK}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="20" cy="40" r="3.6" fill="none" stroke="${HOOK}" stroke-width="2"/>`;
}

function radial(cx, cy, r, n, color, squash = 0.35, width = 1.2) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r * squash).toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  }
  return out;
}

function tail(x, y, color, len = 20, n = 4) {
  let out = '';
  for (let i = 0; i < n; i++) out += `<line x1="${x}" y1="${y}" x2="${x + len}" y2="${y - 6 + i * 3.5}" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`;
  return out;
}

const PATTERNS = {
  adams: () => `
    ${tail(82, 40, '#8a6a45')}
    ${hook()}
    <path d="M40 37 Q62 34 86 39 Q62 46 40 43 Z" fill="#8b8f92" stroke="#6c7073" stroke-width="1"/>
    <rect x="41" y="10" width="8" height="30" rx="4" fill="#fdfcf6" stroke="#d9d6cc"/>
    ${radial(45, 36, 17, 18, '#7a5634')}
    <circle cx="45" cy="36" r="3" fill="#5d4128"/>`,
  caddis: () => `
    ${hook()}
    <path d="M28 37 Q55 33 82 38 Q55 46 28 43 Z" fill="#7d8a49"/>
    ${[34, 42, 50, 58, 66, 74].map((x) => `<path d="M${x} 33 l3 13" stroke="#6d4f30" stroke-width="1.3"/>`).join('')}
    <path d="M30 34 L98 30 L96 25 L36 23 Z" fill="#cfae74" stroke="#a9874f"/>
    ${[40, 52, 64, 76, 88].map((x) => `<line x1="${x - 4}" y1="${24 + (x - 36) * 0.02}" x2="${x + 6}" y2="${30 - (x - 36) * 0.03}" stroke="#a9874f" stroke-width="0.8"/>`).join('')}
    <rect x="23" y="28" width="9" height="9" rx="3" fill="#cfae74"/>`,
  hopper: () => `
    ${hook()}
    <path d="M78 46 L92 58 L102 54" stroke="#d9473a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M70 46 L82 60 L94 58" stroke="#e8c33a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M38 46 L30 58" stroke="#d9473a" stroke-width="2" stroke-linecap="round"/>
    <rect x="24" y="26" width="72" height="20" rx="9" fill="#f2cf3c" stroke="#c9a52a" stroke-width="1.4"/>
    ${[40, 52, 64, 76].map((x) => `<line x1="${x}" y1="27" x2="${x}" y2="45" stroke="#c9a52a" stroke-width="1"/>`).join('')}
    <path d="M36 26 L94 22 L90 15 L40 18 Z" fill="#b48a52" stroke="#8d6a3b"/>
    <circle cx="31" cy="33" r="3" fill="#2d2a22"/><circle cx="30" cy="32" r="1" fill="#fff"/>`,
  zebra: () => `
    ${hook()}
    <path d="M26 37 Q55 35 84 39 L84 42 Q55 45 26 43 Z" fill="#1d1d1f"/>
    ${[32, 40, 48, 56, 64, 72, 80].map((x) => `<line x1="${x}" y1="36" x2="${x + 3}" y2="44" stroke="#d6dadd" stroke-width="1.4"/>`).join('')}
    <circle cx="23" cy="40" r="6" fill="#d9dde0" stroke="#9aa1a6"/><circle cx="21" cy="38" r="1.8" fill="#fff"/>`,
  pt: () => `
    ${tail(80, 41, '#8a5a2e', 18, 3)}
    ${hook()}
    <path d="M44 36 Q66 35 84 39 Q66 46 44 45 Z" fill="#8a5a2e"/>
    ${[50, 58, 66, 74].map((x) => `<line x1="${x}" y1="36" x2="${x + 3}" y2="45" stroke="#d48a45" stroke-width="1.6"/>`).join('')}
    <ellipse cx="36" cy="40" rx="10" ry="7" fill="#6b4220"/>
    <path d="M28 34 Q37 29 46 35" stroke="#3d2814" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="23" cy="40" r="6" fill="#e2b543" stroke="#b3872a"/><circle cx="21" cy="38" r="1.8" fill="#fff6c8"/>`,
  stone: () => `
    <path d="M86 40 L106 34 M86 41 L106 48" stroke="#4a3624" stroke-width="2" stroke-linecap="round"/>
    ${hook()}
    <path d="M50 34 Q70 32 88 38 Q70 48 50 47 Z" fill="#4e3a26"/>
    ${[56, 64, 72, 80].map((x) => `<line x1="${x}" y1="33" x2="${x}" y2="47" stroke="#7a5d3d" stroke-width="1.6"/>`).join('')}
    <ellipse cx="38" cy="40" rx="14" ry="9" fill="#3d2c1c"/>
    <path d="M32 47 l-6 10 M40 48 l0 11 M48 47 l6 10" stroke="#3d2c1c" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 32 Q38 26 50 32" stroke="#6a5038" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M18 36 l-10 -8 M18 44 l-10 6" stroke="#4a3624" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="22" cy="40" r="7" fill="#5f666b" stroke="#3d4347"/><circle cx="20" cy="38" r="2" fill="#a9b1b6"/>`,
};

const COMBOS = {
  'dd-small': ['adams', 'zebra'],
  'dd-medium': ['caddis', 'pt'],
  'dd-large': ['hopper', 'stone'],
};

const SCALE = { small: 0.72, medium: 0.86, large: 1 };

export function flySVG(fly) {
  if (fly.type === 'drydropper') {
    const [dry, nymph] = COMBOS[fly.id];
    return `<svg viewBox="0 0 120 80" class="fly-svg" aria-hidden="true">
      <path d="M90 34 Q100 52 70 62" stroke="#c9d3d6" stroke-width="1" fill="none" stroke-dasharray="2 2"/>
      <g transform="translate(-4 -6) scale(0.62)">${PATTERNS[dry]()}</g>
      <g transform="translate(46 34) scale(0.58)">${PATTERNS[nymph]()}</g>
    </svg>`;
  }
  const s = SCALE[fly.size];
  const tx = (120 - 120 * s) / 2, ty = (80 - 80 * s) / 2;
  return `<svg viewBox="0 0 120 80" class="fly-svg" aria-hidden="true"><g transform="translate(${tx} ${ty}) scale(${s})">${PATTERNS[fly.id]()}</g></svg>`;
}
