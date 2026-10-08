// Balance: plays whole rounds of bots against bots with the game's own rules (no engine, no network) and prints what happened.
//   node tools/balance.mjs [rounds=200] [seats=6]
// Read it for: fair seats (every seat's average close), no style that always wins, snips that happen and matter, a leader who can
// still be caught, and a board that fills.

import { STYLES, STYLE_NAMES, chooseOrder } from '../src/brain.js';
import { DROP, TUNING, dropsOf, leaderOf, makeBoard, pathTo, pickDropCell, seededRng, stepGrower, tally } from '../src/rules.js';

const rounds = Number(process.argv[2] ?? 200);
const seats = Number(process.argv[3] ?? 6);
const DT = 1 / 60;
const whyTakes = {};

function playRound(seed, styleOf) {
  const b = makeBoard(seats, seed);
  const rng = seededRng(seed * 31 + 7);
  const growers = Array.from({ length: seats }, (_, s) => ({ sap: TUNING.startSap, wait: 0, target: -1, mode: 'idle', think: rng.float(0.3, 1.0), style: styleOf(s) }));
  const stats = { snips: 0, withered: 0, biggest: 0, leadChanges: 0, firstWater: new Array(seats).fill(-1), takes: 0 };
  let leader = -1;
  let nextSample = 1;
  let nextDrop = TUNING.dropEvery;
  let tick = 0;
  stats.drops = 0;
  const total = TUNING.roundSeconds;
  for (let t = 0; t < total; t += DT) {
    const flood = t >= total - TUNING.floodSeconds;
    b.now = t;
    if (t >= nextDrop) {
      nextDrop += TUNING.dropEvery;
      if (dropsOf(b).length < seats) {
        const c = pickDropCell(b, rng);
        if (c >= 0) {
          b.terrain[c] = DROP;
          stats.drops++;
        }
      }
    }
    const { income, cells: now } = tally(b);
    b.crown = leaderOf(now);
    tick++;
    for (let k = 0; k < seats; k++) {
      // Seats take turns at going first, so nobody wins every tie.
      const s = (k + tick) % seats;
      const gr = growers[s];
      gr.think -= DT;
      if (gr.think <= 0) {
        gr.think = rng.float(0.9, 2.0);
        const threatened = new Set();
        for (let o = 0; o < seats; o++) {
          if (o === s || growers[o].mode !== 'reach') continue;
          for (const c of pathTo(b, o, growers[o].target)) if (b.owner[c] === s + 1) threatened.add(c);
        }
        const pick = chooseOrder(b, s, { style: STYLES[gr.style], rng, mistake: 0.12, threatened, current: gr.mode === 'idle' ? -1 : gr.target, noSnip: t < 0, left: total - t, leader, sap: gr.sap });
        if (pick) {
          gr.target = pick.target;
          gr.why = pick.why;
          gr.mode = b.owner[pick.target] === s + 1 ? 'bloom' : 'reach';
        }
      }
      const ev = stepGrower(b, s, gr, DT, income[s], flood);
      if (ev?.type === 'snip') {
        stats.takes++;
        { const k = gr.why + (b.terrain[gr.target] === 3 ? ':great' : ''); whyTakes[k] = (whyTakes[k] ?? 0) + 1; }
        if (ev.cells.length > 0) {
          stats.snips++;
          stats.withered += ev.cells.length;
          stats.biggest = Math.max(stats.biggest, ev.cells.length);
        }
      }
      if (ev?.drink && stats.firstWater[s] < 0) stats.firstWater[s] = t;
      if (ev?.drink) stats.drunk = (stats.drunk ?? 0) + 1;
    }
    if (t >= nextSample) {
      nextSample += 1;
      const { cells } = tally(b);
      const best = cells.indexOf(Math.max(...cells));
      if (Math.abs(t - total / 2) < 0.6) stats.halfLeader = best;
      if (stats.full === undefined) {
        let open = 0;
        for (let i = 0; i < b.g.count; i++) if (b.owner[i] === 0 && b.terrain[i] !== 1) open++;
        if (open <= b.g.count * 0.12) stats.full = t;
      }
      if (Math.abs(t - (total - TUNING.floodSeconds)) < 0.6) stats.floodLeader = best;
      if (leader >= 0 && best !== leader) stats.leadChanges++;
      leader = best;
    }
  }
  const { cells } = tally(b);
  let open = 0;
  for (let i = 0; i < b.g.count; i++) if (b.owner[i] === 0 && b.terrain[i] !== 1) open++;
  return { cells, stats, open, count: b.g.count };
}

