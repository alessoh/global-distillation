# Data schema for global-distillation dashboard

Every perspective file `data/<perspective>.json` MUST be valid JSON with this shape.
All numeric claims must carry a `source` (URL). Prefer primary sources (papers, company blogs, filings, laws, pricing pages).
Dates are ISO `YYYY-MM-DD` (or `YYYY-MM` / `YYYY` when only that is known).

```jsonc
{
  "perspective": "academic",              // academic | financial | political | company | library | developer | customer | timeline
  "title": "Academic view of AI distillation",
  "updated": "2026-09-03",
  "summary": "3-5 sentence executive summary.",
  "stats": [                              // KPI tiles (4-8 per perspective)
    { "label": "Papers mentioning KD (2025)", "value": 4200, "unit": "papers", "delta": "+38% YoY", "note": "arXiv search estimate", "source": "https://..." }
  ],
  "keyFindings": [                        // 5-10 headline insights
    { "title": "…", "detail": "2-4 sentences", "audience": ["developer","customer"], "sources": ["https://..."] }
  ],
  "tables": [                             // comparison tables, 3-8 per perspective
    { "id": "kd-methods-vs-cost", "title": "…", "description": "…",
      "columns": [ { "key": "method", "label": "Method", "type": "text" }, { "key": "cost", "label": "Cost", "type": "number", "unit": "USD" } ],
      "rows": [ { "method": "…", "cost": 450, "_source": "https://..." } ],
      "notes": "…", "sources": ["https://..."] }
  ],
  "charts": [                             // 3-8 per perspective. type: bar | line | scatter | radar | area | donut | stackedBar
    { "id": "price-per-mtok", "title": "…", "type": "bar", "xLabel": "…", "yLabel": "…", "unit": "USD",
      "series": [ { "name": "Teacher", "data": [ { "x": "GPT-4o", "y": 2.5 } ] } ],
      "notes": "…", "sources": ["https://..."] }
  ],
  "timeline": [                           // events relevant to this perspective
    { "date": "2025-01-29", "title": "…", "detail": "…", "category": "policy|research|product|market|legal", "source": "https://..." }
  ],
  "glossary": [ { "term": "…", "definition": "…" } ],
  "sources": [ { "title": "…", "url": "https://...", "publisher": "…", "date": "2025-01-29", "type": "paper|news|blog|law|pricing|filing|docs" } ],
  "extras": { }                           // perspective-specific (see below)
}
```

## Perspective-specific `extras`

- academic.extras.papers[]: { id, title, authors, year, venue, url, method, category, oneLiner, significance, citations_est }
- academic.extras.benchmarks[]: { student, teacher, method, params_student_b, params_teacher_b, benchmark, teacher_score, student_score, retention_pct, source }
- financial.extras.pricing[]: { model, vendor, tier: "frontier|distilled|open", input_per_mtok_usd, output_per_mtok_usd, params_b, release: "YYYY-MM", source }
- financial.extras.trainingRuns[]: { name, org, cost_usd, gpu_hours, hardware, date, source, note }
- financial.extras.marketEvents[]: { date, event, impact, figure, source }
- political.extras.policies[]: { jurisdiction, name, status, date, whatItSays, distillationRelevance, source }
- political.extras.disputes[]: { date, accuser, accused, claim, evidence, outcome, source }
- company.extras.companies[]: { name, hq, stance: "restrictive|permissive|mixed", distillationProducts[], distilledModels[], tosClause, notableEvents[], source }
- library.extras.methods[]: { id, name, family, year, paper, url, description, howItWorks (markdown), lossFormula (LaTeX string), pros[], cons[], whenToUse, tools[], examples[], relatedMethods[], difficulty: 1-5, dataNeeded: "logits|outputs|features|none", teacherAccess: "white-box|black-box" }
- developer.extras.tools[]: { name, vendor, type: "library|api|platform", url, teachersSupported[], studentsSupported[], techniques[], pricing, openSource: bool, oneLiner, pros[], cons[] }
- developer.extras.recipes[]: { title, steps[], tool, estCost, estTime, source }
- customer.extras.models[]: { model, vendor, isDistilled: bool, teacher, params_b, input_per_mtok_usd, output_per_mtok_usd, mmlu, gpqa, humaneval_or_swe, latency_ttft_ms, contextK, license, releaseDate, source }
- customer.extras.decisionGuide[]: { useCase, recommendation, why, models[] }
- timeline.extras: none (timeline[] is the primary content, 40+ events 2006 → 2026)
