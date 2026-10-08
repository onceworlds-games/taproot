// The rules of Taproot as plain functions on plain data: the map, what a cell costs, the way a root goes, growing, snipping and
// withering. The host's systems, the bots, the screen's previews, the tests and the balance tool all call these.
//
// A board is { radius, seats, g (geometry), terrain, owner, parent, born, seeds, now }:
//   terrain[i]  0 soil, 1 rock, 2 a water drop (drunk by the first root to reach it)
//   owner[i]    0 nobody, else seat index + 1
//   parent[i]   the direction (0-5) a root grew into this cell from, 6 for a seed, 7 for none
//   born[i]     the round's second the cell was taken (roots thicken with age)
//   seeds[s]    the seed cell of seat s
//   now         the round's second now
//   crown       the seat in the lead (its cells are cheaper to take), or -1

import { DIRS, geometry } from './hex.js';

export const SOIL = 0;
export const ROCK = 1;
export const DROP = 2;
export const NO_PARENT = 7;
export const SEED_PARENT = 6;

/** Every number of the game, in one place. */
export const TUNING = {
  /** Sap a second for everyone. */
  baseIncome: 2,
  /** A water drop is drunk by the first root to reach it. A new one rises every `dropEvery` seconds while fewer than one a seat are out. */
  dropSap: 4,
  dropEvery: 2.4,
  /** A drop shows where it will rise this long before it does (everyone sees the race coming). */
  dropWarn: 1.5,
  /** The seat with the most cells wears the crown: its cells cost this much less to take (everyone can catch the leader). */
  crown: 1,
  /** Sap the snipper gets for each cell that withers (what was cut off feeds the one who cut it). */
  compost: 1,
  /** The most sap a seed holds (a drop or a snip may top it past this, up to `sapMax`). */
  sapCap: 12,
  sapMax: 16,
  startSap: 4,
  /** Seconds between two cells of one root, at the fastest. */
  step: 0.16,
  /** Open soil costs this; an enemy cell costs `enemyBase` plus its owner's cells touching it. */
  soilCost: 1,
  enemyBase: 3,
  /** Roots thicken with age: one ring every `ageStep` seconds, up to `maxAge`, each adding 1 to what the cell costs to take. */
  ageStep: 10,
  maxAge: 3,
  /** How far a bloom fills around the tapped cell. */
  bloomRadius: 2,
  /** The round, and the Flood at its end (sap flows `floodRate` times as fast). */
  roundSeconds: 90,
  floodSeconds: 15,
  floodRate: 2,
};

/** The board's size (see `DISC` in hex.js) for a number of seats. */
export const radiusFor = (seats) => (seats <= 4 ? 6 : seats <= 6 ? 7 : 8);

/** A small seeded random stream (mulberry32), for the map and the balance tool. The engine's rng is used in play. */
export function seededRng(seed) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, float: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), chance: (p) => next() < p };
}

// ---------------------------------------------------------------- the map

