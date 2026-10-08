// Every screen in the dish's look: clay type, seed bulbs for players (their colour and symbol, never a BOT tag), the rim root as
// the clock. The HUD is ours (Flow's is off): my sap bulb at the bottom, the standings as a column of seeds (a strip across the
// top on a phone held upright), the last snips, names under the seeds, the preview's price, and round 1's coaching.
import { defineModule } from '@onceworlds/engine';
import { FlowState, UI, servicesOf } from '@onceworlds/engine/modules';
import { Aim, Profile } from './components.js';
import { reachMap, snipSizes, DROP, TUNING } from './rules.js';
import { COLORS, SEATS, TITLE, alpha, seatLook } from './theme.js';
import { viewOf } from './view.js';
import { WIDE } from './play.js';

// ---------------------------------------------------------------- a seed bulb, the player's piece everywhere

/** A seat's symbol with the painter (screen y points down), centred at (x, y), radius r. */
export function symbol(p, kind, x, y, r, fill) {
  const star = (n, inner, turn = -Math.PI / 2) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = turn + (i * Math.PI) / n;
      const rr = i % 2 ? r * inner : r;
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    return pts;
  };
  const ring = (n, turn, k = 1) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = turn + (i * Math.PI * 2) / n;
      pts.push(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k);
    }
    return pts;
  };
  if (kind === 'circle') p.circle(x, y, r * 0.78, { fill });
  else if (kind === 'triangle') p.polygon(ring(3, -Math.PI / 2, 1.05), { fill });
  else if (kind === 'square') p.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4, { fill });
  else if (kind === 'diamond') p.polygon([x, y - r, x + r * 0.78, y, x, y + r, x - r * 0.78, y], { fill });
  else if (kind === 'star') p.polygon(star(5, 0.45), { fill });
  else if (kind === 'plus') {
    p.rect(x - r * 0.34, y - r, r * 0.68, r * 2, { fill });
    p.rect(x - r, y - r * 0.34, r * 2, r * 0.68, { fill });
  } else if (kind === 'hex') p.polygon(ring(6, 0, 0.92), { fill });
  else p.polygon(star(4, 0.32), { fill });
}

/** A little crown (screen space), its base centred at (x, y). */
export function crown(p, x, y, w, fill = COLORS.gold) {
  const h = w * 0.7;
  p.polygon([x - w / 2, y, x - w / 2, y - h * 0.75, x - w / 4, y - h * 0.35, x, y - h, x + w / 4, y - h * 0.35, x + w / 2, y - h * 0.75, x + w / 2, y], { fill, stroke: COLORS.night, strokeWidth: 2 });
}

/** Draws a seat's bulb (colour, symbol, a highlight) with the painter, centred at (x, y). */
export function bulb(p, x, y, r, seat, options = {}) {
  const look = seatLook(seat);
  if (options.halo) p.circle(x, y, r * 1.35, { fill: alpha('#fff6e0', 0.25) });
  p.circle(x, y + r * 0.08, r, { fill: alpha(COLORS.night, 0.55) });
  p.circle(x, y, r, { fill: options.dim ? alpha(look.color, 0.45) : look.color, stroke: options.me ? '#fff6e0' : COLORS.night, strokeWidth: Math.max(2, r * 0.14) });
  p.circle(x - r * 0.32, y - r * 0.34, r * 0.22, { fill: alpha('#ffffff', 0.45) });
  symbol(p, look.symbol, x, y + r * 0.02, r * 0.5, COLORS.night);
}

/** Two crossed blades: a snip. */
export function scissors(p, x, y, r) {
  p.line(x - r, y - r, x + r, y + r, { color: COLORS.ember, width: 3, round: true });
  p.line(x - r, y + r, x + r, y - r, { color: COLORS.ember, width: 3, round: true });
  p.circle(x - r * 0.9, y + r * 0.9, r * 0.35, { stroke: COLORS.ember, strokeWidth: 2 });
  p.circle(x + r * 0.9, y + r * 0.9, r * 0.35, { stroke: COLORS.ember, strokeWidth: 2 });
}

const bulbNode = (seat, size, options) => UI.custom({ w: size, h: size, draw: (p, r) => bulb(p, r.x + r.w / 2, r.y + r.h / 2, size * 0.42, seat, options) });

