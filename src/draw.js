// The dish, drawn in one pass before the world's own pictures (floating words and particles go over it): soil, stones, the
// territories, roots as thick as they are hard to cut, water, seeds, everyone's planned roots, this player's preview, and the rim root that
// is the round's clock. World units: a cell is 1 from its middle to a corner, y points up.
import { defineSystem } from '@onceworlds/engine';
import { Aim } from './components.js';
import { DIRS, hexCorners } from './hex.js';
import { viewOf } from './view.js';
import { DROP, NO_PARENT, ROCK, SEED_PARENT, TUNING, support } from './rules.js';
import { COLORS, alpha, mix, seatLook } from './theme.js';

const CORNERS = hexCorners(1);
/** Seconds a cut-off root takes to wither away. */
const WITHER = 1.8;
const registered = new WeakSet();

/** Registers the pass once per world. */
export const DrawBoard = defineSystem({
  name: 'taproot:draw',
  stage: 'update',
  run({ world, render, time }) {
    if (registered.has(world) || !render?.addPass) return;
    registered.add(world);
    render.addPass({
      name: 'taproot-dish',
      when: 'before',
      draw(ctx, view) {
        if (view.world && view.world !== world) return;
        try {
          drawDish(ctx, view, world, time.now, render.quality ?? 'high');
        } catch (err) {
          // Never let a drawing slip stop the frame.
          if (!registered.warned) {
            registered.warned = true;
            console.warn('taproot: drawing the dish failed', err);
          }
        }
      },
    });
  },
});

// Deterministic little numbers per cell, for wobble and specks.
const hash = (i, k = 0) => {
  let h = (i * 374761393 + k * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const specks = new Map();
function specksFor(g) {
  let list = specks.get(g.size);
  if (list) return list;
  list = [];
  for (let k = 0; k < 260; k++) {
    const a = hash(k, 1) * Math.PI * 2;
    const r = Math.sqrt(hash(k, 2)) * (g.disc + 0.6);
    list.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.04 + hash(k, 3) * 0.12, light: hash(k, 4) > 0.55 });
  }
  specks.set(g.size, list);
  return list;
}

