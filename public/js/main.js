import * as THREE from 'three';
import { World } from './world.js';
import { Fish } from './fish.js';
import { Tackle } from './tackle.js';
import { Effects } from './fx.js';
import { Ambience } from './audio.js';
import { Minimap } from './minimap.js';
import { drawTrout } from './fishcard.js';
import { RigUI, normalizeRig, rigInfo, simRig, rigSummary } from './rig.js';
import {
  DAY_START, DAY_END, makeDay, dayPart, activeHatch, formatClock, catchPoints, rigStars, missHint,
  CALM_MISSES, populateSpot, fishTakeChance, spotPoints,
} from './sim.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SAVE_KEY = 'riverbend-save-v1';
const MAX_CAST = 24;
const EYE = 1.65;

const RANKS = [
  [0, 'Novice'], [300, 'Apprentice'], [1000, 'Angler'], [2500, 'River reader'],
  [5000, 'Trout whisperer'], [10000, 'Master of the beat'],
];

const ACHIEVEMENTS = [
  { id: 'first', name: 'First trout', desc: 'Land your first fish.' },
  { id: 'forty', name: 'A good fish', desc: 'Land a trout of 40 cm or more.' },
  { id: 'fifty', name: 'Fish of the season', desc: 'Land a trout of 50 cm or more.' },
  { id: 'sixty', name: 'The old warrior', desc: 'Land a trout of 60 cm or more.' },
  { id: 'hatch', name: 'Matched the hatch', desc: 'Catch a fish on a dry fly of the right size during a hatch.' },
  { id: 'flat', name: 'Fine and far off', desc: 'Fool a fish on the flat with 12 ft+ leader and 6X.' },
  { id: 'pocket', name: 'Pocket picker', desc: 'Land a 40 cm+ fish from pocket water.' },
  { id: 'sections', name: 'The whole beat', desc: 'Catch fish in the riffle, the boulders and the flat on one day.' },
  { id: 'rainbow', name: 'Painted fish', desc: 'Catch a rainbow trout.' },
  { id: 'perfect', name: 'Perfect setup', desc: 'Catch a fish on a three-star rig.' },
  { id: 'dusk', name: 'Last light', desc: 'Catch a fish at dusk.' },
  { id: 'ten', name: 'Good day out', desc: 'Land 10 fish in one day.' },
  { id: 'eyes', name: 'Sharp eyes', desc: 'Spot 10 fish in one day.' },
  { id: 'ghost', name: 'The ghost', desc: 'Spot a trout of 50 cm or more.' },
];

// --- State ------------------------------------------------------------------

const save = loadSave();
const state = {
  data: null,
  day: null,
  minute: DAY_START,
  rig: null,
  rigChanged: false,
  fresh: {},
  phase: 'intro', // intro | idle | walking | cast | drift | strike | fight | card | dayend
  today: [],
  spottedToday: 0,
  passive: 0,
  stand: null,
  aim: null,
};
save.drag = save.drag || 4;

let renderer, camera, world, tackle, fx, audio, minimap, rigUI;
let fishes = [];
let yaw = 0, pitch = -0.18;
let zoom = 1, zoomTarget = 1, baseFov = 62;
let walk = null, drift = null, strike = null, fight = null;
let holding = false;
let fightDrag = null;
let bowing = false;
let steerKeys = 0;
let dragging = false;
const recentRises = [];
const tension = { value: 0 };

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') return { points: 0, catches: [], ach: {}, days: 0, sound: true, ...s };
  } catch {}
  return { points: 0, catches: [], ach: {}, days: 0, sound: true };
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}

// --- Boot ----------------------------------------------------------------------

async function boot() {
  const [river, water, gear, conditions] = await Promise.all(
    ['river', 'water', 'gear', 'conditions'].map((f) => fetch(`data/${f}.json`).then((r) => r.json())),
  );
  state.data = { river, water, gear, conditions };
  state.rig = normalizeRig(save.rig, gear);
  for (const s of river.spots) state.fresh[s.id] = 1;

  const canvas = $('view');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  camera = new THREE.PerspectiveCamera(62, 1, 0.05, 900);
  world = new World(state.data);
  fx = new Effects(world.scene);
  fx.setWorld(world);
  tackle = new Tackle(world.scene, camera);
  tackle.setFly(rigInfo(state.rig, gear).fly);
  audio = new Ambience();
  audio.enabled = save.sound !== false;
  minimap = new Minimap($('minimap'), river, (st) => walkTo(st));
  updateSoundButton();
  applyPolar();
  resize();

  buildRigUI();
  bindEvents();
  setStand(river.stands[1], true);
  newDay();
  $('loading').hidden = true;
  requestAnimationFrame(loop);
}

function resize() {
  const stage = $('stage');
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  baseFov = w < h ? 72 : 62;
  camera.fov = baseFov / zoom;
  camera.updateProjectionMatrix();
  tackle.resize(w, h);
}

function newDay() {
  const d = state.data;
  state.day = makeDay(d.conditions);
  state.minute = DAY_START;
  state.today = [];
  state.spottedToday = 0;
  state.phase = 'intro';
  for (const k in state.fresh) state.fresh[k] = 1;
  save.days = (save.days || 0) + 1;
  persist();
  populate();
  fx.clearMarks();
  state.aim = null;
  fx.setAim(null);

  $('intro-day').textContent = `Day ${save.days}`;
  const day = state.day;
  $('intro-conditions').innerHTML = `
    <div class="cond"><b>${day.weather.label}</b>${day.weather.note}</div>
    <div class="cond"><b>${day.clarity.label} water</b>${day.clarity.note}</div>`;
  $('intro').hidden = false;
  updateHUD();
}

function populate() {
  for (const f of fishes) f.dispose();
  fishes = [];
  for (const s of world.spots) {
    for (const f of populateSpot(s)) {
      let off = { x: 0, z: 0 };
      for (let k = 0; k < 10; k++) {
        const o = { x: rand(-1.3, 1.3), z: rand(-1.3, 1.3) };
        const x = s.w.x + o.x, z = s.w.z + o.z;
        if (world.heightAt(x, z) < -0.3 && !fishes.some((q) => Math.hypot(q.home.x - x, q.home.z - z) < 0.6)) { off = o; break; }
      }
      fishes.push(new Fish(world, s, { ...f, offset: off }));
    }
  }
}

// --- Camera & stands --------------------------------------------------------------

function standPos(st) {
  const p = world.m2w(st.x, st.y);
  return new THREE.Vector3(p.x, world.heightAt(p.x, p.z) + EYE, p.z);
}

function lookYaw(st) {
  const p = world.m2w(st.x, st.y), l = world.m2w(st.look[0], st.look[1]);
  return Math.atan2(-(l.x - p.x), -(l.z - p.z));
}

function defaultPitch() {
  const st = $('stage');
  return st.clientHeight > st.clientWidth ? -0.32 : -0.18;
}

function setStand(st, instant) {
  state.stand = st;
  if (instant) {
    camera.position.copy(standPos(st));
    yaw = lookYaw(st);
    pitch = defaultPitch();
  }
  const sec = { riffle: 1, boulders: 0.8, poolhead: 0.55, flat: 0.25 }[st.id] ?? 0.6;
  audio.set({ riverLevel: sec, riverBright: sec });
}

function walkTo(st) {
  if (state.phase !== 'idle' || st === state.stand) return;
  audio.start();
  state.phase = 'walking';
  state.aim = null;
  fx.setAim(null);
  $('aim-label').classList.remove('show');
  const from = camera.position.clone(), to = standPos(st);
  const fromYaw = yaw;
  let toYaw = lookYaw(st);
  while (toYaw - fromYaw > Math.PI) toYaw -= Math.PI * 2;
  while (toYaw - fromYaw < -Math.PI) toYaw += Math.PI * 2;
  const dist = from.distanceTo(to);
  walk = { from, to, fromYaw, toYaw, t: 0, dur: clamp(dist / 9, 1.8, 4.5), st };
  setZoom(1);
  tackle.mode = 'hidden';
  log(`You walk along the bank to the ${st.name.toLowerCase()}.`);
  updateHUD();
}