/** The cell nearest to a world point (any cell of the board). */
function nearestCell(g, wx, wy, skip) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < g.count; i++) {
    if (skip && skip(i)) continue;
    const d = (g.x[i] - wx) ** 2 + (g.y[i] - wy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * A fair map for `seats` seeds: seeds evenly round a ring, a water drop three cells in front of each (their first target), one drop
 * between each pair of neighbours (to fight over), the great spring in the middle behind a broken ring of rocks, and the same rocks
 * in every seat's slice of the dish. `seed` varies the rocks from round to round.
 */
export function makeBoard(seats, seed = 1, turnSeats = 0) {
  const radius = radiusFor(seats);
  const g = geometry(radius);
  const rng = seededRng(seed * 7919 + seats);
  const terrain = new Uint8Array(g.count);
  const owner = new Uint8Array(g.count);
  const parent = new Uint8Array(g.count).fill(NO_PARENT);
  const born = new Float32Array(g.count);
  const ringR = g.disc - 2;
  const angleOf = (s) => -Math.PI / 2 + (s / seats) * Math.PI * 2;
  const near = (a, r, skip) => nearestCell(g, Math.cos(a) * r, Math.sin(a) * r, skip);
  // With 2, 3 or 6 seats the dish is turned by whole sixths, exactly: every seat gets the very same cells. Otherwise each seat's
  // things are placed at the same angle round the dish, as near as the cells allow.
  const exact = 6 % seats === 0;
  const turn = (i, sixths) => {
    let q = g.q[i];
    let r = g.r[i];
    for (let n = 0; n < ((sixths % 6) + 6) % 6; n++) [q, r] = [q + r, -q];
    return g.at(q, r);
  };
  const forEachSeat = (place) => {
    const first = place(0);
    const out = [first];
    for (let s = 1; s < seats; s++) out.push(exact ? turn(first, (s * 6) / seats) : place(s));
    return out;
  };
  // `turnSeats` moves everyone round by that many places (a new round, a new spot), with the dish the same.
  const spots = forEachSeat((s) => near(angleOf(s), ringR));
  const seeds = spots.map((_, s) => spots[(s + turnSeats) % seats]);
  const reserved = new Set();
  for (const sd of seeds) {
    reserved.add(sd);
    for (let d = 0; d < 6; d++) if (g.nbr[sd * 6 + d] >= 0) reserved.add(g.nbr[sd * 6 + d]);
  }
  // A broken ring of rocks round the middle, a gap toward every seed: a hollow everyone reaches at once.
  const centre = g.at(0, 0);
  reserved.add(centre);
  for (let d = 0; d < 6; d++) reserved.add(g.nbr[centre * 6 + d]);
  const gaps = new Set(forEachSeat((s) => near(angleOf(s), 3)));
  for (let i = 0; i < g.count; i++) if (g.dist(i, centre) === 2 && !gaps.has(i)) terrain[i] = ROCK;
  for (const c of gaps) reserved.add(c);
  const free = (i) => reserved.has(i) || terrain[i] !== SOIL;
  // Each seed's own drop, three cells in toward the middle, and one between each pair of neighbouring seeds.
  for (const c of forEachSeat((s) => near(angleOf(s), ringR - 3 * 1.5 * 0.95, free))) {
    terrain[c] = DROP;
    reserved.add(c);
  }
  for (const c of forEachSeat((s) => near(angleOf(s + 0.5), ringR * 0.86, free))) {
    terrain[c] = DROP;
    reserved.add(c);
  }
  // Rocks: the same few clusters in every slice, turned round the dish (only where the dish turns exactly: elsewhere rocks
  // would land unevenly).
  const clusters = exact ? 1 : 0;
  for (let k = 0; k < clusters; k++) {
    const p = { f: rng.float(0.35, 0.92), a: rng.float(0.15, 0.85), size: rng.int(1, 2), dir: rng.int(0, 5) };
    const cluster = (s) => {
      const cells = [];
      let c = near(angleOf(s + p.a), p.f * ringR * 1.05);
      for (let n = 0; n < p.size && c >= 0; n++) {
        cells.push(c);
        c = g.nbr[c * 6 + ((p.dir + n) % 6)];
      }
      return cells;
    };
    const first = cluster(0);
    for (let s = 0; s < seats; s++) {
      const cells = s === 0 ? first : exact ? first.map((c) => turn(c, (s * 6) / seats)) : cluster(s);
      for (const c of cells) if (c >= 0 && !reserved.has(c) && terrain[c] === SOIL) terrain[c] = ROCK;
    }
  }
  // Never wall anything off: while the open soil is split, rocks go back to soil (the same ones on every page).
  for (let i = 0; i < g.count && !openConnected(g, terrain); i++) if (terrain[i] === ROCK && g.dist(i, centre) !== 2) terrain[i] = SOIL;
  const board = { radius, seats, g, terrain, owner, parent, born, seeds, now: 0, crown: -1 };
  for (let s = 0; s < seats; s++) {
    const sd = seeds[s];
    owner[sd] = s + 1;
    parent[sd] = SEED_PARENT;
    for (let d = 0; d < 6; d++) {
      const n = g.nbr[sd * 6 + d];
      if (n < 0 || terrain[n] === ROCK) continue;
      owner[n] = s + 1;
      parent[n] = (d + 3) % 6;
    }
  }
  return board;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function openConnected(g, terrain) {
  let start = -1;
  let open = 0;
  for (let i = 0; i < g.count; i++) {
    if (terrain[i] !== ROCK) {
      open++;
      if (start < 0) start = i;
    }
  }
  const seen = new Uint8Array(g.count);
  const stack = [start];
  seen[start] = 1;
  let n = 0;
  while (stack.length) {
    const c = stack.pop();
    n++;
    for (let d = 0; d < 6; d++) {
      const j = g.nbr[c * 6 + d];
      if (j >= 0 && !seen[j] && terrain[j] !== ROCK) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return n === open;
}

/** A deep copy of a board (the balance tool and previews change copies). */
export const cloneBoard = (b) => ({ ...b, terrain: b.terrain.slice(), owner: b.owner.slice(), parent: b.parent.slice(), born: b.born.slice(), seeds: b.seeds.slice() });

// ---------------------------------------------------------------- costs and paths

export const isSeed = (b, i) => b.parent[i] === SEED_PARENT;

/** How many of the owner's cells touch cell i. */
export function support(b, i) {
  const o = b.owner[i];
  let n = 0;
  for (let d = 0; d < 6; d++) {
    const j = b.g.nbr[i * 6 + d];
    if (j >= 0 && b.owner[j] === o) n++;
  }
  return n;
}

/** How thick a cell's root has grown: 0 (just taken) to `maxAge`. */
export const thickness = (b, i) => Math.max(0, Math.min(TUNING.maxAge, Math.floor((b.now - b.born[i]) / TUNING.ageStep)));

/** Sap it costs seat `s` to take cell i: 0 if it's already theirs, Infinity for rocks and seeds. */
export function cellCost(b, s, i) {
  const o = b.owner[i];
  if (o === s + 1) return 0;
  if (b.terrain[i] === ROCK) return Infinity;
  if (o === 0) return TUNING.soilCost;
  if (isSeed(b, i)) return Infinity;
  return TUNING.enemyBase + support(b, i) + thickness(b, i) - (b.crown === o - 1 ? TUNING.crown : 0);
}

/** A tiny binary heap keyed by cost, ties broken by cell index so every page finds the same paths. */
function heapPush(h, cost, i) {
  h.push([cost, i]);
  let k = h.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (less(h[k], h[p])) {
      [h[k], h[p]] = [h[p], h[k]];
      k = p;
    } else break;
  }
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length) {
    h[0] = last;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < h.length && less(h[l], h[m])) m = l;
      if (r < h.length && less(h[r], h[m])) m = r;
      if (m === k) break;
      [h[k], h[m]] = [h[m], h[k]];
      k = m;
    }
  }
  return top;
}
const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/**
 * Cheapest ways out from seat s's roots to every cell: `cost[i]` (sap to take everything on the way, Infinity if it can't be reached)
 * and `prev[i]` (the cell before it on the way, -1 for the seat's own cells). Each step also counts a little for length, so of two
 * equally dear ways the shorter is taken.
 */
export function reachMap(b, s) {
  const n = b.g.count;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int16Array(n).fill(-1);
  const heap = [];
  for (let i = 0; i < n; i++) {
    if (b.owner[i] === s + 1) {
      cost[i] = 0;
      heapPush(heap, 0, i);
    }
  }
  while (heap.length) {
    const [c, i] = heapPop(heap);
    if (c > cost[i]) continue;
    for (let d = 0; d < 6; d++) {
      const j = b.g.nbr[i * 6 + d];
      if (j < 0 || b.owner[j] === s + 1) continue;
      const step = cellCost(b, s, j);
      if (step === Infinity) continue;
      const nc = c + step + 0.001;
      if (nc < cost[j]) {
        cost[j] = nc;
        prev[j] = i;
        heapPush(heap, nc, j);
      }
    }
  }
  return { cost, prev };
}

/** The cells a root of seat s would take on its way to `target`, first to last (empty if it can't, or the target is theirs). */
export function pathTo(b, s, target, map = reachMap(b, s)) {
  if (target < 0 || map.cost[target] === Infinity || b.owner[target] === s + 1) return [];
  const out = [];
  for (let c = target; c >= 0 && b.owner[c] !== s + 1; c = map.prev[c]) out.push(c);
  return out.reverse();
}

/** Sap for a whole path, cell by cell as each would cost when its turn comes (taking one cell changes what its neighbours cost). */
export function pathCost(b, s, path) {
  const work = cloneBoard(b);
  let total = 0;
  for (const c of path) {
    total += cellCost(work, s, c);
    claim(work, s, c);
  }
  return total;
}

// ---------------------------------------------------------------- growing, snipping, withering

/** Seat s takes cell i. Returns what withered: { victim (seat) or -1, cells: [...] }. */
export function claim(b, s, i) {
  const g = b.g;
  const was = b.owner[i];
  // The root comes from a neighbour of ours: the one nearest our seed (by its own parent chain), or any.
  let from = -1;
  for (let d = 0; d < 6; d++) {
    const j = g.nbr[i * 6 + d];
    if (j >= 0 && b.owner[j] === s + 1) {
      from = d;
      if (isSeed(b, j)) break;
    }
  }
  b.owner[i] = s + 1;
  b.parent[i] = from >= 0 ? from : NO_PARENT;
  b.born[i] = Math.floor(b.now);
  if (b.terrain[i] === ROCK) b.terrain[i] = SOIL;
  if (was === 0 || was === s + 1) return { victim: -1, cells: [] };
  const victim = was - 1;
  const cells = wither(b, victim);
  return { victim, cells };
}

/** Everything of seat v no longer joined to its seed dies (goes back to open soil). Returns the cells that withered. */
export function wither(b, v) {
  const g = b.g;
  const seed = b.seeds[v];
  const seen = new Uint8Array(g.count);
  const bfsFrom = new Int8Array(g.count).fill(-1);
  const queue = [seed];
  seen[seed] = 1;
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k];
    for (let d = 0; d < 6; d++) {
      const j = g.nbr[c * 6 + d];
      if (j >= 0 && !seen[j] && b.owner[j] === v + 1) {
        seen[j] = 1;
        bfsFrom[j] = (d + 3) % 6;
        queue.push(j);
      }
    }
  }
  const dead = [];
  for (let i = 0; i < g.count; i++) {
    if (b.owner[i] === v + 1 && !seen[i]) {
      b.owner[i] = 0;
      b.parent[i] = NO_PARENT;
      dead.push(i);
    }
  }
  // Roots whose way back to the seed went through the lost cell grow a new way back (the shortest).
  const ok = new Int8Array(g.count); // 0 unknown, 1 reaches the seed, -1 broken
  ok[seed] = 1;
  for (const start of queue) {
    const chain = [];
    let c = start;
    while (ok[c] === 0) {
      chain.push(c);
      ok[c] = 2; // in progress
      const p = b.parent[c];
      const j = p < 6 ? g.nbr[c * 6 + p] : -1;
      if (j < 0 || b.owner[j] !== v + 1) break;
      c = j;
    }
    const good = ok[c] === 1;
    for (const x of chain) ok[x] = good ? 1 : -1;
  }
  for (const c of queue) if (ok[c] === -1) b.parent[c] = bfsFrom[c];
  return dead;
}

