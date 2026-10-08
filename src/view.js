// What this page shows: the live board while a round is on (from the replicated Soil and Growers), the last one frozen between
// rounds, and a little match of bots playing by itself behind the title and the lobby. Every page keeps its own animation state
// here (cells popping in, roots withering) by comparing each new board with the one before.
import { defineSystem } from '@onceworlds/engine';
import { FlowState } from '@onceworlds/engine/modules';
import { STYLES, STYLE_NAMES, chooseOrder } from './brain.js';
import { Grower, Soil } from './components.js';
import { boardOf, growersOf, soilEntity } from './host.js';
import { DROP, TUNING, cloneBoard, dropsOf, crownOf, leaderOf, makeBoard, pathTo, pickDropCell, seededRng, stepGrower, tally } from './rules.js';

const views = new WeakMap();

/** This page's view of the board for a world (made on first use). */
export function viewOf(world) {
  let v = views.get(world);
  if (!v) {
    v = {
      source: 'none', // 'live', 'frozen', 'demo' or 'none'
      board: null,
      key: '',
      growers: [], // { seat, id, name, sap, cells, income, target, mode, path, me }
      me: -1,
      warn: -1,
      warnAt: 0,
      now: 0, // the round's seconds (or the demo's)
      remaining: TUNING.roundSeconds,
      prevOwner: null,
      prevTerrain: null,
      popAt: null,
      ashAt: null,
      ashOwner: null,
      drunkAt: null,
      demo: null,
      changes: [], // what changed this frame: { type: 'grow' | 'wither' | 'drink' | 'rise', cell, owner }
    };
    views.set(world, v);
  }
  return v;
}

function resetAnim(v, n) {
  v.prevOwner = new Uint8Array(n);
  v.prevParent = new Uint8Array(n);
  v.ashParent = new Uint8Array(n).fill(7);
  v.prevTerrain = new Uint8Array(n);
  v.popAt = new Float32Array(n).fill(-10);
  v.ashAt = new Float32Array(n).fill(-10);
  v.ashOwner = new Uint8Array(n);
  v.drunkAt = new Float32Array(n).fill(-10);
}

/** Compare the new board with the one before: cells that grew, withered, or drank a drop. */
function diff(v, b, now, fresh) {
  const n = b.g.count;
  if (!v.prevOwner || v.prevOwner.length !== n || fresh) {
    resetAnim(v, n);
    v.prevOwner.set(b.owner);
    v.prevParent.set(b.parent);
    v.prevTerrain.set(b.terrain);
    return;
  }
  for (let i = 0; i < n; i++) {
    const was = v.prevOwner[i];
    const is = b.owner[i];
    if (was !== is) {
      if (is) {
        v.popAt[i] = now;
        v.changes.push({ type: 'grow', cell: i, owner: is, from: was });
      } else {
        v.ashAt[i] = now;
        v.ashOwner[i] = was;
        v.ashParent[i] = v.prevParent[i];
        v.changes.push({ type: 'wither', cell: i, owner: was });
      }
    }
    const wt = v.prevTerrain[i];
    const it = b.terrain[i];
    if (wt === DROP && it !== DROP) {
      v.drunkAt[i] = now;
      v.changes.push({ type: 'drink', cell: i, owner: is });
    } else if (wt !== DROP && it === DROP) v.changes.push({ type: 'rise', cell: i });
  }
  v.prevOwner.set(b.owner);
  v.prevParent.set(b.parent);
  v.prevTerrain.set(b.terrain);
}

/** Grows a natural-looking board: bots playing by the real rules for `seconds` (posters and tests). */
export function grownBoard(seats, seed, seconds) {
  const d = startDemo(seed);
  d.b = makeBoard(seats, 11 + seed * 7, 0);
  d.growers = d.growers.slice(0, seats);
  while (d.growers.length < seats) d.growers.push({ ...d.growers[0], think: 0.5 });
  const step = 1 / 30;
  for (let t = 0; t < seconds; t += step) stepDemoSeats(d, step, seats);
  return d;
}

