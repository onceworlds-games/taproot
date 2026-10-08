import { Transform } from '@onceworlds/engine';
import { Audio, camera2D, Feel, Flow, Input, Net, Render2D, UI } from '@onceworlds/engine/modules';

// The whole game, as the config createGame takes. main.js starts it; the tests and `onceworlds check` play it, so importing it
// starts nothing. It is blank on purpose: what the game is (its idea, look, feel and structure) is written in DESIGN.md first, and
// every module below is a slot to keep, change or drop. Look up what you need: npx @onceworlds/cli api <name>, recipe, guide.

// The action map: keyboard, gamepad and the phone's stick and buttons from one list. For example
//   move: Input.axis2d({ keys: 'wasd arrows', stick: true, pad: 'left', label: 'Move' }),
//   jump: Input.button({ keys: 'Space', pad: 'A', touch: { label: 'Jump' }, label: 'Jump' }),
// then `npx @onceworlds/cli doctor --fix` writes "controls" (the menu's How to play) into onceworlds.json from it.
export const actions = {};

export const config = {
  space: '2d',
  modules: [
    Render2D(),
    Input({ actions }),
    Audio(),
    Feel(),
    UI(),
    // Only the components listed here cross the network.
    Net({ components: [] }),
    // How players come together is the design's. Flow.none joins the server the platform picks and adds no screens (leave out `join`
    // for a game played alone). Flow.rounds, .turns, .coop and .dropIn are ready shells for a game of that shape: a lobby with
    // ready-up, one countdown, results ("npx @onceworlds/cli api Flow").
    Flow.none({ join: {} }),
  ],
  systems: [],
  scene(world) {
    world.spawn([Transform(), camera2D({ height: 12, clear: '#16181d' })]);
  },
};
