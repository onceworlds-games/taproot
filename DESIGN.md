# Taproot: design

## The hook

**Tap to grow your roots. Snip theirs. Anything cut off withers.** Six seeds share one slab of night soil. Every root must stay
connected to its seed: cut a thin root and everything past the cut dies on the spot. The clip people share is the snip: one tap,
and half of somebody's glowing root system turns to ash.

Signature mechanic: **connection is life**. You never attack a player's "health": you attack the one thin root that holds their
far side to their seed. Thick roots are expensive to cut, thin ones are cheap, and everyone can see which is which.

## The core loop

Every couple of seconds:

1. **Pick a target** (tap a cell). Your root's planned path shows as a dotted line from your nearest root, with its sap cost and,
   if it cuts through someone, how many of their cells would wither (`SNIP 14`).
2. **Watch it grow**: the root snakes there a cell at a time, paying sap per cell (1 for open soil, more for an enemy cell).
3. **Reward**: water drops give a burst of sap; snips make enemy roots crumble, pay you back in sap, and drop the dead cells back
   to open soil for anyone to take.
4. **Next decision**: reach for more water, snip a rival's neck, or tap your own roots to **thicken** them (bloom) because a
   dotted enemy line is heading for your thin neck.

Rules, all of them:

- Your territory is the cells your roots fill. Each must connect to your seed, through your own cells. Cut off = withered.
- Sap flows to everyone: 1.2 a second at the start of a round, rising to 3 by its end. You hold at most 12.
- **Water drops** rise on open soil, one at a time, a ripple showing where 1.5 s before. The first root to reach one drinks it:
  +4 sap. (A race everyone can see coming; reaching far for one leaves a thin root behind you.)
- Growing into open soil costs 1. Taking an enemy cell costs **3 + the number of that player's cells touching it** (4 for a lone
  tip, up to 9 deep in a clump). Roots are drawn as thick as they are hard to cut.
- Whatever you cut off feeds you: 1 sap for each cell that withers.
- The leader wears a **crown**: their cells cost 1 less to take, so everyone can catch them.
- Seeds can't be taken; nobody is ever knocked out. Rocks block.
- Tap your own roots: **bloom**, filling the open soil around that spot.
- The round lasts 90 seconds. The last 15 are the **Flood**: sap flows double. Most cells when the rim closes wins the round;
  places pay 10, 7, 5, 3, 2, 1 points over a match of 1 to 3 rounds (2 by default). Everyone moves one place round the dish
  each round.

## Originality

It resembles: territory games on a grid (Generals.io, Territorial.io, Splix/Paper.io), Galcon-style "send toward a target" control,
and the capture rule of Go. None of the engine's kits (arena, party floor, platformer, tactics) are close.

What a player notices that is different in the first minute:
- **The connectivity rule is the whole game.** Nothing here has hit points or armies; strength is shape. Thin reaching roots are fast
  and greedy, clumps are slow and safe, and loops make a root uncuttable at one point. Paper.io kills the player; here a cut kills a
  *branch*, and the cut-off part becomes free soil that a third player can steal.