function updateWalk(dt) {
  walk.t += dt;
  const k = Math.min(1, walk.t / walk.dur);
  const e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(walk.from, walk.to, e);
  // Rise a little over the bank as you walk.
  camera.position.y += Math.sin(k * Math.PI) * 0.8 + Math.abs(Math.sin(walk.t * 7)) * 0.04 * (1 - k);
  yaw = lerp(walk.fromYaw, walk.toYaw, e);
  pitch = lerp(pitch, defaultPitch(), Math.min(1, dt * 2));
  if (k >= 1) {
    const st = walk.st;
    walk = null;
    setStand(st, false);
    tackle.idle();
    state.phase = 'idle';
    advance(8);
  }
}

function setZoom(z) {
  zoomTarget = clamp(z, 1, 3.5);
  $('btn-zoom').classList.toggle('on', zoomTarget > 1.05);
}

function applyCamera(dt) {
  if (Math.abs(zoomTarget - zoom) > 0.001) {
    zoom += (zoomTarget - zoom) * Math.min(1, dt * 8);
    camera.fov = baseFov / zoom;
    camera.updateProjectionMatrix();
  }
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
}

// --- UI -------------------------------------------------------------------------

function buildRigUI() {
  rigUI = new RigUI(state.data.gear, {
    getRig: () => state.rig,
    setRig: (patch, note) => setRig(patch, note),
    lieContext,
  });
  refreshRigUI();
}

// What the leader builder compares the nymph depth with: the lie you're aiming at.
function lieContext() {
  if (!state.aim) return null;
  const lie = lieAt(state.aim);
  const p = lie ? lie.w : state.aim;
  const speed = world.flowAt(p.x, p.z).speed;
  if (lie) return { name: lie.name, depthM: parseFloat(lie.depth), speed };
  return { name: 'Your aim point', depthM: Math.max(0.1, -world.heightAt(p.x, p.z)), speed };
}

function setRig(patch, note) {
  if (!['idle', 'intro', 'walking'].includes(state.phase)) {
    toast('Finish this drift first.');
    return;
  }
  Object.assign(state.rig, patch);
  state.rigChanged = true;
  save.rig = state.rig;
  persist();
  tackle.setFly(rigInfo(state.rig, state.data.gear).fly);
  refreshRigUI();
  if (note) $('rig-note').textContent = `${note} It'll be tied on before your next cast.`;
}

function refreshRigUI() {
  const sm = rigSummary(state.rig, state.data.gear);
  $('fly-summary').textContent = sm.fly;
  $('leader-summary').textContent = sm.leader;
}

// The rig as the rules see it, fishing a given spot.
function curRig(spot) {
  const p = spot ? spot.w : state.aim;
  const speed = p ? world.flowAt(p.x, p.z).speed : 0.6;
  return simRig(state.rig, state.data.gear, speed);
}

function tippetInfo() {
  return rigInfo(state.rig, state.data.gear).tippet;
}

function updateHUD() {
  const d = state.data;
  $('clock').textContent = `${formatClock(state.minute)} · ${dayPart(d.water, state.minute).label}`;
  $('weather').textContent = state.day.weather.label;
  $('clarity').textContent = `${state.day.clarity.label} water`;
  $('points').textContent = `${save.points.toLocaleString('en')} pts`;
  $('notes').textContent = riverNotes();
  const idle = state.phase === 'idle';
  $('btn-cast').disabled = !(idle && state.aim) && state.phase !== 'drift';
  $('btn-cast').textContent = state.phase === 'drift' ? 'Pick up' : 'Cast';
  $('btn-rest').disabled = !idle && state.phase !== 'drift';
  $('btn-rest').textContent = state.phase === 'drift' ? 'Mend' : 'Sit & watch';
  world.setConditions(state.minute, state.day.weather.id, state.day.clarity.id);
  audio.set({
    part: dayPart(d.water, state.minute).id,
    rain: state.day.weather.id === 'drizzle',
    wind: state.day.weather.id === 'sunny' ? 0.4 : 0.7,
  });
}

function riverNotes() {
  const d = state.data;
  const hatch = activeHatch(state.day, state.minute);
  if (hatch) return hatch.signs;
  const part = dayPart(d.water, state.minute).id;
  const upcoming = state.day.hatches.find((h) => h.from > state.minute && h.from - state.minute < 45);
  let text = d.conditions.quietNotes[part];
  if (upcoming) text += ' A few insects are starting to appear in the air.';
  return text;
}

let toastTimer;
function toast(text, ms = 4200) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function log(text) {
  const li = document.createElement('li');
  li.innerHTML = `<time>${formatClock(state.minute)}</time>`;
  li.appendChild(document.createTextNode(text));
  const ol = $('log');
  ol.prepend(li);
  while (ol.children.length > 3) ol.lastChild.remove();
}

function floatText(text, worldPos, cls = '') {
  const p = worldPos.clone().project(camera);
  if (p.z > 1) return;
  const el = document.createElement('div');
  el.className = `floater ${cls}`;
  el.textContent = text;
  const stage = $('stage');
  el.style.left = `${(p.x * 0.5 + 0.5) * stage.clientWidth}px`;
  el.style.top = `${(-p.y * 0.5 + 0.5) * stage.clientHeight}px`;
  $('floaters').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function updateSoundButton() {
  const b = $('btn-sound');
  b.classList.toggle('off', !audio.enabled);
  b.innerHTML = audio.enabled ? '&#128264;' : '&#128263;';
}

// --- Time --------------------------------------------------------------------------

function advance(minutes) {
  const before = state.minute;
  const hatchBefore = activeHatch(state.day, before);
  state.minute = Math.min(DAY_END, state.minute + minutes);
  for (const k in state.fresh) state.fresh[k] = Math.min(1, state.fresh[k] + 0.008 * minutes);
  const hatchAfter = activeHatch(state.day, state.minute);
  if (hatchAfter && hatchAfter !== hatchBefore) {
    log(`Something is happening on the water: ${hatchAfter.label.toLowerCase()}.`);
    toast(hatchAfter.signs, 7000);
  } else if (!hatchAfter && hatchBefore) {
    log('The hatch fades and the surface goes quiet.');
  }
  updateHUD();
  if (state.minute >= DAY_END && state.phase === 'idle') endDay();
}

function endDay() {
  state.phase = 'dayend';
  const n = state.today.length;
  const pts = state.today.reduce((s, c) => s + c.points, 0);
  const best = state.today.reduce((b, c) => (!b || c.length > b.length ? c : b), null);
  const spotted = state.spottedToday ? ` You spotted ${state.spottedToday} fish.` : '';
  $('dayend-text').textContent = n
    ? `You landed ${n} trout today, for ${pts} catch points. The biggest was a ${best.length} cm ${best.species} from the ${best.spotName.toLowerCase().replace(/^the /, '')}.${spotted}`
    : `No fish landed today. Some days the river keeps its secrets.${spotted} Tomorrow will be different.`;
  $('dayend-list').innerHTML = state.today.map((c) => `<li>${c.time}: ${c.length} cm ${c.species} trout, ${c.spotName}</li>`).join('');
  $('dayend').hidden = false;
}

// --- Aiming & spotting --------------------------------------------------------------

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function waterPointAt(px, py) {
  const r = $('view').getBoundingClientRect();
  const ndc = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, p)) return null;
  return p;
}

