// Store art, staged by the game's own code: a board grown by bots playing the real rules, then the moment that sells it, a snip,
// posed on it. `onceworlds shot --poster <name>` draws one; ?poster=<name> on the page does the same for `onceworlds posters`.
import { Transform, defineModule } from '@onceworlds/engine';
import { Shape2D, Text } from '@onceworlds/engine/modules';
import { DROP, ROCK, claim, crownOf, pathTo, reachMap, snipSizes, tally } from './rules.js';
import { COLORS, FONT, seatLook } from './theme.js';
import { DEMO_NAMES, grownBoard, viewOf } from './view.js';

/** The best snip on the board: who cuts whom where, for the most withered at a short reach. */
function bestSnip(b) {
  let best = null;
  for (let a = 0; a < b.seats; a++) {
    const reach = reachMap(b, a);
    for (let v = 0; v < b.seats; v++) {
      if (v === a) continue;
      const sizes = snipSizes(b, v);
      for (let i = 0; i < b.g.count; i++) {
        if (sizes[i] < 4 || reach.cost[i] > 6) continue;
        const score = sizes[i] - reach.cost[i] * 0.5;
        if (!best || score > best.score) best = { a, v, cell: i, size: sizes[i], score };
      }
    }
  }
  return best;
}

/**
 * A long, greedy root for the snip to cut: the seat with the most open soil before it reaches far across it (at least `length`
 * cells), and the neighbour nearest its neck gets ready to cut it there. Returns the snip, or null when the board has no room.
 */
function longRoot(b, length) {
  let best = null;
  for (let v = 0; v < b.seats; v++) {
    const reach = reachMap(b, v);
    for (let i = 0; i < b.g.count; i++) {
      if (b.owner[i] || b.terrain[i] === ROCK) continue;
      const path = pathTo(b, v, i, reach);
      if (path.length < length || path.some((c) => b.owner[c])) continue;
      if (!best || path.length > best.path.length) best = { v, path };
    }
  }
  if (!best) return null;
  for (const c of best.path) claim(b, best.v, c);
  // The cut: the second cell of the root, by whoever reaches it cheapest.
  const neck = best.path[1];
  let a = -1;
  let cost = Infinity;
  for (let s = 0; s < b.seats; s++) {
    if (s === best.v) continue;
    const r = reachMap(b, s).cost[neck];
    if (r < cost) {
      cost = r;
      a = s;
    }
  }
  return a >= 0 ? { a, v: best.v, cell: neck, size: best.path.length } : null;
}

/** Poses the view: the board, the seats, what each plans, and a snip that has just happened. */
function pose(p, options) {
  const d = grownBoard(6, options.seed, options.seconds);
  const b = d.b;
  b.now = options.seconds;
  const v = viewOf(p.world);
  const snip = options.snip === false ? null : (options.long && longRoot(b, options.long)) || bestSnip(b);
  let withered = [];
  // How the roots ran before the cut (the dead ones are drawn breaking where they were).
  const parents = new Uint8Array(b.parent);
  if (snip) {
    // The snipper's root runs to the cut.
    for (const c of pathTo(b, snip.a, snip.cell).slice(0, -1)) claim(b, snip.a, c);
    withered = claim(b, snip.a, snip.cell).cells;
  }
  const { cells } = tally(b);
  b.crown = crownOf(cells, -1);
  // Others reaching for water: dotted plans.
  const plans = new Map();
  for (let s = 0; s < b.seats; s++) {
    if (snip && s === snip.a) continue;
    const reach = reachMap(b, s);
    let best = -1;
    for (let i = 0; i < b.g.count; i++) if (b.terrain[i] === DROP && b.owner[i] === 0 && reach.cost[i] < 8 && (best < 0 || reach.cost[i] < reach.cost[best])) best = i;
    if (best >= 0) plans.set(s, pathTo(b, s, best));
    if (plans.size >= 2) break;
  }
  v.posed = true;
  v.source = 'live';
  v.key = `poster:${p.name}`;
  v.board = b;
  v.me = -1;
  v.hud = options.hud ?? false;
  v.names = options.names ?? true;
  v.now = options.seconds;
  v.total = 90;
  v.remaining = 90 - options.seconds;
  v.warn = -1;
  v.growers = Array.from({ length: b.seats }, (_, s) => ({
    seat: s,
    id: `poster:${s}`,
    name: DEMO_NAMES[s],
    bot: true,
    sap: 8,
    cells: cells[s],
    income: 2,
    target: plans.get(s)?.at(-1) ?? -1,
    mode: plans.has(s) ? 'reach' : 'idle',
    path: plans.get(s) ?? [],
    snips: 0,
    snipCell: -1,
    snipSize: 0,
    snipVictim: -1,
    drinks: 0,
    cut: 0,
    best: 0,
    me: false,
  }));
  const n = b.g.count;
  v.prevOwner = new Uint8Array(b.owner);
  v.prevTerrain = new Uint8Array(b.terrain);
  v.popAt = new Float32Array(n).fill(-10);
  v.ashAt = new Float32Array(n).fill(-10);
  v.ashOwner = new Uint8Array(n);
  v.drunkAt = new Float32Array(n).fill(-10);
  v.prevParent = new Uint8Array(b.parent);
  v.ashParent = new Uint8Array(n).fill(7);
  v.flashes = [];
  v.feed = snip ? [{ by: snip.a, victim: snip.v, size: withered.length, at: 0 }] : [];
  return { b, snip, withered, v, parents };
}

