// The look in one place: night soil in a clay dish, glowing roots, cold water. DESIGN.md's "Art direction" has the why.

export const TITLE = 'TAPROOT';
export const FONT = 'Bricolage Grotesque';

export const COLORS = {
  night: '#1c120c', // outside the dish, ink
  loam: '#3a2619', // the soil
  loamLight: '#4a3122',
  loamDark: '#2c1c13',
  clay: '#e8d3ad', // the dish's rim, words on dark
  clayDark: '#b89a6e',
  bark: '#5a3b28', // panels
  barkLight: '#7a5238',
  water: '#7fe3ff',
  waterDeep: '#2a9fc9',
  ember: '#ff5a36',
  ash: '#8c8178',
  stone: '#6e6157',
  stoneLight: '#8f8174',
  gold: '#ffd76a',
};

/** One colour and one symbol per seat, so nobody depends on colour alone. Saturated, all readable on the loam. */
export const SEATS = [
  { color: '#ff4f6e', symbol: 'circle', glyph: '●' },
  { color: '#ffc233', symbol: 'triangle', glyph: '▲' },
  { color: '#45e08a', symbol: 'square', glyph: '■' },
  { color: '#45b5ff', symbol: 'diamond', glyph: '◆' },
  { color: '#b48cff', symbol: 'star', glyph: '★' },
  { color: '#ff8a2b', symbol: 'plus', glyph: '✚' },
  { color: '#ff6ed6', symbol: 'hex', glyph: '⬢' },
  { color: '#c8f04a', symbol: 'spark', glyph: '✦' },
];
export const seatLook = (index) => SEATS[((index % SEATS.length) + SEATS.length) % SEATS.length];

/** The UI theme: clay type on bark panels, the water accent, the game's own font. */
export const theme = {
  font: FONT,
  weights: [600, 800],
  radius: 18,
  border: 3,
  shadow: 'soft',
  colors: {
    ink: COLORS.night,
    panel: COLORS.bark,
    panelAlt: COLORS.barkLight,
    text: COLORS.clay,
    onAccent: COLORS.night,
    dim: '#c7ad86',
    accent: COLORS.water,
    accent2: COLORS.gold,
    good: '#45e08a',
    bad: COLORS.ember,
    warn: COLORS.gold,
    gold: COLORS.gold,
    silver: '#d9d2c7',
    bronze: '#d08a4f',
  },
};

/** "#rrggbb" with an alpha from 0 to 1. */
export function alpha(hex, a) {
  const v = Math.max(0, Math.min(255, Math.round(a * 255)));
  return `${hex.slice(0, 7)}${v.toString(16).padStart(2, '0')}`;
}

/** Mixes two "#rrggbb" colours. */
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1)}`;
}