- **Every intention is public.** Everyone's planned root is drawn on the board as it grows, so you see the snip coming and can
  thicken the neck (cost goes up) or snip their attacking tendril first (it's thin).
- **The look**: a living cross-section of midnight soil with roots that glow, not a grid of coloured squares.

## The first minute

- **0 s, title**: the board alive behind the name: bots growing and snipping in silence. One big button: PLANT.
- **Lobby**: the seeds sit on the board, each a bulb with its symbol and name; ready-up sprouts the bulb.
- **3-2-1**: Flow's one countdown, restyled as a sprouting seed. Banner: `MOST ROOTS WINS`.
- **+1 s**: my seed pulses with a halo; the nearest water drop (three cells away) glows with a ring and the words `TAP THE WATER`.
  The rest of the board is dimmer. On a computer the dotted path already follows the mouse.
- **+3 s**: I tap the water. A root snakes to it in about a second with a rising pop per cell, the drop splashes, `+4`
  floats up, my sap glass fills. Hint gone.
- **+6 s**: a second hint ring on the biggest open patch beside me: `NOW TAP OPEN SOIL`. I tap; the root runs there.
- **+15 s**: my roots touch a rival's thin root. Their neck glows ember with `TAP TO SNIP` and the preview shows `SNIP 9`.
- **+18 s**: I snip. Crack sound, a shake, their branch goes grey and crumbles; `SNIP 9` floats in my colour and the feed says
  `● YOU ✂ ▲ MIA`. I understand the game.
- **+30 s**: a dotted line in Mia's colour is heading at *my* thin root; it pulses ember. Hint: `TAP YOUR ROOT: THICKEN`.
- **90 s**: the rim closes, the standings fly in; I see I was 3rd and the result line says who snipped whom most.

Round 1 is gentler: bots start a beat later and never snip in the first 20 seconds.

## Art direction

**World**: a slice of night soil under a forest, seen from above like a specimen in a round clay dish. Roots glow faintly in their
seed's colour, water drops shine cold blue, stones sit dark and round. The dish's rim is the clock.

**Palette** (ground, ink, accents, good, bad):
- Loam `#3a2619` (the soil), Deep loam `#1c120c` (ink, edges, outside the dish)
- Clay rim `#e8d3ad` (the dish, text on dark), Bark `#5a3b28` (panels)
- Spring blue `#7fe3ff` (water, sap), Ember `#ff5a36` (cuts, danger), Ash `#8c8178` (withered)
- Seeds (each with a symbol, for colour-blind players): rose `#ff4f6e` ●, marigold `#ffc233` ▲, mint `#45e08a` ■,
  sky `#45b5ff` ◆, violet `#a77bff` ★, tangerine `#ff8a2b` ✚, orchid `#ff6ed6` ⬢, lime `#c8f04a` ✦.

**Type**: Bricolage Grotesque (800 for words, 700 for numbers): organic, a little quirky, modern.

**Shapes and materials**: hex cells as soft rounded tiles of tinted soil; roots as tapered strokes along the way each cell grew
(thick near the seed, fine at the tips); seeds as round bulbs with the symbol cut in. Everything drawn in code; no library art.

**Signature element**: the **rim root**: a root that creeps around the dish's rim as the round's clock; when it closes the circle, the
round ends. It turns blue for the Flood. The same rim frames the title, the lobby and the results.

## Feel

- Growth: each cell pops in (scale 0.6 to 1, eased back-out) with a soft pitched pop that rises while a root keeps growing.
- Snip: a hard shears crack, hit-stop of 60 ms, camera shake by size, the cut cell flashes ember, the withered cells go grey and
  crumble into dust, `SNIP 14` floats up in the snipper's colour.
- Water: a bloop and a splash ring when a drop is drunk; `+4` floats up.
- Threat: an enemy's dotted line that crosses your root makes it pulse ember with a low tick.
- Flood: rumble, the rim and water turn bright, music intensity up.
- Music: Audio's procedural `chill` behind the title, `action` during rounds, intensity rising in the Flood.

## The UI

- **Title**: the dish with bots playing inside it, `TAPROOT` in clay over it with a root underline, one button `PLANT`.
- **Lobby**: Flow's lobby restyled: each player is a seed bulb with their symbol and name; no BOT tags (bots have names and seeds).
- **Countdown**: a seed cracking open on 3-2-1, `GROW!`.
- **HUD** (my own; Flow's hud off):
  - The rim clock (in the world).
  - My sap: a bulb at the bottom with the number and income (`+3.2/s`), and my cells and place.
  - Standings: one row per seed (symbol, cells), sorted, mine ringed; top right on a computer, a strip across the top on a phone.
  - Snip feed: the last three snips (`● MIA ✂ ▲ KAI 14`), left side.
- **Between rounds and results**: the final board stays visible; the standings in seed rows; the winner's seed is crowned.

## Balance (tools/balance.mjs: bots against bots with the game's own rules)

300 rounds of 6 seats: every seat ends with 23.5 to 24.7 cells on average (the dish is exactly the same from every seat); the
four bot personalities (grower, cutter, keeper, balanced) win 77% to 109% of their fair share; about 59 snips a round, 3.5 cells
each, the biggest 20; the board is 88% taken at 57 s; the leader at half time wins only a third of rounds and the leader when the
Flood starts about half, so the end matters. A newcomer-paced seat (looks every 2 to 3.5 s, often picks a worse move) places
4.1 of 6 on average, 4.0 in round 1, when bots don't snip for 20 s.

What changed on the way, and why: income first was flat (the board filled in 10 s and the half-time leader won 86%); roots first
thickened with age (old territory got so safe that the half-time leader won 83%); a great spring in the middle paid sap to its
holder (bots spent 70% of all sap pulling it back and forth), so water became drops to race for; and once the board filled,
bots that only snipped big went idle, so they chip at borders when their sap would otherwise go to waste.

## Pre-build check

1. Yes: the glowing water three cells away and `TAP THE WATER`; the root is growing within 3 seconds.
2. Drops show where sap is (and the ripple where the next one rises), a root's thickness shows what it costs to cut, dotted lines
   show what every rival is doing, the crown shows whom to gang up on.
3. Yes: the dotted path, its sap cost and `SNIP n` with the doomed cells tinted before you commit.
4. Yes: the feed and the ember flash name who snipped you and where; the result line says who cut most.
5. The leader is big, so they have long thin roots: anyone can see their necks and their planned lines; the counter to a reaching
   tendril is to snip it (it's thin) or to bloom your own neck.
6. No blind guesses: all orders are public lines on the board.
7. Each order is a choice every 2 to 5 seconds; the stake (cells that would die, water to take) is on the board, the clock is the rim.
8. Yes: territory games don't have "cut the neck and the branch dies" with public intentions and thickness as defence.
