// The data, and what of it crosses the network. The host owns the board (`Soil`) and one `Grower` a seat: nobody's page can write
// what it holds or how much sap it has. A player asks for an order with a call (see host.js); everything else is worked out from
// these on every page.
import { defineComponent, defineResource, t } from '@onceworlds/engine';
import { defineSave } from '@onceworlds/engine/modules';

/** Room for the biggest dish (211 cells). */
export const MAX_CELLS = 256;

/**
 * The board, as short strings (one character a cell) so a change costs a few hundred bytes:
 * `cells` holds owner and root direction, `terrain` soil, rock or water.
 */
export const Soil = defineComponent(
  'Soil',
  {
    size: t.u8(7),
    seats: t.u8(6),
    cells: t.string(MAX_CELLS),
    terrain: t.string(MAX_CELLS),
    seeds: t.list(t.u16(), 8),
    /** The seat in the lead (its roots are cheaper to take), or -1. */
    crown: t.i32(-1),
    /** Where the next drop will rise (-1: none yet), and the round's second it rises. */
    warn: t.i32(-1),
    warnAt: t.f32(0, { step: 0.05 }),
    /** Counts up with every change, so pages know to look again. */
    version: t.u32(),
  },
  { net: { replicate: true, owner: 'host', rate: 12 } },
);

/** One seat's roots: sap, the order it is following, the path it plans (everyone sees it), and counters pages turn into effects. */
export const Grower = defineComponent(
  'Grower',
  {
    seat: t.u8(),
    id: t.playerId(),
    sap: t.f32(0, { step: 0.05 }),
    wait: t.f32(0, { step: 0.01 }),
    target: t.i32(-1),
    mode: t.enum(['idle', 'reach', 'bloom']),
    path: t.list(t.u16(), 40),
    cells: t.u16(),
    income: t.f32(0, { step: 0.05 }),
    // Counting, not flags, so a page that reloads shows nothing twice.
    snips: t.u16(),
    snipCell: t.i32(-1),
    snipSize: t.u16(),
    snipVictim: t.i32(-1),
    drinks: t.u16(),
    drinkCell: t.i32(-1),
    grows: t.u32(),
    /** Cells of others this seat has withered, and its biggest single snip (for the results). */
    cut: t.u16(),
    best: t.u16(),
    /** The host's own note: the sap the next cell needs, and when that was worked out (not sent). */
    need: t.f32(),
    needAt: t.f32(-1),
  },
  {
    net: {
      replicate: ['seat', 'id', 'sap', 'wait', 'target', 'mode', 'path', 'cells', 'income', 'snips', 'snipCell', 'snipSize', 'snipVictim', 'drinks', 'drinkCell', 'grows', 'cut', 'best'],
      owner: 'host',
      rate: 12,
    },
  },
);

/** Every seat's body in the match (Flow wants one; the roots themselves are the host's). */
export const Planter = defineComponent('Planter', { seat: t.playerId() }, { net: { replicate: true } });

/** The camera that frames the dish. */
export const DishCamera = defineComponent('DishCamera', {});

/** Host only: the round's tick (seats take turns at going first) and when the next drop is due. */
export const HostClock = defineResource('HostClock', { tick: t.u32(), nextDrop: t.f32(0) });

/** This page's own: what the pointer is over, the preview, the hints already shown. */
export const Aim = defineResource('Aim', {
  cell: t.i32(-1),
  key: t.string(64),
  ordered: t.u16(),
  lastOrder: t.i32(-1),
  lastOrderAt: t.f32(-10),
  holding: t.bool(false),
});

/** What this player keeps between visits: matches finished (the coach stops after two), snips made, the biggest one. */
export const Profile = defineSave('TaprootProfile', { matches: t.u16(), snips: t.u32(), best: t.u16() });