// ---------------------------------------------------------------- the demo behind the title and the lobby

const DEMO_SEATS = 6;
export const DEMO_NAMES = ['Moss', 'Fern', 'Burr', 'Sorrel', 'Wren', 'Pip', 'Tansy', 'Rue'];

function startDemo(round) {
  const b = makeBoard(DEMO_SEATS, 11 + round * 7, round % DEMO_SEATS);
  const rng = seededRng(97 + round * 13);
  const growers = Array.from({ length: DEMO_SEATS }, (_, s) => ({ sap: TUNING.startSap, wait: 0, target: -1, mode: 'idle', think: 0.4 + s * 0.17, style: STYLES[STYLE_NAMES[s % STYLE_NAMES.length]] }));
  return { b, rng, growers, t: 0, nextDrop: TUNING.dropEvery, warn: -1, warnAt: 0, round, tick: 0 };
}

function stepDemo(d, dt) {
  stepDemoSeats(d, dt, DEMO_SEATS);
}

function stepDemoSeats(d, dt, seats) {
  const b = d.b;
  d.t += dt;
  b.now = d.t;
  d.tick++;
  const { cells, income } = tally(b);
  b.crown = crownOf(cells, b.crown ?? -1);
  for (let k = 0; k < seats; k++) {
    const s = (k + d.tick) % seats;
    const g = d.growers[s];
    g.think -= dt;
    if (g.think <= 0) {
      g.think = d.rng.float(0.7, 1.4);
      const pick = chooseOrder(b, s, { style: g.style, rng: d.rng, mistake: 0.15, left: 60 - d.t, current: g.mode === 'idle' ? -1 : g.target, noSnip: d.t < 6 });
      if (pick) {
        g.target = pick.target;
        g.mode = b.owner[pick.target] === s + 1 ? 'bloom' : 'reach';
      }
    }
    stepGrower(b, s, g, dt, income[s] * 0.8, false);
  }
  if (d.warn >= 0 && d.t >= d.warnAt) {
    if (b.owner[d.warn] === 0 && b.terrain[d.warn] === 0) b.terrain[d.warn] = DROP;
    d.warn = -1;
  }
  if (d.warn < 0 && d.t >= d.nextDrop) {
    d.nextDrop = d.t + TUNING.dropEvery;
    if (dropsOf(b).length < seats) {
      d.warn = pickDropCell(b, d.rng);
      d.warnAt = d.t + TUNING.dropWarn;
    }
  }
}

/** The demo's planned roots, worked out a few times a second (not every frame). */
function demoPath(d, s) {
  d.paths = d.paths ?? [];
  const g = d.growers[s];
  const held = d.paths[s];
  if (held && held.target === g.target && d.t - held.at < 0.25) return held.path;
  const path = pathTo(d.b, s, g.target).slice(0, 40);
  d.paths[s] = { target: g.target, at: d.t, path };
  return path;
}

// ---------------------------------------------------------------- the system that keeps the view up to date

