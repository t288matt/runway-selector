# Runway Mode Planner

A decision-support tool for VATSIM controllers. Pick an airport and it fetches the live weather and VATSIM traffic itself, applies that airport's operating rules (held in its data pack), and tells you which runway mode to use — now, and for the rest of the forecast — so you change modes as rarely as possible and never get caught out by a change in busier traffic.

**Flight simulation only.** Never use it for real-world navigation, flight planning or operations.

## Try it

👉 **[runway-selector on GitHub Pages](https://t288matt.github.io/runway-selector/)** — no install needed, works in any modern browser.

Pick your airport from the selector, and the tool fetches the latest weather and traffic for you automatically.

The main screen is "answer-first": it gives you the single recommendation without scrolling.

## What it does

- Fetches the latest weather (METAR/TAF) and VATSIM traffic automatically — no manual entry needed, though you can paste your own report to override it.
- Checks every standard runway mode for the airport against the wind, the runway condition, the traffic, and the airport's operating rules, for every half-hour of the forecast.
- Recommends the mode to use now, and the sequence of modes to expect across the rest of the forecast, with the fewest and least disruptive changes.
- Warns you when changing early would avoid being forced to change later during busier traffic.
- Explains its reasoning in plain language, for every recommendation and every cell in the timeline.

It only ever advises — it never changes anything, and the decision is always yours.

## Supported airports

- **Australia:** YBBN, YBCS, YBTL, YMML (the default), YPAD, YPDN, YPPH, YSCB, YSSY, YSWS
- **Elsewhere:** NFFN (Fiji)

The airport list is in `refdata/app.json`, and the airport selector in the header only offers those.

Each airport's rules, runways and limits live in a separate data pack in `refdata/airports/`, so adding a new airport doesn't need any code changes — see [docs/DESIGN.md](docs/DESIGN.md) if you're setting one up.

## Privacy

Everything runs in your browser. Weather and traffic data are fetched directly from VATSIM and public weather services — nothing you do is sent to any other server. The only things saved (in your browser only) are the airport you last chose and your forecast window.

## Running it yourself

You'll need [Node.js](https://nodejs.org/) 24 or later.

```bash
git clone https://github.com/t288matt/runway-selector.git
cd runway-selector
npm ci --ignore-scripts
npm run dev
```

Then open the address it prints (usually `http://localhost:5173`).

To build a static copy you can deploy anywhere (the `dist/` folder is a complete, self-contained site — serve it over HTTP, not by double-clicking the files):

```bash
npm run build
```

To run the test suite:

```bash
npm test
```

## Learn more

The full rules the recommendation engine follows, the screen-by-screen behaviour, and the airport data format are documented in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), [docs/DESIGN.md](docs/DESIGN.md) and [docs/UI_DESIGN.md](docs/UI_DESIGN.md).

## Known limits

- Traffic estimates are rough, especially for aircraft that haven't taken off yet.
- If the weather feed fails, the last good report is kept and you're told; pasting your own report always works as a fallback.