function lieAt(p) {
  let best = null, bd = 3.2;
  for (const s of world.spots) {
    const d = Math.hypot(s.w.x - p.x, s.w.z - p.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function describeAim(p) {
  const dist = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
  if (!world.inWater(p.x, p.z)) return { ok: false, text: 'That’s dry land.' };
  if (dist > MAX_CAST) return { ok: false, text: `Too far to cast (${Math.round(dist)} m).` };
  if (dist < 3) return { ok: false, text: 'Too close. You’d spook everything.' };
  const lie = lieAt(p);
  const wt = lie ? state.data.water.types[lie.type].label.toLowerCase() : null;
  return { ok: true, dist, lie, text: lie ? `${lie.name} · ${wt} · ${Math.round(dist)} m` : `Open water · ${Math.round(dist)} m` };
}

function screenOf(v) {
  const p = v.clone().project(camera);
  const r = $('view').getBoundingClientRect();
  return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, behind: p.z > 1 };
}

function trySpot(px, py) {
  const now = world.time;
  let best = null, bd = 20 + 9 * zoom;
  for (const f of fishes) {
    if (f.spotted || f.hidden || f.state === 'hooked') continue;
    const risen = recentRises.some((r) => r.fish === f && now - r.t < 3.5);
    if (f.vis < 0.18 && !risen) continue;
    const s = screenOf(new THREE.Vector3(f.pos.x, risen ? 0 : f.pos.y, f.pos.z));
    if (s.behind) continue;
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < bd) { bd = d; best = f; }
  }
  if (!best) return false;
  best.spotted = true;
  state.spottedToday++;
  const pts = spotPoints(best.length);
  save.points += pts;
  fx.mark(best);
  const sz = Math.round(best.length / 5) * 5;
  const kind = best.length >= 50 ? 'a big trout' : best.length >= 40 ? 'a good trout' : 'a trout';
  const where = best.spot.name.toLowerCase().replace(/^the /, '');
  const msg = `Spotted ${kind}, around ${sz} cm, in the ${where}.`;
  log(msg);
  toast(`${msg} +${pts}`);
  floatText(`+${pts} spotted`, new THREE.Vector3(best.pos.x, 0.2, best.pos.z), 'spot');
  audio.click(2600, 0.02);
  if (state.spottedToday >= 10) give('eyes');
  if (best.length >= 50) give('ghost');
  persist();
  updateHUD();
  return true;
}

function setAimAt(px, py) {
  const p = waterPointAt(px, py);
  if (!p) return;
  const a = describeAim(p);
  if (!a.ok) {
    toast(a.text, 2000);
    return;
  }
  state.aim = p;
  fx.setAim(p);
  $('aim-label').textContent = a.text;
  $('aim-label').classList.add('show');
  updateHUD();
}

// --- Casting ------------------------------------------------------------------------------

function cast() {
  if (state.phase === 'drift') return pickUp();
  if (state.phase !== 'idle' || !state.aim) return;
  audio.start();
  if (state.rigChanged) {
    log('You retie your rig.');
    state.rigChanged = false;
    advance(2);
  }
  state.phase = 'cast';
  const target = state.aim.clone();
  // A little natural inaccuracy, more at long range.
  const dist = Math.hypot(target.x - camera.position.x, target.z - camera.position.z);
  const err = 0.15 + dist * 0.02;
  target.x += rand(-err, err);
  target.z += rand(-err, err);
  if (!world.inWater(target.x, target.z)) target.copy(state.aim);
  target.y = 0;
  tackle.startCast(target, () => land(target));
  audio.cast();
  setTimeout(() => audio.cast(), 650);
  $('aim-label').classList.remove('show');
  fx.setHover(null);
  updateHUD();
}

function land(p) {
  audio.plop();
  const r = curRig();
  fx.ring(p.x, p.z, r.size === 'large' ? 0.5 : 0.3, 1.2);
  tackle.startDrift((x, z) => world.flowAt(x, z));
  const lie = lieAt(p);
  tackle.setDepth(0);
  drift = { pos: tackle.flyPos, t: 0, sink: 0, target: r.fly === 'dry' ? 0 : curRig(lie).depthM, passed: new Set(), near: new Map(), engaged: false, start: p.clone(), drag: 0, dragMax: 0, wakeT: 0 };
  state.phase = 'drift';
  advance(2);
  spookCheck(p);
  updateHUD();
}

// Fish that see the line, or the fly landing on their heads, bolt.
function spookCheck(p) {
  let spooked = 0, lined = 0;
  const linePts = tackle.linePoints();
  for (const f of fishes) {
    if (f.hidden || f.state !== 'hold') continue;
    f.lined = false;
    const wt = state.data.water.types[f.spot.type];
    const sp = wt.spookiness * state.day.weather.spook;
    const r = curRig();
    const leaderShort = r.leader < 8.5 ? 1.6 : r.leader < 10.5 ? 1.2 : r.leader < 13 ? 0.8 : 0.7;
    const dLand = Math.hypot(f.pos.x - p.x, f.pos.z - p.z);
    const plop = r.size === 'large' || r.fly === 'nymph' ? 1.3 : 1;
    let chance = 0;
    if (dLand < 0.6 * plop) chance = 0.35 + 0.5 * sp;
    else if (dLand < 1.4 * plop && sp > 0.6) chance = 0.4 * sp;
    // Lining: the fly line or leader landing on top of the fish.
    for (let i = 4; i < linePts.length - 3; i++) {
      const q = linePts[i];
      if (q.y > 0.1) continue;
      if (Math.hypot(f.pos.x - q.x, f.pos.z - q.z) < 0.6) {
        const thick = i < linePts.length * 0.8 ? 1 : 0.6; // fly line spooks more than leader
        chance = Math.max(chance, (0.45 + 0.4 * sp) * leaderShort * thick);
        f.lined = true;
        break;
      }
    }
    if (chance > 0 && Math.random() < chance * (0.5 + 0.5 * state.fresh[f.spot.id])) {
      f.spook(p.x, p.z);
      spooked++;
      if (f.lined) lined++;
      state.fresh[f.spot.id] = Math.max(0, state.fresh[f.spot.id] - 0.2);
      fx.ring(f.pos.x, f.pos.z, 0.6, 1);
    }
  }
  if (spooked) {
    const msg = lined
      ? `The fly line slapped down right on top of ${spooked > 1 ? 'some fish' : 'a trout'}, and ${spooked > 1 ? 'they' : 'it'} shot off for cover. Cast so only the leader and fly pass over the fish: from further across, or aim beyond them.`
      : spooked > 1
        ? 'Dark shapes shoot off upstream. The fly came down right on their heads. Land it a metre or two upstream of the fish instead.'
        : 'A dark shape bolts from under the fly. It landed too close. Aim a metre or two upstream and let the current bring the fly down.';
    log(msg);
    toast(msg, 6000);
  }
}

function snagBottom() {
  drift = null;
  tackle.idle();
  state.phase = 'idle';
  audio.snap();
  const msg = 'Snagged on the bottom! The nymph was set deeper than the river here, and you lose the fly. Shorten the indicator depth or dropper for this spot.';
  log(msg);
  toast(msg, 6000);
  advance(3);
}

function mend() {
  if (state.phase !== 'drift' || !drift) return;
  tackle.mend();
  audio.cast();
  drift.mends = (drift.mends || 0) + 1;
  // A big mend close to the fly can twitch it.
  if (Math.random() < 0.12) fx.ring(drift.pos.x, drift.pos.z, 0.25, 0.8);
}

function pickUp() {
  if (state.phase !== 'drift') return;
  endDrift(true);
}

function endDrift(pickedUp) {
  const d = drift;
  drift = null;
  tackle.idle();
  tackle.hideFly = false;
  tackle.dip = 0;
  state.phase = 'idle';
  if (d && !d.engaged && !d.refused) {
    // What happened (or didn't) in the lie we were fishing?
    const lie = lieAt(d.start) || lieAt(d.pos);
    if (lie) {
      const ctx = { water: state.data.water, day: state.day, minute: state.minute };
      const res = fishTakeChance(lie, curRig(lie), { ...ctx, drag: d.dragMax || 0 }, state.fresh[lie.id], { length: lie.fish.min }, 0.5);
      state.fresh[lie.id] = Math.max(0, state.fresh[lie.id] - 0.04);
      const hint = missHint(lie, curRig(lie), res.ev);
      const msg = hint && Math.random() < 0.7 ? hint : pick(CALM_MISSES);
      if (!pickedUp) { log(msg); toast(msg); }
    } else if (!pickedUp) {
      const msg = d.passed.size ? pick(CALM_MISSES) : 'The fly drifted through open water. Few fish live there. Try drifting it through a lie.';
      log(msg);
      toast(msg);
    }
  }
  updateHUD();
}

function updateDrift(dt) {
  const d = drift;
  d.t += dt;
  const cam = camera.position;
  // The fly line is simulated in tackle.js; read back how much it drags the fly.
  d.drag = tackle.drag;
  if (d.t > 0.6) d.dragMax = Math.max(d.dragMax, d.drag);
  d.wakeT -= dt;
  if (d.drag > 0.45 && d.wakeT <= 0) {
    // A dragging fly leaves a little V-wake.
    fx.ring(d.pos.x, d.pos.z, 0.18, 0.7);
    d.wakeT = 0.25;
    if (!d.warned && d.drag > 0.6) {
      d.warned = true;
      toast('Your fly is dragging! Mend the line upstream (M) to free it.', 3500);
    }
  }
  // The nymph sinks through the first part of the drift: heavy flies fast,
  // light ones slowly. Cast far enough upstream for it to get down.
  if (d.target > 0) {
    const rate = { small: 0.14, medium: 0.28, large: 0.5 }[curRig().size];
    d.sink = Math.min(d.target, d.sink + rate * dt);
    tackle.setDepth(d.sink);
  }
  // A nymph fished deeper than the river snags the bottom.
  if (curRig().fly !== 'dry' && !d.engaged) {
    const bed = -world.heightAt(d.pos.x, d.pos.z);
    // Ticking the stones is fine; much deeper than the bottom hangs up.
    const over = tackle.depthM - bed * 1.3 - 0.1;
    if (over > 0 && Math.random() < dt * Math.min(1.5, over * 1.6)) return snagBottom();
  }

  if (!d.engaged) {
    const ctx = { water: state.data.water, day: state.day, minute: state.minute };
    for (const f of fishes) {
      if (f.hidden || f.state !== 'hold' || d.passed.has(f)) continue;
      const now = Math.hypot(f.pos.x - d.pos.x, f.pos.z - d.pos.z);
      if (now > 1.6) continue;
      // Judge the fly at its closest pass, as it drifts over the fish.
      const best = d.near.get(f);
      if (best === undefined || now < best) d.near.set(f, now);
      if (now > 0.4 && (best === undefined || now <= best + 0.03)) continue;
      const dist = Math.min(now, best ?? now);
      d.passed.add(f);
      const rr = curRig(f.spot);
      if (rr.depthM !== undefined) rr.depthM = Math.min(rr.depthM, d.sink);
      const res = fishTakeChance(f.spot, rr, { ...ctx, drag: d.drag || 0 }, state.fresh[f.spot.id], f, dist);
      const surface = rr.fly === 'dry' || (rr.fly === 'drydropper' && Math.random() < 0.45);
      if (Math.random() < res.p) {
        d.engaged = true;
        d.fish = f;
        d.ev = res.ev;
        d.surface = surface;
        f.approach(d.pos, surface, true, () => takeFly(f));
        break;
      } else if (res.ev.match > 0.3 && Math.random() < 0.4 * (1 - res.ev.match * 0.6)) {
        d.refused = true;
        f.approach(d.pos, surface, false, () => {
          const hint = missHint(f.spot, rr, res.ev) || 'A trout came up for a look, then sank back. Maybe the fly dragged a little. Try again.';
          log(hint);
          toast(hint, 5000);
          if (surface) fx.ring(d.pos.x + 0.1, d.pos.z + 0.2, 0.35, 1.3);
        });
        break;
      }
    }
  }

  // End of the drift: the fly has come round, hit the bank or dragged.
  const toCam = Math.hypot(d.pos.x - cam.x, d.pos.z - cam.z);
  if (!d.engaged && (d.t > 14 || toCam < 3.5 || !world.inWater(d.pos.x, d.pos.z) || d.pos.z - cam.z > 8 || (d.t > 3 && d.drag > 0.95))) endDrift(false);
}

// --- Take, strike, fight -----------------------------------------------------------------

function takeFly(f) {
  if (state.phase !== 'drift' || !drift) return;
  state.phase = 'strike';
  const d = drift;
  const p = d.pos;
  if (d.surface) {
    const size = riseSize(f);
    fx.riseWaves(p.x, p.z, 0.6 + size * 0.7);
    fx.splash(p.x, 0, p.z, Math.round(6 + size * 10), 0.35 + size * 0.3);
    tackle.hideFly = true;
    audio.rise(size, 1.2);
    log('A nose breaks the surface and your fly is gone!');
  } else {
    tackle.dip = 0.03;
    audio.plop();
    log('The indicator twitches and stops!');
  }
  strike = { t: 0, window: d.surface ? 1.6 : 1.3 };
  $('strike').hidden = false;
}

function updateStrike(dt) {
  strike.t += dt;
  if (strike.t > strike.window) {
    $('strike').hidden = true;
    const f = drift.fish;
    f.state = 'returning';
    f.wary = 1;
    state.fresh[f.spot.id] = Math.max(0, state.fresh[f.spot.id] - 0.15);
    strike = null;
    drift.refused = true;
    const msg = 'Too slow. The trout felt the fly and let go.';
    log(msg);
    toast(msg);
    endDrift(true);
  }
}

function doStrike() {
  if (state.phase !== 'strike') return;
  $('strike').hidden = true;
  audio.start();
  strike = null;
  const d = drift;
  const f = d.fish;
  if (Math.random() < 0.1) {
    f.state = 'returning';
    f.wary = 1;
    const msg = 'You lift into it, but the hook doesn’t find a hold.';
    log(msg);
    toast(msg);
    state.fresh[f.spot.id] = Math.max(0, state.fresh[f.spot.id] - 0.15);
    d.refused = true;
    endDrift(true);
    return;
  }
  startFight(d, f);
}

function startFight(d, f) {
  state.phase = 'fight';
  drift = null;
  tackle.hideFly = false;
  tackle.dip = 0;
  f.state = 'hooked';
  const tip = tippetInfo();
  const foot = new THREE.Vector3(camera.position.x, 0, camera.position.z);
  const away = new THREE.Vector3(f.pos.x - foot.x, 0, f.pos.z - foot.z).normalize();
  fight = {
    fish: f, ev: d.ev, foot,
    strength: tip.strengthKg,
    stamina: 1,
    running: false,
    runLeft: 0,
    dir: away.clone(),
    speed: 0.4,
    lineOut: Math.hypot(f.pos.x - foot.x, f.pos.z - foot.z),
    tensionKg: 0,
    over: 0,
    snag: 0,
    slackT: 0,
    clickT: 0,
    jump: null,
    warn: null,
    jumpStress: 0,
    crankQ: 0,
    crankT: 0,
    autoCrankT: 0,
    rodSide: 0,
    dragSide: 0,
    t: 0,
    // Many trout leap the moment they feel the hook.
    jumpAt: Math.random() < (f.species === 'rainbow' ? 0.85 : f.length > 45 ? 0.35 : 0.5) ? rand(0.35, 0.9) : null,
    mouth: new THREE.Vector3(),
  };
  $('fight').hidden = false;
  $('bottombar').hidden = true;
  $('flybox').hidden = true;
  $('leaderbox').hidden = true;
  updateDragUI();
  $('fight-title').textContent = f.kg > 1.2 ? 'Fish on! It feels heavy...' : 'Fish on!';
  audio.splash(Math.min(1.4, 0.4 + f.kg));
  fx.splash(f.pos.x, 0, f.pos.z, 25, 0.8 + f.kg * 0.2);
  fx.ring(f.pos.x, f.pos.z, 1.2, 1.4);
  if (f.kg > 0.7) startRun();
}

function startRun() {
  const f = fight.fish;
  fight.running = true;
  fight.runLeft = rand(1, 2 + f.kg * 0.8);
  const away = new THREE.Vector3(f.pos.x - fight.foot.x, 0, f.pos.z - fight.foot.z).normalize();
  const a = rand(-0.9, 0.9);
  fight.dir.set(away.x * Math.cos(a) - away.z * Math.sin(a), 0, away.x * Math.sin(a) + away.z * Math.cos(a));
  fight.toCover = false;
  if (f.spot.snag > 0.3 && Math.random() < 0.65) {
    // Bolt for the nearest rock or the roots of the bank.
    let best = null, bd = 10;
    for (const r of world.rocks) {
      const dd = Math.hypot(r.x - f.pos.x, r.z - f.pos.z);
      if (dd < bd && r.r > 0.5) { bd = dd; best = r; }
    }
    if (f.spot.type === 'bank') best = { x: f.spot.w.x + 1.2, z: f.spot.w.z };
    if (best) {
      fight.dir.set(best.x - f.pos.x, 0, best.z - f.pos.z).normalize();
      fight.coverDir = fight.dir.clone();
      fight.toCover = true;
    }
  }
  fight.speed = 1.4 + f.kg * 0.9;
  $('fight-title').textContent = fight.toCover ? 'It’s heading for cover!' : 'It’s running!';
  fight.jumpSoon = Math.random() < (f.species === 'rainbow' ? 0.65 : 0.3);
}

function applyPolar() {
  const on = save.polarized === true;
  world.setPolarized(on);
  $('btn-polar').classList.toggle('off', !on);
  $('btn-polar').classList.toggle('lit', on);
  $('polar-tint').classList.toggle('on', on);
}

function setBow(on) {
  if (bowing === on) return;
  bowing = on;
  $('bow').classList.toggle('on', on);
}

function crank(amount = 0.45) {
  if (!fight) return;
  fight.crankQ = Math.min(1.4, fight.crankQ + amount);
  fight.crankT = 0.35;
  tackle.spool += 0.9;
}

function dragKg() {
  return save.drag * 0.45;
}

function updateDragUI() {
  const s = fight ? fight.strength : 2;
  $('drag-val').textContent = `${dragKg().toFixed(1)} kg`;
  $('drag-fill').style.width = `${(dragKg() / 3.6) * 100}%`;
  $('drag-break').style.left = `${(s / 3.6) * 100}%`;
  $('drag-tip').textContent = `${tippetInfo().id} breaks at ${s.toFixed(1)} kg`;
}

function setDrag(delta) {
  save.drag = clamp(save.drag + delta, 1, 8);
  persist();
  audio.click(900 + save.drag * 150, 0.04);
  updateDragUI();
}

function updateFight(dt) {
  const F = fight;
  const f = F.fish;
  const drag = dragKg();
  F.t += dt;

  if (!F.running && Math.random() < dt * (0.12 + 0.35 * F.stamina) * Math.min(1.5, 0.5 + f.kg)) startRun();
  if (F.running) {
    F.runLeft -= dt;
    if (F.runLeft <= 0) {
      F.running = false;
      F.speed = 0.35 + 0.3 * F.stamina;
      $('fight-title').textContent = F.stamina < 0.3 ? 'It’s tiring...' : 'Fish on!';
      // Sometimes the fish swims towards you, throwing slack.
      if (Math.random() < 0.3) F.dir.set(F.foot.x - f.pos.x, 0, F.foot.z - f.pos.z).normalize();
    }
  } else {
    // Wandering, shaking its head.
    const a = rand(-1, 1) * dt * 1.5;
    F.dir.set(F.dir.x * Math.cos(a) - F.dir.z * Math.sin(a), 0, F.dir.x * Math.sin(a) + F.dir.z * Math.cos(a));
  }

  // Move the fish, staying in the water.
  const next = f.pos.clone().addScaledVector(F.dir, F.speed * dt);
  if (world.heightAt(next.x, next.z) > -0.25) {
    const { cx } = world.channel(f.pos.z);
    F.dir.set(cx - f.pos.x, 0, rand(-0.5, 0.5)).normalize();
  } else {
    f.pos.x = next.x;
    f.pos.z = next.z;
  }

  const pull = f.kg * 0.9 * (F.running ? 1.9 : 1) * (0.4 + 0.6 * F.stamina);
  // Cranking: every tap of Reel winds in a turn of line; holding it winds slowly.
  if (holding) {
    F.autoCrankT -= dt;
    if (F.autoCrankT <= 0) { crank(0.22); F.autoCrankT = 0.3; }
  }
  F.crankT -= dt;
  const cranking = F.crankT > 0;
  let wound = 0;
  if (F.crankQ > 0) {
    if (pull <= drag && !bowing) {
      wound = Math.min(F.crankQ, dt * 2.4);
      F.lineOut -= wound;
      F.crankQ -= wound;
    } else {
      // The fish is pulling harder than the drag: the spool just slips.
      F.crankQ = Math.max(0, F.crankQ - dt * 3);
    }
  }
  F.lineOut = Math.max(1.5, F.lineOut);

  // Side pressure: leaning the rod to one side pulls the fish's head that way.
  const steerTarget = clamp(F.dragSide + steerKeys, -1, 1);
  F.rodSide = lerp(F.rodSide, steerTarget, Math.min(1, dt * 5));
  tackle.rodSide = F.rodSide;
  tackle.bowing = bowing;
  const dist0 = Math.hypot(f.pos.x - F.foot.x, f.pos.z - F.foot.z);
  if (Math.abs(F.rodSide) > 0.1 && !bowing && dist0 >= F.lineOut - 0.2) {
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const toMe = new THREE.Vector3(F.foot.x - f.pos.x, 0, F.foot.z - f.pos.z).normalize();
    const want = toMe.multiplyScalar(0.5).addScaledVector(right, F.rodSide * 1.4).normalize();
    const k = Math.min(1, dt * 1.6 * Math.abs(F.rodSide) * clamp(F.tensionKg / 0.8, 0.3, 1.5));
    F.dir.lerp(want, k).normalize();
    if (F.toCover && F.coverDir && F.dir.dot(F.coverDir) < 0.2) {
      F.toCover = false;
      $('fight-title').textContent = 'You turned its head away from cover!';
    }
  }

  const effLine = F.lineOut + (bowing ? 1.4 : 0); // bowing drops the rod and gives slack
  const dist = Math.hypot(f.pos.x - F.foot.x, f.pos.z - F.foot.z);
  let given = 0, t;
  if (dist > effLine && bowing) {
    // Bowing: line slides out without much resistance.
    given = dist - effLine;
    F.lineOut = dist - 1.4;
    t = 0.06;
    F.slackT = 0;
  } else if (dist > F.lineOut) {
    if (pull > drag) {
      given = dist - F.lineOut;
      F.lineOut = dist;
      t = drag;
    } else {
      // Held: the fish can't take line, and is drawn towards you.
      const k = F.lineOut / dist;
      f.pos.x = F.foot.x + (f.pos.x - F.foot.x) * k;
      f.pos.z = F.foot.z + (f.pos.z - F.foot.z) * k;
      t = pull;
    }
    if (cranking) t += 0.3;
    F.slackT = 0;
  } else {
    const slack = effLine - dist;
    t = slack > 0.6 ? 0.05 : pull * 0.6 + (cranking ? 0.3 : 0);
    if (bowing) t = Math.min(t, 0.08);
    if (slack > 2.5) F.slackT += dt;
    else F.slackT = 0;
  }
  F.tensionKg = lerp(F.tensionKg, t, Math.min(1, dt * 8));
  const ratio = F.tensionKg / F.strength;
  tension.value = F.tensionKg / 2.2;

  F.stamina = Math.max(0, F.stamina - dt * (0.03 + F.tensionKg * 0.05 + (F.running ? 0.03 : 0) + Math.abs(F.rodSide) * 0.02) / (0.5 + f.kg * 0.5));
  if (ratio > 0.92) F.over += dt;
  else F.over = Math.max(0, F.over - dt * 1.5);
  if (F.running && F.toCover && given > 0 && f.spot.snag > 0.3) F.snag += given * f.spot.snag * 0.14;
  else F.snag = Math.max(0, F.snag - dt * 0.05);

  // Sounds: the reel clicks as you wind, and sings as the fish takes line.
  F.clickT -= dt;
  if (F.clickT <= 0) {
    if (given > 0) {
      audio.click(1200 + save.drag * 160, 0.035);
      F.clickT = clamp(0.006 / (given / dt + 0.01), 0.025, 0.12);
      tackle.spool -= 0.6;
    } else if (wound > 0) {
      audio.click(1700, 0.025);
      F.clickT = 0.08;
      tackle.spool += 0.5;
    } else F.clickT = 0.05;
  }

  // Depth, heading, jumps and splashes.
  let y = F.running ? -0.35 : F.stamina < 0.3 ? -0.12 : -0.5;
  // A jump is coming: the fish surges up, bulging and swirling the surface.
  const wantJump = (F.jumpAt !== null && F.t >= F.jumpAt) || (F.jumpSoon && F.running && Math.random() < dt * 1.5);
  if (wantJump && !F.jump && !F.warn) {
    F.jumpAt = null;
    F.jumpSoon = false;
    F.warn = { t: 0, dur: rand(0.9, 1.3), boilT: 0 };
    $('fight-title').textContent = 'It\u2019s coming up! Get ready to bow!';
    $('fight').classList.add('warning');
    $('jump-cue').hidden = false;
    audio.surge();
  }
  if (F.warn) {
    F.warn.t += dt;
    y = lerp(y, -0.06, Math.min(1, F.warn.t / F.warn.dur));
    F.warn.boilT -= dt;
    if (F.warn.boilT <= 0) {
      fx.ring(f.pos.x, f.pos.z, 0.5 + F.warn.t * 0.6, 0.9);
      fx.splash(f.pos.x, 0, f.pos.z, 3, 0.25);
      F.warn.boilT = 0.18;
    }
    const sc = screenOf(new THREE.Vector3(f.pos.x, 0.3, f.pos.z));
    const r = $('stage').getBoundingClientRect();
    $('jump-cue').style.left = `${sc.x - r.left}px`;
    $('jump-cue').style.top = `${sc.y - r.top}px`;
  }
  const jumpNow = F.warn && F.warn.t >= F.warn.dur;
  if (jumpNow && !F.jump) {
    F.warn = null;
    $('fight').classList.remove('warning');
    $('jump-cue').hidden = true;
    $('fight-title').textContent = 'It\u2019s jumping! Bow!';
    $('fight').classList.add('jumping');
    F.jump = { t: 0, dur: 0.85, h: 0.45 + f.kg * 0.12 };
    F.jumpSoon = false;
    fx.splash(f.pos.x, 0, f.pos.z, 30, 1.1);
    audio.splash(0.7);
  }
  if (F.jump) {
    F.jump.t += dt;
    const k = F.jump.t / F.jump.dur;
    y = Math.sin(Math.min(1, k) * Math.PI) * F.jump.h;
    f.pitch = lerp(0.9, -0.9, k);
    f.roll = Math.sin(k * 12) * 0.6;
    // Bow to the fish: a tight line while it's in the air rips the hook out.
    const pressure = F.tensionKg / F.strength;
    if (F.jump.t > 0.1 && !bowing && (cranking || pressure > 0.3)) F.jumpStress += dt * (cranking ? 1.6 : 1) * (0.6 + pressure);
    if (F.jumpStress > 0.32) return endFight('thrown');
    if (k >= 1) {
      F.jump = null;
      F.jumpStress = 0;
      $('fight').classList.remove('jumping');
      if (F.running) $('fight-title').textContent = 'It\u2019s running!';
      f.roll = 0;
      fx.splash(f.pos.x, 0, f.pos.z, 40, 1.2);
      fx.ring(f.pos.x, f.pos.z, 1.5, 1.5);
      audio.splash(1);
    }
  } else {
    f.pitch = lerp(f.pitch || 0, 0, dt * 4);
  }
  f.pos.y = F.jump ? y : lerp(f.pos.y, y, dt * (F.warn ? 4 : 2));
  f.running = F.running;
  f.faceTowards(f.pos.x + F.dir.x, f.pos.z + F.dir.z, 0.15);
  if (!F.jump && f.pos.y > -0.25 && Math.random() < dt * (F.running ? 3 : 0.8)) {
    fx.splash(f.pos.x, 0, f.pos.z, 6, 0.4);
    fx.ring(f.pos.x, f.pos.z, 0.6, 1);
  }

  const fwd = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
  F.mouth.copy(f.pos).addScaledVector(fwd, f.length / 200);
  tackle.setFight(F.mouth, tension);

  $('tension').style.width = `${clamp(ratio, 0, 1.1) / 1.1 * 100}%`;
  $('lineout').textContent = `${Math.round(F.lineOut)} m`;
  $('side-dot').style.left = `${50 + F.rodSide * 45}%`;
  $('tension-bar').classList.toggle('danger', ratio > 0.8);

  if (F.over > 0.3) return endFight('snap');
  if (F.snag > 1) return endFight('snag');
  if (F.slackT > 3) return endFight('slack');
  if (dist < 3 && F.stamina < 0.35) return endFight('landed');
  if (dist < 3 && !F.running) startRun();
}

function endFight(outcome) {
  const F = fight;
  fight = null;
  holding = false;
  $('fight').hidden = true;
  $('fight').classList.remove('jumping', 'warning');
  $('jump-cue').hidden = true;
  bowing = false;
  tackle.rodSide = 0;
  tackle.bowing = false;
  $('bottombar').hidden = false;
  $('reel').classList.remove('on');
  tension.value = 0;
  const f = F.fish;
  f.running = false;
  if (outcome === 'landed') {
    tackle.mode = 'hidden';
    state.fresh[f.spot.id] = Math.max(0, state.fresh[f.spot.id] - 0.3);
    landed(F);
    return;
  }
  tackle.idle();
  f.state = 'hold';
  f.spook(F.foot.x, F.foot.z);
  audio.snap();
  state.fresh[f.spot.id] = Math.max(0, state.fresh[f.spot.id] - 0.35);
  const size = f.kg > 1.4 ? 'a big fish' : 'the fish';
  const msg = {
    snap: `Snap! The ${tippetInfo().id} tippet couldn’t take the strain, and ${size} is gone. Loosen the drag, or stop reeling when it runs.`,
    snag: 'The fish dived under a rock and the line went solid. Gone. In snaggy water, set the drag tighter (with a tippet strong enough to take it) so the fish can’t reach cover.',
    slack: 'The line went slack and the hook fell out. Keep reeling when the fish swims towards you.',
    thrown: 'The trout leapt and shook its head against the tight line, and the hook flew out. When you see it coming up, hold Bow (B) to drop the rod tip, so the line goes soft while it\u2019s in the air.',
  }[outcome];
  log(msg);
  toast(msg, 6500);
  state.phase = 'idle';
  advance(5);
}

// --- Landing & rewards ----------------------------------------------------------------

function landed(F) {
  const f = F.fish;
  const ev = F.ev;
  const fishRec = { length: f.length, weightG: f.weightG, species: f.species, trophy: f.length > f.spot.fish.max };
  const pts = catchPoints(fishRec, ev.match);
  const stars = rigStars(ev.match);
  const spot = f.spot;
  const rec = {
    length: f.length, weightG: f.weightG, species: f.species,
    spotId: spot.id, spotName: spot.name, section: spot.section,
    rig: { ...curRig(spot), name: rigInfo(state.rig, state.data.gear).fly.name }, stars, points: pts,
    time: formatClock(state.minute), day: save.days,
  };
  save.points += pts;
  save.catches.unshift(rec);
  save.catches = save.catches.slice(0, 60);
  if (!save.best || f.length > save.best.length) save.best = rec;
  state.today.push(rec);
  const newAch = checkAchievements(rec, ev);
  persist();

  // Bring the fish to the net, close to the bank.
  const foot = F.foot;
  const dir = new THREE.Vector3(f.pos.x - foot.x, 0, f.pos.z - foot.z).normalize();
  f.pos.set(foot.x + dir.x * 2.2, -0.08, foot.z + dir.z * 2.2);
  f.state = 'landed';
  state.landedFish = f;

  state.phase = 'card';
  audio.chime();
  $('catch-eyebrow').textContent = `${f.species === 'rainbow' ? 'Rainbow trout' : 'Brown trout'}${fishRec.trophy ? ' · a real trophy' : ''}`;
  $('catch-len').textContent = f.length;
  $('catch-wt').textContent = f.weightG.toLocaleString('en');
  $('catch-pts').textContent = pts;
  $('catch-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('catch-note').textContent = catchNote(stars, fishRec);
  const ach = $('catch-ach');
  if (newAch.length) {
    ach.hidden = false;
    ach.textContent = `Achievement: ${newAch.map((a) => a.name).join(', ')}`;
  } else ach.hidden = true;
  drawTrout($('fish-canvas'), fishRec);
  setTimeout(() => ($('catch').hidden = false), 600);
  log(`Landed a ${f.length} cm ${f.species} trout (+${pts} pts).`);
  updateHUD();
}

function catchNote(stars, fish) {
  if (stars === 3) return fish.trophy ? 'Perfect setup, and the river rewarded you with one of its oldest fish.' : 'Perfect setup for this water and this moment. Bonus points.';
  if (stars === 2) return 'A good rig for this water. A few tweaks might bring bigger fish.';
  if (stars === 1) return 'You got one, but the rig wasn’t really suited to this water. Better choices bring bigger fish, more often.';
  return 'A lucky fish! This rig was badly matched to the water.';
}

const gotNow = [];
function give(id) {
  if (save.ach[id]) return;
  save.ach[id] = save.days;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  gotNow.push(a);
  if (state.phase !== 'card') toast(`Achievement: ${a.name}`, 4000);
}

function checkAchievements(rec, ev) {
  gotNow.length = 0;
  give('first');
  if (rec.length >= 40) give('forty');
  if (rec.length >= 50) give('fifty');
  if (rec.length >= 60) give('sixty');
  if (rec.species === 'rainbow') give('rainbow');
  if (rec.stars === 3) give('perfect');
  if (ev.hatch && rec.rig.fly === 'dry' && rec.rig.size === ev.hatch.size) give('hatch');
  const spot = state.data.river.spots.find((s) => s.id === rec.spotId);
  if (spot.type === 'flat' && Number(rec.rig.leader) >= 12 && rec.rig.tippet === '6X') give('flat');
  if (spot.type === 'pocket' && rec.length >= 40) give('pocket');
  if (new Set(state.today.map((c) => c.section)).size >= 3) give('sections');
  if (dayPart(state.data.water, state.minute).id === 'dusk') give('dusk');
  if (state.today.length >= 10) give('ten');
  return [...gotNow];
}

function release() {
  $('catch').hidden = true;
  const f = state.landedFish;
  if (f) {
    f.state = 'released';
    f.t = 0;
    f.wary = 1;
    fx.splash(f.pos.x, 0, f.pos.z, 12, 0.5);
    fx.ring(f.pos.x, f.pos.z, 0.8, 1.4);
    audio.splash(0.3);
  }
  state.landedFish = null;
  tackle.idle();
  state.phase = 'idle';
  advance(6);
}

// --- Logbook ----------------------------------------------------------------------------

function openLogbook() {
  let rank = RANKS[0][1];
  for (const [p, name] of RANKS) if (save.points >= p) rank = name;
  const next = RANKS.find(([p]) => p > save.points);
  $('rank').textContent = rank;
  const total = save.catches.length;
  $('book-stats').innerHTML = `
    <div><b>${save.points.toLocaleString('en')}</b><span>points${next ? ` · ${next[0] - save.points} to ${next[1]}` : ''}</span></div>
    <div><b>${total}${total >= 60 ? '+' : ''}</b><span>fish landed</span></div>
    <div><b>${save.best ? save.best.length + ' cm' : '–'}</b><span>personal best${save.best ? ` (${save.best.species})` : ''}</span></div>
    <div><b>${state.spottedToday}</b><span>fish spotted today</span></div>
    <div><b>${save.days}</b><span>days on the river</span></div>`;
  $('ach-grid').innerHTML = ACHIEVEMENTS.map(
    (a) => `<div class="ach ${save.ach[a.id] ? 'got' : ''}"><b>${save.ach[a.id] ? '★ ' : ''}${a.name}</b>${a.desc}</div>`,
  ).join('');
  const rows = save.catches.slice(0, 25).map((c) =>
    `<tr><td>Day ${c.day} ${c.time}</td><td>${c.length} cm</td><td>${c.species}</td><td>${c.spotName}</td><td>${c.rig.leader} ft · ${c.rig.tippet} · ${flyLabel(c.rig)}</td><td>${'★'.repeat(c.stars)}</td></tr>`,
  ).join('');
  $('catch-table').innerHTML = rows
    ? `<tr><th>When</th><th>Length</th><th>Species</th><th>Spot</th><th>Rig</th><th>Rating</th></tr>${rows}`
    : '<tr><td class="muted">No fish yet. The river is waiting.</td></tr>';
  $('logbook').hidden = false;
}

function togglePanel(id) {
  const el = $(id);
  const open = el.hidden;
  $('flybox').hidden = true;
  $('leaderbox').hidden = true;
  if (!open) return;
  if (id === 'flybox') rigUI.renderFlyBox(el);
  else rigUI.renderLeader(el);
  el.hidden = false;
}

function flyLabel(rig) {
  if (rig.name) return rig.name;
  const t = { dry: 'dry', nymph: 'nymph', drydropper: 'dry dropper' }[rig.fly];
  const s = { small: '#18', medium: '#14', large: '#10' }[rig.size];
  return `${t} ${s}`;
}

// --- Living river --------------------------------------------------------------------

function riseSize(fish) {
  return clamp((fish.length - 20) / 30, 0.15, 1.5);
}

function updateFishLife(dt) {
  const hatch = activeHatch(state.day, state.minute);
  const part = dayPart(state.data.water, state.minute).id;
  const light = world.light ?? 1;
  const cam = camera.position;
  const ctx = {
    time: world.time, minute: state.minute,
    sun: state.day.weather.id === 'sunny' ? clamp(light - 0.3, 0, 1) : 0.1,
  };
  const visCtx = { clarity: state.day.clarity.id, polarized: save.polarized === true, light: clamp(light * (state.day.weather.id === 'sunny' ? 1 : 0.8), 0.15, 1) };
  for (const f of fishes) {
    visCtx.distance = Math.hypot(f.pos.x - cam.x, f.pos.z - cam.z);
    f.vis = f.computeVisibility(visCtx);
    if (f.state !== 'landed') f.update(dt, ctx);

    // Natural rises: lots in a hatch, a few in the evening.
    if (f.state !== 'hold') continue;
    const influence = { flat: 1, seam: 0.9, bank: 0.8, pocket: 0.5, riffle: 0.5, run: 0.35 }[f.spot.type];
    let rate = 0;
    if (hatch) rate = (hatch.id === 'terrestrials' ? (f.spot.type === 'bank' || f.spot.type === 'seam' ? 0.9 : 0.25) : influence) / 9;
    else if (part === 'evening' || part === 'dusk') rate = influence / 60;
    rate *= f.length > 45 ? 0.6 : 1;
    if (rate > 0 && Math.random() < dt * rate) {
      f.rise((fish) => {
        const size = riseSize(fish);
        fx.riseWaves(fish.pos.x, fish.pos.z - 0.1, 0.45 + size * 0.6);
        if (size > 0.6 || hatch?.id === 'caddis') fx.splash(fish.pos.x, 0, fish.pos.z, Math.round(3 + size * 8), 0.25 + size * 0.25);
        const dist = Math.hypot(fish.pos.x - cam.x, fish.pos.z - cam.z);
        audio.rise(size, clamp(1.4 - dist / 25, 0.15, 1.2), clamp((fish.pos.x - cam.x) / 20, -0.8, 0.8));
        recentRises.push({ fish, t: world.time });
      });
    }
  }
  while (recentRises.length && world.time - recentRises[0].t > 5) recentRises.shift();
}

// --- Events -----------------------------------------------------------------------------

function bindEvents() {
  const canvas = $('view');
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe($('stage'));

  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    audio.start();
    if (state.phase === 'fight') {
      // In a fight, dragging sideways leans the rod for side pressure.
      fightDrag = { x: e.clientX };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      return;
    }
    down = { x: e.clientX, y: e.clientY, yaw, pitch, drag: false };
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (fightDrag && fight) {
      fight.dragSide = clamp((e.clientX - fightDrag.x) / 140, -1, 1);
      return;
    }
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.drag && Math.hypot(dx, dy) > 7) down.drag = true;
      if (down.drag) {
        dragging = true;
        yaw = down.yaw - (dx * 0.0045) / zoom;
        pitch = clamp(down.pitch - (dy * 0.003) / zoom, -0.85, 0.3);
      }
      return;
    }
    if (state.phase === 'idle' && e.pointerType === 'mouse') {
      const p = waterPointAt(e.clientX, e.clientY);
      const a = p && describeAim(p);
      fx.setHover(a && a.ok ? p : null);
      if (!state.aim) {
        $('aim-label').textContent = a ? a.text : '';
        $('aim-label').classList.toggle('show', !!a);
      }
    } else fx.setHover(null);
  });
  const up = (e) => {
    holding = false;
    $('reel').classList.remove('on');
    if (fightDrag) {
      fightDrag = null;
      if (fight) fight.dragSide = 0;
      return;
    }
    if (!down) return;
    const wasDrag = down.drag;
    down = null;
    dragging = false;
    if (wasDrag) return;
    if (state.phase === 'strike') return doStrike();
    if (state.phase !== 'idle' && state.phase !== 'drift') return;
    if (trySpot(e.clientX, e.clientY)) return;
    if (state.phase === 'idle') setAimAt(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { down = null; holding = false; });
  window.addEventListener('pointerup', () => { holding = false; $('reel').classList.remove('on'); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(zoomTarget * (1 - e.deltaY * 0.0015));
  }, { passive: false });
  $('btn-zoom').addEventListener('click', () => setZoom(zoomTarget > 1.05 ? 1 : 2.8));
  canvas.addEventListener('dblclick', () => { if (state.phase === 'idle' && state.aim) cast(); });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (state.phase === 'fight') { crank(); holding = true; if (fight) fight.autoCrankT = 0.35; $('reel').classList.add('on'); }
      else if (state.phase === 'strike') doStrike();
      else if (state.phase === 'idle' || state.phase === 'drift') cast();
    }
    if (state.phase === 'fight' && (e.code === 'ArrowUp' || e.code === 'KeyW')) { setDrag(1); e.preventDefault(); }
    if (state.phase === 'fight' && (e.code === 'ArrowDown' || e.code === 'KeyS')) { setDrag(-1); e.preventDefault(); }
    if (e.code === 'KeyM') mend();
    if (state.phase === 'fight') {
      if (e.code === 'KeyB' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { setBow(true); e.preventDefault(); }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') steerKeys = -1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') steerKeys = 1;
    } else {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') yaw += 0.06;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') yaw -= 0.06;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { holding = false; $('reel').classList.remove('on'); }
    if (e.code === 'KeyB' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') setBow(false);
    if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) steerKeys = 0;
  });

  $('strike').addEventListener('pointerdown', (e) => { e.stopPropagation(); doStrike(); });
  $('btn-cast').addEventListener('click', cast);
  $('btn-rest').addEventListener('click', () => {
    if (state.phase === 'drift') return mend();
    if (state.phase !== 'idle') return;
    audio.start();
    log('You sit on a warm stone and watch the water for a while.');
    advance(20);
  });
  $('btn-flybox').addEventListener('click', () => togglePanel('flybox'));
  $('btn-leader').addEventListener('click', () => togglePanel('leaderbox'));
  document.querySelectorAll('[data-hide]').forEach((b) => b.addEventListener('click', () => ($(b.dataset.hide).hidden = true)));
  const reel = $('reel');
  reel.addEventListener('pointerdown', (e) => { e.preventDefault(); crank(); holding = true; if (fight) fight.autoCrankT = 0.35; reel.classList.add('on'); });
  const bow = $('bow');
  bow.addEventListener('pointerdown', (e) => { e.preventDefault(); setBow(true); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) bow.addEventListener(ev, () => setBow(false));
  bow.addEventListener('contextmenu', (e) => e.preventDefault());
  reel.addEventListener('pointerup', () => { holding = false; reel.classList.remove('on'); });
  reel.addEventListener('pointerleave', () => { holding = false; reel.classList.remove('on'); });
  reel.addEventListener('contextmenu', (e) => e.preventDefault());
  $('drag-up').addEventListener('click', () => setDrag(1));
  $('drag-down').addEventListener('click', () => setDrag(-1));
  $('btn-start').addEventListener('click', () => {
    $('intro').hidden = true;
    state.phase = 'idle';
    audio.start();
    toast('Drag to look around. Tap the water where you want the fly to land, then Cast. Put on the polarized glasses (🕶) to see into the water, and tap fish or rises you spot for points.', 8000);
    log(`Day ${save.days}: ${state.day.weather.label.toLowerCase()}, ${state.day.clarity.label.toLowerCase()} water.`);
    updateHUD();
  });
  $('btn-release').addEventListener('click', release);
  $('btn-newday').addEventListener('click', () => {
    $('dayend').hidden = true;
    newDay();
  });
  $('btn-log').addEventListener('click', openLogbook);
  $('btn-guide').addEventListener('click', () => ($('guide').hidden = false));
  $('btn-sound').addEventListener('click', () => {
    audio.start();
    audio.setEnabled(!audio.enabled);
    save.sound = audio.enabled;
    persist();
    updateSoundButton();
  });
  $('btn-polar').addEventListener('click', () => {
    save.polarized = !save.polarized;
    persist();
    applyPolar();
    toast(save.polarized ? 'Polarized glasses on: the glare is gone and you can see into the water.' : 'Glasses off. The surface glare hides the fish.', 3500);
  });
  $('notes-toggle').addEventListener('click', () => $('notes-card').classList.toggle('collapsed'));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => (b.closest('.modal').hidden = true)));
  for (const id of ['logbook', 'guide']) $(id).addEventListener('click', (e) => { if (e.target.id === id) $(id).hidden = true; });
}

