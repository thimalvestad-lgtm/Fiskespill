import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateRig, takeChance, drawFish } from '../public/js/sim.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url)));
const water = load('water.json');
const river = load('river.json');
const conditions = load('conditions.json');
const spot = (id) => river.spots.find((s) => s.id === id);
const weather = (id) => conditions.weather.find((w) => w.id === id);
const clarity = (id) => conditions.clarity.find((c) => c.id === id);
const hatch = (id) => conditions.hatches.find((h) => h.id === id);

const day = (w, c, hatches = []) => ({ weather: weather(w), clarity: clarity(c), hatches: hatches.map(hatch) });
const rig = (leader, tippet, fly, size) => ({ leader, tippet, fly, size });

test('flat: long leader and fine tippet beat short and thick', () => {
  const ctx = { water, day: day('sunny', 'clear', ['caddis']), minute: 1150 };
  const good = evaluateRig(spot('glide'), rig('12', '6X', 'dry', 'medium'), ctx);
  const bad = evaluateRig(spot('glide'), rig('7.5', '3X', 'dry', 'medium'), ctx);
  assert.ok(good.match > 0.85, `good ${good.match}`);
  assert.ok(bad.match < 0.15, `bad ${bad.match}`);
});

test('flat during a hatch: the dry fly of the right size wins', () => {
  const ctx = { water, day: day('overcast', 'clear', ['olives']), minute: 720 };
  const dry = evaluateRig(spot('glide'), rig('12', '6X', 'dry', 'small'), ctx);
  const wrongSize = evaluateRig(spot('glide'), rig('12', '6X', 'dry', 'large'), ctx);
  const nymph = evaluateRig(spot('glide'), rig('12', '6X', 'nymph', 'small'), ctx);
  assert.ok(dry.match > wrongSize.match && dry.match > nymph.match);
});

test('pocket water: short leader, strong tippet and a nymph', () => {
  const ctx = { water, day: day('sunny', 'clear'), minute: 720 };
  const good = evaluateRig(spot('big-boulder'), rig('7.5', '3X', 'nymph', 'large'), ctx);
  const bad = evaluateRig(spot('big-boulder'), rig('15', '6X', 'dry', 'small'), ctx);
  assert.ok(good.match > 0.9);
  assert.ok(bad.match < 0.25);
});

test('coloured water forgives a thick tippet', () => {
  const s = spot('glide');
  const r = rig('12', '4X', 'dry', 'medium');
  const clear = evaluateRig(s, r, { water, day: day('overcast', 'clear', ['caddis']), minute: 1150 });
  const tinged = evaluateRig(s, r, { water, day: day('overcast', 'tinged', ['caddis']), minute: 1150 });
  assert.ok(tinged.factors.tippet > clear.factors.tippet);
});

test('the right rig catches more often and bigger', () => {
  const ctx = { water, day: day('overcast', 'clear'), minute: 600 };
  const s = spot('pool-head');
  const good = takeChance(s, rig('9', '4X', 'nymph', 'large'), ctx);
  const bad = takeChance(s, rig('15', '6X', 'dry', 'small'), ctx);
  assert.ok(good.p > bad.p * 2.5, `${good.p} vs ${bad.p}`);

  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const avg = (m) => {
    let t = 0;
    for (let i = 0; i < 2000; i++) t += drawFish(s, m, 'morning', rng).length;
    return t / 2000;
  };
  assert.ok(avg(good.ev.match) > avg(bad.ev.match) + 5);
});

test('big fish are pickier than small ones', async () => {
  const { fishTakeChance } = await import('../public/js/sim.js');
  const ctx = { water, day: day('overcast', 'clear'), minute: 600 };
  const s = spot('pool-head');
  const meh = rig('9', '4X', 'dry', 'small');
  const small = fishTakeChance(s, meh, ctx, 1, { length: 30 }, 0.4).p;
  const big = fishTakeChance(s, meh, ctx, 1, { length: 55 }, 0.4).p;
  assert.ok(small > big * 2, `${small} vs ${big}`);
  const good = rig('9', '4X', 'nymph', 'large');
  assert.ok(fishTakeChance(s, good, ctx, 1, { length: 55 }, 0.4).p > big * 3);
});

test('a nymph has to reach the fish, and drag kills takes', async () => {
  const { effectiveDepth } = await import('../public/js/sim.js');
  const ctx = { water, day: day('overcast', 'clear'), minute: 600 };
  const s = spot('pool-head'); // 1.8 m deep, fast tongue
  const base = { leader: '9', tippet: '4X', fly: 'nymph', size: 'large' };
  const shallow = { ...base, depthM: effectiveDepth({ ...base, indicatorFt: 2 }, 0.8) };
  const deep = { ...base, depthM: effectiveDepth({ ...base, indicatorFt: 6.5 }, 0.8) };
  assert.ok(evaluateRig(s, deep, ctx).match > evaluateRig(s, shallow, ctx).match * 2);
  // A light midge gets swept up in fast water.
  assert.ok(effectiveDepth({ fly: 'nymph', size: 'small', indicatorFt: 6 }, 1.2) < effectiveDepth({ fly: 'nymph', size: 'large', indicatorFt: 6 }, 1.2) * 0.7);
  const dragged = evaluateRig(s, deep, { ...ctx, drag: 1 });
  assert.ok(dragged.match < evaluateRig(s, deep, ctx).match * 0.3);
});

test('tippet thicker than the leader tip hurts the cast', () => {
  const ctx = { water, day: day('overcast', 'clear'), minute: 600 };
  const s = spot('riffle-seam');
  const ok = evaluateRig(s, { leader: 10, tippet: '5X', fly: 'drydropper', size: 'medium' }, ctx);
  const bad = evaluateRig(s, { leader: 10, tippet: '5X', fly: 'drydropper', size: 'medium', turnover: false }, ctx);
  assert.ok(bad.match < ok.match * 0.75);
});

test('attractor and emerger patterns shine in the right water', () => {
  const s = spot('riffle-bucket');
  const quiet = { water, day: day('overcast', 'clear'), minute: 600 };
  const plain = evaluateRig(s, { leader: 9, tippet: '5X', fly: 'dry', size: 'medium' }, quiet);
  const wulff = evaluateRig(s, { leader: 9, tippet: '5X', fly: 'dry', size: 'medium', bonus: { waters: ['riffle'], noHatch: 1.35 } }, quiet);
  assert.ok(wulff.match > plain.match * 1.25);
});