const easeOutBack = (t) => {
  const c = 1.70158;
  const x = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

function hexPath(ctx, x, y, k) {
  ctx.moveTo(x + CORNERS[0][0] * k, y + CORNERS[0][1] * k);
  for (let i = 1; i < 6; i++) ctx.lineTo(x + CORNERS[i][0] * k, y + CORNERS[i][1] * k);
  ctx.closePath();
}

/** The symbol of a seat, centred at (x, y), radius r. */
export function symbolPath(ctx, symbol, x, y, r) {
  ctx.beginPath();
  if (symbol === 'circle') ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  else if (symbol === 'triangle') {
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  } else if (symbol === 'square') ctx.rect(x - r * 0.72, y - r * 0.72, r * 1.44, r * 1.44);
  else if (symbol === 'diamond') {
    ctx.moveTo(x, y + r);
    ctx.lineTo(x + r * 0.8, y);
    ctx.lineTo(x, y - r);
    ctx.lineTo(x - r * 0.8, y);
  } else if (symbol === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  } else if (symbol === 'plus') {
    const w = r * 0.36;
    ctx.rect(x - w, y - r, w * 2, r * 2);
    ctx.rect(x - r, y - w, r * 2, w * 2);
  } else if (symbol === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.3 : r;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  }
  ctx.closePath();
}

function drawDish(ctx, view, world, now, quality) {
  // The low Graphics setting (older phones) leaves out the grit and the glow under the roots.
  const low = quality === 'low';
  const v = viewOf(world);
  const b = v.board;
  ctx.save();
  ctx.setTransform(view.a, view.b, view.c, view.d, view.e, view.f);
  const disc = b ? b.g.disc : 12;
  // The dish: a clay rim round a bowl of soil, darker toward the edge.
  ctx.beginPath();
  ctx.arc(0, 0, disc + 1.75, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.clayDark;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, disc + 1.45, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.clay;
  ctx.fill();
  const soil = ctx.createRadialGradient(0, 0, disc * 0.15, 0, 0, disc + 1.1);
  soil.addColorStop(0, COLORS.loamLight);
  soil.addColorStop(0.75, COLORS.loam);
  soil.addColorStop(1, COLORS.loamDark);
  ctx.beginPath();
  ctx.arc(0, 0, disc + 1.05, 0, Math.PI * 2);
  ctx.fillStyle = soil;
  ctx.fill();
  if (!b) {
    ctx.restore();
    return;
  }
  const g = b.g;
  // Specks of grit in the soil (two paths: light and dark).
  for (const light of low ? [] : [true, false]) {
    ctx.beginPath();
    for (const s of specksFor(g)) {
      if (s.light !== light) continue;
      ctx.moveTo(s.x + s.r, s.y);
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = light ? '#5a3d2a' : '#2a1a11';
    ctx.fill();
  }
  drawClock(ctx, v, disc, now);
  // Open soil: a faint dot in each cell, so the grid reads without lines.
  ctx.fillStyle = '#5b3e2b';
  ctx.beginPath();
  for (let i = 0; i < g.count; i++) {
    if (b.owner[i] || b.terrain[i] === ROCK) continue;
    ctx.moveTo(g.x[i] + 0.09, g.y[i]);
    ctx.arc(g.x[i], g.y[i], 0.09, 0, Math.PI * 2);
  }
  ctx.fill();
  // Withering: the cut-off roots go grey, crack into pieces and sink into the soil.
  for (let i = 0; i < g.count; i++) {
    const age = now - v.ashAt[i];
    if (age < 0 || age > WITHER || b.owner[i]) continue;
    const k = age / WITHER;
    const was = seatLook(v.ashOwner[i] - 1).color;
    const grey = mix(was, COLORS.ash, Math.min(1, age * 6));
    ctx.beginPath();
    hexPath(ctx, g.x[i], g.y[i] - k * 0.2, 0.9 - k * 0.25);
    ctx.fillStyle = alpha(COLORS.ash, 0.42 * (1 - k));
    ctx.fill();
    ctx.setLineDash([0.16, 0.12]);
    ctx.strokeStyle = alpha('#cfc5ba', 0.85 * (1 - k));
    ctx.lineWidth = 0.07;
    ctx.stroke();
    ctx.setLineDash([]);
    // The dead root: in three broken pieces that drift apart.
    const p = v.ashParent?.[i] ?? 7;
    const j = p < 6 ? g.nbr[i * 6 + p] : -1;
    if (j >= 0) {
      const dx = g.x[j] - g.x[i];
      const dy = g.y[j] - g.y[i];
      ctx.strokeStyle = alpha(mix(grey, '#e6ddd2', 0.3), 0.95 * (1 - k));
      ctx.lineWidth = 0.14;
      ctx.lineCap = 'round';
      for (let n = 0; n < 3; n++) {
        const a0 = n / 3 + 0.04;
        const a1 = (n + 1) / 3 - 0.04;
        const drop = k * (0.15 + n * 0.12);
        ctx.beginPath();
        ctx.moveTo(g.x[i] + dx * a0, g.y[i] + dy * a0 - drop);
        ctx.lineTo(g.x[i] + dx * a1, g.y[i] + dy * a1 - drop);
        ctx.stroke();
      }
    }
  }
  // Territories: a tinted hex per cell, and a bright edge where it meets anyone else.
  const seats = b.seats;
  for (let s = 0; s < seats; s++) {
    const look = seatLook(s);
    const mine = v.me === s;
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < g.count; i++) {
      if (b.owner[i] !== s + 1) continue;
      any = true;
      const pop = easeOutBack((now - v.popAt[i]) / 0.28);
      hexPath(ctx, g.x[i], g.y[i], 0.97 * (0.55 + 0.45 * pop));
    }
    if (!any) continue;
    ctx.fillStyle = alpha(look.color, mine ? 0.3 : 0.22);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < g.count; i++) {
      if (b.owner[i] !== s + 1) continue;
      for (let d = 0; d < 6; d++) {
        const j = g.nbr[i * 6 + d];
        if (j >= 0 && b.owner[j] === s + 1) continue;
        const c0 = CORNERS[(d + 5) % 6];
        const c1 = CORNERS[d];
        ctx.moveTo(g.x[i] + c0[0] * 0.97, g.y[i] + c0[1] * 0.97);
        ctx.lineTo(g.x[i] + c1[0] * 0.97, g.y[i] + c1[1] * 0.97);
      }
    }
    ctx.strokeStyle = alpha(look.color, mine ? 0.95 : 0.7);
    ctx.lineWidth = mine ? 0.11 : 0.08;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  // Stones.
  for (let i = 0; i < g.count; i++) {
    if (b.terrain[i] !== ROCK) continue;
    const x = g.x[i];
    const y = g.y[i];
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + hash(i, 5);
      const r = 0.62 + hash(i, k + 6) * 0.2;
      ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r * 0.86);
    }
    ctx.closePath();
    ctx.fillStyle = COLORS.stone;
    ctx.fill();
    ctx.strokeStyle = '#3d332c';
    ctx.lineWidth = 0.07;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - 0.15, y + 0.2, 0.26, 0.13, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.stoneLight;
    ctx.fill();
  }
  drawRoots(ctx, v, b, now, low);
  drawWater(ctx, v, b, now);
  drawPlans(ctx, v, b, now);
  drawPreview(ctx, v, b, world, now);
  drawSeeds(ctx, v, b, now);
  drawFlashes(ctx, v, b, now);
  drawTap(ctx, v, b, now);
  ctx.restore();
}