// --- Main loop --------------------------------------------------------------------------

let last = performance.now();
let timeScale = 1; // automated tests can speed the game up
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (let i = 0; i < timeScale; i++) step(dt);
  minimap.draw({ stand: state.stand, cam: camera.position, yaw, aim: state.aim, fish: fishes, walking: !!walk });
  renderer.render(world.scene, camera);
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(loop);
}

function step(dt) {
  if (walk) updateWalk(dt);
  applyCamera(dt);

  if (state.phase === 'drift' && drift) {
    updateDrift(dt);
    // Keep the drifting fly in view without taking the camera away from you.
    if (drift && !dragging) {
      const sp = drift.pos.clone().project(camera);
      if (Math.abs(sp.x) > 0.45) yaw -= Math.sign(sp.x) * (Math.abs(sp.x) - 0.45) * dt * 1.5;
    }
  }
  else if (state.phase === 'strike' && strike) updateStrike(dt);
  else if (state.phase === 'fight' && fight) {
    updateFight(dt);
    // Let the view follow the fish, unless you're looking around yourself.
    if (fight && !dragging) {
      const f = fight.fish.pos, c = camera.position;
      let target = Math.atan2(-(f.x - c.x), -(f.z - c.z)) - 0.12;
      while (target - yaw > Math.PI) target -= Math.PI * 2;
      while (target - yaw < -Math.PI) target += Math.PI * 2;
      yaw += (target - yaw) * Math.min(1, dt * 1.2);
      pitch += (-0.12 - pitch) * Math.min(1, dt * 1.2);
    }
  }

  if (['idle', 'drift', 'cast', 'fight', 'strike'].includes(state.phase)) {
    state.passive += dt;
    if (state.passive >= 5) {
      state.passive = 0;
      advance(1);
    }
  }

  world.update(dt);
  updateFishLife(dt);
  fx.aim.visible = !!state.aim && state.phase === 'idle';
  tackle.update(dt, state.phase === 'fight' && fight ? fight.fish.pos : drift ? drift.pos : state.aim);
  fx.update(dt, camera.position, {
    hatch: !!activeHatch(state.day, state.minute),
    rain: state.day.weather.id === 'drizzle',
    mist: state.minute < 500 ? clamp((500 - state.minute) / 100, 0, 1) : 0,
    minute: state.minute,
  });
}


