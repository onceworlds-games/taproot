import { Transform } from '@onceworlds/engine';
import { Audio, Awards, Bot, Feel, Flow, Input, Net, Render2D, UI, camera2D } from '@onceworlds/engine/modules';
import { BotBrain } from './src/bots.js';
import { Aim, DishCamera, Grower, HostClock, Planter, Soil } from './src/components.js';
import { DrawBoard } from './src/draw.js';
import { Grow, Orders, planterParts, populateRound } from './src/host.js';
import { Aiming, CameraFit, Effects, Music, Sounds, actions } from './src/play.js';
import { TaprootPosters } from './src/posters.js';
import { TUNING, tally } from './src/rules.js';
import { COLORS, FONT, TITLE, theme } from './src/theme.js';
import { TaprootUi, flowViews } from './src/ui.js';
import { ShowBoard } from './src/view.js';
import { boardOf } from './src/host.js';

// Taproot: tap to grow your roots, snip theirs; anything cut off withers. Read DESIGN.md first, then src/rules.js (every rule
// and number), src/host.js (the host's side of a round), src/draw.js (the dish) and src/ui.js (every screen).

/**
 * Options (all optional, for tests and tools): `fill` the seats bots fill up to (default 6), `rounds` the lobby's default,
 * `quick` short screens and short rounds (check and tests), `seconds` a round's length, `friends`, `seed`, `render` (passed to
 * Render2D), `systems` (extra systems).
 */
export function gameConfig(options = {}) {
  const seconds = options.seconds ?? TUNING.roundSeconds;
  return {
    space: '2d',
    seed: options.seed,
    modules: [
      Render2D({ font: FONT, fonts: [FONT], background: COLORS.night, ...options.render }),
      Feel(),
      Input({ actions }),
      Audio(),
      Sounds(),
      UI({ title: TITLE, theme, flowViews: flowViews() }),
      // Only these cross the network: the board and the seats' roots (the host's), and every seat's body.
      Net({ components: [Soil, Grower, Planter, Bot] }),
      Orders(),
      Flow.rounds({
        join: { maxPlayers: 8 },
        friends: options.friends,
        admit: 'round',
        title: { logo: TITLE },
        lobby: { hint: 'Tap to grow. Cut their roots.' },
        settings: [{ id: 'rounds', label: 'Rounds', options: [1, 2, 3], default: options.rounds ?? 2 }],
        roster: { fill: options.fill ?? 6, bot: (_ctx, seat) => planterParts(seat), skill: [0.35, 0.75] },
        round: {
          banner: 'MOST ROOTS WINS',
          seconds,
          populate: populateRound,
          spawn: (_ctx, seat) => planterParts(seat),
          // Most cells when the rim closes.
          rank(ctx) {
            const b = boardOf(ctx.world);
            const out = {};
            const cells = b ? tally(b).cells : [];
            ctx.seats.forEach((seat, s) => (out[seat.id] = cells[s] ?? 0));
            return out;
          },
          end(ctx, outcome) {
            for (const id of outcome[0] ?? []) ctx.flow.stat('wins', 1, id);
          },
        },
        scoring: Flow.placePoints([10, 7, 5, 3, 2, 1, 0, 0], { rounds: 'rounds' }),
        results: { awards: [Awards.most('Snipped', 'snipped'), Awards.most('Water drunk', 'drops')] },
        timing: options.quick ? { banner: 0.4, roundEnd: 0.4, scoreboard: 0.4, results: 3 } : undefined,
      }),
      TaprootUi(),
      TaprootPosters(),
    ],
    resources: [HostClock(), Aim()],
    systems: [ShowBoard, Grow, BotBrain, Aiming, Effects, Music, DrawBoard, CameraFit, ...(options.systems ?? [])],
    scene(world) {
      world.spawn([Transform(), camera2D({ height: 32, clear: COLORS.night }), DishCamera()]);
    },
  };
}

/** The ready config `main.js` starts, and the action map "How to play" is written from. */
export const config = gameConfig();
/** A short version for `onceworlds check`: one short round and short screens, so a simulated match reaches its results. */
export const quick = gameConfig({ quick: true, rounds: 1, seconds: 30 });
export { actions };