/** A tap answers at once, before the host does: a ring in my colour where I tapped. */
function drawTap(ctx, v, b, now) {
  const t = v.tapped;
  if (!t || v.me < 0 || !(t.cell >= 0 && t.cell < b.g.count)) return;
  const age = now - t.at;
  if (age < 0 || age > 0.4) return;
  const k = age / 0.4;
  ctx.beginPath();
  ctx.arc(b.g.x[t.cell], b.g.y[t.cell], 0.3 + k * 0.9, 0, Math.PI * 2);
  ctx.strokeStyle = alpha(seatLook(v.me).color, 1 - k);
  ctx.lineWidth = 0.16 * (1 - k) + 0.04;
  ctx.stroke();
}

/** The rim root: creeps round the dish as the round goes; blue in the Flood. */
function drawClock(ctx, v, disc, now) {
  const r = disc + 1.6;
  const live = v.source === 'live' || v.source === 'frozen';
  const total = live ? v.total ?? TUNING.roundSeconds : 70;
  const frac = Math.max(0, Math.min(1, live ? v.now / total : v.now / total));
  const flood = live && v.remaining <= TUNING.floodSeconds && v.remaining > 0;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = alpha(COLORS.night, 0.18);
  ctx.lineWidth = 0.22;
  ctx.stroke();
  // Where the rim root will close: a notch at the top.
  ctx.beginPath();
  ctx.moveTo(0, r - 0.32);
  ctx.lineTo(0, r + 0.32);
  ctx.strokeStyle = alpha(COLORS.night, 0.6);
  ctx.lineWidth = 0.16;
  ctx.stroke();
  if (frac <= 0) return;
  // Clockwise from the top (y is up, so clockwise means falling angles).
  const start = Math.PI / 2;
  const end = start - frac * Math.PI * 2;
  const color = flood ? COLORS.water : '#2f5a2a';
  ctx.beginPath();
  ctx.arc(0, 0, r, start, end, true);
  ctx.strokeStyle = color;
  ctx.lineWidth = flood ? 0.34 + 0.06 * Math.sin(now * 10) : 0.3;
  ctx.lineCap = 'round';
  ctx.stroke();
  // Little leaves along it.
  const leaves = Math.floor(frac * 36);
  for (let k = 1; k <= leaves; k++) {
    const a = start - (k / 36) * Math.PI * 2;
    const side = k % 2 ? 1 : -1;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const lx = Math.cos(a) * (r + side * 0.32);
    const ly = Math.sin(a) * (r + side * 0.32);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + lx) / 2 + Math.cos(a - Math.PI / 2) * 0.18, (y + ly) / 2 + Math.sin(a - Math.PI / 2) * 0.18, lx, ly);
    ctx.strokeStyle = flood ? COLORS.water : '#45e08a';
    ctx.lineWidth = 0.13;
    ctx.stroke();
  }
  // The growing tip.
  ctx.beginPath();
  ctx.arc(Math.cos(end) * r, Math.sin(end) * r, flood ? 0.3 : 0.24, 0, Math.PI * 2);
  ctx.fillStyle = flood ? '#d9f8ff' : COLORS.clay;
  ctx.fill();
}

