// This page's side of play: the pointer picks a cell (a preview of what a tap would do, then the order), every change on the board
// gets a sound and some motion, snips get their moment, and the camera keeps the dish framed on any screen.
import { Transform, defineModule, defineSystem } from '@onceworlds/engine';
import { Camera, FlowState, Input, servicesOf } from '@onceworlds/engine/modules';
import { Aim, DishCamera, Soil } from './components.js';
import { soilEntity } from './host.js';
import { ROCK, TUNING, isSeed, preview } from './rules.js';
import { COLORS, seatLook } from './theme.js';
import { viewOf } from './view.js';

export const actions = {
  // Tap (or click) a cell: grow there. Tap your own roots: fill the soil round them. Hold and drag on a phone to see first.
  point: Input.pointer({ drag: 'any', label: 'Tap a cell', hint: { keys: ['Click', 'Tap'], action: 'Grow there (your roots: thicken)' } }),
};

const out = { x: 0, y: 0 };

/** The cell under a screen point, or -1. */
function cellUnder(render2d, v, x, y) {
  if (!v.board || !render2d?.screenToWorld(x, y, out)) return -1;
  return v.board.g.cellAt(out.x, out.y);
}

/** What tapping `cell` would do for this player, kept until the cell or the board changes. */
function previewFor(v, world, cell) {
  const soil = soilEntity(world)?.get(Soil);
  const key = `${cell}:${soil?.version ?? 0}`;
  if (v.previewKey === key) return v.preview;
  v.previewKey = key;
  v.preview = cell >= 0 && v.board && v.me >= 0 ? preview(v.board, v.me, cell) : null;
  return v.preview;
}

export const Aiming = defineSystem({
  name: 'taproot:aim',
  stage: 'update',
  run({ world, input, render2d, taproot, audio, time }) {
    const v = viewOf(world);
    const aim = world.resource(Aim);
    const state = world.resource(FlowState);
    if (state.phase !== 'playing' || v.source !== 'live' || v.me < 0 || !v.board) {
      aim.cell = -1;
      v.preview = null;
      v.previewKey = '';
      return;
    }
    const p = input.pointer('point');
    const touch = p.type === 'touch' || p.type === 'pen';
    const cell = cellUnder(render2d, v, p.x, p.y);
    // A mouse previews wherever it points; a finger previews while it is down.
    const showing = touch ? p.down || p.released : p.type === 'mouse';
    aim.cell = showing ? cell : -1;
    previewFor(v, world, aim.cell);
    const commit = touch ? p.released : p.pressed;
    if (!commit || cell < 0) return;
    const b = v.board;
    if (b.terrain[cell] === ROCK || (b.owner[cell] !== v.me + 1 && isSeed(b, cell))) {
      audio?.ui('error');
      v.refused = { cell, at: time.now };
      return;
    }
    taproot?.order(cell);
    aim.ordered = (aim.ordered + 1) % 65536;
    aim.lastOrder = cell;
    aim.lastOrderAt = time.now;
    v.tapped = { cell, at: time.now };
    audio?.play('order', { volume: 0.8 });
    if (touch) aim.cell = -1;
  },
});

// ---------------------------------------------------------------- effects