export const ShowBoard = defineSystem({
  name: 'taproot:show',
  stage: 'update',
  run({ world, time, flow }) {
    const v = viewOf(world);
    v.changes.length = 0;
    // A poster poses the view itself (posters.js): leave it as it is.
    if (v.posed) return;
    const state = world.resource(FlowState);
    const live = soilEntity(world) ? boardOf(world) : null;
    const phase = state.phase;
    if (live && (phase === 'playing' || phase === 'banner' || phase === 'countdown' || phase === 'roundEnd' || flow?.poster)) {
      const soil = soilEntity(world).get(Soil);
      const key = `live:${soilEntity(world).id}`;
      const fresh = v.key !== key;
      v.key = key;
      v.source = 'live';
      // A copy, so what is drawn between rounds stays as it was.
      if (fresh || !v.board || v.board.g !== live.g) v.board = cloneBoard(live);
      else {
        v.board.owner.set(live.owner);
        v.board.parent.set(live.parent);
        v.board.terrain.set(live.terrain);
        v.board.seeds = live.seeds.slice();
        v.board.crown = live.crown;
      }
      // The round's clock from Flow (FlowState.until stays 0 in a timed round; the context has it).
      const fc = flow?.context?.();
      const remaining = phase === 'playing' ? Math.max(0, fc?.remaining ?? 0) : phase === 'roundEnd' ? 0 : TUNING.roundSeconds;
      v.remaining = remaining;
      v.total = phase === 'playing' && fc ? Math.max(1, (fc.elapsed ?? 0) + remaining) : TUNING.roundSeconds;
      v.now = phase === 'playing' && fc ? Math.max(0, fc.elapsed ?? 0) : v.total - v.remaining;
      v.board.now = v.now;
      v.warn = soil.warn;
      v.warnAt = soil.warnAt;
      const seats = flow?.seats ?? [];
      const growers = growersOf(world);
      v.growers = [];
      v.me = -1;
      for (let s = 0; s < v.board.seats; s++) {
        const e = growers[s];
        const g = e ? e.get(Grower) : null;
        const seat = seats[s];
        const mine = !!g && g.id === state.me && !!state.me;
        if (mine) v.me = s;
        v.growers.push({
          seat: s,
          id: g?.id ?? seat?.id ?? '',
          name: seat?.name ?? `Seed ${s + 1}`,
          bot: !!seat?.bot,
          sap: g?.sap ?? 0,
          cells: g?.cells ?? 0,
          income: g?.income ?? TUNING.baseIncome,
          target: g?.target ?? -1,
          mode: g?.mode ?? 'idle',
          path: g ? Array.from(g.path) : [],
          snips: g?.snips ?? 0,
          snipCell: g?.snipCell ?? -1,
          snipSize: g?.snipSize ?? 0,
          snipVictim: g?.snipVictim ?? -1,
          drinks: g?.drinks ?? 0,
          cut: g?.cut ?? 0,
          best: g?.best ?? 0,
          me: mine,
        });
      }
      diff(v, v.board, time.now, fresh);
      return;
    }
    // Between rounds (and while the next round's board is on its way): the board as it ended.
    if (v.board && (v.source === 'live' || v.source === 'frozen') && phase !== 'title' && phase !== 'lobby') {
      v.source = 'frozen';
      return;
    }
    // The countdown before a round: the empty dish, waiting for the seeds.
    if (phase === 'countdown') {
      v.source = 'none';
      v.board = null;
      v.growers = [];
      v.me = -1;
      return;
    }
    // Title and lobby: the demo.
    if (!v.demo || v.demo.t > 70) v.demo = startDemo(v.demo ? v.demo.round + 1 : 0);
    const fresh = v.source !== 'demo' || v.key !== `demo:${v.demo.round}`;
    v.key = `demo:${v.demo.round}`;
    v.source = 'demo';
    stepDemo(v.demo, Math.min(0.05, time.frameDt ?? time.dt ?? 1 / 60));
    const b = v.demo.b;
    v.board = b;
    v.now = v.demo.t;
    v.remaining = Math.max(0, 70 - v.demo.t);
    v.warn = v.demo.warn;
    v.warnAt = v.demo.warnAt;
    v.me = -1;
    const { cells } = tally(b);
    v.growers = v.demo.growers.map((g, s) => ({
      seat: s,
      id: `demo:${s}`,
      name: DEMO_NAMES[s],
      bot: true,
      sap: g.sap,
      cells: cells[s],
      income: TUNING.baseIncome,
      target: g.target,
      mode: g.mode,
      path: g.mode === 'reach' ? demoPath(v.demo, s) : [],
      snips: 0,
      snipCell: -1,
      snipSize: 0,
      snipVictim: -1,
      drinks: 0,
      cut: 0,
      best: 0,
      me: false,
    }));
    diff(v, b, time.now, fresh);
  },
});