/** 0 (a lone tip) to 3 (deep in a clump), from how many of its owner's cells touch it. */
const thickOf = (b, i) => {
  const n = support(b, i);
  return n <= 1 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
};

function drawRoots(ctx, v, b, now, low) {
  const g = b.g;
  for (let s = 0; s < b.seats; s++) {
    const look = seatLook(s);
    // A root is as thick as it is hard to cut (how many of its own cells hold it). Two strokes per thickness: a soft glow under
    // a bright core.
    for (let pass = low ? 1 : 0; pass < 2; pass++) {
      for (let thick = 0; thick <= 3; thick++) {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < g.count; i++) {
          if (b.owner[i] !== s + 1) continue;
          const p = b.parent[i];
          if (p === NO_PARENT || p === SEED_PARENT) continue;
          if (thickOf(b, i) !== thick) continue;
          const j = g.nbr[i * 6 + p];
          if (j < 0) continue;
          any = true;
          const grow = Math.min(1, Math.max(0, (now - v.popAt[i]) / 0.18));
          const x0 = g.x[j];
          const y0 = g.y[j];
          const x1 = x0 + (g.x[i] - x0) * grow;
          const y1 = y0 + (g.y[i] - y0) * grow;
          // A slight bend, the same for this cell on every frame.
          const bend = (hash(i, 9) - 0.5) * 0.5;
          const mx = (x0 + x1) / 2 - (y1 - y0) * bend * 0.4;
          const my = (y0 + y1) / 2 + (x1 - x0) * bend * 0.4;
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(mx, my, x1, y1);
        }
        if (!any) continue;
        const w = 0.09 + thick * 0.07;
        ctx.lineCap = 'round';
        if (pass === 0) {
          ctx.strokeStyle = alpha(look.color, 0.22);
          ctx.lineWidth = w + 0.22;
        } else {
          ctx.strokeStyle = mix(look.color, '#ffffff', 0.12);
          ctx.lineWidth = w;
        }
        ctx.stroke();
      }
    }
    // Root tips: a bright bead where a root ends.
    ctx.beginPath();
    for (let i = 0; i < g.count; i++) {
      if (b.owner[i] !== s + 1 || b.parent[i] >= 6) continue;
      const fresh = now - v.popAt[i];
      if (fresh > 1.2) continue;
      const r = 0.16 * (1 - fresh / 1.2) + 0.05;
      ctx.moveTo(g.x[i] + r, g.y[i]);
      ctx.arc(g.x[i], g.y[i], r, 0, Math.PI * 2);
    }
    ctx.fillStyle = '#fff6e0';
    ctx.fill();
  }
}

function dropShape(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.55);
  ctx.bezierCurveTo(x + r * 0.35, y + r * 0.9, x + r, y + r * 0.45, x + r, y - r * 0.05);
  ctx.arc(x, y - r * 0.05, r, 0, Math.PI, true);
  ctx.bezierCurveTo(x - r, y + r * 0.45, x - r * 0.35, y + r * 0.9, x, y + r * 1.55);
  ctx.closePath();
}

