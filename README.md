# global-distillation
a dashboard of the global utilization of AI distillation

## Daily updates

The dashboard is a static site; the only moving part is `data/live.json`, which holds
live signals about AI distillation and is refreshed once a day.

- `scripts/update-data.mjs` (Node 22, no dependencies) fetches:
  - **arXiv**: total papers matching `"knowledge distillation"`, new papers in the last
    30 days, a per-year count since 2015, and the 12 most recent papers (one polite
    request every 3 s, per arXiv's API policy).
  - **Hugging Face**: number of models matching `distill`, the 15 most downloaded, and
    downloads/likes for a fixed list of tracked distilled and small models.
  - **GitHub**: stars, forks and last push for the main distillation / fine-tuning
    / inference repos (set `GITHUB_TOKEN` to raise the rate limit; optional).
  - **Hacker News**: the 20 latest stories about distillation via the Algolia API.
- Every source is isolated. If one fails, the error is listed in `live.json.errors` and
  the previous value for that source is kept, so a flaky API never blanks the dashboard.
- `.github/workflows/daily-update.yml` runs the script every day at 06:17 UTC (and on
  demand via *Run workflow*), and commits `data/live.json` to `main` as
  `github-actions[bot]` when it changed.
- A push to `main` triggers Vercel's Git integration to redeploy, so no Vercel token or
  deploy step is needed. `vercel.json` serves the site with no build step and caches
  `data/*.json` for 5 minutes in the browser / 1 hour at the edge.

Run it locally with `npm run update-data`.
