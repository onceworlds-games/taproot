// Bots on the host: each thinks when its reaction clock fires (sharper bots sooner), reads the board like a player (water to race
// for, thin roots to snip, its own necks under threat) and gives the same order a tap gives. Each has a personality from its
// name, so a table of bots plays differently. In round 1 they leave everyone alone for the first 20 seconds.
import { hashString } from '@onceworlds/engine';
import { FlowState, defineBotSystem } from '@onceworlds/engine/modules';
import { STYLES, STYLE_NAMES, chooseOrder } from './brain.js';
import { Grower, Planter } from './components.js';
import { applyOrder, boardOf, growersOf } from './host.js';
import { TUNING } from './rules.js';

/** A bot's personality, from its seat id (the same on every host). */
export const styleOf = (id) => STYLE_NAMES[hashString(String(id)) % STYLE_NAMES.length];

// People don't change their minds several times a second: each bot looks again every second or two (sooner the sharper it is).
const nextLook = new WeakMap();

export const BotBrain = defineBotSystem({
  name: 'taproot:bots',
  query: [Planter],
  think(ctx, bot, planter) {
    const world = ctx.world;
    const flow = world.resource(FlowState);
    if (flow.phase !== 'playing') return;
    const b = boardOf(world);
    if (!b) return;
    const now = world.time.now;
    if (now < (nextLook.get(ctx.entity) ?? 0)) return;
    nextLook.set(ctx.entity, now + 0.9 + (1 - (bot.skill ?? 0.5)) * 0.8 + ctx.rng.float(0, 0.5));
    const growers = growersOf(world);
    const me = growers.find((e) => e && e.get(Grower).id === planter.seat);
    if (!me) return;
    const g = me.get(Grower);
    const s = g.seat;
    // The host's growing writes the round's clock onto the board it keeps (FlowState.until stays 0 in a timed round).
    const elapsed = b.now ?? 0;
    const remaining = b.remaining ?? TUNING.roundSeconds - elapsed;
    // What the others are heading for: our cells on their planned roots.
    const threatened = new Set();
    let leader = -1;
    let most = -1;
    for (const e of growers) {
      if (!e) continue;
      const o = e.get(Grower);
      if (o.cells > most) {
        most = o.cells;
        leader = o.seat;
      }
      if (o.seat === s) continue;
      for (const c of o.path) if (b.owner[c] === s + 1) threatened.add(c);
    }
    const pick = chooseOrder(b, s, {
      style: STYLES[styleOf(planter.seat)],
      rng: ctx.rng,
      mistake: Math.min(0.35, 0.05 + (bot.mistake ?? 0.1)),
      noSnip: (b.round ?? flow.round) === 1 && elapsed < 20,
      left: remaining,
      leader,
      threatened,
      current: g.mode === 'idle' ? -1 : g.target,
      sap: g.sap,
    });
    if (pick && (pick.target !== g.target || g.mode === 'idle')) applyOrder(world, planter.seat, pick.target);
  },
  act() {},
});
