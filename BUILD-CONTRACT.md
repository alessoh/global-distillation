# Build contract

`index.html` and `assets/js/app.js` are written and fixed. Four modules and one stylesheet are
built against this contract. Each is owned by exactly one agent; **never edit a file you do not
own**, and never edit `index.html` or `app.js` (report a needed change instead).

Design system: read `DESIGN.md` first and follow its tokens, class names and anti-patterns exactly.
Data shape: read `data/SCHEMA.md`. Live feed shape: read `data/live.json`.

## Environment

- Plain static site, no build step, no bundler. ES modules, served from the repo root.
- A static server already runs at `http://localhost:4173`. Do **not** start another.
- Libraries are **vendored locally** and already loaded by `index.html`:
  - `window.echarts` (ECharts 5.5.1, global, loaded before modules)
  - `window.katex` (KaTeX 0.16.11, global; CSS already linked)
  - `three` (ES module, via importmap: `import * as THREE from 'three'`)
  Never load anything from a CDN except the Google Fonts stylesheet already in `index.html`.
- Screenshot for verification:
  `node scripts/screenshot.mjs "http://localhost:4173/#/<route>" shots/<name>.png --full`
  Add `--width 390 --height 844` for mobile, `--click "<selector>"` to interact first.
  Then view the PNG with the Read tool. The script prints console errors; there must be none.

## Imports available from `app.js`

```js
import { openDrawer, closeDrawer, ROUTES, data, live, loadPerspective } from './app.js';
```

`openDrawer(html, title)` injects `html` into the drawer body and manages focus. `data` is a live
object keyed by perspective name, populated as sections load.

## Files and owners

### `assets/css/app.css`
Every class in `index.html` plus every class listed in DESIGN.md section 4. Also:
`.skip-link`, `.eyebrow`, `.eyebrow__dot`, `.view`, `.section`, `.section__head`,
`.section__title`, `.section__standfirst`, `.grid`, `.kpi-row`, `.skeleton`, `.callout--bad`,
`.foot*`, `.hero*`, `.rail*`, `.nav*`, `.drawer*`, `.palette*`, `.is-locked`, `.is-open`,
`.is-active`. Mobile: at ≤1023px the rail slides in over a scrim; at ≤767px the nav links
collapse (the rail is the navigation) and KPI rows go 2-up then 1-up at ≤479px. No horizontal
page scroll at 390px. Print styles not required.

### `assets/js/hero.js`
```js
export function mountHero(el): void   // el = #hero-canvas
```
Builds the Three.js scene per DESIGN.md section 5 and also fills `#hero-legend` with the
three direct labels and `#hero-facts` with 3 definition pairs read from `data`/`live` when
available (fall back to static text). Pause rendering when off-screen or hidden; honour
`prefers-reduced-motion`; cap DPR at 2; dispose on `pagehide`.

### `assets/js/render.js`
```js
export function renderSection(el, d, route): void   // generic perspective page
export function renderOverview(el, ctx): void       // ctx = { data, live }
export function renderCompare(el, ctx): void
export function renderMethodology(el, ctx): void
export function renderTable(spec): string           // returns HTML, used by library.js too
export function renderChart(node, spec): void       // mounts an ECharts instance
export const echartsTheme                            // registered as 'gd'
```
- `renderSection` renders, in order: section head (eyebrow, title, standfirst from `summary`),
  KPI row from `stats`, key findings, every chart in `charts` inside a `.panel` with a
  segmented control when a section has more than one chart of the same subject, every table in
  `tables` (sortable, filter chips derived from the first text column when it has 3–12 distinct
  values), the perspective `timeline` when present, glossary, and the sources list with numbered
  footnotes.
- `renderOverview` composes a cross-perspective front page: a KPI row picking the single
  strongest stat from each perspective, a "six angles" card grid linking into each section, two
  headline charts (price gap and benchmark retention if available), a live-signals panel from
  `live.json` (arXiv per-year, tracked model downloads, repo stars, recent news), and the
  latest six timeline events.
- `renderCompare` is an interactive builder: pick 2–4 models from `customer.extras.models`
  (fall back to `financial.extras.pricing`) and render a side-by-side spec table plus a radar
  or grouped-bar chart. Selection persists in `localStorage` inside try/catch.
- Charts must resize with a `ResizeObserver` and be disposed when the view is replaced.
- Tables: `aria-sort`, tabular numerals, units in the caption, sources beneath.

### `assets/js/library.js`
```js
export function renderLibrary(el, d, param): void
export function openMethod(id): void
```
Renders `library.extras.methods` as a filterable grid: family chips, a difficulty filter, a
teacher-access filter (white-box / black-box), and a text filter. Clicking a card opens the
drawer via `openDrawer` with the method's `howItWorks` (render markdown paragraphs and lists
yourself, no library), the `lossFormula` rendered with `katex.render` (display mode, `throwOnError:false`),
pros/cons columns, when-to-use, tools, examples, and related-method links that swap the drawer
contents. `openMethod(id)` opens a method by id and updates the hash to `#/library/<id>`.
If `data/library.json` is missing, render an honest empty state, not a crash.

### `assets/js/palette.js`
```js
export function initPalette(): void
export function buildIndex(ctx): void   // ctx = { data, routes }
```
Command palette on `Cmd/Ctrl+K` and on `#open-palette` click. Indexes sections, methods, models,
companies, tools, glossary terms and timeline events from whatever is loaded in `data`. Fuzzy
subsequence match, grouped results with a type badge, keyboard navigation with `aria-activedescendant`,
Enter navigates (and opens a method drawer where relevant), Escape closes and restores focus.
Cap rendering at 40 results.

## Quality bar

Zero console errors, zero layout shift on load, no horizontal scroll at 390px, focus rings on
everything interactive, and every figure carrying a unit and a source. The result is judged
side-by-side against Our World in Data, Epoch AI, Artificial Analysis, Linear and FT Visual by
adversarial critics; it must plausibly win.
