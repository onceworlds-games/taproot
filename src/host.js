// The host's side of a round: the board and the seats' growers are made once (populate), orders arrive as calls and are checked,
// and every step the host grows each seat's roots, raises water drops and writes the board back. Every page sees the result
// through the replicated `Soil` and `Grower`; a new host carries on from them.
import { defineModule, defineSystem, t } from '@onceworlds/engine';
import { netOf } from '@onceworlds/engine/modules';
import { decode, encode, encodeLive } from './codec.js';
import { Grower, HostClock, Planter, Soil } from './components.js';
import { DROP, ROCK, SOIL, TUNING, dropsOf, isSeed, leaderOf, makeBoard, pathTo, pickDropCell, stepGrower, tally } from './rules.js';

// ---------------------------------------------------------------- reading the board

const cache = new WeakMap();

/** The board as plain data, decoded from the `Soil` entity (kept between steps while its version stays the same). */
export function boardOf(world) {
  const e = soilEntity(world);
  if (!e) return null;
  const soil = e.get(Soil);
  const held = cache.get(world);
  if (held && held.entity === e.id && held.version === soil.version && held.cells === soil.cells) return held.board;
  const board = decode(soil, held?.board);
  cache.set(world, { entity: e.id, version: soil.version, cells: soil.cells, board });
  return board;
}

const queries = new WeakMap();
function q(world) {
  let found = queries.get(world);
  if (!found) queries.set(world, (found = { soil: world.query([Soil]), growers: world.query([Grower]) }));
  return found;
}

export const soilEntity = (world) => q(world).soil.first() ?? null;

/** The growers by seat index (holes where one hasn't arrived yet). */
export function growersOf(world) {
  const out = [];
  q(world).growers.each((e, g) => {
    if (g.seat < 8) out[g.seat] = e;
  });
  return out;
}

/** This page's own grower, or null when watching. */
export function myGrower(world, me) {
  let found = null;
  q(world).growers.each((e, g) => {
    if (g.id === me) found = e;
  });
  return found;
}

// ---------------------------------------------------------------- the round's setup (host, once)

/** Makes the round's board and a grower for every seat. Everyone moves one place round the dish each round. */
export function populateRound(ctx) {
  const seats = ctx.seats.length;
  const seed = 1 + Math.floor(ctx.rng('map').next() * 100000);
  const b = makeBoard(seats, seed, (ctx.round - 1) % seats);
  const entity = ctx.world.spawn([Soil()], { owner: 'host' });
  encode(b, entity.get(Soil));
  const { cells } = tally(b);
  ctx.seats.forEach((seat, s) => {
    ctx.world.spawn([Grower({ seat: s, id: seat.id, sap: TUNING.startSap, cells: cells[s], income: TUNING.baseIncome })], { owner: 'host' });
  });
  const clock = ctx.world.resource(HostClock);
  clock.tick = 0;
  clock.nextDrop = TUNING.dropEvery;
}

// ---------------------------------------------------------------- orders

/** Gives a seat's grower an order, if the cell is one it may aim at. Returns '' or why not. (Host.) */
export function applyOrder(world, id, cell) {
  const e = myGrower(world, id);
  const b = boardOf(world);
  if (!e || !b) return 'not playing';
  if (!(cell >= 0 && cell < b.g.count)) return 'off the board';
  if (b.terrain[cell] === ROCK) return 'rock';
  const g = e.get(Grower);
  const mine = b.owner[cell] === g.seat + 1;
  if (!mine && isSeed(b, cell)) return 'a seed';
  g.target = cell;
  g.mode = mine ? 'bloom' : 'reach';
  return '';
}

/** The call a tap makes, provided to systems as `taproot.order(cell)`. */
export function Orders() {
  return defineModule({
    name: 'taproot-orders',
    install(game) {
      const net = netOf(game);
      const order = net.rpc('taproot.order', {
        args: { cell: t.u16() },
        to: 'host',
        rate: 12,
        validate: (from, a) => (!!myGrower(game.world, from.id) && a.cell < 256) || 'not in this round',
        run: (from, a) => void applyOrder(game.world, from.id, a.cell),
      });
      game.provide('taproot', { order: (cell) => order({ cell }) });
    },
  });
}