function drawWater(ctx, v, b, now) {
  const g = b.g;
  // Where the next drop will rise: rings closing in.
  if (v.warn >= 0 && v.warn < g.count) {
    const left = Math.max(0, v.warnAt - v.now);
    const k = 1 - left / TUNING.dropWarn;
    for (let n = 0; n < 2; n++) {
      const t = (k + n * 0.5) % 1;
      ctx.beginPath();
      ctx.arc(g.x[v.warn], g.y[v.warn], 0.25 + (1 - t) * 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(COLORS.water, 0.15 + 0.6 * t);
      ctx.lineWidth = 0.08;
      ctx.stroke();
    }
  }
  for (let i = 0; i < g.count; i++) {
    if (b.terrain[i] !== DROP) continue;
    const x = g.x[i];
    const bob = Math.sin(now * 3 + i) * 0.05;
    const y = g.y[i] - 0.12 + bob;
    const pulse = (now * 0.8 + hash(i, 2)) % 1;
    ctx.beginPath();
    ctx.arc(g.x[i], g.y[i] - 0.1, 0.45 + pulse * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = alpha(COLORS.water, 0.4 * (1 - pulse));
    ctx.lineWidth = 0.07;
    ctx.stroke();
    dropShape(ctx, x, y, 0.36);
    ctx.fillStyle = COLORS.waterDeep;
    ctx.fill();
    dropShape(ctx, x, y + 0.04, 0.3);
    ctx.fillStyle = COLORS.water;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - 0.1, y + 0.08, 0.07, 0.12, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f2fdff';
    ctx.fill();
  }
  // A splash where a drop was drunk.
  for (let i = 0; i < g.count; i++) {
    const age = now - v.drunkAt[i];
    if (age < 0 || age > 0.6) continue;
    const k = age / 0.6;
    ctx.beginPath();
    ctx.arc(g.x[i], g.y[i], 0.3 + k * 1.4, 0, Math.PI * 2);
    ctx.strokeStyle = alpha(COLORS.water, 0.8 * (1 - k));
    ctx.lineWidth = 0.14 * (1 - k) + 0.03;
    ctx.stroke();
  }
}

/** Where a planned root starts: the cell of its own it grows out of. */
function startOf(b, s, first) {
  const g = b.g;
  for (let d = 0; d < 6; d++) {
    const j = g.nbr[first * 6 + d];
    if (j >= 0 && b.owner[j] === s + 1) return j;
  }
  return -1;
}

function drawLine(ctx, b, s, path, dash) {
  const g = b.g;
  const from = startOf(b, s, path[0]);
  ctx.beginPath();
  if (from >= 0) ctx.moveTo(g.x[from], g.y[from]);
  else ctx.moveTo(g.x[path[0]], g.y[path[0]]);
  for (const c of path) ctx.lineTo(g.x[c], g.y[c]);
  ctx.setLineDash(dash);
}

function drawPlans(ctx, v, b, now) {
  const g = b.g;
  for (const o of v.growers) {
    if (o.mode !== 'reach' || !o.path.length || o.path.some((c) => !(c >= 0 && c < g.count))) continue;
    const look = seatLook(o.seat);
    const mine = o.me;
    drawLine(ctx, b, o.seat, o.path, [0.18, 0.22]);
    ctx.lineDashOffset = -now * 1.2;
    ctx.strokeStyle = alpha(look.color, mine ? 1 : 0.85);
    ctx.lineWidth = mine ? 0.14 : 0.11;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
    // Enemy cells on the way: an ember notch (a snip coming).
    for (const c of o.path) {
      const owner = b.owner[c];
      if (!owner || owner === o.seat + 1) continue;
      const r = 0.28 + 0.06 * Math.sin(now * 12);
      ctx.beginPath();
      ctx.moveTo(g.x[c] - r, g.y[c] - r);
      ctx.lineTo(g.x[c] + r, g.y[c] + r);
      ctx.moveTo(g.x[c] - r, g.y[c] + r);
      ctx.lineTo(g.x[c] + r, g.y[c] - r);
      ctx.strokeStyle = COLORS.ember;
      ctx.lineWidth = 0.12;
      ctx.stroke();
      // The victim's root there pulses ember: everyone can see the snip coming.
      ctx.beginPath();
      hexPath(ctx, g.x[c], g.y[c], 0.9);
      ctx.fillStyle = alpha(COLORS.ember, 0.18 + 0.14 * Math.sin(now * 10));
      ctx.fill();
    }
    const t = o.path[o.path.length - 1];
    ctx.beginPath();
    ctx.arc(g.x[t], g.y[t], 0.55 + 0.05 * Math.sin(now * 6), 0, Math.PI * 2);
    ctx.strokeStyle = alpha(look.color, 0.9);
    ctx.lineWidth = 0.09;
    ctx.stroke();
  }
}

/** This player's preview: the way the root would go, what it costs, what would wither. */
function drawPreview(ctx, v, b, world, now) {
  const p = world.resource(Aim);
  const pv = v.preview;
  if (!pv || p.cell < 0 || v.me < 0) return;
  const g = b.g;
  const look = seatLook(v.me);
  if (pv.kind === 'reach' && pv.path.length) {
    for (const c of pv.doomed) {
      ctx.beginPath();
      hexPath(ctx, g.x[c], g.y[c], 0.9);
      ctx.fillStyle = alpha(COLORS.ember, 0.38 + 0.12 * Math.sin(now * 8));
      ctx.fill();
    }
    drawLine(ctx, b, v.me, pv.path, [0.12, 0.14]);
    ctx.strokeStyle = alpha('#fff6e0', 0.9);
    ctx.lineWidth = 0.12;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (pv.kind === 'bloom') {
    for (const c of pv.path) {
      ctx.beginPath();
      hexPath(ctx, g.x[c], g.y[c], 0.8);
      ctx.strokeStyle = alpha(look.color, 0.9);
      ctx.lineWidth = 0.07;
      ctx.setLineDash([0.15, 0.12]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  const c = p.cell;
  if (c >= 0 && c < g.count) {
    ctx.beginPath();
    hexPath(ctx, g.x[c], g.y[c], 1.02);
    ctx.strokeStyle = pv.kind === 'none' ? alpha(COLORS.ash, 0.9) : '#fff6e0';
    ctx.lineWidth = 0.1;
    ctx.stroke();
  }
}

function drawSeeds(ctx, v, b, now) {
  const g = b.g;
  for (let s = 0; s < b.seats; s++) {
    const c = b.seeds[s];
    if (!(c >= 0 && c < g.count)) continue;
    const look = seatLook(s);
    const x = g.x[c];
    const y = g.y[c];
    const mine = v.me === s;
    if (mine) {
      const pulse = (now * 0.9) % 1;
      ctx.beginPath();
      ctx.arc(x, y, 0.85 + pulse * 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = alpha('#fff6e0', 0.7 * (1 - pulse));
      ctx.lineWidth = 0.12;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y - 0.06, 0.74, 0, Math.PI * 2);
    ctx.fillStyle = alpha(COLORS.night, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 0.7, 0, Math.PI * 2);
    ctx.fillStyle = look.color;
    ctx.fill();
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = mine ? '#fff6e0' : COLORS.night;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - 0.22, y + 0.25, 0.2, 0.11, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#ffffff', 0.45);
    ctx.fill();
    symbolPath(ctx, look.symbol, x, y - 0.02, 0.36);
    ctx.fillStyle = COLORS.night;
    ctx.fill();
    if (b.crown === s) drawCrown(ctx, x, y + 0.95, now);
  }
}

function drawCrown(ctx, x, y, now) {
  const bob = Math.sin(now * 3) * 0.04;
  ctx.beginPath();
  ctx.moveTo(x - 0.42, y + bob);
  ctx.lineTo(x - 0.42, y + 0.32 + bob);
  ctx.lineTo(x - 0.2, y + 0.16 + bob);
  ctx.lineTo(x, y + 0.42 + bob);
  ctx.lineTo(x + 0.2, y + 0.16 + bob);
  ctx.lineTo(x + 0.42, y + 0.32 + bob);
  ctx.lineTo(x + 0.42, y + bob);
  ctx.closePath();
  ctx.fillStyle = COLORS.gold;
  ctx.fill();
  ctx.strokeStyle = COLORS.night;
  ctx.lineWidth = 0.07;
  ctx.stroke();
}

/** Snips: an ember burst where the root was cut. */
function drawFlashes(ctx, v, b, now) {
  const g = b.g;
  for (const f of v.flashes ?? []) {
    const age = now - f.at;
    if (age < 0 || age > 0.7 || !(f.cell >= 0 && f.cell < g.count)) continue;
    const k = age / 0.7;
    const x = g.x[f.cell];
    const y = g.y[f.cell];
    ctx.beginPath();
    ctx.arc(x, y, 0.4 + k * (1.2 + Math.min(2, f.size * 0.12)), 0, Math.PI * 2);
    ctx.strokeStyle = alpha(COLORS.ember, 1 - k);
    ctx.lineWidth = 0.22 * (1 - k) + 0.04;
    ctx.stroke();
    for (let n = 0; n < 6; n++) {
      const a = (n / 6) * Math.PI * 2 + 0.3;
      const r0 = 0.3 + k * 0.6;
      const r1 = r0 + 0.45 * (1 - k);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.strokeStyle = alpha('#ffd0b0', 1 - k);
      ctx.lineWidth = 0.09;
      ctx.stroke();
    }
  }
}

export { DIRS };
