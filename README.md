# Taproot

**Tap to grow your roots. Snip theirs. Anything cut off withers.**

A multiplayer strategy game for 2 to 8 players (bots fill the empty seats) in a round clay dish of night soil. Every root must stay
joined to its seed: cut a thin root and everything past the cut dies on the spot.

Play it: https://onceworlds.com/play/taproot

## How to play

- **Tap a cell** and your root grows there, a cell at a time, paying sap as it goes. The dotted line shows the way and the price
  before you let go.
- **Water drops** give sap. The first root to reach one drinks it.
- **Tap a rival's root** to cut through it. Thin roots are cheap to cut, thick clumps are dear. Whatever you cut off from its seed
  withers, and you get its sap back.
- **Tap your own roots** to thicken them: fill the open soil around that spot.
- Everyone's planned roots are drawn on the board, so you can see a snip coming and thicken the neck in time.
- The rim root is the clock. The last 15 seconds are the **Flood**: sap flows double. Most roots when the rim closes wins the round.

## Make it

An [Onceworlds](https://onceworlds.com) engine game: plain ES modules, no build step.

```
npm install
npx @onceworlds/cli check     # tests, lints and simulated matches with chaos
npx @onceworlds/cli shot      # a picture of a match; --story for the first minute
node tools/balance.mjs        # bots against bots: fair seats, styles, snips, comebacks
```

`DESIGN.md` is the design, `src/rules.js` every rule and number, `src/draw.js` the dish. Pushes to GitHub deploy through
`.github/workflows/onceworlds.yml`.

MIT licensed.
