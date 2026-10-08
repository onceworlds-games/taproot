// How a bot picks its next order, as a plain function: look at the board the way a player does (water to take, thin enemy roots to
// snip, open soil to fill, its own thin roots under threat) and pick the best value for the sap, with a personality and now and
// then a slip. The engine's bot system and the balance tool both call it.

import { DROP, ROCK, TUNING, bloomCells, reachMap, snipSizes } from './rules.js';



/** Personalities: how much each kind of move appeals. Every bot gets one, so a table of bots plays differently each time. */
export const STYLES = {
  grower: { water: 1.2, snip: 0.7, grow: 1.3, guard: 0.8 },
  cutter: { water: 0.9, snip: 1.6, grow: 0.8, guard: 0.7 },
  keeper: { water: 1.0, snip: 0.9, grow: 0.9, guard: 1.6 },
  balanced: { water: 1.0, snip: 1.0, grow: 1.0, guard: 1.0 },
};
export const STYLE_NAMES = Object.keys(STYLES);

/** Open soil within two cells of i. */
function openAround(b, i) {
  const g = b.g;
  let n = 0;
  for (let d = 0; d < 6; d++) {
    const j = g.nbr[i * 6 + d];
    if (j < 0) continue;
    if (b.owner[j] === 0 && b.terrain[j] !== ROCK) n += 1;
    for (let e = 0; e < 6; e++) {
      const k = g.nbr[j * 6 + e];
      if (k >= 0 && k !== i && b.owner[k] === 0 && b.terrain[k] !== ROCK) n += 0.35;
    }
  }
  return n;
}

/**
 * The bot's choice: { target, value, why } or null. `opts`: { style, rng, mistake (0-1), noSnip (round 1's opening),
 * threatened (Set of this seat's cells on an enemy's planned path), current (the target it is following, or -1) }.
 */
export function chooseOrder(b, s, opts) {
  const style = opts.style ?? STYLES.balanced;
  const g = b.g;
  const reach = reachMap(b, s);
  const options = [];
  // A hair of jitter breaks ties, so no direction on the board is favoured.
  const jitter = () => (opts.rng ? 1 + opts.rng.next() * 0.03 : 1);
  const add = (target, value, why) => {
    if (Number.isFinite(value) && value > 0) options.push({ target, value: value * jitter(), why });
  };
  // Water: drops to race for, less tempting when a rival is nearer.
  const rivals = [];
  for (let v = 0; v < b.seats; v++) if (v !== s) rivals.push(reachMap(b, v));
  for (let c = 0; c < g.count; c++) {
    if (b.terrain[c] !== DROP || reach.cost[c] === Infinity) continue;
    if (opts.noSnip && b.owner[c] !== 0) continue;
    const mine = reach.cost[c];
    let best = Infinity;
    for (const r of rivals) best = Math.min(best, r.cost[c]);
    const odds = mine < best - 0.5 ? 1 : mine <= best + 0.5 ? 0.6 : 0.2;
    add(c, (style.water * TUNING.dropSap * 0.7 * odds) / (mine + 1), 'water');
  }
  // Snips and takes: an enemy cell, worth what it withers (and the sap that brings back) and the cell itself, for the sap it
  // costs. A lone border cell is a small gain, but when the dish is full it is the only one.
  if (!opts.noSnip) {
    for (let v = 0; v < b.seats; v++) {
      if (v === s) continue;
      const sizes = snipSizes(b, v);
      const lead = opts.leader === v ? 1.3 : 1;
      for (let i = 0; i < g.count; i++) {
        const big = sizes[i] >= 4;
        if (sizes[i] < 1 || reach.cost[i] === Infinity || reach.cost[i] > (big ? 16 : 7)) continue;
        if (big) add(i, (style.snip * lead * (sizes[i] - 1) * (1 + TUNING.compost) * 0.6) / (reach.cost[i] + 2), 'snip');
        // Chipping at a border: only with sap to spare (it would go to waste at the cap otherwise).
        else if (opts.sap === undefined || opts.sap >= TUNING.sapCap * 0.75) add(i, (style.snip * lead * (sizes[i] + 1) * 0.06) / (reach.cost[i] + 2), 'take');
      }
    }
  }
  // Open soil: the edge of the biggest open patches nearby.
  for (let i = 0; i < g.count; i++) {
    if (b.owner[i] !== 0 || b.terrain[i] === ROCK) continue;
    const c = reach.cost[i];
    if (c === Infinity || c > 7) continue;
    add(i, (style.grow * (1 + openAround(b, i)) * 0.55) / (c + 2), 'grow');
  }
  // Guard: thicken a thin root of ours that an enemy is heading for.
  if (opts.threatened && opts.threatened.size) {
    const mine = snipSizes(b, s);
    for (const c of opts.threatened) {
      if (b.owner[c] !== s + 1 || mine[c] < 3) continue;
      if (bloomCells(b, s, c).length === 0) continue;
      add(c, (style.guard * mine[c]) / 5, 'guard');
    }
  }
  if (options.length === 0) return null;
  options.sort((a, b2) => b2.value - a.value || a.target - b2.target);
  // Keep going with the current order unless something is clearly better (people don't change their minds every second).
  const current = options.find((o) => o.target === opts.current);
  let pick = options[0];
  if (current && current.value * 1.35 >= pick.value) pick = current;
  if (opts.rng && opts.mistake && opts.rng.next() < opts.mistake) pick = options[Math.min(options.length - 1, 1 + Math.floor(opts.rng.next() * 3))];
  return pick;
}
