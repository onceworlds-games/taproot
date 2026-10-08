// The board to and from the `Soil` component: one character a cell. Decoding never trusts what arrives: a wrong length or an
// unknown character reads as open soil, so a forged or garbled board can't break a page.
import { geometry } from './hex.js';
import { NO_PARENT, ROCK, SOIL, DROP } from './rules.js';

// 91 characters that need no escaping in JSON.
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~';
const INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHA.length; i++) INDEX[ALPHA.charCodeAt(i)] = i;
const TERRAIN = ['.', '#', '~'];
const AGE_MAX = ALPHA.length - 1;

const decodeChar = (str, i) => {
  const c = str.charCodeAt(i);
  return c < 128 ? INDEX[c] : -1;
};

export const SIZES = [6, 7, 8];

/** Writes a board into a Soil component's fields. */
export function encode(b, soil) {
  const n = b.g.count;
  let cells = '';
  let age = '';
  let terrain = '';
  for (let i = 0; i < n; i++) {
    cells += ALPHA[b.owner[i] * 8 + b.parent[i]];
    age += ALPHA[Math.max(0, Math.min(AGE_MAX, Math.floor(b.born[i])))];
    terrain += TERRAIN[b.terrain[i]] ?? '.';
  }
  soil.size = b.radius;
  soil.seats = b.seats;
  soil.cells = cells;
  soil.age = age;
  soil.terrain = terrain;
  soil.seeds = Array.from(b.seeds);
  soil.crown = b.crown ?? -1;
}

/** Only what changes in play: owners, roots, ages and water. */
export function encodeLive(b, soil) {
  let cells = '';
  let age = '';
  let terrain = '';
  for (let i = 0; i < b.g.count; i++) {
    cells += ALPHA[b.owner[i] * 8 + b.parent[i]];
    age += ALPHA[Math.max(0, Math.min(AGE_MAX, Math.floor(b.born[i])))];
    terrain += TERRAIN[b.terrain[i]] ?? '.';
  }
  if (soil.cells !== cells) soil.cells = cells;
  if (soil.age !== age) soil.age = age;
  if (soil.terrain !== terrain) soil.terrain = terrain;
  if (soil.crown !== (b.crown ?? -1)) soil.crown = b.crown ?? -1;
}

/** A board from a Soil component, or null when it isn't a board this game could have made. */
export function decode(soil, into) {
  const size = soil.size;
  const seats = soil.seats;
  if (!SIZES.includes(size) || seats < 1 || seats > 8) return null;
  const g = geometry(size);
  const n = g.count;
  const seeds = Array.from(soil.seeds ?? []).slice(0, seats);
  if (seeds.length !== seats || seeds.some((c) => !(c >= 0 && c < n))) return null;
  const b =
    into && into.g === g && into.seats === seats
      ? into
      : { radius: size, seats, g, terrain: new Uint8Array(n), owner: new Uint8Array(n), parent: new Uint8Array(n), born: new Float32Array(n), seeds, now: 0, crown: -1 };
  b.seeds = seeds;
  const cells = typeof soil.cells === 'string' ? soil.cells : '';
  const age = typeof soil.age === 'string' ? soil.age : '';
  const terrain = typeof soil.terrain === 'string' ? soil.terrain : '';
  for (let i = 0; i < n; i++) {
    const v = i < cells.length ? decodeChar(cells, i) : -1;
    let owner = v >= 0 ? v >> 3 : 0;
    let parent = v >= 0 ? v & 7 : NO_PARENT;
    if (owner > seats) {
      owner = 0;
      parent = NO_PARENT;
    }
    b.owner[i] = owner;
    b.parent[i] = owner ? parent : NO_PARENT;
    const a = i < age.length ? decodeChar(age, i) : 0;
    b.born[i] = a >= 0 ? a : 0;
    const t = terrain[i];
    b.terrain[i] = t === '#' ? ROCK : t === '~' ? DROP : SOIL;
  }
  // A seed is always its seat's, whatever arrived.
  seeds.forEach((c, s) => {
    b.owner[c] = s + 1;
    b.parent[c] = 6;
  });
  b.crown = soil.crown >= 0 && soil.crown < seats ? soil.crown : -1;
  return b;
}
