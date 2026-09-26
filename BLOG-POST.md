# The Quiet Engine Behind Cheap AI: Introducing Global Distillation

On 27 January 2025, Nvidia lost roughly $589 billion in market value in a single trading
session. The trigger was DeepSeek-R1, a reasoning model from a Chinese lab that matched far
more expensive systems at a fraction of the price. Two days later, OpenAI said it had seen
evidence that DeepSeek had used its models to train its own, through a technique called
distillation.

Most people had never heard the word. Within weeks it was a question for markets,
regulators and courts. When I went looking for one place that explained what distillation
is, what it costs, who does it and whether it's allowed, I couldn't find one. So I built it.

## What distillation actually is

Distillation is a way of teaching a small model to imitate a large one. The large model,
called the teacher, answers a huge number of prompts. The small model, the student, is
trained to reproduce not just its answers but the probabilities behind them: how confident
the teacher was, and which wrong answers it nearly gave. That extra signal carries a
surprising amount of the teacher's knowledge.

The idea is older than the current AI boom. Geoffrey Hinton, Oriol Vinyals and Jeff Dean
named it in a 2015 paper, "Distilling the Knowledge in a Neural Network," building on
model-compression work from 2006. What changed is scale. Today distillation is how labs turn
their most expensive models into the fast, cheap ones people actually use. Google's technical
reports describe Gemini Flash and the open Gemma models as distilled from larger siblings.
Meta built its smallest Llama 3.2 models the same way. DeepSeek released a whole family of
open "R1-Distill" models, trained on output from its flagship.

## Why it became a fight

Here is the tension. When a lab distills its own model, it's a product feature. When someone
else distills that model through its public API, the lab calls it theft. Most major AI
providers' terms forbid using their outputs to build competing models, while those same
providers rely on distillation for their own product lines.

The economics make the tension sharper. A frontier training run costs tens to hundreds of
millions of dollars. Distilling some of that capability can cost almost nothing by
comparison: the NovaSky team reported training its Sky-T1 reasoning model for under $450.
When copying is that much cheaper than building, it becomes a question of export controls,
contract law and national strategy, not just engineering.

## What the compendium covers

Global Distillation (https://global-distillation.com) is a free public reference that looks at
the subject from eight angles:

- **Academic.** The research record, from the early compression papers to the 2025–26 wave of
  reasoning distillation, with 46 key papers and teacher-versus-student benchmark comparisons.
- **Financial.** Token prices for 63 models, documented training costs, and a cost model for
  when self-hosting a distilled model beats paying for an API.
- **Political.** 25 policies across jurisdictions and 14 named disputes, including the OpenAI
  and DeepSeek allegations.
- **Company.** How 18 AI companies use distillation, what their terms of service say about it,
  and whom they have accused.
- **Developer.** 27 tools and 8 step-by-step recipes for distilling a model, with realistic
  costs.
- **Customer.** 74 models compared on price, quality, speed, context length and licence.
- **Library.** 27 distillation methods, each explained with its loss function, its data needs,
  and where it fails.
- **Timeline.** 130 dated events from 2006 to today.

## How it's built

Every chart and table on the site cites its sources, 468 distinct ones in total, from arXiv
papers and company documentation to government filings and news reporting. Where a number
couldn't be verified, the site says "undisclosed" rather than guessing. Every morning an
automated job pulls fresh data from arXiv, Hugging Face, GitHub and Hacker News and rebuilds
the pages, so the live figures stay current without anyone touching them. The underlying data
is published as plain JSON, free to reuse with attribution.

It also has limits worth stating plainly. Most benchmark scores are reported by the companies
that built the models, not measured independently. The legal questions are genuinely
unsettled, and the site sets out the arguments on each side rather than declaring a winner.
And any single compendium will contain errors, so corrections backed by a source are welcome.

## Why it matters

If you build with AI, distillation decides which models you can afford to run. If you buy AI
services, it explains why a small model can come close to a flagship at a fraction of the
price. And if you follow technology policy, it sits at the center of how the US, China and
Europe are trying to regulate AI.

Global Distillation aims to put the evidence for all three in one place. Take a look at
https://global-distillation.com, and if you find something wrong, tell me.