/** After settling: the snip's moment, timed to the picture (the husks still grey, the burst still open). */
function freeze(p, staged) {
  const { b, snip, withered, v } = staged;
  const now = p.world.time.now;
  for (const c of withered) {
    v.ashAt[c] = now - 0.35;
    v.ashOwner[c] = snip.v + 1;
    v.ashParent[c] = staged.parents?.[c] ?? 7;
  }
  if (v.feed[0]) v.feed[0].at = now - 0.5;
  if (snip) {
    v.flashes = [{ cell: snip.cell, at: now - 0.12, size: snip.size, by: snip.a }];
    const g = b.g;
    p.world.spawn([
      Transform({ position: [g.x[snip.cell], g.y[snip.cell] + 1.7, 0] }),
      Text({ text: `SNIP ${withered.length}`, font: FONT, size: 1.25, weight: 800, color: seatLook(snip.a).color, outline: 0.22, outlineColor: COLORS.night, layer: 5 }),
    ]);
  }
}

/** A badge: a clay medallion with an emblem drawn on soil. */
function medallion(p, emblem) {
  const v = viewOf(p.world);
  v.posed = true;
  v.board = null;
  p.camera({ height: 5.2, clear: COLORS.night });
  const at = (x, y) => Transform({ position: [x, y, 0] });
  p.world.spawn([at(0, 0), Shape2D({ shape: 'circle', radius: 2.45, fill: COLORS.clayDark, layer: 3 })]);
  p.world.spawn([at(0, 0), Shape2D({ shape: 'circle', radius: 2.3, fill: COLORS.clay, layer: 3, z: 1 })]);
  p.world.spawn([at(0, 0), Shape2D({ shape: 'circle', radius: 2.0, fill: COLORS.loam, layer: 3, z: 2 })]);
  emblem((parts) => p.world.spawn([at(parts.x ?? 0, parts.y ?? 0), Shape2D({ layer: 3, z: 3, ...parts.shape })]));
  p.settle(0.1);
}

