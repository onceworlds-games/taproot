// Whole matches, headless: a player's tap reaches the host and grows their roots, bots fill the seats and play, rounds end ranked,
// and the board survives a reloaded host and garbage on the wire.
import { simulate } from '@onceworlds/engine/test';
import { FlowState } from '@onceworlds/engine/modules';
import { expect, test } from 'vitest';
import { gameConfig } from '../game.config.js';
import { Grower } from '../src/components.js';
import { boardOf, myGrower } from '../src/host.js';
import { DROP, pathTo } from '../src/rules.js';

const quick = (extra = {}) => gameConfig({ quick: true, rounds: 1, seconds: 30, ...extra });

test('a whole match: six seats (bots fill), everyone ranked, no errors', async () => {
  const run = await simulate(quick(), { humans: 1, seed: 2, seconds: 50 });
  expect(run.errors).toEqual([]);
  expect(run.game.world.resource(FlowState).phase).toBe('results');
  expect(run.game.world.resource(FlowState).standings.length).toBe(6);
});

test("a player's tap grows their root to the water, on every page", async () => {
  let ordered = false;
  const run = await simulate(quick(), {
    humans: 2,
    seed: 5,
    seconds: 20,
    latency: [10, 60],
    onFrame(r) {
      const page = r.games[1];
      const state = page.world.resource(FlowState);
      if (ordered || state.phase !== 'playing') return;
      const b = boardOf(page.world);
      const mine = myGrower(page.world, state.me);
      if (!b || !mine) return;
      const s = mine.get(Grower).seat;
      // The nearest water drop.
      let best = -1;
      for (let i = 0; i < b.g.count; i++) if (b.terrain[i] === DROP && (best < 0 || pathTo(b, s, i).length < pathTo(b, s, best).length)) best = i;
      page.services.taproot.order(best);
      ordered = { cell: best, seat: s };
    },
  });
  expect(run.errors).toEqual([]);
  expect(ordered).toBeTruthy();
  // Both pages agree the drop's cell is now the player's.
  for (const page of run.games) expect(boardOf(page.world).owner[ordered.cell]).toBe(ordered.seat + 1);
});

test('a reloaded host, a dropped player and garbage: the board carries on and the match ends ranked', async () => {
  const run = await simulate(quick(), { humans: 3, seed: 8, seconds: 60, latency: [10, 80], chaos: ['reload-host', 'drop-player', 'garbage-messages', 'forged-state'] });
  expect(run.errors).toEqual([]);
  expect(run.game.world.resource(FlowState).phase).toBe('results');
});

test('a full-length round of 90 s: bots keep playing after the board fills (snips happen), and it ends', async () => {
  let snips = 0;
  const run = await simulate(gameConfig({ quick: true, rounds: 1 }), {
    humans: 1,
    seed: 11,
    seconds: 120,
    onFrame(r) {
      let n = 0;
      r.game.world.query([Grower]).each((_e, g) => (n += g.snips));
      snips = Math.max(snips, n);
    },
  });
  expect(run.errors).toEqual([]);
  expect(run.game.world.resource(FlowState).phase).toBe('results');
  expect(snips).toBeGreaterThan(0);
});
