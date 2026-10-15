// "Check the water": what insects are on the surface and in the drift, drawn
// as little cartoons, and how your fly compares.

const SVG = {
  dun: (c = '#b9b38a', w = '#9aa3a8') => `
    <path d="M30 52 Q60 46 92 50" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M92 50 L112 44 M92 51 L112 52" stroke="${c}" stroke-width="1.4"/>
    <path d="M48 47 Q46 14 62 8 Q66 30 60 46 Z" fill="${w}" opacity="0.85"/>
    <path d="M54 47 Q56 18 70 14 Q70 34 62 47 Z" fill="${w}" opacity="0.6"/>
    <circle cx="28" cy="51" r="5" fill="${c}"/>
    ${[38, 44, 52].map((x) => `<path d="M${x} 55 l-4 9" stroke="#6b6450" stroke-width="1.3"/>`).join('')}`,
  caddis: () => `
    <path d="M24 50 Q60 44 96 52 L96 58 Q60 60 24 58 Z" fill="#9a8a5a"/>
    <path d="M26 46 Q62 30 104 54 Q62 50 26 54 Z" fill="#b79c6a" stroke="#8d7448"/>
    <path d="M24 49 Q10 30 4 26 M24 50 Q12 36 6 36" stroke="#6b5a3a" stroke-width="1.2" fill="none"/>
    ${[36, 44, 52].map((x) => `<path d="M${x} 58 l-5 9" stroke="#6b5a3a" stroke-width="1.3"/>`).join('')}`,
  hopper: () => `
    <rect x="22" y="40" width="74" height="18" rx="8" fill="#a8b84a"/>
    <path d="M34 40 L98 37 L94 30 L38 32 Z" fill="#8a7a3a"/>
    <path d="M72 56 L92 70 L106 66" stroke="#8a9a3a" stroke-width="4" fill="none" stroke-linejoin="round"/>
    <path d="M40 58 l-6 10 M52 58 l-2 10" stroke="#6a7a2a" stroke-width="2"/>
    <circle cx="28" cy="46" r="3.5" fill="#2d2a22"/>
    <path d="M22 42 Q10 26 4 22" stroke="#6a7a2a" stroke-width="1.3" fill="none"/>`,
  spinner: () => `
    <path d="M30 50 Q60 47 92 50" stroke="#8a5a3a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M92 50 L114 46 M92 51 L114 54" stroke="#8a5a3a" stroke-width="1.3"/>
    <ellipse cx="58" cy="30" rx="10" ry="22" fill="#e8eef2" opacity="0.75" stroke="#c4cdd2"/>
    <ellipse cx="58" cy="70" rx="10" ry="22" fill="#e8eef2" opacity="0.75" stroke="#c4cdd2"/>
    <circle cx="28" cy="50" r="4.5" fill="#8a5a3a"/>`,
  nymph: () => `
    <path d="M86 50 L106 44 M86 51 L106 56 M86 50 L108 50" stroke="#7a5a34" stroke-width="1.3"/>
    <path d="M44 44 Q66 42 88 48 Q66 58 44 56 Z" fill="#8a6a40"/>
    ${[52, 60, 68, 76].map((x) => `<line x1="${x}" y1="44" x2="${x}" y2="56" stroke="#6a4e2c" stroke-width="1.2"/>`).join('')}
    <ellipse cx="34" cy="50" rx="12" ry="8" fill="#6a4e2c"/>
    <path d="M28 57 l-6 9 M36 58 l-1 10 M42 57 l5 9" stroke="#5a3e22" stroke-width="1.6"/>
    <circle cx="23" cy="47" r="2.5" fill="#1d1a14"/>`,
};

const HATCH_INFO = {
  morningduns: { svg: () => SVG.dun(), name: 'Mayfly duns', hook: '#14', what: 'Newly hatched mayflies drifting on the surface, drying their upright wings before they fly off.' },
  olives: { svg: () => SVG.dun('#8a9a5a', '#a7b0b4'), name: 'Small olives', hook: '#18', what: 'Tiny olive-green mayflies. They hatch best on grey, drizzly days, and trout sip them softly.' },
  terrestrials: { svg: () => SVG.hopper(), name: 'Grasshoppers', hook: '#10', what: 'Big, clumsy land insects that fall into the river from the grassy banks on warm days.' },
  caddis: { svg: () => SVG.caddis(), name: 'Caddisflies', hook: '#14', what: 'Moth-like insects with tent-shaped wings. They skitter and flutter, and fish chase them hard.' },
  spinners: { svg: () => SVG.spinner(), name: 'Mayfly spinners', hook: '#18', what: 'Mayflies that have laid their eggs and fallen spent on the water, wings spread flat. Easy food for big, lazy fish.' },
};
const SIZE_RANK = { small: 0, medium: 1, large: 2 };

const svg = (inner) => `<svg viewBox="0 0 120 100" class="bug-svg" aria-hidden="true">${inner}</svg>`;

export function insectReport({ hatch, upcoming, part, fly, flies }) {
  let surface;
  if (hatch) {
    const h = HATCH_INFO[hatch.id];
    const matches = flies.filter((f) => (f.type === 'dry' || f.type === 'drydropper') && f.size === hatch.size);
    const ok = (fly.type === 'dry' || fly.type === 'drydropper') && fly.size === hatch.size;
    const diff = SIZE_RANK[fly.size] - SIZE_RANK[hatch.size];
    let verdict;
    if (ok) verdict = `<p class="match good">✔ Your ${fly.name} ${fly.hook} is a good match.</p>`;
    else if (fly.type === 'nymph') verdict = '<p class="match warn">Your nymph fishes under the surface, but these fish are eating on top. Try a dry fly.</p>';
    else verdict = `<p class="match warn">Your ${fly.name} is ${diff > 0 ? 'bigger' : 'smaller'} than these insects. Pick a dry fly around ${h.hook}.</p>`;
    surface = `<div class="bug-card">${svg(h.svg())}<div><b>On the surface: ${h.name} (about ${h.hook})</b><p>${h.what}</p>
      <p class="hint">Matching flies in your box: ${matches.map((f) => `${f.name} ${f.hook}`).join(', ') || 'none yet. Check the tackle shop'}.</p>${verdict}</div></div>`;
  } else {
    surface = `<div class="bug-card empty"><div class="bug-svg none">—</div><div><b>Nothing on the surface</b>
      <p>No insects are hatching right now, so trout aren't looking up. They're feeding near the bottom.</p>
      ${fly.type === 'dry' ? '<p class="match warn">A dry fly will struggle now. Try a nymph or a dry dropper, unless you see fish rising.</p>' : '<p class="match good">✔ A nymph or dry dropper is the right idea.</p>'}
      ${upcoming ? `<p class="hint">A few ${HATCH_INFO[upcoming.id].name.toLowerCase()} are already in the air. A hatch may start soon.</p>` : ''}</div></div>`;
  }
  const under = `<div class="bug-card">${svg(SVG.nymph())}<div><b>Under the surface: nymphs</b>
    <p>Young mayflies, caddis and stoneflies live among the stones and tumble along in the current. That's where trout find most of their food${part === 'midday' ? ', especially in the middle of the day' : ''}.</p>
    <p class="hint">Fish a nymph close to the bottom: match the indicator depth to the depth of the water.</p></div></div>`;
  return surface + under;
}