const BADGES = {
  // A green root, cut by ember blades.
  'first-snip': (add) => {
    add({ shape: { shape: 'line', points: [[-1.4, -0.9], [-0.25, -0.15]], stroke: '#45e08a', strokeWidth: 0.32 } });
    add({ shape: { shape: 'line', points: [[0.25, 0.15], [1.4, 0.9]], stroke: COLORS.ash, strokeWidth: 0.32, dash: 0.2 } });
    add({ shape: { shape: 'line', points: [[-0.75, 0.75], [0.75, -0.75]], stroke: COLORS.ember, strokeWidth: 0.24 } });
    add({ shape: { shape: 'line', points: [[-0.75, -0.75], [0.75, 0.75]], stroke: COLORS.ember, strokeWidth: 0.24 } });
  },
  // A long dead root, grey and broken, with the cut at its base.
  'clean-cut': (add) => {
    add({ shape: { shape: 'line', points: [[-1.3, -1.1], [-0.4, -0.3], [0.2, 0.4], [1.2, 1.1]], stroke: '#cfc5ba', strokeWidth: 0.28, dash: 0.22 } });
    add({ x: -1.3, y: -1.1, shape: { shape: 'circle', radius: 0.42, fill: '#00000000', stroke: COLORS.ember, strokeWidth: 0.16 } });
    add({ shape: { shape: 'line', points: [[-1.3, -1.1], [-1.75, -0.3]], stroke: '#45e08a', strokeWidth: 0.3 } });
  },
  // A seed with the crown.
  'took-the-dish': (add) => {
    add({ y: -0.35, shape: { shape: 'circle', radius: 0.95, fill: '#ff4f6e', stroke: COLORS.night, strokeWidth: 0.12 } });
    add({ y: 0.95, shape: { shape: 'polygon', points: [[-0.85, 0], [-0.85, 0.6], [-0.42, 0.3], [0, 0.85], [0.42, 0.3], [0.85, 0.6], [0.85, 0]], fill: COLORS.gold, stroke: COLORS.night, strokeWidth: 0.1 } });
  },
};

export function TaprootPosters() {
  return defineModule({
    name: 'taproot-posters',
    install(game) {
      if (!game.poster) return;
      // The cover: the dish mid-fight on the right, the name big on the left, a snip just landed.
      game.poster('cover', (p) => {
        const staged = pose(p, { seed: 8, seconds: 9, long: 9 });
        const cam = p.camera({ height: 30, clear: COLORS.night });
        cam.get(Transform).position.set(-12.5, 0, 0);
        p.world.spawn([Transform({ position: [-25.5, 3.2, 0] }), Text({ text: 'TAPROOT', font: FONT, size: 4.6, weight: 800, color: COLORS.clay, outline: 0.45, outlineColor: COLORS.night })]);
        p.world.spawn([Transform({ position: [-25.5, -1.2, 0] }), Text({ text: 'GROW · SNIP · WITHER', font: FONT, size: 1.5, weight: 800, color: COLORS.water, outline: 0.25, outlineColor: COLORS.night })]);
        p.settle(0.5);
        freeze(p, staged);
      });
      // A snip up close: the cut, the husks, the dotted plans.
      game.poster('snip', (p) => {
        const staged = pose(p, { seed: 9, seconds: 8, long: 8 });
        const g = staged.b.g;
        const at = staged.snip ? staged.snip.cell : 0;
        const cam = p.camera({ height: 16, clear: COLORS.night });
        cam.get(Transform).position.set(g.x[at] * 0.7, g.y[at] * 0.7, 0);
        p.settle(0.5);
        freeze(p, staged);
      });
      // The whole dish with the standings: late in a round.
      game.poster('dish', (p) => {
        const staged = pose(p, { seed: 8, seconds: 60, hud: true });
        p.camera({ height: 30, clear: COLORS.night });
        p.settle(0.5);
        freeze(p, staged);
      });
      // The icon: one seed and its glowing roots, a drop beside it, no words.
      game.poster(
        'icon',
        (p) => {
          const staged = pose(p, { seed: 2, seconds: 16, names: false, snip: false });
          const b = staged.b;
          const g = b.g;
          // The seed with the most roots round it.
          let seat = 0;
          const { cells } = tally(b);
          cells.forEach((n, s) => (n > cells[seat] ? (seat = s) : 0));
          const c = b.seeds[seat];
          // A drop beside it for the eye.
          for (let d = 0; d < 6; d++) {
            const j = g.nbr[c * 6 + d];
            const k = j >= 0 ? g.nbr[j * 6 + d] : -1;
            if (k >= 0 && b.terrain[k] !== ROCK && b.owner[k] === 0) {
              b.terrain[k] = DROP;
              break;
            }
          }
          staged.v.growers.forEach((o) => {
            o.mode = 'idle';
            o.path = [];
          });
          staged.v.feed = [];
          const cam = p.camera({ height: 7.5, clear: COLORS.loam });
          cam.get(Transform).position.set(g.x[c], g.y[c], 0);
          p.settle(0.4);
        },
        { width: 512, height: 512 },
      );
      for (const [id, emblem] of Object.entries(BADGES)) game.poster(`badge-${id}`, (p) => medallion(p, emblem), { width: 256, height: 256 });
    },
  });
}
