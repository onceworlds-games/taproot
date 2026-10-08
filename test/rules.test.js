// The rules as plain functions: the map is fair, costs are what the screen says, a snip withers exactly what was cut off, and the
// board survives the network (and garbage on it).
import { expect, test } from 'vitest';
import { chooseOrder, STYLES } from '../src/brain.js';
import { decode, encode } from '../src/codec.js';
import { DROP, ROCK, SEED_PARENT, TUNING, bloomCells, cellCost, claim, cloneBoard, incomeAt, leaderOf, makeBoard, pathTo, preview, seededRng, snipSizes, stepGrower, support, tally } from '../src/rules.js';

const turn60 = (g, i) => g.at(g.q[i] + g.r[i], -g.q[i]);

test('a six-seat dish is the same from every seat: turning it a sixth maps rocks to rocks, water to water, seeds to seeds', () => {
  for (const seed of [1, 2, 3, 99]) {
    const b = makeBoard(6, seed);
    const g = b.g;
    for (let i = 0; i < g.count; i++) {
      const j = turn60(g, i);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(b.terrain[j]).toBe(b.terrain[i]);
    }
    const seeds = new Set(b.seeds);
    for (const c of b.seeds) expect(seeds.has(turn60(g, c))).toBe(true);
  }
});

test('everyone starts with a seed and its six neighbours, and all the open soil is reachable', () => {
  for (const seats of [2, 3, 4, 5, 6, 7, 8]) {
    const b = makeBoard(seats, seats * 3);
    const { cells } = tally(b);
    expect(cells).toEqual(new Array(seats).fill(7));
    b.seeds.forEach((c, s) => {
      expect(b.owner[c]).toBe(s + 1);
      expect(b.parent[c]).toBe(SEED_PARENT);
    });
    // Every open cell can be reached by seat 0.
    const reach = pathTo(b, 0, -1);
    expect(reach).toEqual([]);
    for (let i = 0; i < b.g.count; i++) {
      if (b.terrain[i] === ROCK || b.owner[i]) continue;
      expect(pathTo(b, 0, i).length).toBeGreaterThan(0);
    }
  }
});

test('costs: open soil 1, an enemy cell 2 plus 2 for each of its owner\'s cells touching it, seeds and rocks never, the leader 1 less', () => {
  const b = makeBoard(6, 5);
  const g = b.g;
  const ring = [0, 1, 2, 3, 4, 5].map((d) => g.nbr[b.seeds[1] * 6 + d]).find((c) => c >= 0);
  expect(cellCost(b, 0, b.seeds[1])).toBe(Infinity);
  expect(cellCost(b, 1, ring)).toBe(0);
  expect(cellCost(b, 0, ring)).toBe(TUNING.enemyBase + TUNING.supportCost * support(b, ring));
  b.crown = 1;
  expect(cellCost(b, 0, ring)).toBe(TUNING.enemyBase + TUNING.supportCost * support(b, ring) - TUNING.crown);
  const open = [...Array(g.count).keys()].find((i) => b.owner[i] === 0 && b.terrain[i] !== ROCK);
  expect(cellCost(b, 0, open)).toBe(1);
  const rock = [...Array(g.count).keys()].find((i) => b.terrain[i] === ROCK);
  expect(cellCost(b, 0, rock)).toBe(Infinity);
});

/** Grows seat s along a path to `target`, for free. */
function growTo(b, s, target) {
  for (const c of pathTo(b, s, target)) claim(b, s, c);
}

test('cutting a thin root withers everything past the cut, and nothing else', () => {
  const b = makeBoard(6, 7);
  const g = b.g;
  // Seat 1 sends a long thin root to the middle; seat 0 grows next to it and cuts it.
  const middle = g.at(0, 0);
  growTo(b, 1, middle);
  const before = tally(b).cells[1];
  const sizes = snipSizes(b, 1);
  // The best place to cut: the one that withers the most.
  let cut = -1;
  for (let i = 0; i < g.count; i++) if (b.owner[i] === 2 && (cut < 0 || sizes[i] > sizes[cut])) cut = i;
  expect(sizes[cut]).toBeGreaterThan(1);
  const res = claim(b, 0, cut);
  expect(res.victim).toBe(1);
  expect(res.cells.length).toBe(sizes[cut] - 1);
  expect(tally(b).cells[1]).toBe(before - sizes[cut]);
  for (const c of res.cells) expect(b.owner[c]).toBe(0);
});

test('snipSizes predicts every cut exactly, on boards grown at random', () => {
  const rng = seededRng(4);
  for (let round = 0; round < 6; round++) {
    const b = makeBoard(6, round + 1);
    // Grow everyone at random for a while.
    for (let k = 0; k < 160; k++) {
      const s = Math.floor(rng.next() * 6);
      const target = Math.floor(rng.next() * b.g.count);
      const path = pathTo(b, s, target);
      if (path.length) claim(b, s, path[0]);
    }
    for (let v = 0; v < 6; v++) {
      const sizes = snipSizes(b, v);
      for (let i = 0; i < b.g.count; i++) {
        if (b.owner[i] !== v + 1 || i === b.seeds[v]) continue;
        const work = cloneBoard(b);
        const res = claim(work, (v + 1) % 6, i);
        expect(res.cells.length + 1).toBe(sizes[i]);
      }
    }
  }
});