const short = (name, n = 10) => {
  const s = String(name ?? '').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** The seat a player id sat in this match (for colours on the scoreboard), or a stand-in from the list order. */
function seatOfId(world, id, fallback) {
  const v = viewOf(world);
  const found = v.growers.find((o) => o.id === id);
  return found ? found.seat : fallback;
}

/** The round's biggest snip, as a line for the scoreboard: who caused the swing. */
function biggestSnip(world) {
  const v = viewOf(world);
  const top = [...v.growers].sort((a, b) => b.best - a.best)[0];
  if (!top || top.best < 2) return false;
  return UI.row(
    { gap: 6, align: 'center', justify: 'center' },
    UI.custom({ w: 22, h: 18, draw: (p, r) => scissors(p, r.x + r.w / 2, r.y + r.h / 2, 8) }),
    UI.label(`BIGGEST SNIP: ${top.me ? 'YOU' : short(top.name, 10).toUpperCase()} ${top.best}`, { size: 18, color: COLORS.clay, weight: 800 }),
  );
}

// ---------------------------------------------------------------- Flow's screens, in the dish's look

/** The root under the title: a wavy line with two leaves. */
function rootLine(p, x, y, w, t) {
  const pts = [];
  for (let k = 0; k <= 24; k++) {
    const u = k / 24;
    pts.push(x - w / 2 + u * w, y + Math.sin(u * Math.PI * 3 + t * 2) * 5);
  }
  p.polyline(pts, { color: '#45e08a', width: 7, round: true });
  p.circle(x + w / 2, y + Math.sin(Math.PI * 3 + t * 2) * 5, 7, { fill: '#fff6e0' });
}

export function flowViews() {
  return {
    title: (s, ctx) =>
      UI.column(
        { align: 'center', gap: 10, opacity: s.enter },
        UI.label(s.title || TITLE, { size: Math.min(104, (ctx?.width ?? 800) * 0.17), color: COLORS.clay, weight: 800, outline: 7, outlineColor: COLORS.night }),
        UI.custom({ w: Math.min(340, (ctx?.width ?? 800) * 0.7), h: 26, draw: (p, r) => rootLine(p, r.x + r.w / 2, r.y + r.h / 2, r.w, s.age) }),
        UI.label('GROW · SNIP · WITHER', { size: 22, color: COLORS.water, weight: 800, outline: 4, outlineColor: COLORS.night }),
        UI.spacer?.(6) ?? false,
        UI.button('PLANT', { kind: 'primary', size: 34, fill: '#45e08a', color: COLORS.night, w: 240, ...s.play }),
        s.error ? UI.label(s.error, { size: 18, color: COLORS.ember, outline: 3, outlineColor: COLORS.night }) : false,
      ),
    lobby: (s) =>
      UI.panel(
        { pad: [14, 18], gap: 10, align: 'center', fill: alpha(COLORS.bark, 0.92), stroke: COLORS.clay, border: 3, radius: 22 },
        UI.label('SEEDS IN THE DISH', { size: 24, color: COLORS.clay, weight: 800 }),
        UI.row(
          { gap: 12, align: 'start', justify: 'center' },
          ...s.players.slice(0, 8).map((pl, i) =>
            UI.column(
              { gap: 4, align: 'center', w: 74 },
              UI.custom({ w: 58, h: 58, draw: (p, r) => bulb(p, r.x + r.w / 2, r.y + r.h / 2, 23, i, { me: pl.me, dim: !pl.ready && !pl.bot, halo: pl.me }) }),
              UI.label(short(pl.me ? 'YOU' : pl.name, 8), { size: 18, color: pl.me ? COLORS.water : COLORS.clay, weight: 800 }),
              UI.label(pl.ready || pl.bot ? 'READY' : pl.away ? 'AWAY' : '…', { size: 16, color: pl.ready || pl.bot ? '#45e08a' : '#c7ad86' }),
            ),
          ),
        ),
        ...s.settings.map((set) =>
          UI.row(
            { gap: 8, align: 'center' },
            UI.label(set.label.toUpperCase(), { size: 18, color: '#c7ad86', weight: 800 }),
            ...set.options.map((o) =>
              set.editable
                ? UI.button(String(o.label), { kind: o.chosen ? 'primary' : 'secondary', size: 20, fill: o.chosen ? COLORS.water : COLORS.barkLight, color: o.chosen ? COLORS.night : COLORS.clay, onClick: o.choose, key: o.key })
                : o.chosen
                  ? UI.label(String(o.label), { size: 20, color: COLORS.water, weight: 800 })
                  : false,
            ),
          ),
        ),
        s.hint ? UI.label(s.hint, { size: 18, color: COLORS.clay }) : false,
        s.status ? UI.label(s.status, { size: 18, color: '#c7ad86' }) : false,
      ),
    countdown: (s) =>
      UI.custom({
        w: 220,
        h: 220,
        draw: (p, r) => {
          const x = r.x + r.w / 2;
          const y = r.y + r.h / 2;
          const k = 1 - s.beat;
          p.circle(x, y, 70 + 18 * k, { fill: s.go ? '#45e08a' : COLORS.clay, stroke: COLORS.night, strokeWidth: 6 });
          if (!s.go) {
            // The seed cracks a little more each beat.
            const crack = (3 - s.n) / 3;
            p.polyline([x - 30 * crack, y - 40, x, y - 18, x + 26 * crack, y - 44], { color: COLORS.night, width: 5, round: true });
          }
          p.text(s.go ? 'GROW!' : String(s.n), x, y + 6, { size: s.go ? 54 : 92, color: COLORS.night, weight: 800 });
        },
      }),
    banner: {
      anchor: 'top',
      offset: [0, 70],
      draw: (s) =>
        UI.panel(
          { pad: [10, 22], gap: 4, align: 'center', fill: COLORS.clay, stroke: COLORS.night, border: 4, radius: 16, opacity: Math.min(s.enter, 1 - s.leave) },
          UI.label(s.goal, { size: 38, color: COLORS.night, weight: 800 }),
          UI.custom({
            w: 20 + s.rounds * 26,
            h: 22,
            draw: (p, r) => {
              // The rounds as seeds: sprouted for those played.
              for (let k = 0; k < s.rounds; k++) {
                const x = r.x + 23 + k * 26;
                const y = r.y + r.h / 2;
                p.circle(x, y, 8, { fill: k < s.round ? '#45e08a' : alpha(COLORS.night, 0.25), stroke: COLORS.night, strokeWidth: 2 });
              }
            },
          }),
        ),
    },
    hud: false,
    scoreboard: (s, ctx) =>
      UI.panel(
        { pad: [14, 18], gap: 8, align: 'stretch', fill: alpha(COLORS.bark, 0.94), stroke: COLORS.clay, border: 3, radius: 22, w: 360 },
        UI.label(s.phase === 'roundEnd' ? 'THE RIM CLOSES' : s.title.toUpperCase(), { size: 26, color: COLORS.clay, weight: 800, align: 'center' }),
        ...s.rows.slice(0, 8).map((row, i) =>
          UI.row(
            { gap: 10, align: 'center' },
            UI.label(String(row.place), { size: 22, color: row.place === 1 ? COLORS.gold : '#c7ad86', weight: 800, w: 22 }),
            bulbNode(seatOfId(ctx.world, row.id, i), 34, { me: row.me }),
            UI.label(short(row.me ? 'YOU' : row.name, 12), { size: 20, color: row.me ? COLORS.water : COLORS.clay, weight: 800, grow: 1 }),
            UI.label(String(row.points), { size: 22, color: COLORS.clay, weight: 800 }),
          ),
        ),
        s.note ? UI.label(s.note, { size: 18, color: '#c7ad86', align: 'center' }) : false,
        biggestSnip(ctx.world),
      ),
    results: (s, ctx) =>
      UI.panel(
        { pad: [16, 20], gap: 10, align: 'center', fill: alpha(COLORS.bark, 0.95), stroke: COLORS.clay, border: 3, radius: 24, w: 380 },
        UI.label(s.won ? 'YOU TOOK THE DISH' : s.podium[0] ? `${short(s.podium[0].name, 12).toUpperCase()} TOOK THE DISH` : 'THE DISH', {
          size: 28,
          color: s.won ? COLORS.gold : COLORS.clay,
          weight: 800,
          align: 'center',
        }),
        UI.row(
          { gap: 14, align: 'end', justify: 'center' },
          ...[1, 0, 2].map((k) => {
            const pl = s.podium[k];
            if (!pl) return false;
            const size = k === 0 ? 70 : 52;
            return UI.column(
              { gap: 4, align: 'center', w: 96 },
              UI.custom({
                w: size,
                h: size + (k === 0 ? 18 : 0),
                draw: (p, r) => {
                  const seat = seatOfId(ctx.world, pl.id, k);
                  bulb(p, r.x + r.w / 2, r.y + r.h - size / 2, size * 0.42, seat, { me: pl.me });
                  if (k === 0) crown(p, r.x + r.w / 2, r.y + 18, 30);
                },
              }),
              UI.label(short(pl.me ? 'YOU' : pl.name, 9), { size: 18, color: pl.me ? COLORS.water : COLORS.clay, weight: 800 }),
              UI.label(`${pl.points}`, { size: 20, color: COLORS.gold, weight: 800 }),
            );
          }),
        ),
        ...s.awards.slice(0, 2).map((a) => UI.label(`${a.title.toUpperCase()}: ${short(a.name, 12)} (${a.value})`, { size: 18, color: '#c7ad86' })),
        UI.button('PLANT AGAIN', { kind: 'primary', size: 26, fill: '#45e08a', color: COLORS.night, w: 260, ...s.again }),
      ),
    player: (pl) => UI.row({ gap: 8, align: 'center' }, bulbNode(0, 30, { me: pl.me }), UI.label(short(pl.me ? 'YOU' : pl.name, 12), { size: 18, color: COLORS.clay, weight: 800 })),
  };
}

// ---------------------------------------------------------------- the HUD

/** A screen wide enough for the standings as a column beside the dish. */
const wide = (ctx) => ctx.width / Math.max(1, ctx.height) >= WIDE;

/** While a round is played (and a poster that asks for the HUD). */
const playing = ({ flow, world }) => !!flow && flow.phase === 'playing' && viewOf(world).hud !== false;

/** Round 1's coach: what to point at, worked out a few times a second. */
function coachOf(world, v, now) {
  const c = (v.coach = v.coach ?? { at: -1, step: 'water', target: -1, snipDone: false, guardDone: false, shownSnip: -1, shownGuard: -1 });
  const aim = world.resource(Aim);
  const flow = world.resource(FlowState);
  // Round 1 of a player's first two matches.
  if (flow.round !== 1 || v.me < 0 || !v.board || world.resource(Profile).matches >= 2) return null;
  if (now - c.at < 0.3) return c;
  c.at = now;
  const b = v.board;
  const me = v.me;
  const mine = v.growers[me];
  if (aim.ordered === 0) {
    // First: the nearest water.
    const reach = reachMap(b, me);
    let best = -1;
    for (let i = 0; i < b.g.count; i++) if (b.terrain[i] === DROP && b.owner[i] === 0 && (best < 0 || reach.cost[i] < reach.cost[best])) best = i;
    c.step = best >= 0 ? 'water' : '';
    c.target = best;
    return c;
  }
  c.step = '';
  c.target = -1;
  // Second: once the first root has landed, the biggest open patch within reach.
  if (aim.ordered === 1 && mine?.mode === 'idle') {
    const reach = reachMap(b, me);
    let best = -1;
    let bestValue = 0;
    for (let i = 0; i < b.g.count; i++) {
      if (b.owner[i] !== 0 || b.terrain[i] === 1 || reach.cost[i] > 4) continue;
      let open = 0;
      for (let d = 0; d < 6; d++) {
        const j = b.g.nbr[i * 6 + d];
        if (j >= 0 && b.owner[j] === 0 && b.terrain[j] !== 1) open++;
      }
      const value = open / (reach.cost[i] + 1);
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    if (best >= 0) {
      c.step = 'grow';
      c.target = best;
      return c;
    }
  }
  if ((mine?.snips ?? 0) > 0) c.snipDone = true;
  // A thin enemy root within reach: show where a snip would bite (once, for a while).
  if (!c.snipDone && v.now > 12 && (c.shownSnip < 0 || now - c.shownSnip < 7)) {
    const reach = reachMap(b, me);
    let best = -1;
    let bestValue = 0;
    for (let s = 0; s < b.seats; s++) {
      if (s === me) continue;
      const sizes = snipSizes(b, s);
      for (let i = 0; i < b.g.count; i++) {
        if (sizes[i] < 3 || reach.cost[i] > 9) continue;
        const value = sizes[i] / (reach.cost[i] + 1);
        if (value > bestValue) {
          bestValue = value;
          best = i;
        }
      }
    }
    if (best >= 0) {
      if (c.shownSnip < 0) c.shownSnip = now;
      c.step = 'snip';
      c.target = best;
      return c;
    }
  }
  // Someone's planned root runs through mine: thicken it.
  if (!c.guardDone && (c.shownGuard < 0 || now - c.shownGuard < 6)) {
    for (const o of v.growers) {
      if (o.seat === me || o.mode !== 'reach') continue;
      const hit = o.path.find((cell) => b.owner[cell] === me + 1);
      if (hit !== undefined) {
        if (c.shownGuard < 0) c.shownGuard = now;
        c.step = 'guard';
        c.target = hit;
        if (mine?.mode === 'bloom') c.guardDone = true;
        return c;
      }
    }
  }
  return c;
}

const COACH_WORDS = { water: 'TAP THE WATER', grow: 'NOW TAP OPEN SOIL', snip: 'TAP TO SNIP', guard: 'TAP YOUR ROOT: THICKEN' };

export function TaprootUi() {
  return defineModule({
    name: 'taproot-ui',
    install(game) {
      const { ui } = servicesOf(game);
      const toScreen = (x, y, scale) => {
        const p = ui.worldToScreen(x, y);
        return p ? { x: p.x / scale, y: p.y / scale } : null;
      };

      // Words in the dish: names under the seeds, the preview's price, the coach.
      ui.view(
        'taproot.labels',
        ({ world, width, height, scale, time }) => {
          const v = viewOf(world);
          const b = v.board;
          if (!b) return null;
          const g = b.g;
          const now = time.now;
          return UI.custom({
            w: width,
            h: height,
            draw: (p) => {
              const live = v.source !== 'demo';
              // Names under the seeds (live rounds only: the title's demo stays wordless).
              if (live && v.names !== false) {
                for (const o of v.growers) {
                  const c = b.seeds[o.seat];
                  const at = c >= 0 ? toScreen(g.x[c], g.y[c] - 1.15, scale) : null;
                  if (!at) continue;
                  p.text(o.me ? 'YOU' : short(o.name, 9), at.x, at.y, { size: o.me ? 20 : 17, color: o.me ? '#fff6e0' : seatLook(o.seat).color, weight: 800, outline: 4, outlineColor: COLORS.night });
                }
              }
              // The preview: what this tap costs and what it would wither.
              const aim = world.resource(Aim);
              const pv = v.preview;
              if (pv && aim.cell >= 0 && aim.cell < g.count) {
                // Under the cell, so it never sits on the coach's words (above their target).
                const at = toScreen(g.x[aim.cell], g.y[aim.cell] - 1.35, scale);
                if (at) {
                  const words =
                    pv.kind === 'none' ? 'NO WAY' : pv.kind === 'bloom' ? (pv.path.length ? `THICKEN ${pv.path.length}` : 'FULL') : pv.doomed.length ? `SNIP ${pv.doomed.length} · ${Math.round(pv.cost)} SAP` : `${Math.round(pv.cost)} SAP`;
                  p.text(words, at.x, at.y, { size: 22, color: pv.doomed?.length ? COLORS.ember : '#fff6e0', weight: 800, outline: 5, outlineColor: COLORS.night });
                }
              }
              // A refused tap (a stone, someone's seed).
              if (v.refused && now - v.refused.at < 0.6 && v.refused.cell < g.count) {
                const at = toScreen(g.x[v.refused.cell], g.y[v.refused.cell] + 1, scale);
                if (at) p.text('✕', at.x + Math.sin(now * 60) * 3, at.y, { size: 28, color: COLORS.ember, weight: 800, outline: 4, outlineColor: COLORS.night });
              }
              // The last ten seconds, big, over the top of the rim.
              if (v.source === 'live' && v.remaining > 0 && v.remaining <= 10 && world.resource(FlowState).phase === 'playing') {
                const at = toScreen(0, g.disc + 1.6, scale);
                if (at) {
                  const n = Math.ceil(v.remaining);
                  const beat = v.remaining % 1;
                  p.text(String(n), at.x, at.y, { size: 34 + beat * 14, color: COLORS.water, weight: 800, outline: 6, outlineColor: COLORS.night });
                }
              }
              // Round 1's coach.
              const coach = live ? coachOf(world, v, now) : null;
              if (coach && coach.step && coach.target >= 0 && coach.target < g.count) {
                const at = toScreen(g.x[coach.target], g.y[coach.target], scale);
                if (at) {
                  const pulse = (now * 1.4) % 1;
                  const unit = (toScreen(g.x[coach.target] + 1, g.y[coach.target], scale)?.x ?? at.x + 20) - at.x;
                  p.circle(at.x, at.y, unit * (1.1 + pulse * 0.9), { stroke: alpha('#fff6e0', 1 - pulse), strokeWidth: 4 });
                  p.circle(at.x, at.y, unit * 1.05, { stroke: '#fff6e0', strokeWidth: 3 });
                  const up = coach.step === 'guard' ? -1 : 1;
                  const ty = at.y - up * unit * 2.3;
                  p.text(COACH_WORDS[coach.step], at.x, ty + Math.sin(now * 4) * 3, { size: 26, color: coach.step === 'snip' ? COLORS.ember : '#fff6e0', weight: 800, outline: 6, outlineColor: COLORS.night });
                }
              }
            },
          });
        },
        { anchor: 'top-left', safe: false, order: 2 },
      );

      // My sap: a bulb that fills, my cells and place. Bottom left on a wide screen, bottom middle on a phone held upright.
      const mePanel = ({ world, portrait }) => {
          const v = viewOf(world);
          if (v.source !== 'live' || v.me < 0) return null;
          const me = v.growers[v.me];
          if (!me) return null;
          const ranked = [...v.growers].sort((a, b) => b.cells - a.cells);
          const place = ranked.findIndex((o) => o.seat === v.me) + 1;
          const frac = Math.max(0, Math.min(1, me.sap / TUNING.sapCap));
          const flood = v.remaining <= TUNING.floodSeconds && v.remaining > 0;
          return UI.panel(
            { dir: 'row', pad: [8, 16], gap: 14, align: 'center', fill: alpha(COLORS.night, 0.82), stroke: seatLook(v.me).color, border: 3, radius: 30 },
            UI.custom({
              w: 64,
              h: 64,
              draw: (p, r) => {
                const x = r.x + r.w / 2;
                const y = r.y + r.h / 2;
                // A drop-shaped glass that fills with sap.
                p.circle(x, y + 4, 26, { fill: alpha(COLORS.water, 0.12), stroke: COLORS.water, strokeWidth: 3 });
                const h = 52 * frac;
                p.clip(x - 26, y + 30 - h, 52, h);
                p.circle(x, y + 4, 24, { fill: flood ? '#bff4ff' : COLORS.water });
                p.unclip();
                p.polygon([x - 12, y - 14, x, y - 32, x + 12, y - 14], { fill: alpha(COLORS.water, 0.4) });
                p.text(String(Math.floor(me.sap)), x, y + 5, { size: 24, color: '#fff6e0', weight: 800, outline: 4, outlineColor: COLORS.night });
              },
            }),
            UI.column(
              { gap: 0, align: 'start' },
              UI.label(`${me.cells} ROOTS`, { size: portrait ? 24 : 26, color: '#fff6e0', weight: 800 }),
              UI.label(`${ordinal(place)} · +${me.income.toFixed(1)} SAP/S`, { size: 18, color: flood ? COLORS.water : '#c7ad86', weight: 700 }),
            ),
          );
        };
      ui.view('taproot.me', mePanel, { anchor: 'bottom-left', offset: [12, 12], order: 5, when: (ctx) => playing(ctx) && !ctx.portrait });
      ui.view('taproot.me.phone', mePanel, { anchor: 'bottom', offset: [0, 12], order: 5, when: (ctx) => playing(ctx) && ctx.portrait });

      // The standings: every seed and its roots, most first. A column on the right of a wide screen, a strip across the top of
      // a phone held upright.
      const ranked = (v) => [...v.growers].sort((a, b) => b.cells - a.cells || a.seat - b.seat);
      ui.view(
        'taproot.standings',
        ({ world }) => {
          const v = viewOf(world);
          if (v.source !== 'live' || !v.growers.length) return null;
          const list = ranked(v);
          const most = Math.max(1, list[0]?.cells ?? 1);
          return UI.panel(
            { pad: [10, 12], gap: 6, align: 'stretch', fill: alpha(COLORS.night, 0.7), radius: 18, border: 0, w: 230 },
            ...list.map((o, k) =>
              UI.row(
                { gap: 8, align: 'center' },
                bulbNode(o.seat, 34, { me: o.me, halo: o.me }),
                UI.column(
                  { gap: 2, grow: 1 },
                  UI.row(
                    { gap: 6, align: 'center', justify: 'between' },
                    UI.label(short(o.me ? 'YOU' : o.name, 9), { size: 18, color: o.me ? '#fff6e0' : COLORS.clay, weight: 800 }),
                    UI.row(
                      { gap: 4, align: 'center' },
                      v.board?.crown === o.seat ? UI.custom({ w: 22, h: 18, draw: (p, r) => crown(p, r.x + r.w / 2, r.y + r.h - 1, 20) }) : false,
                      UI.label(String(o.cells), { size: 20, color: seatLook(o.seat).color, weight: 800 }),
                    ),
                  ),
                  UI.bar(o.cells / most, { h: 6, fill: seatLook(o.seat).color }),
                ),
              ),
            ),
          );
        },
        { anchor: 'top-right', offset: [10, 10], order: 5, when: (ctx) => playing(ctx) && wide(ctx) },
      );
      ui.view(
        'taproot.strip',
        ({ world }) => {
          const v = viewOf(world);
          if (v.source !== 'live' || !v.growers.length) return null;
          return UI.row(
            { gap: 4, align: 'center', justify: 'center' },
            ...ranked(v)
              .slice(0, 8)
              .map((o) =>
                UI.column(
                  { gap: 0, align: 'center', w: 42 },
                  bulbNode(o.seat, 34, { me: o.me, halo: o.me }),
                  UI.label(String(o.cells), { size: 18, color: o.me ? '#fff6e0' : seatLook(o.seat).color, weight: 800, outline: 3, outlineColor: COLORS.night }),
                ),
              ),
          );
        },
        { anchor: 'top', offset: [0, 62], order: 5, when: (ctx) => playing(ctx) && !wide(ctx) },
      );

      // The last snips: who cut whom, and how much.
      ui.view(
        'taproot.feed',
        ({ world, time, portrait }) => {
          const v = viewOf(world);
          const feed = (v.feed ?? []).filter((f) => time.now - f.at < 6).slice(0, portrait ? 2 : 3);
          if (v.source !== 'live' || !feed.length) return null;
          const name = (seat) => (seat === v.me ? 'YOU' : short(v.growers[seat]?.name ?? '?', 8));
          return UI.column(
            { gap: 4, align: 'start' },
            ...feed.map((f) =>
              UI.panel(
                { dir: 'row', pad: [4, 10], gap: 6, align: 'center', fill: alpha(COLORS.night, 0.75), radius: 14, border: 0, opacity: Math.min(1, (6 - (time.now - f.at)) / 1) },
                bulbNode(f.by, 24, {}),
                UI.label(name(f.by), { size: 17, color: f.by === v.me ? '#fff6e0' : seatLook(f.by).color, weight: 800 }),
                UI.custom({ w: 22, h: 18, draw: (p, r) => scissors(p, r.x + r.w / 2, r.y + r.h / 2, 8) }),
                UI.label(name(f.victim), { size: 17, color: f.victim === v.me ? '#fff6e0' : seatLook(f.victim).color, weight: 800 }),
                UI.label(`−${f.size}`, { size: 18, color: COLORS.ember, weight: 800 }),
              ),
            ),
          );
        },
        { anchor: 'left', offset: [10, 0], order: 5, when: (ctx) => playing(ctx) && wide(ctx) },
      );
      // On a phone: the latest snip, one line under the standings.
      ui.view(
        'taproot.feed.phone',
        ({ world, time }) => {
          const v = viewOf(world);
          const f = (v.feed ?? [])[0];
          if (v.source !== 'live' || !f || time.now - f.at > 4) return null;
          const name = (seat) => (seat === v.me ? 'YOU' : short(v.growers[seat]?.name ?? '?', 8));
          return UI.panel(
            { dir: 'row', pad: [4, 10], gap: 6, align: 'center', fill: alpha(COLORS.night, 0.75), radius: 14, border: 0, opacity: Math.min(1, 4 - (time.now - f.at)) },
            UI.label(name(f.by), { size: 17, color: f.by === v.me ? '#fff6e0' : seatLook(f.by).color, weight: 800 }),
            UI.custom({ w: 22, h: 18, draw: (p, r) => scissors(p, r.x + r.w / 2, r.y + r.h / 2, 8) }),
            UI.label(name(f.victim), { size: 17, color: f.victim === v.me ? '#fff6e0' : seatLook(f.victim).color, weight: 800 }),
            UI.label(`−${f.size}`, { size: 18, color: COLORS.ember, weight: 800 }),
          );
        },
        { anchor: 'top', offset: [0, 128], order: 5, when: (ctx) => playing(ctx) && !wide(ctx) },
      );
    },
  });
}

export { SEATS };
