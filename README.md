# Token Launch Radar

Built for the make.fun bounty **“Build the best token launch radar”**.

An offline, static dashboard ranking pre-token DeFi protocols by implied
value, with a farm plan for each — from the sealed DefiLlama snapshot only.
Snapshot date **14 November 2026**: 758 protocols, watchlist 40, floor
$50,000,000.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot at
`/input/snapshot.json`, ranks every protocol that records no token and is
not a wrapped, staked or bridged product of one that trades — the
watchlist’s own rule, applied to the whole snapshot — and writes:

- `board.json` — the ranked board (198 rows: the 40 watchlist protocols
  plus every other protocol the rule keeps)
- `data.js` — the dashboard’s dataset, written beside `dashboard/`
- `dashboard/` — the static page (plain HTML/CSS/JS, no network calls)
- `screenshots/` — three screenshots of the dashboard
- `dossier.json` — built with the vendored `vendor/makefun-board.ts`

Implied value is the value of farming a protocol at a fixed $10,000
deposit, $2,000 a month, 6 months: the protocol’s implied token value
(TVL × 0.25, adjusted for 7-day growth and for how long it has run with
no token) × 5% to farmers × the deposit’s share of the pool, capped at
3× the deposit. The model is stated in full on the dashboard itself, with
a walk-forward check (the model re-run on the snapshot rewound seven
days) and a deposit curve for the $10,000 deposit. Every board row carries
a ten-step farm plan and two panels: “Why this protocol is worth farming”
and “Who should farm it”.

The dashboard is one page: a sortable, filterable board (chain, category,
time since listing, TVL-to-implied-value; search by name or symbol), a
detail view for each protocol on the same page, and a comparison mode for
two protocols side by side above the board. Protocols whose token already
trades are set aside in a Live token view with their market caps.

## Build

```sh
# from the repository root; the sealed snapshot lives in the kit at
# ../kit/token-radar-01-kit/input/snapshot.json
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
node tools/check-gate.mjs --out out --input ../kit/token-radar-01-kit/input/snapshot.json
```

Then serve the output and check the page renders:

```sh
cd out && python3 -m http.server 8000
# open http://localhost:8000/dashboard/
```

In the grader’s container the program runs as `node main.ts` with the
sealed snapshot mounted at `/input` and a writable `/output`; the same
commands above reproduce the build locally.

## Screenshots

The three screenshots in `screenshots/` are taken from the built
dashboard with a headless browser, all 1440×900, the three views the
bounty asks for: `1-board.png` (the board), `2-detail.png` (a
protocol's detail view, Steakhouse Financial), `3-filtered.png` (the
board filtered to protocols listed under 90 days). They are regenerated
whenever the dashboard changes, before the final build, so the images
always show the shipped page.

## License

MIT — see `LICENSE`.
