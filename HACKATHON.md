# Global Distillation — hackathon submission

**Live:** https://global-distillation.com · **Code:** https://github.com/alessoh/global-distillation

## Inspiration

On 27 January 2025, DeepSeek-R1 wiped $589B off Nvidia's market capitalisation in a single
session — the largest one-day loss in stock-market history. Two days later OpenAI accused
DeepSeek of distilling its models. Within weeks, distillation had turned into an export-control
question, a Senate-hearing question, and an EU AI Act question.

We went looking for one place that explained what actually happened. There wasn't one.

The research literature sits on arXiv. The prices sit on eight different vendor pricing pages.
The accusations sit in news archives. The policy sits in the Federal Register and EUR-Lex.
A developer asking "should I distil this model, and what will it cost me?" and a policy
analyst asking "is this legally distinguishable from training on the open web?" were reading
completely different internets, and neither could see the other's evidence.

Distillation is the quiet engine behind most models people actually pay for — GPT-4o-mini,
Gemini Flash, Claude Haiku, Llama 3.2, the entire R1-Distill family. It deserved a primary
source, not a blog post.

## What it does

Global Distillation is a public compendium of AI model distillation, examined from eight
perspectives on one site:

- **Academic** — 46 papers from Bucilă 2006 to the 2026 reasoning-distillation wave, with 24
  teacher/student benchmark pairs showing exactly how much capability survives compression.
- **Financial** — 63 models' list prices, 13 documented training runs (Sky-T1 at $450, s1 at
  ~$50 of compute), and a TCO model showing where self-hosting actually overtakes an API.
- **Political** — 25 policies across jurisdictions and 14 named disputes, from the OpenAI/DeepSeek
  accusation to the EU AI Act's GPAI obligations.
- **Company** — 18 labs scored on a single question: do they use distillation, sell it, ban it,
  or accuse others of it? Most do several at once.
- **Developer** — 27 tools and 8 costed, step-by-step recipes.
- **Customer** — 74 models compared on price, quality, latency, context and licence, plus a
  decision guide for 10 concrete use cases.
- **Library** — 27 distillation methods explained properly: what it is, how it works, the loss
  function in LaTeX, when to use it, what it costs, what it needs from the teacher.
- **Timeline** — 365 dated events, 2006 to today.

Every figure carries its unit, its provenance and a numbered citation — 599 primary sources
across 44 tables and 47 charts. Nothing is asserted without a link.

Four things make it more than a static report:

1. **It updates itself daily.** A GitHub Action pulls live signals at 06:17 UTC — arXiv (5,372
   papers matching "knowledge distillation" and climbing), Hugging Face (16,331 distilled
   models), 15 GitHub repos, and Hacker News — regenerates the whole static layer, and redeploys.
2. **A Three.js hero that argues rather than decorates.** A 900-point teacher network transfers
   soft targets along Bézier paths into a 260-point student that is smaller and three times
   denser. It is the thesis of the site in one image, and it costs 0.2 ms per frame.
3. **A comparison engine.** Filter, sort and cross-reference any of it; every chart has a
   "show data" table so no figure is image-only.
4. **It is built to be quoted correctly.** 11 prerendered, fully crawlable pages, JSON-LD
   throughout, and `llms.txt` / `llms-full.txt` so an answer engine can read the whole
   compendium as text and cite it accurately instead of paraphrasing it wrong.

## How we built it

A static site with **no build step and no runtime dependencies** — ECharts, KaTeX and Three.js
are vendored, the data is plain JSON, and the whole thing deploys as files. About 18,600 lines
across the renderer, the stylesheet, the hero and eight generator scripts.

The interesting part is the process. We ran it as a **multi-agent pipeline** rather than writing
it linearly:

- **Research** fanned out one deep-research agent per perspective, each required to do 25+ web
  searches and read 15+ primary sources before writing a line.
- **Adversarial verification** put a second agent on every file whose only job was to *refute*
  it — spot-check 20 claims, fetch 8 URLs, and prove the numbers wrong. A third agent applied
  the corrections. Roughly 18 corrections per file survived that gauntlet.
- **Design** ran as a blind tournament: three designers built competing prototypes (editorial,
  premium-SaaS, scientific-instrument) which three judges scored without knowing who made what.
  The winner became `DESIGN.md`, with the runners-up's best ideas grafted in.
- **Quality** was enforced by a harsh critic loop. Judges screenshotted our site *alongside*
  Epoch AI, Our World in Data and Artificial Analysis, blind, and ranked all four.

That last loop is what actually drove the quality:

| Round | Judge 1 | Judge 2 | Judge 3 | Result |
|---|---|---|---|---|
| 1 | 33/40 | 33/40 | 30/40 | 1st, unanimous |
| 2 | 34/40 | 34/40 | 32/40 | 1st, unanimous |
| 3 | **36/40** | **36/40** | **35/40** | 1st, unanimous |