/** Sounds made in code: no files to load. */
export function Sounds() {
  return defineModule({
    name: 'taproot-sounds',
    install(game) {
      const audio = servicesOf(game).audio;
      if (!audio?.effect) return;
      audio.effect('grow', { voices: [{ kind: 'osc', wave: 'sine', freq: 520, freqEnd: 780, dur: 0.07, gain: 0.16, attack: 0.005 }] });
      audio.effect('order', { voices: [{ kind: 'osc', wave: 'triangle', freq: 660, freqEnd: 990, dur: 0.05, gain: 0.18 }] });
      audio.effect('snip', {
        voices: [
          { kind: 'noise', dur: 0.06, gain: 0.55, filter: { type: 'highpass', freq: 2600 } },
          { kind: 'osc', wave: 'square', freq: 1900, freqEnd: 260, dur: 0.09, gain: 0.16 },
          { kind: 'osc', wave: 'sine', freq: 150, freqEnd: 55, dur: 0.16, gain: 0.5, start: 0.01 },
        ],
      });
      audio.effect('wither', { voices: [{ kind: 'noise', dur: 0.5, gain: 0.22, attack: 0.02, filter: { type: 'lowpass', freq: 1100, freqEnd: 180 } }] });
      audio.effect('drink', {
        voices: [
          { kind: 'osc', wave: 'sine', freq: 420, freqEnd: 1100, dur: 0.11, gain: 0.32 },
          { kind: 'osc', wave: 'sine', freq: 880, freqEnd: 1600, dur: 0.09, gain: 0.2, start: 0.07 },
        ],
      });
      audio.effect('rise', { voices: [{ kind: 'osc', wave: 'sine', freq: 300, freqEnd: 620, dur: 0.22, gain: 0.08, attack: 0.04 }] });
      audio.effect('flood', {
        voices: [
          { kind: 'noise', dur: 1.1, gain: 0.3, attack: 0.2, filter: { type: 'lowpass', freq: 220, freqEnd: 1400 } },
          { kind: 'osc', wave: 'sawtooth', freq: 70, freqEnd: 140, dur: 1.0, gain: 0.12, attack: 0.1 },
        ],
        duck: true,
      });
    },
  });
}

const seen = new WeakMap();

export const Effects = defineSystem({
  name: 'taproot:effects',
  stage: 'update',
  run({ world, time, feel, audio, ui, flow }) {
    const v = viewOf(world);
    if (!v.board) return;
    const g = v.board.g;
    const at = (c) => ({ x: g.x[c], y: g.y[c] });
    const live = v.source === 'live';
    const quiet = !live; // the demo behind the title makes no sound
    let s = seen.get(world);
    if (!s || s.key !== v.key) {
      s = { key: v.key, snips: v.growers.map((o) => o.snips), streak: 0, lastGrow: -10, withered: 0, flood: false };
      seen.set(world, s);
      v.flashes = [];
      v.feed = [];
    }
    // Growing: a soft pop, rising in pitch while this player's root keeps going.
    let mineGrew = false;
    let othersGrew = 0;
    let withered = 0;
    let witherAt = -1;
    for (const ch of v.changes) {
      if (ch.type === 'grow') {
        if (ch.owner === v.me + 1) mineGrew = true;
        else othersGrew++;
      } else if (ch.type === 'wither') {
        withered++;
        if (withered <= 6 && feel) feel.particles.burst('dust', at(ch.cell), { count: 5, color: [COLORS.ash, '#6b5a4c'], scale: 0.5 });
        witherAt = ch.cell;
      } else if (ch.type === 'drink' && !quiet) {
        const mine = ch.owner === v.me + 1;
        audio?.play('drink', { volume: mine ? 1 : 0.35 });
        feel?.floatText(`+${TUNING.dropSap}`, at(ch.cell), { color: COLORS.water, size: mine ? 0.9 : 0.6, rise: 1.4 });
      } else if (ch.type === 'rise' && !quiet) audio?.play('rise', { volume: 0.5 });
    }
    if (!quiet) {
      if (mineGrew) {
        s.streak = time.now - s.lastGrow < 0.6 ? Math.min(s.streak + 1, 10) : 0;
        s.lastGrow = time.now;
        audio?.play('grow', { pitch: 1 + s.streak * 0.06, volume: 0.9 });
      } else if (othersGrew && time.now - (s.lastOther ?? 0) > 0.12) {
        s.lastOther = time.now;
        audio?.play('grow', { pitch: 0.7, volume: 0.18 });
      }
      if (withered > 0) audio?.play('wither', { volume: Math.min(1, 0.3 + withered * 0.06) });
    }
    void witherAt;
    // Snips: from each seat's counter, so a page that reloads shows nothing twice.
    v.growers.forEach((o, k) => {
      const before = s.snips[k] ?? o.snips;
      s.snips[k] = o.snips;
      if (o.snips === before || o.snipCell < 0 || o.snipCell >= g.count) return;
      v.flashes.push({ cell: o.snipCell, at: time.now, size: o.snipSize, by: o.seat });
      if (v.flashes.length > 12) v.flashes.shift();
      v.feed.unshift({ by: o.seat, victim: o.snipVictim, size: o.snipSize, at: time.now });
      if (v.feed.length > 4) v.feed.pop();
      if (quiet) return;
      const involved = o.seat === v.me || o.snipVictim === v.me;
      const big = o.snipSize >= 8;
      audio?.play('snip', { volume: involved ? 1 : 0.55, pitch: big ? 0.85 : 1 });
      feel?.floatText(`SNIP ${o.snipSize}`, at(o.snipCell), { color: seatLook(o.seat).color, size: 0.7 + Math.min(0.8, o.snipSize * 0.05), rise: 1.8, ms: 1300 });
      feel?.particles.burst('sparks', at(o.snipCell), { count: 10 + Math.min(20, o.snipSize), color: [COLORS.ember, '#ffd0b0'], scale: 0.6 });
      feel?.shake(Math.min(0.7, (involved ? 0.25 : 0.1) + o.snipSize * 0.025));
      if (big && involved) feel?.hitStop(60);
    });
    // The Flood: the last seconds, sap flows double.
    const flood = live && flow?.phase === 'playing' && v.remaining <= TUNING.floodSeconds && v.remaining > 0;
    if (flood && !s.flood) {
      ui?.callout('FLOOD!', { color: COLORS.water, size: 72, ms: 1400 });
      audio?.play('flood');
      audio?.music?.setIntensity?.(1);
    }
    s.flood = flood;
  },
});

