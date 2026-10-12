# Rally: Boost Time and Hero Equipment Ore Calculator

Two small tools for a mobile strategy game, in one static page:

1. **Boost time**: when will an upgrade finish once you apply speed-up boosts?
2. **Hero equipment ore**: how much Shiny, Glowy and Starry Ore does an equipment upgrade plan need?

Independent fan-made tool. Not affiliated with Supercell.

**[Try it live](#)** *(replace with your hosted link)*

## Boost time calculator

- Enter a start date and time and how much time is left on an upgrade
- Queue boosts (Builder, Research, Pet potion, or a custom multiplier and duration) in the order you'll use them; reorder, duplicate or delete them
- Get the exact finish time, a live countdown, time saved, and a timeline of normal and boosted segments
- Timezones: WIB, WITA, WIT, or the device's local time
- Save calculations on the device and reload them later; share a text summary

Boosts apply in queue order. Each boost turns its real duration into progress (`duration × multiplier`). If that is more than what is left, only the real time actually needed is counted. Otherwise the whole boost is used and the next one starts. Whatever remains after the queue runs at normal speed. The "How was this calculated?" panel shows the working for any result.

## Hero equipment ore calculator

Open the **Hero equipment ore** tab (URL hash `#ore`).

Equipment upgrades are instant. They cost ore, not time, so this tab does not use the boost queue or the timezone.

1. **Build a plan.** Pick a hero and a piece of equipment and press *Add*, or *Add all* for a hero, or *Add all equipment*. Every piece starts at current level 1 and at its default target level.
2. **Set levels.** Edit each piece's current and target level. Target presets: *Default* (your preset target), *Max* (18 for Common, 27 for Epic) and *Custom* (type any level).
3. **Enter ore in stock** (Shiny, Glowy, Starry). Blank means none.
4. **Press *Calculate all*.** You get, per piece, its ore total and a level-by-level breakdown, and for the whole plan the required ore, ore in stock, and the balance (short or spare). After the first calculation, results update as you edit.

Scope of the reset controls:

| Control | What it does |
| --- | --- |
| Reset (on a piece) | That piece goes back to current level 1 and its default target |
| Restore default targets | Every piece's target returns to its default; current levels are kept |
| Clear plan | Removes every piece from the plan; stock is kept |
| ✕ (on a piece) | Removes that piece |

Invalid rows (blank, non-numeric, out of range, or target below current) are flagged on the row and left out of the totals, and the summary says how many were skipped. The plan and stock persist in the browser (`localStorage`, per device).

### Rules

- Common equipment maxes at level 18, Epic at level 27.
- Cost of going from level `A` to `B` is the sum of the costs of upgrades to `A+1` through `B`. `A = B` costs nothing.
- Common equipment never costs Starry Ore. Epic equipment costs Starry Ore only at levels 9, 12, 15, 18, 21, 24 and 27.

### Cost data: status and sources

**The ore costs have not been verified against the live game.** They are community-published per-level tables, cross-checked against each other and against published maximum-level totals.

- Dataset version `2026-10`, retrieved 2026-10-12
- Every level (2 to 18 Common, 2 to 27 Epic) has at least two agreeing sources
- Sums match the published totals: Common 1 to 18 is 27,260 Shiny and 1,920 Glowy; Epic 1 to 27 is 56,060 Shiny, 3,720 Glowy and 480 Starry
- Epic cumulative Shiny, Glowy and Starry also match checkpoints from a separate wiki table
- Unverified levels: none flagged

Known caveats:

- Supercell's October 2026 ore announcement changes Gem and Medal prices for ore, not the ore each level needs. Supercell has said more ore-economy news is coming later in October, so recheck afterwards.
- One source's aggregate row ("L1 to L9: 1,680 Shiny") disagrees with its own per-level values. It was not used.
- Hero assignments agree between two sources. Rarities come from one 2026 guide and are not confirmed in-game. Monolith Arrow is classed Epic (released as an Epic in a June 2026 medal event).
- Supercell's support article was not used for per-level numbers.

The full source list is in the app under *About the cost data*, and in `ore/data.js`.

### Updating the data

Edit `ore/data.js`: the two row tables (`[destinationLevel, shiny, glowy, starry]`), the registry, and `META` (version, date, sources, notes). Then run the tests. They fail if a level is missing, a value is not a non-negative integer, Common costs Starry Ore, or the sums stop matching the baseline totals. To add equipment, add one line to `EQUIPMENT`. To change a default target, edit its `defaultTarget`.

## Running it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Tests

```bash
npm install   # installs jsdom, used only by the DOM tests
npm test      # Node 18 or newer
```

- `tests/ore.test.js`: dataset integrity and every calculation rule (same-level, destination-level costs, bounds, missing data, inventory, combined totals)
- `tests/app.test.js`: loads the real page in jsdom and checks the boost calculator for regressions, navigation, and the ore view end to end

jsdom checks behaviour, not layout. Check responsive layout in a real browser.

## Project structure

```text
.
├── index.html     # page structure: both views
├── styles.css     # design tokens and styling for both views
├── script.js      # boost time calculator (engine, rendering, storage)
├── nav.js         # switches views from the URL hash (#time, #ore)
├── ore/
│   ├── data.js    # equipment registry and per-level ore costs, with sources
│   ├── calc.js    # pure calculation functions, no DOM
│   └── ui.js      # ore view rendering and state
├── tests/
├── package.json   # test script only
└── README.md
```

## Notes

- Plain HTML, CSS and JavaScript. The only dependency is jsdom, for tests.
- `ore/data.js` and `ore/calc.js` run in both the browser and Node, so the same code is tested and shipped.
- Single dark theme by design. One accent (amber) marks primary actions; green and red appear only for outcomes (spare, short, errors).
- Monospace type is used only for numbers, so digits don't shift width as values change.