// ---------------------------------------------------------------- growing (host, every step)

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export const Grow = defineSystem({
  name: 'taproot:grow',
  stage: 'fixed',
  authority: 'host',
  run({ world, time, flow, rng }) {
    if (flow.phase !== 'playing' || flow.poster) return;
    const e = soilEntity(world);
    const b = boardOf(world);
    if (!e || !b) return;
    const soil = e.get(Soil);
    const ctx = flow.context();
    const now = Math.max(0, ctx.elapsed ?? 0);
    b.now = now;
    const growers = growersOf(world);
    const { cells, income } = tally(b);
    b.crown = leaderOf(cells);
    const flood = ctx.remaining !== undefined && ctx.remaining <= TUNING.floodSeconds;
    const clock = world.resource(HostClock);
    clock.tick++;
    let changed = false;
    for (let k = 0; k < b.seats; k++) {
      // Seats take turns at going first, so nobody wins every tie.
      const s = (k + clock.tick) % b.seats;
      const ge = growers[s];
      if (!ge) continue;
      const g = ge.get(Grower);
      const plain = { sap: g.sap, wait: g.wait, target: g.target, mode: g.mode, need: g.need, needAt: g.needAt };
      const ev = stepGrower(b, s, plain, time.dt, income[s], flood);
      g.sap = plain.sap;
      g.wait = Math.min(plain.wait, 5);
      if (g.target !== plain.target) g.target = plain.target;
      if (g.mode !== plain.mode) g.mode = plain.mode;
      g.need = plain.need ?? 0;
      g.needAt = plain.needAt ?? -1;
      if (!ev || ev.type === 'done') continue;
      changed = true;
      g.grows = (g.grows + 1) >>> 0;
      if (ev.drink) {
        g.drinks = (g.drinks + 1) % 65536;
        g.drinkCell = ev.cell;
        flow.stat('drops', 1, ctx.seats[s]?.id);
      }
      if (ev.type === 'snip' && ev.cells.length > 0) {
        g.snips = (g.snips + 1) % 65536;
        g.snipCell = ev.cell;
        g.snipSize = ev.cells.length;
        g.snipVictim = ev.victim;
        g.cut = Math.min(65535, g.cut + ev.cells.length);
        g.best = Math.max(g.best, ev.cells.length);
        flow.stat('snipped', ev.cells.length, ctx.seats[s]?.id);
      }
    }
    // Water: a ripple shows where the next drop will rise, then it rises (if the soil there is still open).
    if (soil.warn >= 0 && now >= soil.warnAt) {
      const c = soil.warn;
      if (c < b.g.count && b.terrain[c] === SOIL && b.owner[c] === 0) {
        b.terrain[c] = DROP;
        changed = true;
      }
      soil.warn = -1;
    }
    if (soil.warn < 0 && now >= clock.nextDrop) {
      clock.nextDrop = now + TUNING.dropEvery;
      if (dropsOf(b).length < b.seats) {
        const c = pickDropCell(b, rng('drops'));
        if (c >= 0) {
          soil.warn = c;
          soil.warnAt = now + TUNING.dropWarn;
        }
      }
    }
    if (changed || soil.crown !== b.crown) {
      encodeLive(b, soil);
      soil.version = (soil.version + 1) >>> 0;
      cache.set(world, { entity: e.id, version: soil.version, cells: soil.cells, board: b });
    }
    // What everyone sees: each seat's planned root, its cells and its sap a second.
    const after = changed ? tally(b) : { cells, income };
    for (let s = 0; s < b.seats; s++) {
      const ge = growers[s];
      if (!ge) continue;
      const g = ge.get(Grower);
      const stale = g.mode === 'reach' ? g.path.length === 0 || g.path[g.path.length - 1] !== g.target : g.path.length > 0;
      if (changed || stale) {
        const path = g.mode === 'reach' ? pathTo(b, s, g.target).slice(0, 40) : [];
        if (!sameList(path, g.path)) g.path = path;
      }
      if (g.cells !== after.cells[s]) g.cells = after.cells[s];
      const inc = after.income[s] * (flood ? TUNING.floodRate : 1);
      if (Math.abs(g.income - inc) > 0.01) g.income = inc;
    }
  },
});

/** A seat's body for Flow (bots and players alike). */
export const planterParts = (seat) => [Planter({ seat: seat.id })];