// ---------------------------------------------------------------- music

export const Music = defineSystem({
  name: 'taproot:music',
  stage: 'update',
  run({ world, audio }) {
    if (!audio?.music) return;
    const phase = world.resource(FlowState).phase;
    const song = phase === 'playing' || phase === 'banner' || phase === 'countdown' ? 'action' : 'chill';
    const held = seen.get(audio) ?? {};
    if (held.song !== song) {
      held.song = song;
      seen.set(audio, held);
      audio.music.play(song, { intensity: song === 'action' ? 0.55 : 0.4, fadeIn: 1.2, volume: 0.55 });
    }
  },
});

// ---------------------------------------------------------------- the camera

/** The camera frames the dish: on a tall phone it fills the width with room above and below for the HUD; on a wide screen it
 * fills the height, with the HUD at the sides. */
export const CameraFit = defineSystem({
  name: 'taproot:camera',
  stage: 'late',
  query: [DishCamera, Camera, Transform],
  run({ query, ui, world }) {
    const v = viewOf(world);
    const disc = v.board ? v.board.g.disc : 12;
    const D = 2 * (disc + 1.9);
    const screen = ui?.safe.screen;
    const aspect = screen && screen.w > 0 && screen.h > 0 ? screen.w / screen.h : 16 / 9;
    query.each((_e, _tag, camera, tr) => {
      if (aspect < 0.9) {
        // Portrait: the cells across the whole width (the rim runs off the sides; its top, where the clock starts and ends,
        // stays in view); the standings above, the sap below.
        const cells = 2 * (disc + 0.75);
        camera.height = Math.max(cells / aspect, D * 1.35);
        tr.position.set(0, -camera.height * 0.015, 0);
      } else {
        // Wide: the dish in the middle, as tall as the screen; my sap on the left of it, the standings on the right.
        camera.height = D * 1.04;
        tr.position.set(0, 0, 0);
      }
    });
  },
});