/**
 * For every cell of seat v: how many of v's cells would wither if it were taken (itself included), from one walk of v's roots
 * (cut vertices and the size of what hangs below them). Cells not v's are 0.
 */
export function snipSizes(b, v) {
  const g = b.g;
  const n = g.count;
  const out = new Int16Array(n);
  const seed = b.seeds[v];
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const size = new Int32Array(n);
  let time = 0;
  // Iterative DFS from the seed over v's cells.
  const stack = [[seed, -1, 0]];
  disc[seed] = low[seed] = time++;
  size[seed] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const [c, par] = top;
    if (top[2] < 6) {
      const d = top[2]++;
      const j = g.nbr[c * 6 + d];
      if (j < 0 || b.owner[j] !== v + 1 || j === par) continue;
      if (disc[j] === -1) {
        disc[j] = low[j] = time++;
        size[j] = 1;
        stack.push([j, c, 0]);
      } else low[c] = Math.min(low[c], disc[j]);
      continue;
    }
    stack.pop();
    if (par >= 0) {
      low[par] = Math.min(low[par], low[c]);
      size[par] += size[c];
      // Taking `par` cuts off c's whole branch when nothing in it reaches above par.
      if (low[c] >= disc[par]) out[par] += size[c];
    }
  }
  for (let i = 0; i < n; i++) if (b.owner[i] === v + 1 && disc[i] >= 0) out[i] += 1;
  out[seed] = 0;
  return out;
}

