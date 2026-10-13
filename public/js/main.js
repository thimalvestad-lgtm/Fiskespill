import { RiverRenderer } from './render.js';
import { Ambience } from './audio.js';
import {
  DAY_START, DAY_END, makeDay, dayPart, activeHatch, formatClock, takeChance,
  drawFish, catchPoints, rigStars, missHint, CALM_MISSES,
} from './sim.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SAVE_KEY = 'riverbend-save-v1';

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
];

// --- State --------------------------------------------------------------------

const save = loadSave();
const state = {
  data: null,
  day: null,
  minute: DAY_START,
  selected: null,
  rig: save.rig || { leader: '9', tippet: '5X', fly: 'drydropper', size: 'medium' },
  rigChanged: false,
  fresh: {},
  phase: 'intro', // intro | idle | walking | drift | strike | fight | card | dayend
  today: [],
  passive: 0,
};
const scene = { rises: [], splashes: [], angler: null, fly: null, selectedId: null, hoverId: null, minute: DAY_START, fresh: state.fresh };

let renderer, audio;

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

// --- Boot -----------------------------------------------------------------------

async function boot() {
  const [river, water, gear, conditions] = await Promise.all(
    ['river', 'water', 'gear', 'conditions'].map((f) => fetch(`data/${f}.json`).then((r) => r.json())),
  );
  state.data = { river, water, gear, conditions };
  for (const s of river.spots) state.fresh[s.id] = 1;

  renderer = new RiverRenderer($('river'), river);
  audio = new Ambience();
  audio.enabled = save.sound !== false;
  updateSoundButton();

  buildRigUI();
  bindEvents();
  newDay();
  requestAnimationFrame(loop);
}

function newDay() {
  const d = state.data;
  state.day = makeDay(d.conditions);
  state.minute = DAY_START;
  state.today = [];
  state.phase = 'intro';
  for (const k in state.fresh) state.fresh[k] = 1;
  save.days = (save.days || 0) + 1;
  persist();
  scene.rises.length = 0;

  $('intro-day').textContent = `Day ${save.days}`;
  const day = state.day;
  $('intro-conditions').innerHTML = `
    <div class="cond"><b>${day.weather.label}</b>${day.weather.note}</div>
    <div class="cond"><b>${day.clarity.label} water</b>${day.clarity.note}</div>`;
  $('intro').hidden = false;
  updateHUD();
}

// --- UI -----------------------------------------------------------------------

function buildRigUI() {
  const g = state.data.gear;
  const groups = [
    ['seg-leader', 'leader', g.leaders],
    ['seg-tippet', 'tippet', g.tippets],
    ['seg-fly', 'fly', g.flyTypes],
    ['seg-size', 'size', g.flySizes],
  ];
  for (const [el, key, items] of groups) {
    const box = $(el);
    box.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = key === 'tippet' ? it.id : key === 'size' ? it.label.split(' ')[0] : it.label;
      b.title = `${it.label}. ${it.note || ''}`;
      b.dataset.key = key;
      b.dataset.id = it.id;
      b.addEventListener('click', () => setRig(key, it.id, it));
      box.appendChild(b);
    }
  }
  refreshRigUI();
}

function setRig(key, id, item) {
  if (state.phase !== 'idle' && state.phase !== 'intro') return;
  if (state.rig[key] === id) return;
  state.rig[key] = id;
  state.rigChanged = true;
  save.rig = state.rig;
  persist();
  refreshRigUI();
  const label = key === 'size' ? `${item.label} ${state.rig.fly === 'nymph' ? 'nymph' : 'fly'}` : item.label;
  $('rig-note').textContent = `${label}: ${item.note || 'tied on.'}`;
}

function refreshRigUI() {
  document.querySelectorAll('.seg button').forEach((b) => {
    b.classList.toggle('on', state.rig[b.dataset.key] === b.dataset.id);
  });
}

