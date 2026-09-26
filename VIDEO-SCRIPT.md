# Global Distillation — demo narration

Spoken script only. ~390 words; about two and a half minutes at a relaxed pace.

---

On the 27th of January 2025, one model wiped five hundred and eighty-nine billion dollars
off Nvidia in a single session. Two days later, OpenAI accused its maker of distillation —
of copying a frontier model through its own API.

I went looking for one place that explained what actually happened. There wasn't one.

The research was on arXiv. The prices were spread across eight vendors' pricing pages. The
accusations were in news archives, and the law was in the Federal Register. A developer
asking "should I distil this, and what will it cost me" and an analyst asking "is this
legally different from training on the open web" were reading completely different
internets, and neither could see the other's evidence.

So I built the source that didn't exist.

Global Distillation is a public compendium of AI model distillation, examined from eight
perspectives on one site. The research. The token economics. The policy fights. The
companies doing it, and accusing each other of it. And what a developer or a buyer should
actually do about it.

Every chart and table carries its units and its citations. Four hundred and sixty-eight
sources.

Here's the arbitrage at the centre of all this. A frontier training run costs tens to
hundreds of millions of dollars. Harvesting that capability through an API and retraining
a small model costs hundreds — Sky-T1 was distilled for under four hundred and fifty.

And every chart opens its own data. Nothing here is a picture you have to take on trust.

Twenty-seven distillation methods, explained properly. What signal crosses from teacher to
student, the loss function, what it needs from the teacher, what it costs, and where it
fails — from Hinton's soft targets in 2015 to reasoning-trace distillation in 2026.

Seventy-four models compared on price, quality, latency, context and licence. So the
question "which distilled model should I ship" has an answer with numbers behind it.

And it isn't a snapshot. Every morning a job pulls arXiv, Hugging Face, GitHub and Hacker
News — five thousand three hundred papers and counting — regenerates every page, and
redeploys. Nobody touches it.

Every perspective is its own indexable page, with structured data and a plain-text digest,
so answer engines can quote it correctly and cite it.

I had three independent judges score this blind against Epoch AI, Our World in Data and
Artificial Analysis. All three ranked it first.

Global Distillation. The compendium distillation didn't have.
