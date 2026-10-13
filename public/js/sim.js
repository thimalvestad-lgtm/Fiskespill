// Pure game logic: no DOM, so it can be tested in Node.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const DAY_START = 360; // 06:00
export const DAY_END = 1320; // 22:00

// How much an insect hatch changes things in each kind of water (fish in
// slow water look up the most).
const HATCH_INFLUENCE = { flat: 1, seam: 0.9, bank: 0.8, pocket: 0.6, riffle: 0.6, run: 0.5 };

export function pickWeighted(list, rng = Math.random) {
  const total = list.reduce((s, x) => s + (x.weight ?? 1), 0);
  let r = rng() * total;
  for (const x of list) {
    r -= x.weight ?? 1;
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

export function makeDay(conditions, rng = Math.random) {
  const weather = pickWeighted(conditions.weather, rng);
  // Rain makes coloured water more likely.
  const clarityList = conditions.clarity.map((c) => ({
    ...c,
    weight: c.id === 'tinged' && weather.id === 'drizzle' ? c.weight * 2.5 : c.weight,
  }));
  const clarity = pickWeighted(clarityList, rng);
  const hatches = conditions.hatches.filter((h) => rng() < (h.chance[weather.id] ?? 0));
  return { weather, clarity, hatches };
}

export function dayPart(water, minute) {
  let part = water.dayParts[0];
  for (const p of water.dayParts) if (minute >= p.from) part = p;
  return part;
}

export function activeHatch(day, minute) {
  // When hatches overlap, the later one has taken over.
  let found = null;
  for (const h of day.hatches) if (minute >= h.from && minute < h.to) found = h;
  return found;
}

export function formatClock(minute) {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const SIZE_RANK = { small: 0, medium: 1, large: 2 };
const LEADERS = ['7.5', '9', '12', '15'];
const TIPPETS = ['3X', '4X', '5X', '6X'];

function bestKey(table, order) {
  let best = order[0];
  for (const k of order) if (table[k] > table[best]) best = k;
  return best;
}

// Score a rig for a spot under the current conditions. Each factor runs from
// 0 to 1, and `match` is their product.
export function evaluateRig(spot, rig, ctx) {
  const { water, day, minute } = ctx;
  const wt = water.types[spot.type];
  const part = dayPart(water, minute).id;
  const hatch = activeHatch(day, minute);
  const lowLight = part === 'dawn' || part === 'dusk';

  // Bright light makes visible gear matter more; low light and rain forgive it.
  const spookMul = 1 + (day.weather.spook * (lowLight ? 0.8 : 1) - 1) * wt.spookiness;

  // Leader: too short spooks fish (worse in bright light); too long loses control.
  const bestLeader = bestKey(wt.leader, LEADERS);
  let leader = wt.leader[rig.leader];
  const leaderDir = LEADERS.indexOf(rig.leader) - LEADERS.indexOf(bestLeader);
  if (leaderDir < 0) leader = 1 - (1 - leader) * spookMul;

  // Tippet: too thick shows (coloured water hides it); too thin costs control
  // and fighting strength.
  const bestTippet = bestKey(wt.tippet, TIPPETS);
  let tippet = wt.tippet[rig.tippet];
  const tippetDir = TIPPETS.indexOf(rig.tippet) - TIPPETS.indexOf(bestTippet);
  if (tippetDir < 0) tippet = 1 - (1 - tippet) * spookMul * (1 - day.clarity.tippetEase);

  // Fly type: depends on whether the fish are looking up.
  let h = hatch ? HATCH_INFLUENCE[spot.type] : 0;
  if (hatch && hatch.id === 'terrestrials') h = spot.type === 'bank' || spot.type === 'seam' ? 1 : h * 0.6;
  const base = wt.fly[rig.fly];
  let fly = base;
  if (hatch) {
    if (rig.fly === 'dry') fly = lerp(base, 1, h);
    else if (rig.fly === 'drydropper') fly = lerp(base, 1, h * 0.6);
    else fly = base * (1 - 0.4 * h);
  } else if (rig.fly === 'dry') {
    fly = base * (day.weather.id === 'sunny' && (part === 'midday' || part === 'afternoon') ? 0.7 : 0.85);
  }

  // Fly size: match the hatch when fish are rising, otherwise suit the water.
  let size;
  const surface = rig.fly === 'dry' || rig.fly === 'drydropper';
  if (hatch && surface) {
    const diff = Math.abs(SIZE_RANK[rig.size] - SIZE_RANK[hatch.size]);
    const steps = rig.fly === 'dry' ? [1, 0.6, 0.35] : [1, 0.75, 0.55];
    size = lerp(1, steps[diff], Math.max(h, 0.5));
  } else if (rig.fly === 'dry') {
    size = { small: 0.85, medium: 1, large: 0.85 }[rig.size];
  } else if (rig.fly === 'drydropper') {
    size = (wt.nymphSize[rig.size] + 0.9) / 2;
  } else {
    size = wt.nymphSize[rig.size];
  }

  leader = clamp(leader, 0.08, 1);
  tippet = clamp(tippet, 0.08, 1);
  fly = clamp(fly, 0.08, 1);
  size = clamp(size, 0.08, 1);
  const match = leader * tippet * fly * size;

  return {
    match,
    factors: { leader, tippet, fly, size },
    leaderDir,
    tippetDir,
    hatch,
    part,
  };
}

export function spotActivity(spot, ctx) {
  const { water, day, minute } = ctx;
  const wt = water.types[spot.type];
  const part = dayPart(water, minute).id;
  const hatch = activeHatch(day, minute);
  let a = spot.holding * wt.activity[part] * day.weather.activity;
  if (hatch) a *= 1 + 0.35 * HATCH_INFLUENCE[spot.type];
  if (spot.type === 'flat' && day.weather.id === 'sunny' && (part === 'midday' || part === 'afternoon')) a *= 0.85;
  return clamp(a, 0, 1.2);
}

export function takeChance(spot, rig, ctx, freshness = 1) {
  const ev = evaluateRig(spot, rig, ctx);
  const act = spotActivity(spot, ctx);
  const p = act * Math.pow(ev.match, 1.2) * 0.75 * (0.25 + 0.75 * freshness);
  return { p: clamp(p, 0.01, 0.8), ev, activity: act };
}

// A better rig draws bigger, more selective fish.
export function drawFish(spot, match, part, rng = Math.random) {
  const f = spot.fish;
  const k = 1 + (1 - match) * 3;
  let length = f.min + Math.pow(rng(), k) * (f.max - f.min);
  const lowLight = part === 'dawn' || part === 'dusk' ? 1.6 : 1;
  const trophy = rng() < f.trophyChance * Math.pow(match, 3) * lowLight;
  if (trophy) length = f.max + rng() * (f.trophy - f.max);
  length = Math.round(length);
  const species = rng() < f.rainbow ? 'rainbow' : 'brown';
  const weightG = Math.round(0.0115 * length ** 3 * (species === 'rainbow' ? 1.05 : 1));
  return { length, weightG, species, trophy };
}

export function catchPoints(fish, match) {
  const base = Math.round(fish.weightG / 10);
  const bonus = match >= 0.8 ? 1.5 : match >= 0.55 ? 1.2 : 1;
  return Math.round(base * bonus);
}

export function rigStars(match) {
  if (match >= 0.8) return 3;
  if (match >= 0.55) return 2;
  if (match >= 0.3) return 1;
  return 0;
}

// A short, in-world explanation of why a drift didn't work, aimed at the
// weakest part of the rig. Returns null when the rig was decent.
export function missHint(spot, rig, ev) {
  const entries = Object.entries(ev.factors).sort((a, b) => a[1] - b[1]);
  const [worst, value] = entries[0];
  if (value > 0.78) return null;
  const surface = rig.fly === 'dry' || rig.fly === 'drydropper';
  switch (worst) {
    case 'leader':
      return ev.leaderDir < 0
        ? 'The fly line landed too close to the fish. A shadow bolted for cover. A longer leader keeps it further away.'
        : 'The long leader crumpled in the tangled currents and the fly dragged unnaturally. A shorter leader would give you more control here.';
    case 'tippet':
      if (ev.tippetDir < 0)
        return surface
          ? 'A trout drifted up under the fly, looked hard at it, and sank away. In water this clear it can see a thick tippet.'
          : 'Nothing. In water this clear and calm, thick tippet is easy to see.';
      return 'The fine tippet lets the current push the fly around between the rocks, so it doesn’t drift naturally. You might lose a hooked fish on the rocks, too.';
    case 'fly':
      if (ev.hatch && rig.fly === 'nymph') return 'Fish keep rising all around while your nymph drifts far below them. They’re looking up.';
      if (rig.fly === 'dry' && spot.type === 'run') return 'Your dry fly floated over deep, fast water. Fish holding on the bottom won’t rise that far.';
      if (rig.fly === 'dry') return 'The dry fly bobbed through untouched. Nothing is looking up right now. The fish are feeding near the bottom.';
      return 'The flies drifted through without a touch. Think about where the fish are feeding: on the surface, or near the bottom?';
    case 'size':
      if (ev.hatch && surface) return 'A fish rose, nosed the fly and refused it. Compare your fly with the size of the insects on the water.';
      if (rig.size === 'large' && spot.type === 'flat') return 'The big fly landed with a plop that rippled across the whole flat.';
      if (rig.size === 'small') return 'The little fly was swept past before it got anywhere near the fish. Something heavier would sink faster.';
      return 'The fly drifted past without interest. Maybe a different size?';
  }
  return null;
}

export const CALM_MISSES = [
  'The fly drifts through the lie. Nothing this time.',
  'A clean drift, but no take. The river keeps its secrets.',
  'A dipper bobs on a rock downstream while your fly swings out.',
  'Nothing. A kingfisher flashes past, low over the water.',
  'A good drift. Maybe they’re just not home.',
  'Your fly ticks along nicely, then swings out untouched.',
  'Swallows skim the surface. Your fly floats on alone.',
  'A leaf drifts alongside your fly. Neither gets eaten.',
];

export const LEADER_ORDER = LEADERS;
export const TIPPET_ORDER = TIPPETS;

// --- 3D: individual fish -------------------------------------------------------

// The fish that live in a lie today. Sizes follow the spot's range, with the
// odd trophy in the best lies.
export function populateSpot(spot, rng = Math.random) {
  const n = 1 + (rng() < spot.holding ? 1 : 0) + (rng() < spot.holding * 0.45 ? 1 : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = drawFish(spot, 0.85, 'morning', rng);
    out.push({ length: f.length, species: f.species });
  }
  return out;
}

// How close the fly drifted to the fish's nose (metres) → 0..1.
export function proximity(dist) {
  return clamp(1 - (dist - 0.45) / 1.1, 0.25, 1);
}

// Chance that one particular fish takes a fly drifting past it. Bigger fish
// are pickier: they need a better-matched rig.
export function fishTakeChance(spot, rig, ctx, freshness, fish, dist) {
  const base = takeChance(spot, rig, ctx, freshness);
  const f = spot.fish;
  const big = clamp((fish.length - f.min) / (f.max - f.min), 0, 1.6);
  const picky = Math.pow(base.ev.match, 1.4 * big);
  const wary = fish.wary ? 0.4 : 1;
  return { p: clamp(base.p * 1.2 * picky * proximity(dist) * wary, 0, 0.85), ev: base.ev };
}

export function spotPoints(length) {
  return 3 + Math.round(length / 10) + (length >= 45 ? 5 : 0);
}
