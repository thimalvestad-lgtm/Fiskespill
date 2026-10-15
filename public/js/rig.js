// The angler's rig: tapered leader + tippet + fly, and the fly box and leader
// builder panels that edit it.
import { flySVG } from './flies.js';
import { effectiveDepth } from './sim.js';

const TIPPET_ORDER = ['3X', '4X', '5X', '6X'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const DEFAULT_RIG = { leaderId: '9-4X', tippetSize: '5X', tippetFt: 2, flyId: 'dd-medium', indicatorFt: 4, dropperFt: 1.5 };

export function normalizeRig(saved, gear) {
  const r = { ...DEFAULT_RIG, ...(saved && saved.leaderId ? saved : {}) };
  if (!gear.leaders.some((l) => l.id === r.leaderId)) r.leaderId = DEFAULT_RIG.leaderId;
  if (!gear.flies.some((f) => f.id === r.flyId)) r.flyId = DEFAULT_RIG.flyId;
  return r;
}

export function rigInfo(rig, gear) {
  const taper = gear.leaders.find((l) => l.id === rig.leaderId);
  const fly = gear.flies.find((f) => f.id === rig.flyId);
  const tipSize = rig.tippetSize || taper.tip;
  const tippet = gear.tippets.find((t) => t.id === tipSize);
  const leaderFt = taper.feet + (rig.tippetSize ? rig.tippetFt : 0);
  // Tippet thicker than the leader's tip won't turn over.
  const turnover = !rig.tippetSize || TIPPET_ORDER.indexOf(rig.tippetSize) >= TIPPET_ORDER.indexOf(taper.tip);
  return { taper, fly, tippet, tipSize, leaderFt, turnover };
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
  };
  if (r.fly !== 'dry') r.depthM = effectiveDepth(r, speed);
  return r;
}

export function rigSummary(rig, gear) {
  const i = rigInfo(rig, gear);
  return { fly: `${i.fly.name} ${i.fly.hook}`, leader: `${i.leaderFt % 1 ? i.leaderFt.toFixed(1) : i.leaderFt} ft · ${i.tipSize}` };
}

export class RigUI {
  constructor(gear, { getRig, setRig, lieContext }) {
    this.gear = gear;
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
        <div class="foam">${flies.map((f) => `
          <button class="fly ${f.id === rig.flyId ? 'on' : ''}" data-fly="${f.id}" title="${f.name} ${f.hook}: ${f.note}">
            ${flySVG(f)}
            <span class="fly-name">${f.name}</span><span class="fly-hook">${f.hook}</span>
          </button>`).join('')}
        </div>
      </div>`;
    }).join('');
    const sel = this.gear.flies.find((f) => f.id === rig.flyId);
    el.querySelector('.box-inner').innerHTML = groups;
    el.querySelector('.box-note').innerHTML = `<b>${sel.name} ${sel.hook}</b> ${sel.note}`;
    el.querySelectorAll('[data-fly]').forEach((b) => b.addEventListener('click', () => {
      this.setRig({ flyId: b.dataset.fly }, `Tied on a ${this.gear.flies.find((f) => f.id === b.dataset.fly).name}.`);
      this.renderFlyBox(el);
    }));
  }

  // --- Leader builder --------------------------------------------------------

  renderLeader(el) {
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