test('after a cut, every root still standing finds its way back to its seed', () => {
  const rng = seededRng(9);
  const b = makeBoard(6, 3);
  for (let k = 0; k < 400; k++) {
    const s = Math.floor(rng.next() * 6);
    const path = pathTo(b, s, Math.floor(rng.next() * b.g.count));
    if (path.length) claim(b, s, path[0]);
  }
  const g = b.g;
  for (let i = 0; i < g.count; i++) {
    if (!b.owner[i]) continue;
    let c = i;
    for (let steps = 0; steps < g.count && b.parent[c] !== SEED_PARENT; steps++) {
      const j = g.nbr[c * 6 + b.parent[c]];
      expect(j).toBeGreaterThanOrEqual(0);
      expect(b.owner[j]).toBe(b.owner[i]);
      c = j;
    }
    expect(b.parent[c]).toBe(SEED_PARENT);
  }
});

test('a grower pays per cell, drinks drops, gets sap back for what it withers, and stops when it gets there', () => {
  const b = makeBoard(6, 2);
  const g = b.g;
  const drop = [...Array(g.count).keys()].filter((i) => b.terrain[i] === DROP).sort((x, y) => pathTo(b, 0, x).length - pathTo(b, 0, y).length)[0];
  const grower = { sap: 0, wait: 0, target: drop, mode: 'reach' };
  const path = pathTo(b, 0, drop);
  let drank = false;
  for (let t = 0; t < 30 && grower.mode !== 'idle'; t += 1 / 60) {
    b.now = t;
    const ev = stepGrower(b, 0, grower, 1 / 60, incomeAt(t));
    if (ev?.drink) drank = true;
  }
  expect(drank).toBe(true);
  expect(b.owner[drop]).toBe(1);
  expect(b.terrain[drop]).not.toBe(DROP);
  expect(grower.mode).toBe('idle');
  expect(path.length).toBeGreaterThan(0);
});

test('a bloom fills only open soil round the tapped cell, and the preview shows the same cells', () => {
  const b = makeBoard(6, 8);
  const seed = b.seeds[0];
  const cells = bloomCells(b, 0, seed);
  expect(cells.length).toBeGreaterThan(0);
  for (const c of cells) {
    expect(b.owner[c]).toBe(0);
    expect(b.g.dist(c, seed)).toBeLessThanOrEqual(TUNING.bloomRadius);
  }
  expect(preview(b, 0, seed).path).toEqual(cells);
});

test('the preview of a snip names the cells that would wither', () => {
  const b = makeBoard(6, 7);
  growTo(b, 1, b.g.at(0, 0));
  const sizes = snipSizes(b, 1);
  let cut = -1;
  for (let i = 0; i < b.g.count; i++) if (b.owner[i] === 2 && (cut < 0 || sizes[i] > sizes[cut])) cut = i;
  const pv = preview(b, 0, cut);
  expect(pv.kind).toBe('reach');
  expect(pv.doomed.length).toBeGreaterThanOrEqual(sizes[cut] - 1);
  expect(Number.isFinite(pv.cost)).toBe(true);
});

test('the board crosses the network intact, and garbage reads as a safe board or none', () => {
  const b = makeBoard(6, 4);
  growTo(b, 2, b.g.at(0, 0));
  b.crown = 2;
  const soil = { size: 0, seats: 0, cells: '', terrain: '', seeds: [], crown: -1 };
  encode(b, soil);
  const back = decode(soil);
  expect(Array.from(back.owner)).toEqual(Array.from(b.owner));
  expect(Array.from(back.parent)).toEqual(Array.from(b.parent));
  expect(Array.from(back.terrain)).toEqual(Array.from(b.terrain));
  expect(back.crown).toBe(2);
  expect(decode({ ...soil, size: 99 })).toBe(null);
  expect(decode({ ...soil, seeds: [1, 2] })).toBe(null);
  const junk = decode({ ...soil, cells: '"\\ÿ'.repeat(80), terrain: 12345, crown: 40 });
  expect(junk).not.toBe(null);
  expect(junk.crown).toBe(-1);
  for (let i = 0; i < junk.g.count; i++) expect(junk.owner[i]).toBeLessThanOrEqual(6);
  // Seeds stay seeds whatever arrives, and nothing else pretends to be one.
  junk.seeds.forEach((c, s) => expect(junk.owner[c]).toBe(s + 1));
  const seeds = new Set(junk.seeds);
  for (let i = 0; i < junk.g.count; i++) if (!seeds.has(i)) expect(junk.parent[i]).not.toBe(SEED_PARENT);
});

test('bots pick real targets: never a rock or a seed', () => {
  const b = makeBoard(6, 6);
  const rng = seededRng(3);
  for (let s = 0; s < 6; s++) {
    for (const style of Object.values(STYLES)) {
      const pick = chooseOrder(b, s, { style, rng, mistake: 0.3, left: 60 });
      expect(pick).not.toBe(null);
      expect(b.terrain[pick.target]).not.toBe(ROCK);
      expect(b.seeds.includes(pick.target) && b.owner[pick.target] !== s + 1).toBe(false);
    }
  }
});

test('the leader is whoever has the most, and nobody when it is shared', () => {
  expect(leaderOf([3, 9, 4])).toBe(1);
  expect(leaderOf([9, 9, 4])).toBe(-1);
});