/** What a reach to `target` would do for seat s: the path, its sap and the enemy cells that would wither on the way. */
export function preview(b, s, target) {
  if (target < 0 || target >= b.g.count) return null;
  if (b.owner[target] === s + 1) return { kind: 'bloom', path: bloomCells(b, s, target), cost: 0, doomed: [] };
  const path = pathTo(b, s, target);
  if (path.length === 0) return { kind: 'none', path, cost: Infinity, doomed: [] };
  const work = cloneBoard(b);
  let cost = 0;
  const doomed = [];
  for (const c of path) {
    cost += cellCost(work, s, c);
    const res = claim(work, s, c);
    for (const x of res.cells) doomed.push(x);
  }
  return { kind: 'reach', path, cost, doomed };
}

/** Open soil a bloom at `centre` would fill, nearest first: within `bloomRadius` of it, and touching seat s's roots as it goes. */
export function bloomCells(b, s, centre) {
  const g = b.g;
  const work = cloneBoard(b);
  const out = [];
  for (;;) {
    const next = nextBloom(work, s, centre);
    if (next < 0) break;
    out.push(next);
    work.owner[next] = s + 1;
  }
  void g;
  return out;
}

/** The next cell a bloom at `centre` takes, or -1 when it's done. */
export function nextBloom(b, s, centre) {
  const g = b.g;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < g.count; i++) {
    if (b.owner[i] !== 0 || b.terrain[i] === ROCK) continue;
    const d = g.dist(i, centre);
    if (d > TUNING.bloomRadius || d >= bestD) continue;
    let touches = false;
    for (let k = 0; k < 6 && !touches; k++) {
      const j = g.nbr[i * 6 + k];
      touches = j >= 0 && b.owner[j] === s + 1;
    }
    if (touches) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- a seat's turn of growing

/** The seat with the most cells, or -1 when two or more share the most. */
export function leaderOf(cells) {
  let best = -1;
  let most = -1;
  let shared = false;
  cells.forEach((n, s) => {
    if (n > most) {
      most = n;
      best = s;
      shared = false;
    } else if (n === most) shared = true;
  });
  return shared ? -1 : best;
}

/** Cells and sap a second per seat. */
export function tally(b) {
  const cells = new Array(b.seats).fill(0);
  const income = new Array(b.seats).fill(TUNING.baseIncome);
  for (let i = 0; i < b.g.count; i++) {
    const o = b.owner[i];
    if (!o) continue;
    cells[o - 1]++;
  }
  return { cells, income };
}

/** The water drops on the board. */
export function dropsOf(b) {
  const out = [];
  for (let i = 0; i < b.g.count; i++) if (b.terrain[i] === DROP) out.push(i);
  return out;
}

/**
 * Where the next drop rises: open soil at least two cells from every root if there is any (a fair race), else any open soil, else
 * nowhere (-1). `rng` is the round's random stream (the host's).
 */
export function pickDropCell(b, rng) {
  const g = b.g;
  const near = new Int16Array(g.count).fill(99);
  const queue = [];
  for (let i = 0; i < g.count; i++) {
    if (b.owner[i]) {
      near[i] = 0;
      queue.push(i);
    }
  }
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k];
    for (let d = 0; d < 6; d++) {
      const j = g.nbr[c * 6 + d];
      if (j >= 0 && near[j] > near[c] + 1) {
        near[j] = near[c] + 1;
        queue.push(j);
      }
    }
  }
  const open = [];
  const far = [];
  for (let i = 0; i < g.count; i++) {
    if (b.owner[i] || b.terrain[i] !== SOIL) continue;
    open.push(i);
    if (near[i] >= 2) far.push(i);
  }
  const from = far.length ? far : open;
  if (!from.length) return -1;
  return from[Math.floor(rng.next() * from.length) % from.length];
}

