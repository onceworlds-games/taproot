import { readFileSync } from 'node:fs';
import { controlsFromActions } from '@onceworlds/engine/modules';
import { simulate } from '@onceworlds/engine/test';
import { expect, test } from 'vitest';
import { actions, config } from '../game.config.js';

// Headless tests: step the game, drive its input, assert on its components ("npx @onceworlds/cli guide testing"). These two hold for
// any game; add the game's own rules as it gets them.

test('plays through a reloaded host and a dropped player with no errors', async () => {
  const run = await simulate(config, { humans: 2, seed: 1, seconds: 30, latency: [10, 60], chaos: ['reload-host', 'drop-player'] });
  expect(run.errors).toEqual([]);
});

test('"controls" in onceworlds.json is the action map, for the menu\'s How to play', () => {
  const listing = JSON.parse(readFileSync(new URL('../onceworlds.json', import.meta.url), 'utf8'));
  expect(listing.controls ?? []).toEqual(controlsFromActions(actions));
});