// Hooks for automated play-testing.
window.__game = {
  state, save,
  get fishes() { return fishes; },
  get fight() { return fight; },
  get drift() { return drift; },
  screenOf: (x, y, z) => screenOf(new THREE.Vector3(x, y, z)),
  setView: (y, p) => { if (y !== undefined) yaw = y; if (p !== undefined) pitch = p; },
  nudge: (dy, p) => { yaw += dy; pitch = p; },
  debugCam: (x, y, z, yw, pt) => { camera.position.set(x, y, z); yaw = yw; pitch = pt; },
  setMinute: (m) => { state.minute = m; updateHUD(); },
  setRig: (patch) => setRig(patch, null),
  setTimeScale: (k) => { timeScale = k; },
  get tackle() { return tackle; },
  get world() { return world; },
  curRig: () => curRig(),
  walkTo: (id) => walkTo(state.data.river.stands.find((s) => s.id === id)),
  setHatch: (id) => { state.day.hatches = state.data.conditions.hatches.filter((h) => h.id === id); updateHUD(); },
  setWeather: (id) => { state.day.weather = state.data.conditions.weather.find((w) => w.id === id); updateHUD(); },
};

boot().catch((e) => {
  console.error(e);
  $('loading').textContent = 'Something went wrong loading the river. Try reloading the page.';
});