/**
 * One step of one seat's growing. `g` is the seat's grower: { sap, wait, target, mode ('idle' | 'reach' | 'bloom') }.
 * Adds sap, then takes the next cell of its order if it can afford it. Returns an event or null:
 * { type: 'grow', cell, cost, drink } or { type: 'snip', cell, cost, drink, victim, cells: [...withered] } (`drink`: it drank a drop),
 * or { type: 'done' } when the order is finished.
 */
export function stepGrower(b, s, grower, dt, income, flood = false) {
  if (grower.sap < TUNING.sapCap) grower.sap = Math.min(TUNING.sapCap, grower.sap + income * dt * (flood ? TUNING.floodRate : 1));
  grower.wait += dt;
  if (grower.mode === 'idle' || grower.target < 0) return null;
  if (grower.wait < TUNING.step) return null;
  // Saving up for a dear cell: look again only now and then (or when there's enough).
  if (grower.need > 0 && grower.sap < grower.need && b.now - grower.needAt < 0.2) return null;
  let cell = -1;
  if (grower.mode === 'bloom') {
    if (b.owner[grower.target] !== s + 1) {
      // The cell the bloom was round was taken: the bloom is over.
      grower.mode = 'idle';
      return { type: 'done' };
    }
    cell = nextBloom(b, s, grower.target);
  } else {
    if (b.owner[grower.target] === s + 1) {
      grower.mode = 'idle';
      return { type: 'done' };
    }
    const path = pathTo(b, s, grower.target);
    cell = path.length ? path[0] : -1;
  }
  if (cell < 0) {
    grower.mode = 'idle';
    return { type: 'done' };
  }
  const cost = cellCost(b, s, cell);
  if (grower.sap < cost) {
    grower.need = cost;
    grower.needAt = b.now;
    return null;
  }
  grower.need = 0;
  grower.sap -= cost;
  grower.wait = 0;
  const drink = b.terrain[cell] === DROP;
  const res = claim(b, s, cell);
  if (drink) {
    b.terrain[cell] = SOIL;
    grower.sap = Math.min(TUNING.sapMax, grower.sap + TUNING.dropSap);
  }
  if (res.cells.length) grower.sap = Math.min(TUNING.sapMax, grower.sap + res.cells.length * TUNING.compost);
  if (res.victim >= 0) return { type: 'snip', cell, cost, drink, victim: res.victim, cells: res.cells };
  return { type: 'grow', cell, cost, drink };
}