const bySeat = new Array(seats).fill(0);
const winsBySeat = new Array(seats).fill(0);
const winsByStyle = Object.fromEntries(STYLE_NAMES.map((n) => [n, 0]));
const seatsByStyle = Object.fromEntries(STYLE_NAMES.map((n) => [n, 0]));
let snips = 0;
let withered = 0;
let biggest = 0;
let leadChanges = 0;
let openEnd = 0;
let spread = 0;
let firstWater = 0;
let firstWaterN = 0;
let takes = 0;
let halfWins = 0;
let floodWins = 0;
let drops = 0;
let fullAt = 0;
const total = TUNING.roundSeconds;
let drunk = 0;
let comeback = 0;
for (let k = 0; k < rounds; k++) {
  const styleRng = seededRng(k * 13 + 5);
  const styles = Array.from({ length: seats }, () => STYLE_NAMES[Math.floor(styleRng.next() * STYLE_NAMES.length)]);
  const r = playRound(k + 1, (s) => styles[s]);
  const best = Math.max(...r.cells);
  const winner = r.cells.indexOf(best);
  winsBySeat[winner]++;
  if (r.stats.halfLeader === winner) halfWins++;
  if (r.stats.floodLeader === winner) floodWins++;
  winsByStyle[styles[winner]]++;
  for (let s = 0; s < seats; s++) {
    bySeat[s] += r.cells[s];
    seatsByStyle[styles[s]]++;
  }
  snips += r.stats.snips;
  takes += r.stats.takes;
  drops += r.stats.drops;
  fullAt += r.stats.full ?? total;
  drunk += r.stats.drunk ?? 0;
  withered += r.stats.withered;
  biggest = Math.max(biggest, r.stats.biggest);
  leadChanges += r.stats.leadChanges;
  if (r.stats.leadChanges > 0) comeback++;
  openEnd += r.open / r.count;
  spread += best - Math.min(...r.cells);
  for (const w of r.stats.firstWater) if (w >= 0) {
    firstWater += w;
    firstWaterN++;
  }
}
const f = (x, d = 1) => x.toFixed(d);
console.log(`${rounds} rounds, ${seats} seats, ${TUNING.roundSeconds} s each`);
console.log(`cells by seat (avg): ${bySeat.map((x) => f(x / rounds)).join('  ')}`);
console.log(`wins by seat:        ${winsBySeat.join('  ')}`);
console.log(`win rate by style:   ${STYLE_NAMES.map((n) => `${n} ${f((100 * winsByStyle[n]) / Math.max(1, seatsByStyle[n]) * seats / 1, 0)}%`).join('  ')}  (fair = 100%)`);
console.log(`snips a round: ${f(snips / rounds)}  (enemy cells taken: ${f(takes / rounds)}), cells withered a snip: ${f(withered / Math.max(1, snips))}, biggest: ${biggest}`);
console.log(`lead changes a round: ${f(leadChanges / rounds)}, rounds with a change of leader: ${f((100 * comeback) / rounds, 0)}%`);
console.log(`open soil at the end: ${f((100 * openEnd) / rounds, 0)}%, winner minus last: ${f(spread / rounds)} cells`);
console.log('takes by reason', JSON.stringify(whyTakes));
console.log(`leader at half time wins: ${f((100 * halfWins) / rounds, 0)}%, leader when the Flood starts wins: ${f((100 * floodWins) / rounds, 0)}%`);
console.log(`drops risen a round: ${f(drops / rounds)}, drunk: ${f(drunk / rounds)}`);
console.log(`board 88% taken at: ${f(fullAt / rounds)} s`);
console.log(`first water at: ${f(firstWater / Math.max(1, firstWaterN))} s`);
