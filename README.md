# Global Distillation

**A public compendium of AI model distillation — how frontier intelligence is compressed, priced and contested.**

Live: **https://global-distillation.vercel.app**

Distillation moves capability from a large teacher model into a small, cheap student. It is
the quiet engine behind most models people actually pay for, the subject of an open dispute
between the largest labs, and a live regulatory question in three jurisdictions. This
dashboard tracks all of it from six perspectives, with a reference library of the methods
themselves.

Every figure on the site carries a primary source. Numbers that could not be verified are
written as "undisclosed" rather than estimated.

## What is in it

| | |
|---|---|
| Distillation methods, each with its loss function and trade-offs | 27 |
| Models compared on quality, price, latency, context and licence | 74 |
| Papers catalogued, from Bucilă 2006 to 2026 | 46 |
| Policies, bills and rulings tracked across jurisdictions | 25 |
| Companies profiled, including their terms-of-service position | 18 |
| Tools and platforms, with 8 costed recipes | 27 |
| Dated events, 20 August 2006 to today | 130 |
| Primary sources cited | 599 |

Nine sections: **Overview**, **Academic**, **Financial**, **Political**, **Company**,
**Developer**, **Customer**, the method **Library**, and the **Timeline**, plus a **Compare**
builder for putting teacher and student models side by side.

## Who it is for

**If you are choosing a model to build on**, start at *Customer*. It compares 74 models on
benchmark quality, price per million tokens, latency, context window and licence, marks which
ones are publicly documented as distilled and from which teacher, and ends in a decision guide
for ten common use cases. *Compare* lets you put two to four of them side by side.

**If you are doing the distilling**, start at *Developer*. It covers the libraries, the managed
platforms, the open reasoning datasets, GPU requirements by student size, and eight step-by-step
recipes with realistic cost and time estimates. The *Library* explains the 27 methods behind
them: what signal crosses from teacher to student, whether you need logits or only text, and
what each approach costs you.

**If you are modelling the economics**, start at *Financial*. It carries the frontier-versus-small
price spread, documented training costs for distilled reasoning models, the January 2025 market
shock, and a total-cost-of-ownership model for self-hosting against paying an API.

**If you are writing policy or contracts**, start at *Political* and *Company*. Between them they
track the extraction accusations, export controls, the EU AI Act obligations, congressional
bills, the legal theories that decide whether distillation is theft, and which labs forbid it in
their terms of service.

**If you are doing research**, *Academic* holds the paper record and student-versus-teacher
benchmark retention, and every section's underlying JSON is published for reuse.

## Use the data directly

The site is generated from JSON files that are free to fetch, quote and cite with attribution.
The schema is documented in [`data/SCHEMA.md`](data/SCHEMA.md).

```bash
curl https://global-distillation.vercel.app/data/library.json    # 27 distillation methods
curl https://global-distillation.vercel.app/data/customer.json   # 74 models compared
curl https://global-distillation.vercel.app/data/live.json       # today's live signals
```

`llms.txt` at the site root indexes every page and data file for language models and research
agents. Responses are served with `access-control-allow-origin: *`, so browser apps can read
them directly.

## Run it locally

Requires **Node 22 or newer**. There is no build step, no bundler and no framework: the site is
static HTML, ES modules and plain CSS, and its three libraries (ECharts, KaTeX, Three.js) are
vendored under `vendor/` so it runs with no network access.

```bash
git clone https://github.com/alessoh/global-distillation.git
cd global-distillation
npm install
npm start
```

Then open **http://localhost:4173**.

`npm install` pulls Playwright, which is used only for screenshots, the smoke test and
prerendering. To browse the site without it, skip the install and run `node scripts/serve.mjs`.

### Commands

| Command | What it does |
|---|---|
| `npm start` | Serve the site at http://localhost:4173 |
| `npm run update-data` | Refresh `data/live.json` from arXiv, Hugging Face, GitHub and Hacker News |
| `npm run smoke` | Walk every route and interaction, failing on any console error |
| `npm run prerender` | Write one crawlable static HTML page per route, the home page body and `sitemap.xml` |
| `npm run gen-llms` | Regenerate `llms.txt`, `llms-full.txt` and `data/answers.json` |
| `npm run gen-schema` | Refresh the JSON-LD graph in `index.html` and `assets/schema/*.json` |
| `npm run validate` | Check every JSON-LD block, canonical and Open Graph tag |
| `npm run build:static` | All of the above, in the order the daily workflow runs them |
| `npm run shot -- <url> <out.png> --full` | Screenshot a page for review |

Playwright needs its browser once: `npx playwright install chromium`.

### Layout

```
index.html            app shell
assets/css/app.css    the whole design system
assets/js/            app.js (router) hero.js (Three.js) render.js library.js palette.js
data/*.json           one file per perspective, plus live.json; schema in data/SCHEMA.md
scripts/              serve, update-data, smoke, seo, screenshot
vendor/               ECharts, KaTeX, Three — vendored, no CDN
DESIGN.md             tokens, components, chart style guide, accessibility bar
```

## Daily updates

The dashboard is static; the only moving part is `data/live.json`, refreshed once a day.

- `scripts/update-data.mjs` (Node 22, no dependencies) fetches:
  - **arXiv**: total papers matching `"knowledge distillation"`, new papers in the last
    30 days, a per-year count since 2015, and the 12 most recent papers (one polite
    request every 3 s, per arXiv's API policy).
  - **Hugging Face**: number of models matching `distill`, the 15 most downloaded, and
    downloads/likes for a fixed list of tracked distilled and small models.
  - **GitHub**: stars, forks and last push for the main distillation, fine-tuning and
    inference repos (set `GITHUB_TOKEN` to raise the rate limit; optional).
  - **Hacker News**: the 20 latest stories about distillation via the Algolia API.
- Every source is isolated. If one fails, the error is listed in `live.json.errors` and the
  previous value is kept, so a flaky API never blanks the dashboard.
- `.github/workflows/daily-update.yml` runs at 06:17 UTC (and on demand via *Run workflow*)
  and commits `data/live.json` to `main` as `github-actions[bot]` when it changed.

Run it locally with `npm run update-data`.

## Deployment

`vercel.json` serves the site with no build step, caches `data/*.json` for 5 minutes in the
browser and an hour at the edge, and marks `vendor/` immutable.

Two deploy paths are supported and the daily workflow handles both:

1. **Vercel Git integration** (preferred, no secrets). Connect the repository in the Vercel
   dashboard and every push to `main` redeploys, including the daily data commit.
2. **Token deploy** (fallback, when the Git integration is not connected). Add repository
   secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` and the workflow deploys
   with the Vercel CLI. The org and project ids are in `.vercel/project.json`; create a token
   at https://vercel.com/account/tokens.

## Contributing a correction

Accuracy matters more here than features. If a figure is wrong, open an issue or a pull request
against the relevant `data/*.json` file with the corrected value and a primary source URL. The
same standard applies to every entry: a claim without a source does not go in, and a number that
cannot be verified is marked "undisclosed".

## Licence

MIT — see [LICENSE](LICENSE). Text and figures are free to reuse with attribution to Global
Distillation and to the original source of each figure, which is cited on the page.
