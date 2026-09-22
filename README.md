# Rally — Boost Time Calculator

A small, static web tool for planning when a building, research, hero, or pet
upgrade will finish once you apply one or more speed-up boosts (potions) to
it. Independent fan-made tool — not affiliated with Supercell.

**[Try it live →](#)** *(https://spell-boost-calculator.vercel.app/)*

## What it does

- Enter a start date/time and how much time is left on an upgrade
- Queue up one or more boosts (Builder Potion, Research Potion, Pet Potion,
  or a custom multiplier + duration), in the order you'll use them
- Reorder, duplicate, or delete boosts in the queue
- Get the exact finish date/time, a live countdown, how much time the boosts
  saved, and a visual timeline of normal-speed vs. boosted segments
- Pick a timezone (WIB / WITA / WIT, or your device's local time) so the
  result matches when you'll actually be looking at your phone
- Save calculations locally (per-device, via `localStorage`) and reload them
  later, or share a plain-text summary
- Type a duration in shorthand (`2d 17h`) instead of filling in three fields

## How the calculation works

Boosts are applied in queue order. For each boost, the tool converts its
real duration into "accelerated progress" (`duration × multiplier`):

- If that's *more* progress than what's left on the upgrade, only the real
  time actually needed to finish is counted — the boost is cut short.
- Otherwise, the full boost duration is consumed and the remaining work is
  reduced accordingly, then the next boost in the queue is applied.

Anything still left after every boost in the queue is spent runs at normal
(1×) speed. The full step-by-step math for any given result is available in
the "How was this calculated?" panel under the result.

## Tech stack

Plain HTML, CSS, and JavaScript — no build step, no framework, no
dependencies beyond three Google Fonts. Intentional: for a single-purpose
calculator like this, a bundler or component framework would add complexity
without adding capability.

- `index.html` — markup
- `styles.css` — design tokens and styling
- `script.js` — calculation engine, UI rendering, and local storage

## Running it

There's nothing to build or install. Either:

- Open `index.html` directly in a browser, or
- Serve the folder with any static file server, e.g.:

  ```bash
  npx serve .
  # or
  python3 -m http.server 8000
  ```

  (A local server avoids some browsers' restrictions on `file://` pages
  loading external fonts.)

## Project structure

```text
.
├── index.html    # page structure and content
├── styles.css    # design system: colors, type, spacing, components
├── script.js     # engine, rendering, storage — no external deps
└── README.md
```

## Notes on the design

- Single dark theme by design (this is meant to feel like a fixed-purpose
  utility panel, not a themeable app), with one accent color (amber) for
  primary actions and a second accent (ember) reserved for boost-segment
  coding in the timeline. Green/red are used only for outcome states
  (time saved, errors) — never decoratively.
- Monospace type (JetBrains Mono) is used only for numeric/time values, so
  digits don't shift width while the countdown ticks.
- All calculated data (saved calculations) lives in the browser's
  `localStorage` — nothing is sent to a server, and nothing is shared
  between devices or visitors.

## License

Add a license of your choice (e.g. MIT) if you intend to open-source this.