Blocking defects went 5 → 1 → 0. Two judges scored trustworthiness a perfect 10/10 — the
citation-per-figure discipline is exactly what that measures.

## Challenges we ran into

**Hash routing quietly destroyed our SEO.** `#/academic` is not a URL. Search and answer engines
saw one page. The fix was a prerenderer that emits a real HTML page per route carrying the
headline, every table, the numbers behind every chart, and the full source list — genuinely
useful with JavaScript disabled — while the SPA takes over when scripts run.

**The CDN was blocked.** ECharts from cdnjs failed with `ERR_BLOCKED_BY_ORB` in our test
environment. Rather than fight it, we vendored every library — which turned out to be the right
call anyway: no third-party runtime dependency, no CDN outage, faster first paint.

**Parallel agents fought over the same files.** Two agents editing `render.js` simultaneously
produced conflicting rewrites. We solved it with explicit file ownership in a `BUILD-CONTRACT.md`
and by sequencing agents that shared a file instead of running them concurrently.

**Blind judging kept finding real bugs.** The one that stung: wide tables were hard-clipped at
the card edge with no scrollbar, so entire columns were silently unreachable — `SMALL IN`
rendering as `SMAL`, and a whole `SMALL OUT` column that could not be read at all. It looked
fine in a screenshot. It was unusable in practice. Charts had the same class of failure: a
dumbbell chart concatenating a model name into its price as `"Haiku 4.5 5"`.

**Hallucinated citations are the real risk in an AI-built research site.** Any single agent will
confidently invent a plausible arXiv link or a wrong price. The adversarial verifier — an agent
paid, in effect, to prove the first one wrong, and instructed to flag when uncertain — was
non-negotiable.

## Accomplishments that we're proud of

- **Three blind panels ranked it first against Epoch AI, Our World in Data and Artificial
  Analysis** — established, well-funded, professionally designed data publications. Unanimous
  every round.
- **599 cited sources, zero uncited figures.** Where a number could not be verified, it says
  "undisclosed" rather than guessing. Two judges gave trust a perfect score.
- **It stays current without us.** The daily job refreshes the data, regenerates the static
  layer, the sitemap, the structured data and the LLM digests, and redeploys — the static layer
  can never drift from the data.
- **Genuinely accessible.** Every chart has `role="img"`, a real aria-label and a data table
  behind it; contrast holds at 4.5:1; the categorical palette separates under deuteranopia and
  protanopia; it works with JavaScript off.
- **Zero dependencies, zero build.** 5,200 structured-data assertions pass on every deploy.

## What we learned

**Adversarial verification beats careful prompting.** Asking a model to "be accurate" does not
work. Assigning a second model to *disprove* the first one, with instructions to flag on
uncertainty, does. It is the single highest-leverage thing we did.

**Blind comparison is a better quality bar than any rubric.** "Make it look professional" is
unactionable. "Here are four screenshots, one is yours, rank them and justify it" produced
brutally specific, immediately fixable defects — down to which pixel of which label was clipped.
Judges who did not know which site was ours had no reason to be kind.

**Screenshots lie; you have to interrogate the page.** Several blocking bugs — the clipped
columns above all — were invisible in a screenshot and obvious in a scripted DOM check. We ended
up verifying programmatically: *is any table wider than its container without a scroll
affordance?*

**Distillation itself is a genuinely unsettled question.** The same technique is a first-class
product feature when a lab applies it to its own model, and an accusation of theft when someone
else applies it to yours. Nearly every major lab is simultaneously a heavy user of distillation
and a vocal opponent of being distilled. Laying the evidence out side by side makes that
tension impossible to miss — which is the whole point of the site.

## What's next for Global Distillation

- **Deeper live data.** Track price changes over time from vendor pricing pages so the site can
  show the cost curve moving rather than a snapshot, and alert on frontier/small-tier spread
  changes.
- **A public API.** The data is already clean JSON per perspective; a documented, versioned
  endpoint with a permissive licence would let others build on it.
- **Reproducible benchmarks.** Right now we cite vendor-reported scores. Running an independent
  eval harness against the teacher/student pairs would let us publish retention numbers nobody
  has a commercial interest in.
- **A cost calculator.** Enter your token volume, latency requirement and quality floor; get a
  ranked shortlist with a real monthly bill and a breakeven point for self-hosting.
- **Community corrections.** A structured way to dispute a figure, backed by a source, so the
  compendium improves the way a reference work should.
- **Coverage beyond LLMs.** Diffusion distillation, embedding and retriever distillation, and
  on-device models each deserve the same treatment.