function updateHUD() {
  const d = state.data;
  $('clock').textContent = `${formatClock(state.minute)} · ${dayPart(d.water, state.minute).label}`;
  $('weather').textContent = state.day.weather.label;
  $('clarity').textContent = `${state.day.clarity.label} water`;
  $('points').textContent = `${save.points.toLocaleString('en')} pts`;
  $('notes').textContent = riverNotes();
  $('btn-cast').disabled = !state.selected || state.phase !== 'idle';
  $('btn-rest').disabled = state.phase !== 'idle';
  scene.minute = state.minute;
  const hatch = activeHatch(state.day, state.minute);
  scene.hatch = !!hatch;
  scene.rain = state.day.weather.id === 'drizzle';
  scene.overcast = state.day.weather.id === 'overcast' ? 0.1 : state.day.weather.id === 'drizzle' ? 0.16 : 0;
  scene.mist = state.minute < 480 ? clamp((480 - state.minute) / 90, 0, 1) : 0;
  scene.wind = state.day.weather.id === 'sunny' ? 0.4 : 0.7;
  if (audio) {
    const sec = state.selected ? state.data.river.sections.find((s) => s.id === state.selected.section) : null;
    audio.set({
      part: dayPart(d.water, state.minute).id,
      rain: scene.rain,
      wind: scene.wind,
      riverLevel: sec ? sec.noise : 0.55,
      riverBright: sec ? sec.noise : 0.5,
    });
  }
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

function showSpot(spot) {
  const wt = state.data.water.types[spot.type];
  const sec = state.data.river.sections.find((s) => s.id === spot.section);
  $('spot-title').textContent = spot.name;
  const fresh = state.fresh[spot.id];
  const restNote = fresh < 0.5 ? '<p class="muted">You’ve disturbed this spot. The fish need a while to settle again.</p>' : '';
  $('spot-info').innerHTML = `
    <div class="tags">
      <span class="tag type">${wt.label}</span>
      <span class="tag">${sec.label}</span>
      <span class="tag">Depth ${spot.depth}</span>
      <span class="tag">${spot.current}</span>
    </div>
    <p>${spot.description}</p>${restNote}`;
}

let toastTimer;
function toast(text, ms = 3800) {
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
  while (ol.children.length > 6) ol.lastChild.remove();
}

function updateSoundButton() {
  const b = $('btn-sound');
  b.classList.toggle('off', !audio.enabled);
  b.innerHTML = audio.enabled ? '&#128264;' : '&#128263;';
}

// --- Time ----------------------------------------------------------------------

function advance(minutes) {
  const before = state.minute;
  const hatchBefore = activeHatch(state.day, before);
  state.minute = Math.min(DAY_END, state.minute + minutes);
  for (const k in state.fresh) state.fresh[k] = Math.min(1, state.fresh[k] + 0.008 * minutes);
  const hatchAfter = activeHatch(state.day, state.minute);
  if (hatchAfter && hatchAfter !== hatchBefore) {
    log(`Something is happening on the water: ${hatchAfter.label.toLowerCase()}.`);
    toast(hatchAfter.signs, 6500);
  } else if (!hatchAfter && hatchBefore) {
    log('The hatch fades and the surface goes quiet.');
  }
  updateHUD();
  if (state.selected) showSpot(state.selected);
  if (state.minute >= DAY_END && (state.phase === 'idle' || state.phase === 'walking')) endDay();
}

function endDay() {
  state.phase = 'dayend';
  const n = state.today.length;
  const pts = state.today.reduce((s, c) => s + c.points, 0);
  const best = state.today.reduce((b, c) => (!b || c.length > b.length ? c : b), null);
  $('dayend-text').textContent = n
    ? `You landed ${n} trout today, for ${pts} points. The biggest was a ${best.length} cm ${best.species === 'rainbow' ? 'rainbow' : 'brown'} from the ${best.spotName.toLowerCase()}.`
    : 'No fish today. Some days the river just keeps its secrets. Tomorrow will be different.';
  $('dayend-list').innerHTML = state.today
    .map((c) => `<li>${c.time}: ${c.length} cm ${c.species} trout, ${c.spotName}</li>`)
    .join('');
  $('dayend').hidden = false;
}

// --- Spot selection & walking ----------------------------------------------------

function selectSpot(spot) {
  if (state.phase !== 'idle') return;
  if (state.selected && state.selected.id === spot.id) return;
  const first = !state.selected;
  state.selected = spot;
  scene.selectedId = spot.id;
  scene.fly = null;
  const target = renderer.standFor(spot);
  showSpot(spot);
  if (first) {
    scene.angler = target;
    updateHUD();
    return;
  }
  state.phase = 'walking';
  const from = { ...scene.angler };
  const dist = Math.hypot(target.x - from.x, target.y - from.y);
  const dur = clamp(dist / 140, 0.6, 2.5);
  let t = 0;
  walkAnim = (dt) => {
    t += dt;
    const k = Math.min(1, t / dur);
    const e = k * k * (3 - 2 * k);
    scene.angler = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
    if (k >= 1) {
      walkAnim = null;
      state.phase = 'idle';
      advance(Math.round(4 + dist / 60));
    }
  };
  updateHUD();
}
let walkAnim = null;

// --- Casting -----------------------------------------------------------------------

let drift = null;

function cast() {
  if (state.phase !== 'idle' || !state.selected) return;
  audio.start();
  const spot = state.selected;
  const ctx = { water: state.data.water, day: state.day, minute: state.minute };
  const res = takeChance(spot, state.rig, ctx, state.fresh[spot.id]);
  const take = Math.random() < res.p;
  const sec = state.data.river.sections.find((s) => s.id === spot.section);
  const dur = clamp(3.2 / (sec.speed + 0.25), 3, 8);
  const lat = rand(-8, 8);
  drift = {
    spot, res, take, dur,
    t: -0.7, // line in the air first
    takeAt: rand(0.35, 0.7) * dur,
    from: { x: spot.x + lat, y: spot.y - 55 },
    to: { x: spot.x + lat * 0.6, y: spot.y + 32 },
    landed: false,
  };
  if (state.rigChanged) {
    advance(3);
    log('You retie your rig.');
    state.rigChanged = false;
  }
  state.phase = 'drift';
  // On phones the river can be scrolled out of view; bring it back for the drift.
  const stageTop = $('stage').getBoundingClientRect().top;
  if (stageTop < -40) $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  scene.fly = { x: scene.angler.x, y: scene.angler.y, visible: true, kind: state.rig.fly, gone: false, dip: 0 };
  audio.cast();
  updateHUD();
}

function updateDrift(dt) {
  const d = drift;
  d.t += dt;
  if (d.t < 0) {
    // Line unrolling through the air.
    const k = (d.t + 0.7) / 0.7;
    scene.fly.x = scene.angler.x + (d.from.x - scene.angler.x) * k;
    scene.fly.y = scene.angler.y + (d.from.y - scene.angler.y) * k - Math.sin(k * Math.PI) * 30;
    return;
  }
  if (!d.landed) {
    d.landed = true;
    audio.plop();
    const ev = d.res.ev;
    // A short leader on spooky water: the fish see the line land.
    if (ev.factors.leader < 0.5 && state.data.water.types[d.spot.type].spookiness > 0.5 && Math.random() < 0.5) {
      scene.splashes.push({ x: d.spot.x + rand(-10, 10), y: d.spot.y + rand(-5, 15), age: 0, life: 0.6, size: 0.5 });
    }
  }
  const k = Math.min(1, d.t / d.dur);
  scene.fly.x = d.from.x + (d.to.x - d.from.x) * k + Math.sin(d.t * 2) * 1.2;
  scene.fly.y = d.from.y + (d.to.y - d.from.y) * k;

  if (d.take && d.t >= d.takeAt) {
    startStrike();
    return;
  }
  if (k >= 1) {
    drift = null;
    scene.fly = null;
    const spot = d.spot;
    const wt = state.data.water.types[spot.type];
    state.fresh[spot.id] = Math.max(0, state.fresh[spot.id] - (0.035 + 0.12 * (1 - d.res.ev.factors.leader) * wt.spookiness));
    const hint = missHint(spot, state.rig, d.res.ev);
    const msg = hint && Math.random() < 0.75 ? hint : pick(CALM_MISSES);
    log(msg);
    toast(msg);
    state.phase = 'idle';
    advance(6);
  }
}

// --- Strike ------------------------------------------------------------------------------

let strike = null;
function startStrike() {
  const d = drift;
  state.phase = 'strike';
  const surface = state.rig.fly === 'dry';
  if (surface) {
    scene.fly.gone = true;
    scene.rises.push({ x: scene.fly.x, y: scene.fly.y, age: 0, life: 1.4, size: 10, drift: 0 });
    scene.splashes.push({ x: scene.fly.x, y: scene.fly.y, age: 0, life: 0.5, size: 0.6 });
    audio.splash(0.4);
  } else if (state.rig.fly === 'drydropper') {
    scene.fly.dip = 3;
    scene.fly.gone = true;
    scene.rises.push({ x: scene.fly.x, y: scene.fly.y, age: 0, life: 1, size: 5, drift: 0 });
    audio.plop();
  } else {
    scene.fly.dip = 4;
    audio.plop();
  }
  strike = { t: 0, window: surface ? 1.7 : 1.4 };
  $('strike').hidden = false;
  $('strike').focus({ preventScroll: true });
  log(surface ? 'A nose breaks the surface and your fly is gone!' : 'The indicator twitches and stops!');
}

function updateStrike(dt) {
  strike.t += dt;
  if (scene.fly) scene.fly.dip = Math.max(0, (scene.fly.dip || 0) - dt * 2);
  if (strike.t > strike.window) {
    $('strike').hidden = true;
    const spot = drift.spot;
    state.fresh[spot.id] = Math.max(0, state.fresh[spot.id] - 0.15);
    drift = null;
    strike = null;
    scene.fly = null;
    const msg = 'Too slow. The trout felt the fly and let go.';
    log(msg);
    toast(msg);
    state.phase = 'idle';
    advance(5);
  }
}

function doStrike() {
  if (state.phase !== 'strike') return;
  $('strike').hidden = true;
  audio.start();
  const d = drift;
  strike = null;
  if (Math.random() < 0.1) {
    drift = null;
    scene.fly = null;
    const msg = 'You lift into it, but the hook doesn’t find a hold.';
    log(msg);
    toast(msg);
    state.fresh[d.spot.id] = Math.max(0, state.fresh[d.spot.id] - 0.15);
    state.phase = 'idle';
    advance(5);
    return;
  }
  const part = dayPart(state.data.water, state.minute).id;
  const fish = drawFish(d.spot, d.res.ev.match, part);
  startFight(d, fish);
}

// --- Fight --------------------------------------------------------------------------------

let fight = null;
let holding = false;

function startFight(d, fish) {
  state.phase = 'fight';
  const tip = state.data.gear.tippets.find((t) => t.id === state.rig.tippet);
  const kg = fish.weightG / 1000;
  fight = {
    d, fish, kg,
    strength: tip.strengthKg,
    stamina: 1,
    running: false,
    runLeft: 0,
    tension: 0,
    over: 0,
    snag: 0,
    progress: 0.08,
    clickT: 0,
    pos: { x: scene.fly.x, y: scene.fly.y },
    wob: 0,
  };
  scene.fly.gone = true;
  scene.fly.tight = true;
  $('fight').hidden = false;
  $('fight-title').textContent = kg > 1.2 ? 'Fish on! It feels heavy...' : 'Fish on!';
  audio.splash(Math.min(1.4, 0.4 + kg));
  scene.splashes.push({ x: fight.pos.x, y: fight.pos.y, age: 0, life: 0.7, size: 0.6 + kg * 0.4 });
  // Big fish run immediately.
  if (kg > 0.8) startRun();
}

function startRun() {
  fight.running = true;
  fight.runLeft = rand(0.8, 1.6 + fight.kg * 0.6);
  if (!holding) audio.scream();
  $('fight-title').textContent = 'It’s running!';
}

function updateFight(dt) {
  const f = fight;
  // Runs come less often as the fish tires.
  if (!f.running && Math.random() < dt * (0.15 + 0.35 * f.stamina) * Math.min(1.5, 0.5 + f.kg)) startRun();
  if (f.running) {
    f.runLeft -= dt;
    if (f.runLeft <= 0) {
      f.running = false;
      $('fight-title').textContent = f.stamina < 0.3 ? 'It’s tiring...' : 'Fish on!';
    }
  }
  const pull = f.kg * 0.9 * (f.running ? 1.9 : 1) * (0.4 + 0.6 * f.stamina);
  const target = holding ? pull + 0.3 : Math.min(pull * 0.6, f.strength * 0.45);
  f.tension += (target / f.strength - f.tension) * Math.min(1, dt * 7);

  if (holding) f.progress += dt * (f.running ? -0.01 : 0.08 + 0.09 * (1 - f.stamina));
  else f.progress -= dt * (f.running ? 0.06 : 0);
  f.progress = clamp(f.progress, 0, 1);

  const drain = (0.06 + (f.running ? 0.05 : 0) + (holding ? 0.04 : 0)) / (0.6 + f.kg * 0.5);
  f.stamina = Math.max(0, f.stamina - dt * drain);

  // Too much tension for too long breaks the tippet.
  if (f.tension > 0.88) f.over += dt;
  else f.over = Math.max(0, f.over - dt * 1.5);
  // In rocky water, a running fish given free line heads for the rocks.
  const snagRisk = f.d.spot.snag;
  if (f.running && !holding && snagRisk > 0.3) f.snag += dt * snagRisk * 0.9;
  else f.snag = Math.max(0, f.snag - dt * 0.4);

  // Reel clicks and the screaming reel.
  f.clickT -= dt;
  if (f.clickT <= 0) {
    if (holding && !f.running) { audio.click(); f.clickT = 0.09; }
    else if (f.running && !holding) { audio.scream(); f.clickT = 0.35; }
    else f.clickT = 0.1;
  }

  // Move the fish between where it was hooked and the angler.
  f.wob += dt * (f.running ? 6 : 2.5);
  const a = scene.angler;
  const home = f.d.spot;
  const k = f.progress;
  f.pos.x = home.x + (a.x - home.x) * k * 0.85 + Math.sin(f.wob) * (6 + 10 * f.stamina) * (1 - k * 0.6);
  f.pos.y = home.y + (a.y - home.y) * k * 0.85 + Math.cos(f.wob * 0.7) * 5;
  scene.fly.x = f.pos.x;
  scene.fly.y = f.pos.y;
  if (f.running && Math.random() < dt * 2.5) {
    scene.splashes.push({ x: f.pos.x, y: f.pos.y, age: 0, life: 0.5, size: 0.4 + f.kg * 0.3 });
    if (Math.random() < 0.4) audio.splash(0.3);
  }

  $('tension').style.width = `${clamp(f.tension, 0, 1.1) / 1.1 * 100}%`;
  $('progress').style.width = `${f.progress * 100}%`;

  if (f.over > 0.4) return endFight('snap');
  if (f.snag > 1.5) return endFight('snag');
  if (f.progress >= 1) return endFight('landed');
}

function endFight(outcome) {
  const f = fight;
  fight = null;
  holding = false;
  $('fight').hidden = true;
  const spot = f.d.spot;
  scene.fly = null;
  drift = null;
  if (outcome === 'landed') {
    state.fresh[spot.id] = Math.max(0, state.fresh[spot.id] - 0.3);
    landed(f);
    return;
  }
  audio.snap();
  state.fresh[spot.id] = Math.max(0, state.fresh[spot.id] - 0.35);
  const size = f.kg > 1.4 ? 'a big fish' : 'the fish';
  const msg = outcome === 'snap'
    ? `Snap! The ${state.rig.tippet} tippet couldn’t take the strain, and ${size} is gone. Ease off when it runs.`
    : `The fish bored under a rock and the line went solid. Gone. In snaggy water, you need a tippet strong enough to hold it out of the rocks.`;
  log(msg);
  toast(msg, 5500);
  state.phase = 'idle';
  advance(6);
}

// --- Landing & rewards ----------------------------------------------------------------

function landed(f) {
  const fish = f.fish;
  const ev = f.d.res.ev;
  const pts = catchPoints(fish, ev.match);
  const stars = rigStars(ev.match);
  const spot = f.d.spot;
  const rec = {
    length: fish.length,
    weightG: fish.weightG,
    species: fish.species,
    spotId: spot.id,
    spotName: spot.name,
    section: spot.section,
    rig: { ...state.rig },
    stars,
    points: pts,
    time: formatClock(state.minute),
    day: save.days,
  };
  save.points += pts;
  save.catches.unshift(rec);
  save.catches = save.catches.slice(0, 60);
  if (!save.best || fish.length > save.best.length) save.best = rec;
  state.today.push(rec);

  const newAch = checkAchievements(rec, ev);
  persist();

  state.phase = 'card';
  audio.chime();
  $('catch-eyebrow').textContent = `${fish.species === 'rainbow' ? 'Rainbow trout' : 'Brown trout'}${fish.trophy ? ' · a real trophy' : ''}`;
  $('catch-len').textContent = fish.length;
  $('catch-wt').textContent = fish.weightG.toLocaleString('en');
  $('catch-pts').textContent = pts;
  $('catch-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('catch-note').textContent = catchNote(stars, fish);
  const ach = $('catch-ach');
  if (newAch.length) {
    ach.hidden = false;
    ach.textContent = `Achievement: ${newAch.map((a) => a.name).join(', ')}`;
  } else ach.hidden = true;
  drawTrout($('fish-canvas'), fish);
  $('catch').hidden = false;
  log(`Landed a ${fish.length} cm ${fish.species} trout (+${pts} pts).`);
  updateHUD();
}

function catchNote(stars, fish) {
  if (stars === 3) return fish.trophy ? 'Perfect setup, and the river rewarded you with one of its oldest fish.' : 'Perfect setup for this water and this moment. Bonus points.';
  if (stars === 2) return 'A good rig for this water. A few tweaks might bring bigger fish.';
  if (stars === 1) return 'You got one, but the rig wasn’t really suited to this water. Better choices bring bigger fish, more often.';
  return 'A lucky fish! This rig was badly matched to the water.';
}

function checkAchievements(rec, ev) {
  const got = [];
  const give = (id) => {
    if (save.ach[id]) return;
    save.ach[id] = rec.day;
    got.push(ACHIEVEMENTS.find((a) => a.id === id));
  };
  give('first');
  if (rec.length >= 40) give('forty');
  if (rec.length >= 50) give('fifty');
  if (rec.length >= 60) give('sixty');
  if (rec.species === 'rainbow') give('rainbow');
  if (rec.stars === 3) give('perfect');
  if (ev.hatch && rec.rig.fly === 'dry' && rec.rig.size === ev.hatch.size) give('hatch');
  const spot = state.data.river.spots.find((s) => s.id === rec.spotId);
  if (spot.type === 'flat' && ['12', '15'].includes(rec.rig.leader) && rec.rig.tippet === '6X') give('flat');
  if (spot.type === 'pocket' && rec.length >= 40) give('pocket');
  const secs = new Set(state.today.map((c) => c.section));
  if (secs.size >= 3) give('sections');
  if (dayPart(state.data.water, state.minute).id === 'dusk') give('dusk');
  if (state.today.length >= 10) give('ten');
  return got;
}

// --- Fish illustration ------------------------------------------------------------------

function drawTrout(canvas, fish) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const brown = fish.species === 'brown';
  const len = W * 0.82;
  const x0 = (W - len) / 2, cy = H / 2 + 6;
  const depth = len * (brown ? 0.21 : 0.22) * (fish.length > 50 ? 1.08 : 1);
  const seed = fish.length * 13 + fish.weightG;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  const body = new Path2D();
  body.moveTo(x0, cy);
  body.bezierCurveTo(x0 + len * 0.1, cy - depth * 0.62, x0 + len * 0.45, cy - depth * 0.62, x0 + len * 0.82, cy - depth * 0.18);
  body.lineTo(x0 + len * 0.86, cy - depth * 0.12);
  body.lineTo(x0 + len * 0.86, cy + depth * 0.12);
  body.lineTo(x0 + len * 0.82, cy + depth * 0.18);
  body.bezierCurveTo(x0 + len * 0.45, cy + depth * 0.55, x0 + len * 0.12, cy + depth * 0.5, x0, cy);
  body.closePath();

  // Tail.
  ctx.fillStyle = brown ? '#7a6436' : '#6f7a62';
  ctx.beginPath();
  ctx.moveTo(x0 + len * 0.85, cy);
  ctx.quadraticCurveTo(x0 + len * 0.95, cy - depth * 0.55, x0 + len, cy - depth * 0.6);
  ctx.quadraticCurveTo(x0 + len * 0.96, cy, x0 + len, cy + depth * 0.6);
  ctx.quadraticCurveTo(x0 + len * 0.95, cy + depth * 0.55, x0 + len * 0.85, cy);
  ctx.fill();
  // Fins.
  const fin = (x, y, w, h) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w * 0.3, y + h, x + w, y + h * 0.9);
    ctx.quadraticCurveTo(x + w * 0.7, y, x, y);
    ctx.fill();
  };
  ctx.fillStyle = brown ? '#8a7442' : '#7e8670';
  fin(x0 + len * 0.36, cy - depth * 0.48, len * 0.12, -depth * 0.35);
  fin(x0 + len * 0.66, cy - depth * 0.33, len * 0.05, -depth * 0.18);
  ctx.fillStyle = brown ? '#c9a56a' : '#d9c8c0';
  fin(x0 + len * 0.22, cy + depth * 0.32, len * 0.08, depth * 0.25);
  fin(x0 + len * 0.45, cy + depth * 0.4, len * 0.07, depth * 0.22);
  fin(x0 + len * 0.62, cy + depth * 0.3, len * 0.07, depth * 0.2);

  // Body colours.
  const g = ctx.createLinearGradient(0, cy - depth * 0.6, 0, cy + depth * 0.55);
  if (brown) {
    g.addColorStop(0, '#4d3f22');
    g.addColorStop(0.35, '#9a7a3c');
    g.addColorStop(0.65, '#d4b064');
    g.addColorStop(1, '#f1e4b8');
  } else {
    g.addColorStop(0, '#3f5238');
    g.addColorStop(0.35, '#8e9a80');
    g.addColorStop(0.55, '#d7dad0');
    g.addColorStop(1, '#f4f2ea');
  }
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  if (!brown) {
    // Pink lateral band.
    const band = ctx.createLinearGradient(0, cy - depth * 0.12, 0, cy + depth * 0.18);
    band.addColorStop(0, 'rgba(214,120,140,0)');
    band.addColorStop(0.5, 'rgba(214,120,140,0.75)');
    band.addColorStop(1, 'rgba(214,120,140,0)');
    ctx.fillStyle = band;
    ctx.fillRect(x0, cy - depth * 0.15, len, depth * 0.35);
  }
  // Spots.
  const n = brown ? 70 : 110;
  for (let i = 0; i < n; i++) {
    const px = x0 + len * (0.12 + r() * 0.72);
    const py = cy - depth * 0.5 + r() * depth * (brown ? 0.75 : 0.6);
    if (brown) {
      const red = r() < 0.28 && py > cy - depth * 0.15;
      if (red) {
        ctx.fillStyle = 'rgba(245,235,215,0.8)';
        ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill();
        ctx.fillStyle = '#b8402f';
      } else ctx.fillStyle = 'rgba(40,28,15,0.85)';
      ctx.beginPath(); ctx.arc(px, py, red ? 3.6 : 2.4 + r() * 2.4, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(30,35,25,0.8)';
      ctx.beginPath(); ctx.arc(px, py, 1.2 + r() * 1.6, 0, 7); ctx.fill();
    }
  }
  // Soft highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(x0 + len * 0.4, cy - depth * 0.25, len * 0.3, depth * 0.08, -0.04, 0, 7);
  ctx.fill();
  ctx.restore();
  // Gill and eye.
  ctx.strokeStyle = 'rgba(40,30,20,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0 + len * 0.1, cy, depth * 0.33, -0.9, 0.9);
  ctx.stroke();
  ctx.fillStyle = '#f1e3b5';
  ctx.beginPath(); ctx.arc(x0 + len * 0.045, cy - depth * 0.1, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#1b1712';
  ctx.beginPath(); ctx.arc(x0 + len * 0.046, cy - depth * 0.1, 3.4, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,20,0.5)';
  ctx.beginPath();
  ctx.moveTo(x0 + 2, cy + 2);
  ctx.lineTo(x0 + len * 0.06, cy + depth * 0.08);
  ctx.stroke();
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
    <div><b>${save.days}</b><span>days on the river</span></div>`;
  $('ach-grid').innerHTML = ACHIEVEMENTS.map(
    (a) => `<div class="ach ${save.ach[a.id] ? 'got' : ''}"><b>${save.ach[a.id] ? '★ ' : ''}${a.name}</b>${a.desc}</div>`,
  ).join('');
  const rows = save.catches.slice(0, 25).map((c) =>
    `<tr><td>Day ${c.day} ${c.time}</td><td>${c.length} cm</td><td>${c.species}</td><td>${c.spotName}</td><td>${c.rig.leader} ft · ${c.rig.tippet} · ${flyLabel(c.rig)}</td><td>${'★'.repeat(c.stars)}</td></tr>`,
  ).join('');
  $('catch-table').innerHTML = rows
    ? `<tr><th>When</th><th>Length</th><th>Species</th><th>Spot</th><th>Rig</th><th>Rig</th></tr>${rows}`
    : '<tr><td class="muted">No fish yet. The river is waiting.</td></tr>';
  $('logbook').hidden = false;
}

function flyLabel(rig) {
  const t = { dry: 'dry', nymph: 'nymph', drydropper: 'dry dropper' }[rig.fly];
  const s = { small: '#18', medium: '#14', large: '#10' }[rig.size];
  return `${t} ${s}`;
}

// --- Ambient life ------------------------------------------------------------------------

function updateLife(dt) {
  for (const r of scene.rises) r.age += dt;
  for (const s of scene.splashes) s.age += dt;
  scene.rises = scene.rises.filter((r) => r.age < r.life);
  scene.splashes = scene.splashes.filter((s) => s.age < s.life);

  const hatch = activeHatch(state.day, state.minute);
  const part = dayPart(state.data.water, state.minute).id;
  const rate = hatch ? 1.4 : part === 'dusk' || part === 'evening' ? 0.12 : 0.04;
  if (Math.random() < dt * rate) {
    const spots = state.data.river.spots.filter((s) =>
      hatch ? (hatch.id === 'terrestrials' ? ['bank', 'seam', 'flat'] : ['flat', 'seam', 'bank', 'riffle']).includes(s.type) : s.type === 'flat' || s.type === 'seam');
    const s = pick(spots);
    const big = Math.random() < 0.2;
    scene.rises.push({ x: s.x + rand(-28, 28), y: s.y + rand(-22, 22), age: 0, life: rand(1.8, 3), size: big ? 18 : 11, drift: s.section === 'flat' ? 0.5 : 2 });
  }

  // The clock ticks slowly while you're idle: one minute every five seconds.
  if (state.phase === 'idle') {
    state.passive += dt;
    if (state.passive >= 5) {
      state.passive = 0;
      advance(1);
    }
  }
}

// --- Events -----------------------------------------------------------------------------

function bindEvents() {
  const canvas = $('river');
  window.addEventListener('resize', () => renderer.resize());
  new ResizeObserver(() => renderer.resize()).observe($('stage'));

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const s = renderer.spotAt(e.clientX - r.left, e.clientY - r.top);
    scene.hoverId = s ? s.id : null;
    canvas.style.cursor = s && state.phase === 'idle' ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => (scene.hoverId = null));
  canvas.addEventListener('click', (e) => {
    if (state.phase !== 'idle') return;
    audio.start();
    const r = canvas.getBoundingClientRect();
    const s = renderer.spotAt(e.clientX - r.left, e.clientY - r.top);
    if (s) selectSpot(s);
  });

  // Reeling: hold anywhere on the river, or Space.
  const stage = $('stage');
  stage.addEventListener('pointerdown', (e) => {
    if (state.phase === 'fight') { holding = true; e.preventDefault(); }
  });
  window.addEventListener('pointerup', () => (holding = false));
  window.addEventListener('pointercancel', () => (holding = false));
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (state.phase === 'fight' && e.code === 'Space') { holding = true; e.preventDefault(); }
    else if (state.phase === 'strike') { doStrike(); e.preventDefault(); }
    else if (state.phase === 'idle' && e.code === 'Space' && document.activeElement === document.body) { cast(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') holding = false; });

  $('strike').addEventListener('pointerdown', (e) => { e.stopPropagation(); doStrike(); });
  $('btn-cast').addEventListener('click', cast);
  $('btn-rest').addEventListener('click', () => {
    if (state.phase !== 'idle') return;
    audio.start();
    log('You sit on a warm stone and watch the water for a while.');
    advance(20);
  });
  $('btn-start').addEventListener('click', () => {
    $('intro').hidden = true;
    state.phase = 'idle';
    audio.start();
    if (!state.selected) toast('Tap a ring on the river to choose where to fish.', 5000);
    log(`Day ${save.days}: ${state.day.weather.label.toLowerCase()}, ${state.day.clarity.label.toLowerCase()} water.`);
    updateHUD();
  });
  $('btn-release').addEventListener('click', () => {
    $('catch').hidden = true;
    const spot = state.selected;
    scene.splashes.push({ x: spot.x, y: spot.y + 20, age: 0, life: 0.6, size: 0.4 });
    audio.splash(0.3);
    state.phase = 'idle';
    advance(10);
  });
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
  document.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => (b.closest('.modal').hidden = true)));
  for (const id of ['logbook', 'guide']) {
    $(id).addEventListener('click', (e) => { if (e.target.id === id) $(id).hidden = true; });
  }
}

// --- Main loop --------------------------------------------------------------------------

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (walkAnim) walkAnim(dt);
  if (state.phase === 'drift' && drift) updateDrift(dt);
  else if (state.phase === 'strike' && strike) updateStrike(dt);
  else if (state.phase === 'fight' && fight) updateFight(dt);
  updateLife(dt);
  scene.hideSpots = state.phase === 'fight' || state.phase === 'drift' || state.phase === 'strike';
  renderer.draw(dt, scene);
  requestAnimationFrame(loop);
}

boot();
