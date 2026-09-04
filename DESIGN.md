# Global Distillation — Design System

The production build merges the two strongest prototypes. **Start from `prototypes/concept-c`
(scientific instrument)** for information architecture and graft **`prototypes/concept-a`**
(editorial data journalism) for typography, the warm paper ground, and the hero scene.
`concept-b` contributes nothing; its nav dropdown renders stuck-open and its palette is the
generic indigo-SaaS default.

## 1. Principles

- **The number is the interface.** Every screen leads with figures a reader can act on, each
  carrying its unit, its delta, and a source they can click.
- **Sober warmth.** Editorial paper ground, one restrained accent, hairline rules. Nothing glows.
- **Evidence before assertion.** No claim appears without a footnote; unverified figures are
  written as "undisclosed", never invented.
- **Density with air.** A compendium is dense by nature; whitespace comes from rhythm and
  alignment, not from making it emptier.
- **Motion explains, never decorates.** The hero animates because knowledge transfer *is* a flow.
  Everything else moves under 200ms or not at all.

## 2. Tokens

```css
:root {
  color-scheme: light;

  /* Surfaces — warm paper (A) over cool white (C) */
  --paper:      #FAF8F4;   /* page ground */
  --surface:    #FFFFFF;   /* cards, panels, table body */
  --surface-2:  #F3F0EA;   /* subtle fills, zebra, skeletons */
  --surface-3:  #EBE6DC;   /* pressed states, chart plot bands */
  --rule:       #E4DED2;   /* hairlines */
  --rule-strong:#CEC6B6;   /* table header underline, dividers that must read */

  /* Ink */
  --ink:        #1A1814;   /* headlines, table figures */
  --ink-2:      #4C4740;   /* body */
  --ink-3:      #837C71;   /* labels, captions, axis text */
  --ink-4:      #B2AA9D;   /* disabled, gridline labels */

  /* Accent — burnt sienna, used sparingly */
  --accent:     #B5451B;
  --accent-ink: #8E3412;   /* accent text on paper: 5.9:1 */
  --accent-soft:#F6E5DC;

  /* Categorical — 8 slots. Adjacent pairs separate under deuteranopia and
     protanopia; every slot >= 3:1 against --surface and --paper. */
  --cat-1: #B5451B;  /* OpenAI      */
  --cat-2: #1F6A99;  /* DeepSeek    */
  --cat-3: #2E7D53;  /* Google      */
  --cat-4: #9A6C10;  /* Anthropic   */
  --cat-5: #6B4FA8;  /* Meta        */
  --cat-6: #A8324E;  /* Alibaba     */
  --cat-7: #3F6470;  /* Microsoft   */
  --cat-8: #7A6A57;  /* Other/open  */

  /* Sequential (single-hue, light to dark) — use for magnitude only */
  --seq-1: #F2E6DE; --seq-2: #E2C4B3; --seq-3: #CE9E85;
  --seq-4: #B87759; --seq-5: #9E5433; --seq-6: #7C3A17;

  /* Diverging (teacher-favouring <-> student-favouring), midpoint neutral */
  --div-neg-2:#8E3412; --div-neg-1:#CE9E85; --div-mid:#EFEAE1;
  --div-pos-1:#7FA8B8; --div-pos-2:#1F6A99;

  /* Semantic — always paired with an icon or a word, never colour alone */
  --good:#2E7D53; --good-soft:#E4F0E8;
  --bad:#B23127;  --bad-soft:#FAE6E3;
  --warn:#9A6C10; --warn-soft:#F7EDD8;
  --info:#1F6A99; --info-soft:#E4EEF4;

  /* Type */
  --serif: "Newsreader", "Iowan Old Style", Georgia, "Times New Roman", serif;
  --sans:  "Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
  --mono:  "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* Type scale (px, 1.25 ratio off a 15px body) */
  --fs-display: 56px;  --lh-display: 1.04;
  --fs-h1:      40px;  --lh-h1:      1.10;
  --fs-h2:      28px;  --lh-h2:      1.18;
  --fs-h3:      20px;  --lh-h3:      1.25;
  --fs-body:    15px;  --lh-body:    1.55;
  --fs-small:   13px;  --lh-small:   1.45;
  --fs-micro:   11px;  --lh-micro:   1.30;  /* eyebrows, footnotes, axis */
  --fs-figure:  34px;                        /* KPI numbers */

  /* Spacing — 4px base */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:24px;
  --s-6:32px; --s-7:48px; --s-8:64px; --s-9:96px;

  /* Radii */
  --r-sm:4px; --r-md:6px; --r-lg:10px; --r-pill:999px;

  /* Shadows — hairline first, shadow second */
  --shadow-flat: 0 0 0 1px var(--rule);
  --shadow-card: 0 1px 2px rgba(26,24,20,.05), 0 0 0 1px var(--rule);
  --shadow-pop:  0 12px 40px rgba(26,24,20,.16), 0 0 0 1px var(--rule);

  /* Layout */
  --rail-w: 236px;
  --container: 1320px;
  --gutter: 32px;
  --nav-h: 60px;

  /* Z */
  --z-nav:100; --z-rail:90; --z-drawer:200; --z-palette:300; --z-toast:400;

  /* Motion */
  --dur-fast:120ms; --dur-mid:200ms; --dur-slow:320ms;
  --ease: cubic-bezier(.2,.6,.25,1);
}
```

