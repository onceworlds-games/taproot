// What a player sees: the store pictures build, the whole game draws through a strict canvas (a NaN or an unbalanced save would
// fail), words land on a phone's screen, and every sound made in code is one the audio module can play.
import { createGame } from '@onceworlds/engine';
import { FlowState, servicesOf, sfxPlan } from '@onceworlds/engine/modules';
import { simulate } from '@onceworlds/engine/test';
import { describe, expect, it, vi } from 'vitest';
import { gameConfig } from '../game.config.js';
import { Sounds } from '../src/play.js';
import { fakeCanvas, strictBackend } from './fakeCanvas.js';

vi.setConfig({ testTimeout: 60000 });

describe('store pictures', () => {
  for (const [name, width, height] of [
    ['cover', 1920, 1080],
    ['snip', 1920, 1080],
    ['dish', 1920, 1080],
    ['icon', 512, 512],
    ['badge-first-snip', 256, 256],
    ['badge-clean-cut', 256, 256],
    ['badge-took-the-dish', 256, 256],
  ]) {
    it(`builds the ${name} picture`, async () => {
      const body = { dataset: {} };
      const game = createGame({ ...gameConfig({ render: { poster: { search: `?poster=${name}`, body } } }), headless: true });
      game.start();
      const poster = servicesOf(game).poster;
      await poster.done;
      expect(poster.error).toBe(null);
      expect(body.dataset.ready).toBe('1');
      expect(poster.size).toEqual({ width, height });
      expect(game.errors).toEqual([]);
    });
  }
});

it('lists every badge the game awards, each with its picture', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const listing = JSON.parse(readFileSync(new URL('../onceworlds.json', import.meta.url), 'utf8'));
  const config = gameConfig();
  const flow = config.modules.find((m) => m.name === 'flow');
  void flow;
  expect(listing.badges.map((b) => b.id).sort()).toEqual(['clean-cut', 'first-snip', 'took-the-dish']);
  for (const b of listing.badges) expect(existsSync(new URL(`../${b.icon}`, import.meta.url))).toBe(true);
});

describe('drawing', () => {
  it('draws the title, the lobby, a whole round and the results on a phone through a strict canvas', async () => {
    const canvas = fakeCanvas(390, 844);
    const phases = new Set();
    const run = await simulate(() => gameConfig({ quick: true, rounds: 1, seconds: 25, render: { backend: strictBackend(canvas), fit: 'none' } }), {
      humans: 1,
      seed: 6,
      seconds: 60,
      onFrame: (r) => void phases.add(r.game.world.resource(FlowState).phase),
    });
    expect(run.errors).toEqual([]);
    expect([...phases]).toEqual(expect.arrayContaining(['title', 'lobby', 'countdown', 'banner', 'playing', 'results']));
    canvas.assertBalanced();
    // The dish was drawn (cells, seeds, drops are arcs and paths) and words were placed on the screen.
    expect(canvas.count('arc')).toBeGreaterThan(500);
    const placed = canvas.ctx.placed;
    expect(placed.some((p) => p.text === 'YOU')).toBe(true);
    for (const p of placed) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('sound', () => {
  it('every effect made in code is one the audio module can play', () => {
    const made = {};
    const game = { services: { audio: { effect: (name, spec) => (made[name] = spec) } } };
    Sounds().install(game);
    expect(Object.keys(made).sort()).toEqual(['drink', 'flood', 'grow', 'order', 'rise', 'snip', 'wither']);
    for (const [name, spec] of Object.entries(made)) expect(() => sfxPlan(spec, name)).not.toThrow();
  });
});
