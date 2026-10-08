// The board's geometry: a round dish of hexagonal cells (pointy-top, axial coordinates q and r), with no engine in it.
// Every page builds the same geometry from the board's size alone, so only the size crosses the network.

/** Axial steps to the six neighbours, in order. Direction d and (d + 3) % 6 are opposite. */
export const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/** Centre-to-corner size of a cell in world units. */
export const CELL = 1;
const SQ3 = Math.sqrt(3);

/** World position of axial (q, r): y points up, so r grows downward on the screen. */
export const toWorld = (q, r) => ({ x: CELL * SQ3 * (q + r / 2), y: -CELL * 1.5 * r });

/** The axial cell (fractional) under a world point. */
export function fromWorld(x, y) {
  const r = -y / (1.5 * CELL);
  const q = x / (SQ3 * CELL) - r / 2;
  return roundAxial(q, r);
}

/** Rounds fractional axial coordinates to the nearest cell. */
export function roundAxial(q, r) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

export const hexDistance = (aq, ar, bq, br) => (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(-aq - ar + bq + br)) / 2;

const cache = new Map();

/** The dish's radius in world units for each board size (127, 169 and 211 cells): round, so every seat round it is alike. */
export const DISC = { 6: 10.5, 7: 12, 8: 13.5 };

/**
 * The cells of the dish of `size` (6, 7 or 8): their axial coordinates, world centres, neighbours (6 per cell, -1 off the board)
 * and a lookup from (q, r) to the cell's index. Built once per size and shared.
 */
export function geometry(size) {
  let g = cache.get(size);
  if (g) return g;
  const disc = DISC[size] ?? size * 1.5 + 1;
  const reach = Math.ceil(disc / 1.5) + 1;
  const qs = [];
  const rs = [];
  for (let r = -reach; r <= reach; r++) {
    for (let q = -reach * 2; q <= reach * 2; q++) {
      const w = toWorld(q, r);
      if (Math.hypot(w.x, w.y) > disc + 1e-6) continue;
      qs.push(q);
      rs.push(r);
    }
  }
  const count = qs.length;
  const index = new Map();
  const key = (q, r) => q * 64 + r;
  for (let i = 0; i < count; i++) index.set(key(qs[i], rs[i]), i);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const nbr = new Int16Array(count * 6).fill(-1);
  for (let i = 0; i < count; i++) {
    const w = toWorld(qs[i], rs[i]);
    x[i] = w.x;
    y[i] = w.y;
    for (let d = 0; d < 6; d++) {
      const j = index.get(key(qs[i] + DIRS[d][0], rs[i] + DIRS[d][1]));
      if (j !== undefined) nbr[i * 6 + d] = j;
    }
  }
  const at = (q, r) => {
    const i = index.get(key(q, r));
    return i === undefined ? -1 : i;
  };
  /** The cell under a world point, or -1 off the board. */
  const cellAt = (wx, wy) => {
    const a = fromWorld(wx, wy);
    return at(a.q, a.r);
  };
  const dist = (i, j) => hexDistance(qs[i], rs[i], qs[j], rs[j]);
  // How far the board reaches from its centre, in world units (to a corner of an outer cell).
  const extent = Math.max(...Array.from(x, (v, i) => Math.hypot(v, y[i]))) + CELL;
  g = { size, disc, count, q: Int8Array.from(qs), r: Int8Array.from(rs), x, y, nbr, at, cellAt, dist, extent };
  cache.set(size, g);
  return g;
}

/** The corners of a cell around its centre, scaled by `k` (1 = touching its neighbours). */
export function hexCorners(k = 1) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    out.push([Math.cos(a) * CELL * k, Math.sin(a) * CELL * k]);
  }
  return out;
}