Dark mode is explicitly out of scope. Declare `color-scheme: light` so form controls and
scrollbars stay light regardless of the viewer's OS setting.

## 3. Layout

- **Shell**: fixed top nav (`--nav-h`), persistent left rail (`--rail-w`) listing the nine
  sections with a two-line label (name + what's inside), content column filling the rest,
  capped at `--container` with `--gutter` padding.
- **Rhythm**: sections separated by `--s-9` on desktop, `--s-7` on mobile, each opening with an
  eyebrow, an h2, and a one-sentence standfirst before any figure.
- **Grid**: 12 columns, `--s-5` gap. KPI rows are 6-up at 1440, 3-up at 1024, 2-up at 768,
  1-up at 390. Chart panels are 8+4 (chart + notes) at 1440 and stack below 1024.
- **Breakpoints**: 390 (rail becomes a horizontal scroller under the nav), 768 (rail collapses
  to a sheet behind a menu button), 1024 (rail returns, charts stack), 1440 (full layout).

## 4. Components

Class names are the contract; the production HTML should use these verbatim.

- `.nav` — wordmark left, section links centre, `.nav__search` and `.btn--primary` right.
  Links get `aria-current="page"`. Never open a dropdown on hover.
- `.rail` / `.rail__item` — numbered `00`–`08`, name in `--sans` 14px, sublabel in `--fs-micro`
  `--ink-3`. Active item carries a 2px `--accent` left border and `--surface` background.
- `.seg` / `.seg__btn` — segmented control for chart switching. Role `tablist`, arrow-key
  navigation, `aria-selected`, 1px `--rule` container, active pill in `--surface` with
  `--shadow-card`.
- `.btn` / `.btn--primary` (ink fill, paper text) / `.btn--ghost` (rule border) / `.btn--link`
  (accent, underlined on hover with an arrow).
- `.chip` — filter pill, `--r-pill`, `aria-pressed`, active state fills `--accent-soft` with
  `--accent-ink` text and a 1px `--accent` border.
- `.kpi` — label (`--fs-small`, `--ink-3`), figure (`--fs-figure`, `--serif`, tabular numerals),
  unit as a `--fs-small` suffix, `.kpi__delta` with an arrow glyph plus a word, and a
  `.kpi__source` footnote linking the primary source. Never a bare number.
- `.panel` — `--surface`, `--shadow-card`, `--r-lg`, header row with title + `.seg` + a
  `.panel__unit` right-aligned, body, then `.panel__note` and `.panel__sources`.
- `.table` — sticky header with `--rule-strong` underline, numeric columns right-aligned in
  `--mono` with `font-variant-numeric: tabular-nums`, sortable headers as buttons carrying
  `aria-sort`, zebra via `--surface-2` at 40% only when a table exceeds 12 rows, and a caption
  giving units and as-of date.
- `.method-card` — family tag, name in `--serif` 20px, one-line description, difficulty as five
  dots, and a footer row of `dataNeeded` / `teacherAccess` badges. Whole card is one button
  opening the drawer.
- `.drawer` — right sheet, 560px max, `--shadow-pop`, focus trapped, `Esc` closes, returns focus
  to the invoking card, `role="dialog" aria-modal="true"` with a labelled heading. Contains the
  KaTeX formula block, "how it works", pros/cons columns, tools, and related-method links.
- `.timeline` — vertical rail with a year gutter; each event is a dot in its category colour,
  a date in `--mono`, a title, a detail line, and a source link. Category legend at the top,
  filterable by `.chip`.
- `.callout` / `.quote` — `--surface-2` fill, 2px `--accent` left border, source line beneath.
- `.footnote` — superscript `--mono` accent numeral linking to the sources list.
- `.badge` — `--fs-micro`, uppercase, `--r-sm`, semantic soft fill.
- `.palette` — command palette on `Cmd/Ctrl+K`: input, grouped results (sections, methods,
  models, events), arrow keys and Enter, `role="combobox"` + `role="listbox"`.
- `.skeleton` — `--surface-2` block with a 1.2s shimmer, used while `live.json` loads.

### ECharts theme

Register as `gd` and apply to every chart:

```json
{
  "color": ["#B5451B","#1F6A99","#2E7D53","#9A6C10","#6B4FA8","#A8324E","#3F6470","#7A6A57"],
  "backgroundColor": "transparent",
  "textStyle": { "fontFamily": "Schibsted Grotesk, system-ui, sans-serif", "color": "#4C4740" },
  "title": { "textStyle": { "fontFamily": "Newsreader, Georgia, serif", "color": "#1A1814", "fontWeight": 400 } },
  "grid": { "left": 8, "right": 24, "top": 24, "bottom": 8, "containLabel": true },
  "categoryAxis": {
    "axisLine": { "lineStyle": { "color": "#CEC6B6" } },
    "axisTick": { "show": false },
    "axisLabel": { "color": "#837C71", "fontSize": 11 },
    "splitLine": { "show": false }
  },
  "valueAxis": {
    "axisLine": { "show": false },
    "axisTick": { "show": false },
    "axisLabel": { "color": "#837C71", "fontSize": 11 },
    "splitLine": { "lineStyle": { "color": "#E4DED2", "type": "solid" } }
  },
  "legend": { "show": false },
  "tooltip": {
    "backgroundColor": "#FFFFFF", "borderColor": "#CEC6B6", "borderWidth": 1,
    "textStyle": { "color": "#1A1814", "fontSize": 12 },
    "extraCssText": "box-shadow:0 12px 40px rgba(26,24,20,.16);border-radius:6px;"
  },
  "bar": { "itemStyle": { "borderRadius": [3, 3, 0, 0] } },
  "line": { "symbol": "circle", "symbolSize": 6, "lineStyle": { "width": 2 } },
  "scatter": { "symbolSize": 10, "itemStyle": { "opacity": 0.85 } }
}
```

## 5. Hero (Three.js)

A dense **teacher** point cloud on the left transfers **soft targets** along curved paths into a
smaller, denser **student** cloud on the right. Graft concept A's version: it reads immediately
and carries a direct-labelled legend beneath it.

- Scene on `--paper`, orthographic-feeling perspective camera at z≈9, fov 45.
- Teacher: ~900 points in `--ink-4`, radius 3.2, plus ~1400 hairline links at 0.06 opacity.
- Signal: ~180 points in `--accent` travelling along 24 cubic Bézier paths, staggered phase,
  6-second loop.
- Student: ~260 points in `--cat-2`, radius 1.1, rotating 0.06 rad/s.
- Mouse parallax ±3° with a 0.06 lerp; no scroll hijacking; `devicePixelRatio` capped at 2.
- Budget: under 60k vertices, one draw call per group, under 4ms per frame; pause the RAF loop
  when the canvas leaves the viewport or the tab is hidden.
- `prefers-reduced-motion: reduce` renders one static frame and stops the loop.
- Legend beneath the canvas names all three groups with their parameter counts. The scene must
  never be the only place a fact appears.

## 6. Charts

- Direct-label series at their last point; use the ECharts legend only when more than four
  series overlap.
- Units belong in the panel header, not repeated on every tick.
- Horizontal gridlines only, `--rule`, solid, never dashed.
- Annotate the three or four points that carry the argument (a release, a ruling, a price cut)
  with a `markPoint` and a short phrase.
- Log/linear toggles on any price or parameter axis spanning more than two orders of magnitude.
- Every panel ends with a method note and its sources.
- Colour encodes vendor or category consistently across the entire site; never re-map a hue.

## 7. Copy

Plain, declarative, specific. "DeepSeek-R1-Distill-Qwen-32B retains 87% of its teacher's GPQA
Diamond score at 5% of the price" beats "dramatic efficiency gains". No marketing verbs, no
exclamation marks, no emoji. Contested claims are attributed to whoever made them. Dates are
written out (3 September 2026) in prose and ISO in data.

## 8. Accessibility

- Text contrast ≥ 4.5:1, UI and graphical objects ≥ 3:1. `--ink-3` on `--paper` is 4.6:1 and is
  the lightest text permitted.
- Visible `:focus-visible` ring, 2px `--accent`, 2px offset, on every interactive element.
- Tabs, drawers, the palette and sortable headers carry correct roles and keyboard behaviour;
  the drawer traps focus and restores it on close.
- Charts are supplemented by the underlying table, so no fact is vision-only.
- Respect `prefers-reduced-motion` for the hero, counters, and drawer transitions.

## 9. Anti-patterns

Observed in the prototypes and in the reference field; all are forbidden.

- Nav menus that open on hover or render expanded at rest (concept B's stuck-open panel).
- The indigo/violet "AI SaaS" default palette, gradient text, glowing orbs, glassmorphism.
- A dark hero canvas dropped into a light page.
- Charts using ECharts' default colours, or legends where direct labels would fit.
- KPI numbers without a unit, a delta, or a source.
- Percentages with no denominator, and dollar figures with no date.
- CDN dependencies: `cdnjs` was blocked by ORB in testing, so ECharts, KaTeX and Three are
  vendored under `/vendor` and loaded relatively. Only Google Fonts may load remotely, and every
  face needs a real fallback stack.
- Emoji as iconography.
