// The angler's rig: tapered leader + tippet + fly, and the fly box and leader
// builder panels that edit it.
import { flySVG } from './flies.js';
import { effectiveDepth } from './sim.js';

const TIPPET_ORDER = ['3X', '4X', '5X', '6X'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const DEFAULT_RIG = { rodId: 'clearwater', reelId: 'battenkill', lineId: 'hydros', leaderId: '9-4X', tippetSize: '5X', tippetFt: 2, flyId: 'dd-medium', indicatorFt: 4, dropperFt: 1.5 };

export function normalizeRig(saved, gear) {
  const r = { ...DEFAULT_RIG, ...(saved && saved.leaderId ? saved : {}) };
  if (!gear.leaders.some((l) => l.id === r.leaderId)) r.leaderId = DEFAULT_RIG.leaderId;
  if (!gear.flies.some((f) => f.id === r.flyId)) r.flyId = DEFAULT_RIG.flyId;
  for (const [k, list] of [['rodId', gear.rods], ['reelId', gear.reels], ['lineId', gear.lines]]) {
    if (!list.some((x) => x.id === r[k])) r[k] = DEFAULT_RIG[k];
  }
  return r;
}

export function allGear(gear) {
  return [...gear.rods.map((x) => ({ ...x, kind: 'rod' })), ...gear.reels.map((x) => ({ ...x, kind: 'reel' })),
    ...gear.lines.map((x) => ({ ...x, kind: 'line' })), ...gear.flies.map((x) => ({ ...x, kind: 'fly' }))];
}

// Shop items you didn't own and couldn't afford before, but can now.
export function newlyAffordable(gear, owned, before, after) {
  return allGear(gear).filter((x) => x.price > before && x.price <= after && !owned.includes(`${x.kind}:${x.id}`));
}

export function rigInfo(rig, gear) {
  const taper = gear.leaders.find((l) => l.id === rig.leaderId);
  const fly = gear.flies.find((f) => f.id === rig.flyId);
  const tipSize = rig.tippetSize || taper.tip;
  const tippet = gear.tippets.find((t) => t.id === tipSize);
  const leaderFt = taper.feet + (rig.tippetSize ? rig.tippetFt : 0);
  // Tippet thicker than the leader's tip won't turn over.
  const turnover = !rig.tippetSize || TIPPET_ORDER.indexOf(rig.tippetSize) >= TIPPET_ORDER.indexOf(taper.tip);
  const rod = gear.rods.find((x) => x.id === rig.rodId);
  const reel = gear.reels.find((x) => x.id === rig.reelId);
  const line = gear.lines.find((x) => x.id === rig.lineId);
  return { taper, fly, tippet, tipSize, leaderFt, turnover, rod, reel, line };
}

// The shape the rules in sim.js expect.
export function simRig(rig, gear, speed = 0.6) {
  const info = rigInfo(rig, gear);
  const r = {
    leader: info.leaderFt,
    tippet: info.tipSize,
    fly: info.fly.type,
    size: info.fly.size,
    turnover: info.turnover,
    indicatorFt: rig.indicatorFt,
    dropperFt: rig.dropperFt,
    bonus: info.fly.bonus,
    sinkMul: info.fly.sink,
  };
  // A powerful line turns over a heavy rig that would otherwise collapse.
  if (!r.turnover && info.line.turnover >= 1.3) r.turnover = true;
  if (r.fly !== 'dry') r.depthM = effectiveDepth(r, speed);
  return r;
}

export function rigSummary(rig, gear) {
  const i = rigInfo(rig, gear);
  return { fly: `${i.fly.name} ${i.fly.hook}`, leader: `${i.rod.brand} #${i.rod.weight} · ${i.leaderFt % 1 ? i.leaderFt.toFixed(1) : i.leaderFt} ft ${i.tipSize}` };
}

export class RigUI {
  constructor(gear, { getRig, setRig, lieContext, getPoints, owns, buy }) {
    this.gear = gear;
    this.getPoints = getPoints;
    this.owns = owns;
    this.buy = buy;
    this.tab = 'leader';
    this.getRig = getRig;
    this.setRig = setRig;
    this.lieContext = lieContext;
  }

  // --- Fly box -------------------------------------------------------------

  renderFlyBox(el) {
    const rig = this.getRig();
    const groups = this.gear.flyTypes.map((t) => {
      const flies = this.gear.flies.filter((f) => f.type === t.id);
      return `<div class="compartment">
        <div class="comp-head"><b>${t.label}</b><span>${t.note}</span></div>
        <div class="foam">${flies.map((f) => {
          const open = this.owns('fly', f);
          const afford = !open && f.price <= this.getPoints();
          return `
          <button class="fly ${f.id === rig.flyId ? 'on' : ''} ${open ? '' : 'locked'} ${afford ? 'affordable' : ''}" ${open ? `data-fly="${f.id}"` : afford ? `data-buyfly="${f.id}"` : 'disabled'} title="${f.name} ${f.hook}: ${f.note}">
            ${flySVG(f)}
            <span class="fly-name">${f.name}</span><span class="fly-hook">${open ? f.hook : afford ? `Buy \u00B7 ${f.price} pts` : `\u{1F512} ${f.price} pts`}</span>
          </button>`;
        }).join('')}
        </div>
      </div>`;
    }).join('');
    const sel = this.gear.flies.find((f) => f.id === rig.flyId);
    el.querySelector('.box-inner').innerHTML = `<details class="learn"><summary>New to fly fishing? What these flies mean</summary><p>${this.gear.help.flies}</p></details>` + groups;
    el.querySelector('.box-note').innerHTML = `<b>${sel.name} ${sel.hook}</b> ${sel.note}<br><span class="use"><b>When to use:</b> ${sel.use}</span>`;
    el.querySelectorAll('[data-buyfly]').forEach((b) => b.addEventListener('click', () => {
      const f = this.gear.flies.find((x) => x.id === b.dataset.buyfly);
      if (this.buy('fly', f)) this.setRig({ flyId: f.id }, `Bought and tied on a ${f.name}.`);
      this.renderFlyBox(el);
    }));
    el.querySelectorAll('[data-fly]').forEach((b) => b.addEventListener('click', () => {
      this.setRig({ flyId: b.dataset.fly }, `Tied on a ${this.gear.flies.find((f) => f.id === b.dataset.fly).name}.`);
      this.renderFlyBox(el);
    }));
  }

  // --- Leader builder --------------------------------------------------------

  renderLeader(el) {
    const tabs = [['rod', 'Rod'], ['reel', 'Reel'], ['line', 'Line'], ['leader', 'Leader']];
    el.querySelector('.rig-tabs').innerHTML = tabs.map(([id, label]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('');
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderLeader(el); }));
    if (this.tab !== 'leader') return this.renderGear(el, this.tab);
    const rig = this.getRig();
    const g = this.gear;
    const info = rigInfo(rig, g);
    const type = info.fly.type;
    const chips = (items, cur, attr) => items.map((it) => `<button class="chip-btn ${it.id === cur ? 'on' : ''}" data-${attr}="${it.id}">${it.label}</button>`).join('');
    const tl = g.tippetLength, id = g.indicatorDepth, dl = g.dropperLength;
    let depthCtl = '';
    if (type === 'nymph') {
      depthCtl = `<label class="slider-row"><span>Indicator depth</span>
        <input type="range" min="${id.min}" max="${id.max}" step="${id.step}" value="${rig.indicatorFt}" data-range="indicatorFt">
        <b>${rig.indicatorFt} ft</b></label>
        <p class="hint">Distance from the indicator down to the nymph. Set it so the fly drifts just above the bottom.</p>`;
    } else if (type === 'drydropper') {
      depthCtl = `<label class="slider-row"><span>Dropper length</span>
        <input type="range" min="${dl.min}" max="${dl.max}" step="${dl.step}" value="${rig.dropperFt}" data-range="dropperFt">
        <b>${rig.dropperFt} ft</b></label>
        <p class="hint">Tippet from the dry fly's hook bend down to the nymph. Longer fishes deeper.</p>`;
    } else {
      depthCtl = '<p class="hint">A dry fly fishes on the surface, so depth doesn’t matter. A long, fine tippet helps it drift naturally.</p>';
    }
    el.querySelector('.leader-body').innerHTML = `
      <details class="learn"><summary>What are leader and tippet?</summary><p>${g.help.leader}</p></details>
      <div class="leader-diagram">${this.diagram(rig, info)}</div>
      <h3>1 · Tapered leader</h3>
      <div class="chips">${chips(g.leaders, rig.leaderId, 'leader')}</div>
      <p class="hint">${info.taper.note}</p>
      <h3>2 · Tippet</h3>
      <div class="chips">${chips([{ id: '', label: 'None' }, ...g.tippets], rig.tippetSize || '', 'tippet')}</div>
      <label class="slider-row ${rig.tippetSize ? '' : 'disabled'}"><span>Tippet length</span>
        <input type="range" min="${Math.max(0.5, tl.min)}" max="${tl.max}" step="${tl.step}" value="${rig.tippetFt}" data-range="tippetFt" ${rig.tippetSize ? '' : 'disabled'}>
        <b>${rig.tippetFt} ft</b></label>
      ${info.turnover ? '' : `<p class="warn">${rig.tippetSize} tippet is thicker than this leader's ${info.taper.tip} tip. The cast won't turn over. Use ${info.taper.tip} or finer.</p>`}
      <h3>3 · ${type === 'nymph' ? 'Indicator' : type === 'drydropper' ? 'Dropper' : 'Depth'}</h3>
      ${depthCtl}
      <p class="leader-total">Total leader <b>${info.leaderFt} ft</b> · tippet <b>${info.tipSize}</b>, breaks at ${info.tippet.strengthKg} kg</p>`;

    el.querySelectorAll('[data-leader]').forEach((b) => b.addEventListener('click', () => {
      this.setRig({ leaderId: b.dataset.leader }, `New leader: ${g.leaders.find((l) => l.id === b.dataset.leader).label}.`);
      this.renderLeader(el);
    }));
    el.querySelectorAll('[data-tippet]').forEach((b) => b.addEventListener('click', () => {
      this.setRig({ tippetSize: b.dataset.tippet || null }, b.dataset.tippet ? `Added ${b.dataset.tippet} tippet.` : 'Tippet removed.');
      this.renderLeader(el);
    }));
    el.querySelectorAll('[data-range]').forEach((inp) => {
      inp.addEventListener('input', () => {
        this.setRig({ [inp.dataset.range]: Number(inp.value) }, null);
        inp.nextElementSibling.textContent = `${inp.value} ft`;
        el.querySelector('.leader-diagram').innerHTML = this.diagram(this.getRig(), rigInfo(this.getRig(), g));
        el.querySelector('.leader-total').innerHTML = `Total leader <b>${rigInfo(this.getRig(), g).leaderFt} ft</b> · tippet <b>${rigInfo(this.getRig(), g).tipSize}</b>, breaks at ${rigInfo(this.getRig(), g).tippet.strengthKg} kg`;
      });
      inp.addEventListener('change', () => this.renderLeader(el));
    });
  }

  // Rods, reels and lines: cards with ratings, locked until you've earned them.
  renderGear(el, kind) {
    const rig = this.getRig();
    const list = { rod: this.gear.rods, reel: this.gear.reels, line: this.gear.lines }[kind];
    const key = { rod: 'rodId', reel: 'reelId', line: 'lineId' }[kind];
    const pts = this.getPoints();
    const dots = (v) => '\u25CF'.repeat(clamp(Math.round(v), 1, 5)) + '\u25CB'.repeat(5 - clamp(Math.round(v), 1, 5));
    const stats = (x) => {
      if (kind === 'rod') return [['Reach', (x.maxCast - 17) / 2.5], ['Delicacy', 6 - x.presentation * 3.5], ['Backbone', x.power * 3.2], ['Tippet cushion', x.cushion * 3.4]];
      if (kind === 'reel') return [['Max drag', x.maxDrag * 0.62], ['Smoothness', x.smooth * 5], ['Line pickup', x.retrieve * 8.6]];
      return [['Delicacy', 6 - x.presentation * 3.5], ['Turnover', x.turnover * 3.5], ['Mending', x.mend * 3.6]];
    };
    const swatch = (x) => kind === 'line' ? `<span class="swatch" style="background:${x.color}"></span>`
      : kind === 'rod' ? `<span class="swatch rod" style="background:linear-gradient(90deg, ${x.grip} 0 22%, ${x.blank} 22%)"></span>`
      : `<span class="swatch reel" style="background:radial-gradient(circle, ${x.spool} 0 40%, ${x.frame} 42%)"></span>`;
    el.querySelector('.leader-body').innerHTML = `<p class="learn-line">${this.gear.help[kind]}</p><div class="gear-list">${list.map((x) => {
      const open = this.owns(kind, x);
      const afford = !open && x.price <= pts;
      const on = rig[key] === x.id;
      const spec = kind === 'rod' ? `#${x.weight} · ${x.action}` : kind === 'reel' ? x.drag : `WF${this.gearInfo().rod.weight}F floating`;
      return `<button class="gear-card ${on ? 'on' : ''} ${open || afford ? '' : 'locked'}" ${open ? `data-gear="${x.id}"` : afford ? `data-buy="${x.id}"` : 'disabled'}>
        <div class="gc-head">${swatch(x)}<div><span class="gc-brand">${x.brand}</span><b>${x.name}</b><span class="gc-spec">${spec}</span></div>
          <span class="gc-state ${afford ? 'buy' : ''}">${on ? 'In use' : open ? 'Use' : afford ? `Buy \u00B7 ${x.price} pts` : `\u{1F512} ${x.price} pts`}</span></div>
        <div class="gc-stats">${stats(x).map(([l, v]) => `<span>${l}</span><i>${dots(v)}</i>`).join('')}</div>
        <p class="gc-note">${x.note}</p>
      </button>`;
    }).join('')}</div>
    <p class="hint">You have <b>${pts.toLocaleString('en')} points</b> to spend. Spot and catch fish to earn more.</p>`;
    el.querySelectorAll('[data-gear]').forEach((b) => b.addEventListener('click', () => {
      const x = list.find((y) => y.id === b.dataset.gear);
      this.setRig({ [key]: x.id }, `Now fishing the ${x.brand} ${x.name}.`);
      this.renderLeader(el);
    }));
    el.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const x = list.find((y) => y.id === b.dataset.buy);
      if (this.buy(kind, x)) this.setRig({ [key]: x.id }, `Bought the ${x.brand} ${x.name}. It's on your rig.`);
      this.renderLeader(el);
    }));
  }

  // The tackle shop: everything you don't own yet, with prices.
  renderShop(el) {
    const pts = this.getPoints();
    const sections = [['rod', 'Rods', this.gear.rods], ['reel', 'Reels', this.gear.reels], ['line', 'Fly lines', this.gear.lines], ['fly', 'Flies', this.gear.flies]];
    el.querySelector('.shop-wallet').innerHTML = `<b>${pts.toLocaleString('en')}</b> points to spend`;
    el.querySelector('.shop-body').innerHTML = sections.map(([kind, title, list]) => {
      const items = list.filter((x) => !this.owns(kind, x));
      if (!items.length) return `<h3>${title}</h3><p class="hint">You own them all.</p>`;
      return `<h3>${title}</h3><div class="shop-grid">${items.map((x) => {
        const afford = x.price <= pts;
        const pic = kind === 'fly' ? flySVG(x) : kind === 'line' ? `<span class="swatch" style="background:${x.color}"></span>`
          : kind === 'rod' ? `<span class="swatch rod" style="background:linear-gradient(90deg, ${x.grip} 0 22%, ${x.blank} 22%)"></span>`
          : `<span class="swatch reel" style="background:radial-gradient(circle, ${x.spool} 0 40%, ${x.frame} 42%)"></span>`;
        return `<div class="shop-item ${afford ? '' : 'dim'}">
          <div class="shop-pic">${pic}</div>
          <div class="shop-text">${x.brand ? `<span class="gc-brand">${x.brand}</span>` : ''}<b>${x.name}${x.hook ? ` ${x.hook}` : ''}</b><p>${x.note}</p></div>
          <button class="buy-btn" data-shop="${kind}:${x.id}" ${afford ? '' : 'disabled'}>${afford ? 'Buy' : '\u{1F512}'} \u00B7 ${x.price} pts</button>
        </div>`;
      }).join('')}</div>`;
    }).join('');
    el.querySelectorAll('[data-shop]').forEach((b) => b.addEventListener('click', () => {
      const [kind, id] = b.dataset.shop.split(':');
      const list = { rod: this.gear.rods, reel: this.gear.reels, line: this.gear.lines, fly: this.gear.flies }[kind];
      const x = list.find((y) => y.id === id);
      if (this.buy(kind, x)) {
        const key = { rod: 'rodId', reel: 'reelId', line: 'lineId', fly: 'flyId' }[kind];
        this.setRig({ [key]: x.id }, `Bought the ${x.brand ? x.brand + ' ' : ''}${x.name}. It's on your rig.`);
      }
      this.renderShop(el);
    }));
  }

  gearInfo() {
    return rigInfo(this.getRig(), this.gear);
  }

  // A drawing of the leader, and a side view of where the nymph fishes.
  diagram(rig, info) {
    const W = 360, px = 15; // px per foot
    const type = info.fly.type;
    const x0 = 14, xl = 54; // fly line ends at xl
    const xt = xl + info.taper.feet * px;
    const xe = xt + (rig.tippetSize ? rig.tippetFt * px : 0);
    const tipW = { '3X': 2.4, '4X': 2, '5X': 1.6, '6X': 1.3 }[info.taper.tip];
    const tw = { '3X': 2.2, '4X': 1.8, '5X': 1.4, '6X': 1.1 }[info.tipSize];
    let top = `<line x1="${x0}" y1="24" x2="${xl}" y2="24" stroke="#e9cf5c" stroke-width="6" stroke-linecap="round"/>
      <polygon points="${xl},20.5 ${xt},${24 - tipW / 2} ${xt},${24 + tipW / 2} ${xl},27.5" fill="#cfd8d4"/>
      ${rig.tippetSize ? `<line x1="${xt}" y1="24" x2="${xe}" y2="24" stroke="${info.turnover ? '#9fc6d4' : '#e06a4a'}" stroke-width="${tw}"/>` : ''}
      <text x="${(xl + xt) / 2}" y="14" class="dg-label" text-anchor="middle">${info.taper.feet} ft taper</text>
      ${rig.tippetSize ? `<text x="${(xt + xe) / 2}" y="40" class="dg-label" text-anchor="middle">${rig.tippetFt} ft ${rig.tippetSize}</text>` : ''}
      <text x="${x0 + 2}" y="44" class="dg-label" text-anchor="start">fly line</text>`;
    if (type === 'nymph') {
      const xi = Math.max(xl + 4, xe - rig.indicatorFt * px);
      top += `<circle cx="${xi}" cy="24" r="5" fill="#ff7a3d"/><text x="${xi}" y="10" class="dg-label" text-anchor="middle">indicator</text>
        <circle cx="${xe}" cy="24" r="3.5" fill="#6b4220"/>`;
    } else if (type === 'drydropper') {
      const dh = rig.dropperFt * 9;
      top += `<circle cx="${xe}" cy="24" r="4" fill="#f4efe3" stroke="#8b6a45"/>
        <line x1="${xe}" y1="26" x2="${xe + 6}" y2="${26 + dh}" stroke="#9fc6d4" stroke-width="1.2"/>
        <circle cx="${xe + 6}" cy="${26 + dh}" r="3.2" fill="#6b4220"/>`;
    } else {
      top += `<circle cx="${xe}" cy="24" r="4" fill="#f4efe3" stroke="#8b6a45"/>`;
    }

    // Side view of the water at the aimed lie.
    let bottom = '';
    if (type !== 'dry') {
      const ctx = this.lieContext();
      const surfY = 96, scale = 26; // px per metre
      const depthM = ctx ? ctx.depthM : null;
      const sr = { fly: type, size: info.fly.size, indicatorFt: rig.indicatorFt, dropperFt: rig.dropperFt };
      const eff = effectiveDepth(sr, ctx ? ctx.speed : 0.6);
      const ny = surfY + eff * scale;
      const bedY = depthM ? surfY + depthM * scale : null;
      let verdict = '', vcls = '';
      if (depthM) {
        const ratio = eff / Math.max(0.25, depthM * 0.85);
        if (ratio < 0.8) { verdict = 'too shallow: drifting over the fish'; vcls = 'amber'; }
        else if (ratio > 1.3) { verdict = 'too deep: it will snag the bottom'; vcls = 'red'; }
        else { verdict = 'just above the bottom. Good!'; vcls = 'good'; }
      }
      bottom = `
        <rect x="0" y="${surfY}" width="${W}" height="${(bedY || surfY + 70) - surfY}" fill="#4fa3c7" opacity="0.25"/>
        <line x1="0" y1="${surfY}" x2="${W}" y2="${surfY}" stroke="#4fa3c7" stroke-width="2"/>
        ${bedY ? `<path d="M0 ${bedY} Q90 ${bedY - 3} 180 ${bedY + 2} T${W} ${bedY}" stroke="#8a7a5a" stroke-width="3" fill="none"/>
          <text x="${W - 6}" y="${bedY - 5}" class="dg-label" text-anchor="end">bottom · ${depthM.toFixed(1)} m</text>` : ''}
        <circle cx="70" cy="${surfY}" r="${type === 'nymph' ? 5 : 4}" fill="${type === 'nymph' ? '#ff7a3d' : '#f4efe3'}" stroke="#8b6a45" stroke-width="${type === 'nymph' ? 0 : 1}"/>
        <path d="M70 ${surfY} Q${70 + eff * 30} ${surfY + eff * scale * 0.5} ${100 + eff * 40} ${ny}" stroke="#9fc6d4" stroke-width="1.2" fill="none"/>
        <circle cx="${100 + eff * 40}" cy="${ny}" r="3.5" fill="#6b4220"/>
        <text x="${110 + eff * 40}" y="${ny + 4}" class="dg-label" text-anchor="start">fishes at ~${eff.toFixed(1)} m</text>
        <text x="6" y="${surfY - 6}" class="dg-label" text-anchor="start">current →</text>
        ${(this.diagramH = Math.max(150, (bedY || surfY + 70) + 26, ny + 16)) && ''}
        ${ctx ? `<text x="6" y="${(bedY || surfY + 70) + 16}" class="dg-verdict ${vcls}" text-anchor="start">${ctx.name}: ${verdict}</text>`
          : `<text x="6" y="${surfY + 88}" class="dg-label" text-anchor="start">Aim at a lie to compare with its depth.</text>`}`;
    }
    const H = type === 'dry' ? 56 : this.diagramH || 200;
    return `<svg viewBox="0 0 ${W} ${H}" class="dg">${top}${bottom}</svg>`;
  }
}
