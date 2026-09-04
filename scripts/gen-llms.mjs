#!/usr/bin/env node
/**
 * Generative-engine optimisation (GEO) generator.
 *
 *   node scripts/gen-llms.mjs [--origin https://example.com]
 *
 * Reads data/*.json (the single source of truth for every figure on the site) and writes
 * three machine-facing artefacts at the repository root:
 *
 *   llms.txt        the llms.txt convention: H1, blockquote summary, orientation paragraph,
 *                   one linked section per page, and an Optional section of raw JSON endpoints.
 *   llms-full.txt   one plain-text digest of the whole compendium: every summary, key finding,
 *                   figure (with unit and source URL), table (pipe-separated, units in the
 *                   header), chart series, the full 2006-2026 timeline, the method library,
 *                   the merged glossary and the source register.
 *   data/answers.json  question/answer pairs built from the data, each carrying the perspective
 *                   it came from and the source URLs backing it.
 *
 * Nothing here invents a fact. Every number is read out of the JSON at generation time and every
 * sentence of prose is either read verbatim from the data or is a template around a value read
 * from it. If a value a question depends on disappears from the data, that question is dropped
 * (and reported) rather than answered from memory.
 *
 * Run it after scripts/update-data.mjs, so the digest carries the data that ships with it.
 * It is the only writer of llms.txt; the superseded scripts/seo.mjs, which wrote a shorter one,
 * has been removed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oi = process.argv.indexOf('--origin');
const ORIGIN = (oi > -1 ? process.argv[oi + 1] : process.env.SITE_ORIGIN || 'https://global-distillation.com').replace(/\/$/, '');

const PERSPECTIVES = ['academic', 'financial', 'political', 'company', 'developer', 'customer'];
const REFERENCE = ['library', 'timeline'];
const FILES = [...PERSPECTIVES, ...REFERENCE];

/* ------------------------------------------------------------------ read */

const read = (name) => {
  const p = path.join(ROOT, 'data', name + '.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('fatal: cannot read data/' + name + '.json — ' + err.message);
    process.exit(1);
  }
};

/** @type {Record<string, any>} */
const D = {};
for (const f of FILES) D[f] = read(f);
let LIVE = null;
try { LIVE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'live.json'), 'utf8')); } catch { LIVE = null; }

/* ------------------------------------------------------------- utilities */

const url = (id) => ORIGIN + (id ? '/' + id : '/');
const jsonUrl = (name) => ORIGIN + '/data/' + name + '.json';

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

const clip = (s, n) => {
  const t = clean(s);
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};

/** Split prose into sentences. Conservative: never breaks inside an abbreviation such as "H.R. 8283". */
const ABBREV = /(?:[A-Z]\.|[A-Z]\.[A-Z]\.|e\.g\.|i\.e\.|vs\.|No\.|Fig\.|cf\.|approx\.|St\.|Mr\.|Dr\.)$/;
const sentences = (t) => {
  const raw = clean(t).split(/(?<=[.!?])\s+(?=[A-Z(“"'—$])/).filter(Boolean);
  const out = [];
  for (const piece of raw) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ' ' + piece;
    else out.push(piece);
  }
  return out;
};
const sent = (t, n) => sentences(t).slice(0, n).join(' ');

/** Thousands separators for prose. Table cells keep the raw JSON value. */
const fmtNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : String(v));

const withUnit = (v, unit) => fmtNum(v) + (unit ? ' ' + unit : '');

const wrap = (text, width = 96, indent = '') => {
  const words = clean(text).split(' ');
  const out = [];
  let line = indent;
  for (const w of words) {
    if (line.trim() && (line + ' ' + w).length > width) { out.push(line); line = indent + w; }
    else line = line.trim() ? line + ' ' + w : indent + w;
  }
  if (line.trim()) out.push(line);
  return out.join('\n');
};

const cell = (v) => {
  if (v == null || v === '') return 'n/a';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(cell).join('; ');
  return clean(v).replace(/\|/g, '/');
};

const rule = (ch, n = 96) => ch.repeat(n);

/* -------------------------------------------------------- table rendering */

/** Render a schema table (columns[] + rows[]) as pipe-separated text with units in the header. */
function pipeTable(columns, rows) {
  const anySource = rows.some((r) => r && r._source);
  const cols = columns.map((c) => ({ key: c.key, head: c.label + (c.unit ? ' (' + c.unit + ')' : '') }));
  if (anySource) cols.push({ key: '_source', head: 'Source URL' });
  const lines = [cols.map((c) => c.head).join(' | ')];
  lines.push(cols.map((c) => '-'.repeat(Math.max(3, Math.min(c.head.length, 24)))).join(' | '));
  for (const r of rows) lines.push(cols.map((c) => cell(r[c.key])).join(' | '));
  return lines.join('\n');
}

/** Render an arbitrary array of objects as a pipe table, given [key, label, unit] triples. */
function pipeFrom(spec, rows) {
  const head = spec.map(([, label, unit]) => label + (unit ? ' (' + unit + ')' : ''));
  const lines = [head.join(' | '), head.map((h) => '-'.repeat(Math.max(3, Math.min(h.length, 24)))).join(' | ')];
  for (const r of rows) lines.push(spec.map(([key]) => cell(r[key])).join(' | '));
  return lines.join('\n');
}

/* ------------------------------------------------------------- accessors */
/* Each throws when the value it needs is gone, so a stale question is dropped, never guessed. */

const P = (name) => {
  const d = D[name];
  if (!d) throw new Error('no data file ' + name);
  return d;
};

/** Stat by case-insensitive label substring. */
const S = (name, needle) => {
  const d = P(name);
  const s = (d.stats || []).find((x) => x.label.toLowerCase().includes(needle.toLowerCase()));
  if (!s) throw new Error(name + '.stats: no label matching "' + needle + '"');
  return s;
};

/** Key finding by case-insensitive title substring. */
const F = (name, needle) => {
  const d = P(name);
  const k = (d.keyFindings || []).find((x) => x.title.toLowerCase().includes(needle.toLowerCase()));
  if (!k) throw new Error(name + '.keyFindings: no title matching "' + needle + '"');
  return k;
};

/** Glossary entry by case-insensitive term substring. */
const G = (name, needle) => {
  const d = P(name);
  const g = (d.glossary || []).find((x) => x.term.toLowerCase().includes(needle.toLowerCase()));
  if (!g) throw new Error(name + '.glossary: no term matching "' + needle + '"');
  return g;
};

/** Table by id. */
const T = (name, id) => {
  const d = P(name);
  const t = (d.tables || []).find((x) => x.id === id);
  if (!t) throw new Error(name + '.tables: no id "' + id + '"');
  return t;
};

/** Library method by id. */
const M = (id) => {
  const m = (P('library').extras.methods || []).find((x) => x.id === id);
  if (!m) throw new Error('library.extras.methods: no id "' + id + '"');
  return m;
};

/** Customer decision-guide row by use-case substring. */
const DG = (needle) => {
  const g = (P('customer').extras.decisionGuide || []).find((x) => x.useCase.toLowerCase().includes(needle.toLowerCase()));
  if (!g) throw new Error('customer.extras.decisionGuide: no useCase matching "' + needle + '"');
  return g;
};

/** Political dispute by accused + date prefix. */
const DIS = (accusedNeedle, datePrefix) => {
  const rows = (P('political').extras.disputes || []).filter((x) =>
    x.accused.toLowerCase().includes(accusedNeedle.toLowerCase()) && (!datePrefix || String(x.date).startsWith(datePrefix)));
  if (!rows.length) throw new Error('political.extras.disputes: none matching "' + accusedNeedle + '"');
  return rows[0];
};

/** Company record by name. */
const CO = (name) => {
  const c = (P('company').extras.companies || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error('company.extras.companies: no company "' + name + '"');
  return c;
};

/** Developer tool by name substring. */
const TOOL = (needle) => {
  const t = (P('developer').extras.tools || []).find((x) => x.name.toLowerCase().includes(needle.toLowerCase()));
  if (!t) throw new Error('developer.extras.tools: no tool matching "' + needle + '"');
  return t;
};

/** Timeline event (master file) by title substring. */
const EV = (needle) => {
  const e = (P('timeline').timeline || []).find((x) => x.title.toLowerCase().includes(needle.toLowerCase()));
  if (!e) throw new Error('timeline.timeline: no title matching "' + needle + '"');
  return e;
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/** Ensure a fragment read from the data ends as a sentence. */
const period = (t) => { const s = clean(t); return /[.!?]$/.test(s) ? s : s + '.'; };

/** One-sentence gloss: "<term> is <formula> — <explanation>". Used where a definition opens with a formula. */
const gloss1 = (g) => {
  const parts = sentences(g.definition);
  return g.term + ': ' + parts[0].replace(/[.]$/, '') + (parts[1] ? ' — ' + lcfirst(parts[1]) : '.');
};

/** Lowercase the first letter only when the word is not an acronym or proper noun in caps. */
const lcfirst = (t) => { const s = clean(t); return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; };

/* ------------------------------------------------------------- constants */

const LICENCE = 'MIT (see ' + ORIGIN + '/LICENSE). Free to quote, excerpt, cite and redistribute with attribution.';
const CITATION = 'Global Distillation, "How frontier intelligence is compressed, priced and contested", ' + ORIGIN + '/';
const STAMP = FILES.map((f) => D[f].updated).filter(Boolean).sort().pop() || new Date().toISOString().slice(0, 10);
// Derived from the data, never from the clock: running the generator twice over the same
// data/*.json must produce byte-identical output, so the daily commit only moves when the
// data moves. `live.json` is the file that changes daily, so it dates the build.
const GENERATED = String((LIVE && LIVE.updated) || '').slice(0, 10) || STAMP;

const PAGES = [
  { id: '', name: 'Overview', file: null, group: 'perspective',
    desc: 'The front page: the strongest figure from each of the six perspectives, the price gap and benchmark-retention charts, live daily signals, and the six most recent dated events.' },
  { id: 'academic', name: 'Academic', file: 'academic', group: 'perspective' },
  { id: 'financial', name: 'Financial', file: 'financial', group: 'perspective' },
  { id: 'political', name: 'Political', file: 'political', group: 'perspective' },
  { id: 'company', name: 'Company', file: 'company', group: 'perspective' },
  { id: 'developer', name: 'Developer', file: 'developer', group: 'perspective' },
  { id: 'customer', name: 'Customer', file: 'customer', group: 'perspective' },
  { id: 'library', name: 'Method library', file: 'library', group: 'reference' },
  { id: 'timeline', name: 'Timeline', file: 'timeline', group: 'reference' },
  { id: 'compare', name: 'Compare', file: null, group: 'reference',
    desc: 'An interactive builder: pick two to four models and compare price, quality, latency, context and licence side by side, drawn from the same customer dataset.' },
  { id: 'methodology', name: 'Methodology', file: null, group: 'reference',
    desc: 'How the compendium is built: where each figure comes from, what counts as a distilled model, how often each data stream is refreshed, and what the method cannot tell you.' },
];

/** Counts sentence for a data-backed page, derived entirely from the file. */
const counts = (d) => {
  const bits = [];
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  if (d.stats) bits.push(plural(d.stats.length, 'key figure', 'key figures'));
  if (d.tables) bits.push(plural(d.tables.length, 'table', 'tables'));
  if (d.charts) bits.push(plural(d.charts.length, 'chart', 'charts'));
  if (d.timeline) bits.push(plural(d.timeline.length, 'dated event', 'dated events'));
  if (d.glossary) bits.push(plural(d.glossary.length, 'glossary term', 'glossary terms'));
  if (d.sources) bits.push(plural(d.sources.length, 'source', 'sources'));
  return bits.join(', ');
};

const pageDesc = (p) => {
  if (p.desc) return p.desc;
  const d = D[p.file];
  return clip(sent(d.summary, 1), 260) + ' (' + counts(d) + ').';
};

/* ============================================================== llms.txt */

function buildLlms() {
  const L = [];
  L.push('# Global Distillation');
  L.push('');
  L.push('> A public compendium of AI model distillation — how frontier intelligence is compressed, priced and');
  L.push('> contested — examined from six perspectives (academic, financial, political, company, developer,');
  L.push('> customer) with a reference library of 27 distillation methods and a dated 2006-2026 timeline.');
  L.push('');
  L.push(wrap(
    'Every figure on this site is read from a public JSON dataset and carries a primary-source URL: papers, ' +
    'model cards, official pricing pages, filings, statutes and public statements. Figures a primary source ' +
    'never published are marked "undisclosed" rather than estimated. The eight perspective files are edited ' +
    'by hand and dated individually; the live signals file (arXiv counts, Hugging Face downloads, repository ' +
    'stars, news) is refreshed automatically every day at 06:17 UTC. Content is licensed ' + LICENCE +
    ' Cite as: ' + CITATION + ', accessed <date>. Dataset last updated ' + STAMP + '.'));
  L.push('');
  L.push('## Perspectives');
  L.push('');
  for (const p of PAGES.filter((x) => x.group === 'perspective')) {
    L.push('- [' + p.name + '](' + url(p.id) + '): ' + pageDesc(p));
  }
  L.push('');
  L.push('## Reference');
  L.push('');
  for (const p of PAGES.filter((x) => x.group === 'reference')) {
    L.push('- [' + p.name + '](' + url(p.id) + '): ' + pageDesc(p));
  }
  L.push('');
  L.push('## Full text for language models');
  L.push('');
  L.push('- [llms-full.txt](' + ORIGIN + '/llms-full.txt): the entire compendium as one plain-text digest — every summary, key finding, figure with its unit and source URL, every table as pipe-separated text, the full timeline, the method library and the glossary.');
  L.push('- [answers.json](' + ORIGIN + '/data/answers.json): ' + ANSWER_COUNT + ' question-and-answer pairs built from the dataset, each with the perspective it came from and the source URLs backing it.');
  L.push('- [Data schema](' + ORIGIN + '/data/SCHEMA.md): the shape every data file follows, field by field.');
  L.push('');
  L.push('## Optional');
  L.push('');
  L.push('Raw JSON endpoints. Each is the exact source of the corresponding page, is CORS-open, and follows the schema above.');
  L.push('');
  for (const f of FILES) {
    L.push('- [data/' + f + '.json](' + jsonUrl(f) + '): ' + counts(D[f]) + '; updated ' + D[f].updated + '.');
  }
  if (LIVE) {
    L.push('- [data/live.json](' + jsonUrl('live') + '): daily signals — arXiv distillation paper counts, Hugging Face model downloads, GitHub repository stars and recent news; updated ' + String(LIVE.updated).slice(0, 10) + '.');
  }
  L.push('- [sitemap.xml](' + ORIGIN + '/sitemap.xml): every canonical page URL.');
  L.push('- [robots.txt](' + ORIGIN + '/robots.txt): crawling policy — every documented AI crawler is explicitly allowed.');
  L.push('');
  return L.join('\n');
}

/* ========================================================= llms-full.txt */

function statLines(d) {
  const out = [];
  for (const s of d.stats || []) {
    out.push('- ' + s.label + ': ' + withUnit(s.value, s.unit) + (s.delta ? ' (' + clean(s.delta) + ')' : ''));
    if (s.note) out.push(wrap(s.note, 92, '    '));
    if (s.source) out.push('    Source: ' + s.source);
  }
  return out;
}

function findingLines(d) {
  const out = [];
  (d.keyFindings || []).forEach((k, i) => {
    out.push((i + 1) + '. ' + k.title);
    out.push(wrap(k.detail, 92, '   '));
    if (k.sources && k.sources.length) out.push('   Sources: ' + k.sources.join('  '));
    out.push('');
  });
  return out;
}

function tableLines(d) {
  const out = [];
  for (const t of d.tables || []) {
    out.push('TABLE: ' + t.title + '  [id: ' + t.id + ', ' + t.rows.length + ' rows]');
    if (t.description) out.push(wrap(t.description, 92, '  '));
    out.push('');
    out.push(pipeTable(t.columns, t.rows));
    out.push('');
    if (t.notes) out.push(wrap('Notes: ' + t.notes, 92, '  '));
    if (t.sources && t.sources.length) out.push(wrap('Sources: ' + t.sources.join('  '), 92, '  '));
    out.push('');
  }
  return out;
}

function chartLines(d) {
  const out = [];
  for (const c of d.charts || []) {
    out.push('CHART: ' + c.title + '  [id: ' + c.id + ', type: ' + c.type + (c.unit ? ', unit: ' + c.unit : '') + ']');
    for (const s of c.series || []) {
      const head = (c.xLabel || 'x') + ' | ' + (s.name || c.yLabel || 'value') + (c.unit ? ' (' + c.unit + ')' : '');
      out.push('  ' + head);
      for (const pt of s.data || []) out.push('  ' + cell(pt.x) + ' | ' + cell(pt.y));
    }
    if (c.notes) out.push(wrap('Notes: ' + c.notes, 92, '  '));
    if (c.sources && c.sources.length) out.push(wrap('Sources: ' + c.sources.join('  '), 92, '  '));
    out.push('');
  }
  return out;
}

function sourceLines(d) {
  const out = [];
  (d.sources || []).forEach((s, i) => {
    out.push('[' + (i + 1) + '] ' + clean(s.title) + ' — ' + clean(s.publisher || '') +
      (s.date ? ', ' + s.date : '') + (s.type ? ' (' + s.type + ')' : ''));
    out.push('    ' + s.url);
  });
  return out;
}

function compactTimeline(d) {
  return (d.timeline || []).map((e) => e.date + ' | ' + clean(e.category || '') + ' | ' + clean(e.title));
}

/** Perspective-specific extras rendered as pipe tables or short paragraphs. */
function extrasLines(name) {
  const d = D[name];
  const x = d.extras || {};
  const out = [];
  const table = (title, spec, rows) => {
    if (!rows || !rows.length) return;
    out.push('TABLE: ' + title + '  [' + rows.length + ' rows, from data/' + name + '.json $.extras]');
    out.push('');
    out.push(pipeFrom(spec, rows));
    out.push('');
  };

  if (name === 'academic') {
    table('Papers in the academic register', [
      ['title', 'Paper'], ['authors', 'Authors'], ['year', 'Year'], ['venue', 'Venue'],
      ['category', 'Category'], ['method', 'Method'], ['citations_est', 'Citations', 'citations'],
      ['oneLiner', 'What it does'], ['significance', 'Why it matters'], ['url', 'Source URL'],
    ], x.papers);
    table('Student-vs-teacher benchmark retention', [
      ['student', 'Student'], ['teacher', 'Teacher'], ['method', 'Method'],
      ['params_student_b', 'Student params', 'B'], ['params_teacher_b', 'Teacher params', 'B'],
      ['benchmark', 'Benchmark'], ['teacher_score', 'Teacher score', '%'], ['student_score', 'Student score', '%'],
      ['retention_pct', 'Retention', '%'], ['source', 'Source URL'],
    ], x.benchmarks);
    if (x.methodology) {
      out.push('METHODOLOGY NOTES');
      for (const [k, v] of Object.entries(x.methodology)) out.push(wrap(k + ': ' + v, 92, '  '));
      out.push('');
    }
  }

  if (name === 'financial') {
    table('List prices per model, September 2026', [
      ['model', 'Model'], ['vendor', 'Vendor'], ['tier', 'Tier'],
      ['input_per_mtok_usd', 'Input', 'USD/MTok'], ['output_per_mtok_usd', 'Output', 'USD/MTok'],
      ['params_b', 'Params', 'B'], ['release', 'Release'], ['source', 'Source URL'],
    ], x.pricing);
    table('Documented training runs', [
      ['name', 'Run'], ['org', 'Organisation'], ['cost_usd', 'Cost', 'USD'], ['gpu_hours', 'GPU-hours', 'hours'],
      ['hardware', 'Hardware'], ['date', 'Date'], ['note', 'Note'], ['source', 'Source URL'],
    ], x.trainingRuns);
    table('Market events', [
      ['date', 'Date'], ['event', 'Event'], ['impact', 'Impact'], ['figure', 'Figure'], ['source', 'Source URL'],
    ], x.marketEvents);
    table('GPU rental rates', [
      ['gpu', 'GPU'], ['provider', 'Provider'], ['usd_per_hour', 'Price', 'USD/hour'], ['type', 'Type'], ['source', 'Source URL'],
    ], x.gpuRentalRates);
    if (x.tcoAssumptions) {
      out.push('TOTAL-COST-OF-OWNERSHIP ASSUMPTIONS (every input behind the self-hosting model)');
      for (const [k, v] of Object.entries(x.tcoAssumptions)) {
        if (v == null) continue;
        if (Array.isArray(v)) out.push(wrap(k + ': ' + v.join('; '), 92, '  '));
        else if (typeof v === 'object') out.push(wrap(k + ': ' + Object.entries(v).map(([a, b]) => a + ' = ' + b).join('; '), 92, '  '));
        else out.push(wrap(k + ': ' + v, 92, '  '));
      }
      out.push('');
    }
    if (x.marketContext) {
      out.push('MARKET CONTEXT');
      for (const [k, v] of Object.entries(x.marketContext)) {
        out.push(wrap(k + ': ' + (typeof v === 'object' ? Object.entries(v).map(([a, b]) => a + ' = ' + (Array.isArray(b) ? b.join('; ') : b)).join('; ') : v), 92, '  '));
      }
      out.push('');
    }
  }

  if (name === 'political') {
    out.push('POLICY INSTRUMENTS (' + (x.policies || []).length + ')');
    out.push('');
    for (const p of x.policies || []) {
      out.push('- ' + p.jurisdiction + ' — ' + p.name + ' [' + p.status + ', ' + p.date + ']');
      out.push(wrap('What it says: ' + p.whatItSays, 92, '    '));
      out.push(wrap('Distillation relevance: ' + p.distillationRelevance, 92, '    '));
      out.push('    Source: ' + p.source);
    }
    out.push('');
    out.push('PUBLIC ACCUSATIONS AND DISPUTES (' + (x.disputes || []).length + ')');
    out.push('');
    for (const p of x.disputes || []) {
      out.push('- ' + p.date + ' — ' + p.accuser + ' vs ' + p.accused);
      out.push(wrap('Claim: ' + p.claim, 92, '    '));
      out.push(wrap('Evidence: ' + p.evidence, 92, '    '));
      out.push(wrap('Outcome: ' + p.outcome, 92, '    '));
      out.push('    Source: ' + p.source);
    }
    out.push('');
  }

  if (name === 'company') {
    out.push('COMPANY PROFILES (' + (x.companies || []).length + ')');
    out.push('');
    for (const c of x.companies || []) {
      out.push('- ' + c.name + ' (' + c.hq + ') — stance: ' + c.stance);
      if (c.distillationProducts && c.distillationProducts.length) out.push(wrap('Distillation products: ' + c.distillationProducts.join('; '), 92, '    '));
      if (c.distilledModels && c.distilledModels.length) out.push(wrap('Distilled models: ' + c.distilledModels.join('; '), 92, '    '));
      if (c.tosClause) out.push(wrap('Terms-of-service clause: ' + c.tosClause, 92, '    '));
      if (c.notableEvents && c.notableEvents.length) out.push(wrap('Notable events: ' + c.notableEvents.join(' | '), 92, '    '));
      if (c.source) out.push('    Source: ' + c.source);
    }
    out.push('');
  }

  if (name === 'developer') {
    out.push('TOOLS AND PLATFORMS (' + (x.tools || []).length + ')');
    out.push('');
    for (const t of x.tools || []) {
      out.push('- ' + t.name + ' — ' + t.vendor + ' (' + t.type + (t.openSource ? ', open source' : ', proprietary') + ')');
      out.push(wrap(t.oneLiner, 92, '    '));
      if (t.techniques && t.techniques.length) out.push(wrap('Techniques: ' + t.techniques.join('; '), 92, '    '));
      if (t.pricing) out.push(wrap('Pricing: ' + t.pricing, 92, '    '));
      if (t.pros && t.pros.length) out.push(wrap('Pros: ' + t.pros.join('; '), 92, '    '));
      if (t.cons && t.cons.length) out.push(wrap('Cons: ' + t.cons.join('; '), 92, '    '));
      out.push('    URL: ' + t.url);
    }
    out.push('');
    out.push('COSTED RECIPES (' + (x.recipes || []).length + ')');
    out.push('');
    for (const r of x.recipes || []) {
      out.push('- ' + r.title);
      out.push('    Tool: ' + clean(r.tool));
      (r.steps || []).forEach((s, i) => out.push(wrap((i + 1) + '. ' + s, 92, '    ')));
      out.push(wrap('Estimated cost: ' + r.estCost, 92, '    '));
      out.push(wrap('Estimated time: ' + r.estTime, 92, '    '));
      out.push('    Sources: ' + uniq([r.source, ...(r.sources || [])]).join('  '));
    }
    out.push('');
  }

  if (name === 'customer') {
    out.push('DECISION GUIDE (' + (x.decisionGuide || []).length + ' use cases)');
    out.push('');
    for (const g of x.decisionGuide || []) {
      out.push('- Use case: ' + g.useCase);
      out.push(wrap('Recommendation: ' + g.recommendation, 92, '    '));
      out.push(wrap('Why: ' + g.why, 92, '    '));
      if (g.models && g.models.length) out.push(wrap('Models: ' + g.models.join('; '), 92, '    '));
    }
    out.push('');
    if (x.buyerChecklist && x.buyerChecklist.length) {
      out.push('BUYER CHECKLIST');
      x.buyerChecklist.forEach((c, i) => out.push(wrap((i + 1) + '. ' + c, 92, '  ')));
      out.push('');
    }
    table('Model register: every model a buyer could shortlist', [
      ['model', 'Model'], ['vendor', 'Vendor'], ['role', 'Role'], ['isDistilled', 'Distilled'], ['teacher', 'Teacher'],
      ['params_b', 'Params', 'B'], ['active_params_b', 'Active params', 'B'],
      ['input_per_mtok_usd', 'Input', 'USD/MTok'], ['output_per_mtok_usd', 'Output', 'USD/MTok'],
      ['blended_per_mtok_usd', 'Blended', 'USD/MTok'], ['cost_per_1m_requests_usd', 'Cost per 1M requests', 'USD'],
      ['gpqa', 'GPQA Diamond', '%'], ['mmlu', 'MMLU', '%'], ['humaneval_or_swe', 'Coding', '%'], ['aime', 'AIME', '%'],
      ['latency_ttft_ms', 'TTFT', 'ms'], ['contextK', 'Context', 'K tokens'], ['license', 'Licence'],
      ['releaseDate', 'Released'], ['source', 'Source URL'],
    ], x.models);
  }

  return out;
}

function methodLibraryLines() {
  const out = [];
  const methods = P('library').extras.methods || [];
  out.push(wrap('One paragraph per method, in the order they appear in the library. Each entry gives the family, ' +
    'the year and paper it comes from, what the teacher must expose, what data it needs, its loss function in ' +
    'LaTeX, when to use it, and its honest trade-offs. The full multi-paragraph explanation for each method is ' +
    'on ' + url('library') + ' and in data/library.json $.extras.methods[].howItWorks.'));
  out.push('');
  for (const m of methods) {
    out.push(rule('-'));
    out.push(m.name + '  [id: ' + m.id + ']');
    out.push('Family: ' + m.family + ' | Year: ' + m.year + ' | Difficulty: ' + m.difficulty + '/5 | ' +
      'Teacher access: ' + m.teacherAccess + ' | Data needed: ' + m.dataNeeded);
    out.push('Paper: ' + m.paper + ' — ' + m.url);
    out.push(wrap(m.description));
    if (m.lossFormula) out.push('Loss (LaTeX): ' + clean(m.lossFormula));
    if (m.whenToUse) out.push(wrap('When to use: ' + m.whenToUse));
    if (m.pros && m.pros.length) out.push(wrap('Pros: ' + m.pros.join('; ')));
    if (m.cons && m.cons.length) out.push(wrap('Cons: ' + m.cons.join('; ')));
    if (m.tools && m.tools.length) out.push(wrap('Tools: ' + m.tools.join('; ')));
    if (m.examples && m.examples.length) out.push(wrap('Examples: ' + m.examples.join('; ')));
    if (m.relatedMethods && m.relatedMethods.length) out.push('Related methods: ' + m.relatedMethods.join(', '));
    out.push('');
  }
  return out;
}

function glossaryLines() {
  const seen = new Map();
  for (const f of FILES) {
    for (const g of D[f].glossary || []) {
      const key = g.term.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, { term: g.term.trim(), definition: clean(g.definition), from: [f] });
      else {
        const e = seen.get(key);
        if (!e.from.includes(f)) e.from.push(f);
      }
    }
  }
  const out = [];
  const terms = [...seen.values()].sort((a, b) => a.term.localeCompare(b.term, 'en'));
  out.push(terms.length + ' terms, merged and de-duplicated across the eight data files.');
  out.push('');
  for (const t of terms) {
    out.push(t.term + ' [' + t.from.join(', ') + ']');
    out.push(wrap(t.definition, 92, '    '));
  }
  return out;
}

function liveLines() {
  if (!LIVE) return [];
  const out = [];
  out.push(wrap('Automatically refreshed daily at 06:17 UTC by scripts/update-data.mjs. Last refresh: ' +
    LIVE.updated + '. Endpoint: ' + jsonUrl('live') + '.'));
  out.push('');
  if (LIVE.arxiv) {
    out.push('- arXiv papers matching "knowledge distillation" (all time): ' + fmtNum(LIVE.arxiv.totalKD) + ' papers');
    out.push('- arXiv papers matching "knowledge distillation" (last 30 days): ' + fmtNum(LIVE.arxiv.last30d) + ' papers');
    if (LIVE.arxiv.perYear && LIVE.arxiv.perYear.length) {
      out.push('');
      out.push('Year | arXiv papers (papers)');
      out.push('---- | ---------------------');
      for (const y of LIVE.arxiv.perYear) out.push(y.year + ' | ' + y.count);
      out.push('');
    }
  }
  if (LIVE.huggingface) {
    if (LIVE.huggingface.distillModels != null) out.push('- Hugging Face models matching "distill": ' + fmtNum(LIVE.huggingface.distillModels) + ' models');
    if (LIVE.huggingface.tracked && LIVE.huggingface.tracked.length) {
      out.push('');
      out.push(pipeFrom([['id', 'Model'], ['downloads', 'Downloads, 30 days', 'downloads'], ['likes', 'Likes', 'likes']], LIVE.huggingface.tracked));
      out.push('');
    }
  }
  if (LIVE.github && LIVE.github.repos && LIVE.github.repos.length) {
    out.push(pipeFrom([['repo', 'Repository'], ['stars', 'Stars', 'stars'], ['description', 'Description']], LIVE.github.repos));
    out.push('');
  }
  if (LIVE.news && LIVE.news.items && LIVE.news.items.length) {
    out.push('Recent news items tracked by the daily refresh:');
    for (const n of LIVE.news.items) out.push('- ' + (n.date ? n.date.slice(0, 10) + ' — ' : '') + clean(n.title) + ' — ' + (n.url || ''));
    out.push('');
  }
  return out;
}

function buildFull() {
  const L = [];
  const H1 = (t) => { L.push(''); L.push(rule('=')); L.push(t.toUpperCase()); L.push(rule('=')); L.push(''); };
  const H2 = (t) => { L.push(''); L.push(t.toUpperCase()); L.push(rule('-', Math.max(8, t.length))); L.push(''); };

  L.push(rule('='));
  L.push('GLOBAL DISTILLATION — FULL TEXT DIGEST');
  L.push(rule('='));
  L.push('');
  L.push('Site:            ' + ORIGIN + '/');
  L.push('Licence:         ' + LICENCE);
  L.push('Cite as:         ' + CITATION + ', accessed <date>.');
  L.push('Dataset updated: ' + STAMP + ' (live signals refresh daily at 06:17 UTC)');
  L.push('Digest built:    from data/*.json as of ' + GENERATED + ', by scripts/gen-llms.mjs');
  L.push('Machine data:    ' + ORIGIN + '/data/ — one JSON file per section, schema at ' + ORIGIN + '/data/SCHEMA.md');
  L.push('Q&A pairs:       ' + ORIGIN + '/data/answers.json');
  L.push('');
  L.push(wrap(
    'This is the whole compendium in one plain-text file, for language models and answer engines. It contains ' +
    'every perspective summary, every key finding, every headline figure with its unit and primary-source URL, ' +
    'every comparison table rendered as pipe-separated text with units in the header, every chart series as ' +
    'data points, the complete dated timeline, one paragraph on each distillation method, the merged glossary ' +
    'and the full source register. Nothing here is generated prose about the subject: it is a rendering of the ' +
    'published dataset. Where a primary source never published a figure, the cell reads "undisclosed" or "n/a" ' +
    'rather than an estimate.'));
  L.push('');
  L.push('CONTENTS');
  L.push('  1. What distillation is, and how this compendium is sourced');
  L.push('  2. Live signals (refreshed daily)');
  PERSPECTIVES.forEach((p, i) => L.push('  ' + (i + 3) + '. ' + p[0].toUpperCase() + p.slice(1) + ' perspective — ' + url(p)));
  L.push('  9. Method library — ' + url('library'));
  L.push(' 10. Timeline 2006-2026 — ' + url('timeline'));
  L.push(' 11. Glossary (merged across all files)');
  L.push('');
  L.push(wrap('Sources are listed at the end of each section, in the order the section cites them, and per-row ' +
    'and per-chart source URLs appear inline in the tables and chart blocks themselves.'));

  /* 1 — orientation */
  H1('1. What distillation is, and how this compendium is sourced');
  const kd = G('library', 'Knowledge distillation');
  L.push(wrap(kd.term + ': ' + kd.definition));
  L.push('');
  const teacher = G('library', 'Teacher');
  const student = G('library', 'Student');
  L.push(wrap(teacher.term + ': ' + teacher.definition));
  L.push(wrap(student.term + ': ' + student.definition));
  L.push('');
  L.push(wrap(
    'Sourcing: every numeric claim in this dataset carries a source URL, and the register at the end of each ' +
    'section lists the principal works. Sources are primary wherever one exists — papers, model cards, official ' +
    'pricing pages, regulatory filings, statutes and named public statements. The six perspective files and the ' +
    'two reference files are edited by hand and each carries its own "updated" date; data/live.json is machine-' +
    'generated daily. Accusations between companies are reported as accusations, with the accuser, the claim, ' +
    'the evidence offered and the outcome each recorded separately.'));
  L.push('');
  L.push('Page URLs:');
  for (const p of PAGES) L.push('  ' + (p.name + ':').padEnd(16) + url(p.id));

  /* 2 — live */
  H1('2. Live signals (refreshed daily)');
  L.push(...liveLines());

  /* 3..8 — perspectives */
  let n = 3;
  for (const name of PERSPECTIVES) {
    const d = D[name];
    H1(n + '. ' + name + ' perspective — ' + d.title);
    n += 1;
    L.push('Page:    ' + url(name));
    L.push('Data:    ' + jsonUrl(name));
    L.push('Updated: ' + d.updated);
    L.push('Content: ' + counts(d));
    H2('Summary');
    L.push(wrap(d.summary));
    H2('Key figures');
    L.push(...statLines(d));
    H2('Key findings');
    L.push(...findingLines(d));
    H2('Tables');
    L.push(...tableLines(d));
    H2('Chart data');
    L.push(...chartLines(d));
    H2('Detail records');
    L.push(...extrasLines(name));
    H2('Timeline of this perspective (' + (d.timeline || []).length + ' events)');
    L.push(...compactTimeline(d));
    L.push('');
    H2('Sources cited by this section (' + (d.sources || []).length + ')');
    L.push(...sourceLines(d));
  }

  /* 9 — library */
  const lib = D.library;
  H1('9. Method library — ' + lib.title);
  L.push('Page:    ' + url('library'));
  L.push('Data:    ' + jsonUrl('library'));
  L.push('Updated: ' + lib.updated);
  H2('Summary');
  L.push(wrap(lib.summary));
  H2('Key figures');
  L.push(...statLines(lib));
  H2('Key findings');
  L.push(...findingLines(lib));
  H2('Tables');
  L.push(...tableLines(lib));
  H2('Chart data');
  L.push(...chartLines(lib));
  H2('The methods (' + (lib.extras.methods || []).length + ')');
  L.push(...methodLibraryLines());
  H2('Sources cited by the library (' + (lib.sources || []).length + ')');
  L.push(...sourceLines(lib));

  /* 10 — timeline */
  const tl = D.timeline;
  H1('10. Timeline 2006-2026 — ' + tl.title);
  L.push('Page:    ' + url('timeline'));
  L.push('Data:    ' + jsonUrl('timeline'));
  L.push('Updated: ' + tl.updated);
  H2('Summary');
  L.push(wrap(tl.summary));
  H2('Key figures');
  L.push(...statLines(tl));
  H2('Eras');
  L.push(...findingLines(tl));
  H2('Tables');
  L.push(...tableLines(tl));
  H2('Chart data');
  L.push(...chartLines(tl));
  H2('Every dated event (' + (tl.timeline || []).length + ')');
  for (const e of tl.timeline || []) {
    L.push(e.date + ' | ' + clean(e.category || '') + ' | ' + clean(e.title));
    L.push(wrap(e.detail, 92, '    '));
    if (e.source) L.push('    Source: ' + e.source);
  }
  L.push('');
  H2('Sources cited by the timeline (' + (tl.sources || []).length + ')');
  L.push(...sourceLines(tl));

  /* 11 — glossary */
  H1('11. Glossary');
  L.push(...glossaryLines());

  L.push(rule('='));
  L.push('END OF DIGEST — ' + CITATION + ', accessed <date>. Dataset updated ' + STAMP + '.');
  L.push(rule('='));
  L.push('');
  return L.join('\n');
}

/* ========================================================== answers.json */

/**
 * Every answer is assembled from values read out of the data at generation time. `build` throws
 * if a value it needs is gone; that question is then dropped and reported, never guessed.
 */
const QUESTIONS = [
  /* ---------------------------------------------------------- definitions */
  {
    id: 'what-is-knowledge-distillation', perspective: 'library',
    q: 'What is knowledge distillation?',
    build: () => {
      const g = G('library', 'Knowledge distillation');
      const t = G('library', 'Teacher'), s = G('library', 'Student');
      const cite = S('academic', 'Citations: Hinton');
      return {
        a: g.definition + ' The teacher is ' + lcfirst(sent(t.definition, 1)) + ' The student is ' + lcfirst(sent(s.definition, 1)) +
          ' The modern soft-target formulation comes from Hinton, Vinyals and Dean (2015), which now has ' +
          fmtNum(cite.value) + ' ' + cite.unit + '.',
        sources: [cite.source, M('response-kd').url],
      };
    },
  },
  {
    id: 'what-are-soft-targets', perspective: 'library',
    q: 'What are soft targets and dark knowledge in distillation?',
    build: () => {
      const soft = G('library', 'Soft targets'), dark = G('library', 'Dark knowledge'), temp = G('library', 'Temperature');
      return { a: sent(soft.definition, 2) + ' ' + sent(dark.definition, 1) + ' ' + sent(temp.definition, 1), sources: [M('response-kd').url] };
    },
  },
  {
    id: 'white-box-vs-black-box', perspective: 'library',
    q: 'What is the difference between white-box and black-box distillation?',
    build: () => {
      const w = G('library', 'White-box distillation'), b = G('library', 'Black-box distillation');
      const f = F('library', 'what does the teacher let you see');
      return { a: sent(w.definition, 2) + ' ' + sent(b.definition, 1) + ' ' + sent(f.detail, 1), sources: uniq(f.sources || []).slice(0, 3) };
    },
  },
  {
    id: 'what-is-on-policy-distillation', perspective: 'library',
    q: 'What is on-policy distillation?',
    build: () => {
      const g = G('library', 'On-policy distillation'), off = G('library', 'Off-policy distillation');
      const s = S('academic', "on-policy distillation");
      return {
        a: g.definition + ' ' + off.definition + ' It is the fastest-growing sub-topic in the literature: ' +
          s.label.replace(/^arXiv papers mentioning/, 'arXiv papers mentioning') + ' reached ' + fmtNum(s.value) + ' ' + s.unit +
          ' (' + clean(s.delta) + ').',
        sources: [s.source, M('generalized-kd').url],
      };
    },
  },
  {
    id: 'exposure-bias', perspective: 'library',
    q: 'What is exposure bias in knowledge distillation?',
    build: () => {
      const g = G('library', 'Exposure bias');
      const f = F('library', 'exposure-bias');
      return { a: g.definition + ' ' + sent(f.detail, 2), sources: uniq(f.sources || []).slice(0, 3) };
    },
  },
  {
    id: 'forward-vs-reverse-kl', perspective: 'library',
    q: 'Should I use forward KL or reverse KL when distilling a language model?',
    build: () => {
      const fwd = G('library', 'Forward KL'), rev = G('library', 'Reverse KL'), jsd = G('library', 'Generalized JSD');
      const f = F('academic', 'divergence you minimise');
      return { a: gloss1(fwd) + ' ' + gloss1(rev) + ' ' + gloss1(jsd) + ' ' + sent(f.detail, 1), sources: uniq(f.sources || []).slice(0, 3) };
    },
  },
  {
    id: 'what-is-sequence-level-kd', perspective: 'library',
    q: 'What is sequence-level knowledge distillation?',
    build: () => {
      const m = M('sequence-level-kd');
      return { a: m.description + ' ' + m.whenToUse, sources: [m.url] };
    },
  },
  {
    id: 'what-is-dataset-distillation', perspective: 'library',
    q: 'What is dataset distillation, and is it the same thing as model distillation?',
    build: () => {
      const m = M('dataset-distillation');
      const g = G('academic', 'Dataset distillation');
      return { a: sent(g.definition, 1) + ' ' + sent(m.description, 2) + ' Teacher access required: ' + m.teacherAccess + '.', sources: [m.url] };
    },
  },
  {
    id: 'what-is-self-distillation', perspective: 'library',
    q: 'What is self-distillation?',
    build: () => {
      const m = M('self-distillation');
      return { a: m.description + ' ' + m.whenToUse, sources: [m.url] };
    },
  },
  {
    id: 'capacity-gap', perspective: 'academic',
    q: 'Can a student model be too small for its teacher?',
    build: () => {
      const g = G('library', 'Capacity gap');
      const f = F('academic', 'scaling law');
      return { a: g.definition + ' ' + sent(f.detail, 2), sources: uniq(f.sources || []).slice(0, 3) };
    },
  },
  {
    id: 'who-invented-distillation', perspective: 'timeline',
    q: 'Who invented knowledge distillation, and when?',
    build: () => {
      const a = EV('Model Compression');
      const b = EV('Distilling the Knowledge');
      const cite = S('academic', 'Citations: Hinton');
      return {
        a: a.date + ': ' + sent(a.detail, 2) + ' ' + b.date + ': ' + sent(b.detail, 1) +
          ' That paper now carries ' + fmtNum(cite.value) + ' ' + cite.unit + '.',
        sources: uniq([a.source, b.source, cite.source]),
      };
    },
  },
  {
    id: 'model-collapse', perspective: 'academic',
    q: 'Does training models on other models cause homogenisation or model collapse?',
    build: () => {
      const g = G('academic', 'Model collapse');
      const f = F('academic', 'homogenisation');
      return { a: g.definition + ' ' + sent(f.detail, 2), sources: uniq(f.sources || []).slice(0, 3) };
    },
  },

  /* ------------------------------------------------------------ economics */
  {
    id: 'how-much-cheaper-distilled', perspective: 'customer',
    q: 'How much cheaper is a distilled model than its teacher?',
    build: () => {
      const req = S('customer', 'Cost per 1M requests');
      const gap = S('company', 'Output price gap');
      const spread = S('financial', 'price spread');
      return {
        a: 'It depends on the pair, but the gap is between one and two orders of magnitude. ' +
          req.label + ': ' + fmtNum(req.value) + ' ' + req.unit + ' (' + clean(req.delta) + '). ' +
          gap.label + ': ' + fmtNum(gap.value) + ' ' + gap.unit + ' (' + clean(gap.delta) + '). ' +
          spread.label + ' is ' + fmtNum(spread.value) + ' ' + spread.unit + ' (' + clean(spread.delta) + ').',
        sources: uniq([req.source, gap.source, spread.source]),
      };
    },
  },
  {
    id: 'quality-retention', perspective: 'customer',
    q: 'How much quality does a distilled or small-tier model actually retain?',
    build: () => {
      const gpqa = S('customer', 'GPQA retained by GPT-5.6 Luna');
      const ds = S('customer', 'GPQA of DeepSeek-V4-Flash');
      const swe = S('customer', 'SWE-bench Verified retained');
      return {
        a: 'Retention depends on the task, and it is high on knowledge benchmarks and lower on agentic coding. ' +
          gpqa.label + ': ' + gpqa.value + ' ' + gpqa.unit + ' (' + clean(gpqa.delta) + '). ' +
          ds.label + ': ' + ds.value + ' ' + ds.unit + ' (' + clean(ds.delta) + '). ' +
          swe.label + ': ' + swe.value + ' ' + swe.unit + ' (' + clean(swe.delta) + ').',
        sources: uniq([gpqa.source, ds.source, swe.source]),
      };
    },
  },
  {
    id: 'cost-to-train-distilled-model', perspective: 'financial',
    q: 'How much does it cost to train a distilled reasoning model?',
    build: () => {
      const sky = S('financial', 'Sky-T1');
      const s1 = S('academic', 'Cheapest published reasoning distillation run');
      const r1 = S('financial', 'DeepSeek-R1 reinforcement-learning training cost');
      return {
        a: sky.label + ' was ' + fmtNum(sky.value) + ' ' + sky.unit + ' (' + clean(sky.delta) + '). ' +
          s1.label + ' used ' + fmtNum(s1.value) + ' ' + s1.unit + ' (' + clean(s1.delta) + '). ' +
          'For contrast, the ' + r1.label.toLowerCase() + ' was ' + fmtNum(r1.value) + ' ' + r1.unit +
          ' (' + clean(r1.delta) + ').',
        sources: uniq([sky.source, s1.source, r1.source]),
      };
    },
  },
  {
    id: 'distillation-vs-rl-cost', perspective: 'academic',
    q: 'Is distillation cheaper than reinforcement learning for teaching a model to reason?',
    build: () => {
      const s = S('academic', 'on-policy distillation vs RL GPU-hours');
      const f = F('academic', 'better than RL');
      return {
        a: 'Yes, by roughly an order of magnitude on the published comparisons. ' + s.label + ': ' +
          fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' + sent(f.detail, 2),
        sources: uniq([s.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'teacher-corpus-cost', perspective: 'financial',
    q: 'What does it cost to buy a teacher model\'s reasoning traces?',
    build: () => {
      const s = S('financial', 'Teacher-query bill');
      const t = T('financial', 'distillation-corpus-cost');
      return {
        a: s.label + ' is ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' +
          sent(t.description, 2) + ' The full per-teacher breakdown is the "' + t.title + '" table, ' +
          t.rows.length + ' teachers priced at list.',
        sources: uniq([s.source, ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'nvidia-january-2025', perspective: 'financial',
    q: 'What happened to Nvidia\'s market capitalisation after DeepSeek-R1?',
    build: () => {
      const s = S('financial', 'Nvidia single-day market-cap loss');
      const f = F('financial', 'repriced compute');
      return {
        a: s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' + sent(f.detail, 2),
        sources: uniq([s.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'self-host-or-api', perspective: 'financial',
    q: 'Is it cheaper to self-host a distilled model or to call an API?',
    build: () => {
      const f = F('financial', 'Self-hosting');
      const tco = P('financial').extras.tcoAssumptions;
      return {
        a: sent(f.detail, 2) + ' The model assumes one H100 at $' + tco.gpuHourlyRate + '/GPU-hour for ' +
          tco.hoursPerMonth + ' hours plus ' + tco.staffingFte + ' FTE, a total of $' +
          fmtNum(tco.monthlyTotalSelfHosted) + ' a month for about ' + fmtNum(tco.monthlyCapacityMtokOut) +
          ' MTok of output capacity.',
        sources: uniq([...(f.sources || []), ...(tco.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'cheapest-model', perspective: 'customer',
    q: 'What is the cheapest hosted model per million tokens?',
    build: () => {
      const s = S('customer', 'Cheapest hosted model');
      const idx = S('customer', 'Enterprise inference price index');
      return {
        a: s.label + ' is ' + s.value + ' ' + s.unit + ' (' + clean(s.delta) + '). ' +
          'For context, the ' + idx.label.toLowerCase() + ' stands at ' + idx.value + ' ' + idx.unit +
          ' (' + clean(idx.delta) + ').',
        sources: uniq([s.source, idx.source]),
      };
    },
  },
  {
    id: 'price-decline', perspective: 'financial',
    q: 'How fast is the price of a fixed AI capability falling?',
    build: () => {
      const s = S('financial', 'Inference price decline');
      const g = S('financial', 'Frontier training-run cost growth');
      const f = F('financial', 'race to zero');
      return {
        a: s.label + ' runs at ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '), while the ' +
          g.label.toLowerCase() + ' is ' + g.value + ' ' + g.unit + ' (' + clean(g.delta) + '). ' + sent(f.detail, 2),
        sources: uniq([s.source, g.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'deepseek-price-rise', perspective: 'financial',
    q: 'Are AI inference prices still falling in 2026?',
    build: () => {
      const s = S('financial', 'DeepSeek V4 API price increase');
      const f = F('financial', 'race to zero');
      return { a: sent(f.detail, 3) + ' ' + s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + ').',
        sources: uniq([s.source, ...(f.sources || [])]).slice(0, 4) };
    },
  },
  {
    id: 'model-extraction-cost', perspective: 'financial',
    q: 'How expensive is it to extract a model through its API?',
    build: () => {
      const f = F('financial', 'operating expense');
      const t = T('financial', 'cost-of-theft-asymmetry');
      return {
        a: sent(f.detail, 3) + ' The "' + t.title + '" table itemises ' + t.rows.length +
          ' line items on both sides of that trade.',
        sources: uniq([...(f.sources || []), ...(t.sources || [])]).slice(0, 4),
      };
    },
  },

  /* -------------------------------------------------------------- politics */
  {
    id: 'did-deepseek-distil-openai', perspective: 'political',
    q: 'Did DeepSeek distil OpenAI\'s models?',
    build: () => {
      const d1 = DIS('DeepSeek', '2025-01-28');
      const d2 = DIS('DeepSeek', '2025-01-29');
      return {
        a: 'It is a public accusation that has never been tested in court. On ' + d1.date + ', ' + d1.accuser +
          ' alleged: "' + clean(d1.claim) + '" — evidence offered: ' + period(d1.evidence) +
          ' On ' + d2.date + ', ' + d2.accuser + ' alleged: "' + clean(d2.claim) + '".' +
          ' Outcome to date: ' + period(d1.outcome),
        sources: uniq([d1.source, d2.source]),
      };
    },
  },
  {
    id: 'is-distillation-legal', perspective: 'political',
    q: 'Is it legal to distil another company\'s model?',
    build: () => {
      const f = F('political', 'breach of contract');
      const t = T('political', 'legal-theories');
      return {
        a: sent(f.detail, 2) + ' The "' + t.title + '" table scores ' + t.rows.length +
          ' distinct legal theories with the weakness of each — this is a description of the public record, not legal advice.',
        sources: uniq([...(f.sources || []), ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'openai-tos-distillation', perspective: 'company',
    q: 'Do OpenAI\'s terms of service allow you to train on its outputs?',
    build: () => {
      const c = CO('OpenAI');
      const f = F('company', 'Terms of service');
      return {
        a: 'OpenAI\'s terms prohibit using output to build a competing model: ' + clean(c.tosClause) + ' ' + sent(f.detail, 2),
        sources: uniq([c.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'anthropic-disclosures', perspective: 'political',
    q: 'What has Anthropic disclosed about distillation attacks on Claude?',
    build: () => {
      const ex = S('political', 'Claude exchanges in largest disclosed campaign');
      const acc = S('political', 'Fraudulent accounts alleged');
      const f = F('political', 'anecdote to numbers');
      return {
        a: ex.label + ': ' + fmtNum(ex.value) + ' ' + ex.unit + ' (' + clean(ex.delta) + '). ' +
          acc.label + ': ' + fmtNum(acc.value) + ' ' + acc.unit + ' (' + clean(acc.delta) + '). ' + sent(f.detail, 2),
        sources: uniq([ex.source, acc.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'governments-restricting-deepseek', perspective: 'political',
    q: 'Which governments have restricted DeepSeek?',
    build: () => {
      const s = S('political', 'US states restricting DeepSeek');
      const t = T('political', 'restrictions-on-deepseek');
      return {
        a: s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' +
          'The "' + t.title + '" table records ' + t.rows.length + ' jurisdictions with the date, scope and stated rationale of each restriction.',
        sources: uniq([s.source, ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'eu-ai-act-distillation', perspective: 'political',
    q: 'Does the EU AI Act regulate distillation?',
    build: () => {
      const f = F('political', 'EU regulates capability');
      const s = S('political', 'EU AI Act fine');
      return {
        a: sent(f.detail, 3) + ' ' + s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + ').',
        sources: uniq([s.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'us-bills-distillation', perspective: 'political',
    q: 'What are US lawmakers doing about model distillation?',
    build: () => {
      const t = T('political', 'us-bills-tracker');
      const v = S('political', 'House Foreign Affairs vote');
      const f = F('political', 'named category in US national security policy');
      return {
        a: sent(f.detail, 2) + ' The bill tracker follows ' + t.rows.length +
          ' federal bills in the 119th Congress. ' + v.label + ' was ' + v.value + ' ' + v.unit + ' (' + clean(v.delta) + ').',
        sources: uniq([v.source, ...(f.sources || []), ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'export-controls-link', perspective: 'political',
    q: 'How do chip export controls relate to the distillation argument?',
    build: () => {
      const f = F('political', 'Export controls');
      const tar = S('political', 'Section 232 tariff');
      return {
        a: sent(f.detail, 3) + ' ' + tar.label + ': ' + tar.value + ' ' + tar.unit + ' (' + clean(tar.delta) + ').',
        sources: uniq([tar.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'grey-market-api-access', perspective: 'political',
    q: 'How do distillers get API access if their accounts are banned?',
    build: () => {
      const f = F('political', 'grey market');
      const g = G('political', 'Fraudulent account network provider');
      return { a: sent(f.detail, 3) + ' ' + g.term + ': ' + g.definition, sources: uniq(f.sources || []).slice(0, 4) };
    },
  },

  /* ------------------------------------------------------------- companies */
  {
    id: 'which-companies-distil', perspective: 'company',
    q: 'Which AI companies use distillation to build their models?',
    build: () => {
      const s = S('company', 'publicly document a distilled model');
      const f = F('company', 'default way every lab builds its small models');
      const t = T('company', 'distilled-lineage');
      return {
        a: sent(f.detail, 2) + ' ' + s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' +
          'The lineage table documents ' + t.rows.length + ' teacher-to-student pairs with the method and release date of each.',
        sources: uniq([...(f.sources || []), ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'distillation-as-a-product', perspective: 'company',
    q: 'Can I buy distillation as a managed service?',
    build: () => {
      const s = S('company', 'Distillation-as-a-service');
      const bed = S('customer', 'Bedrock Model Distillation claim');
      const f = F('company', 'sell distillation');
      return {
        a: s.label + ': ' + s.value + ' ' + s.unit + ' (' + clean(s.delta) + '). ' + sent(f.detail, 2) + ' ' +
          bed.label + ': ' + bed.value + ' ' + bed.unit + ' (' + clean(bed.delta) + ').',
        sources: uniq([s.source, bed.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'who-bans-distillation', perspective: 'company',
    q: 'Which companies forbid distillation in their terms of service?',
    build: () => {
      const s = S('company', 'anti-distillation');
      const t = T('company', 'tos-clauses');
      return {
        a: s.label + ': ' + s.value + ' ' + s.unit + ' (' + clean(s.delta) + '). ' +
          'The clause table quotes ' + t.rows.length + ' documents with the effect and date of each. ' +
          clean(t.description || ''),
        sources: uniq([s.source, ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'open-weight-licences', perspective: 'company',
    q: 'Do open-weight licences allow you to distil the model?',
    build: () => {
      const f = F('company', 'invite distillation');
      const c = F('customer', 'may not distil the models you buy');
      return { a: sent(f.detail, 2) + ' ' + sent(c.detail, 2), sources: uniq([...(f.sources || []), ...(c.sources || [])]).slice(0, 4) };
    },
  },
  {
    id: 'prune-and-distill', perspective: 'company',
    q: 'What is prune-and-distill, and how much does it save?',
    build: () => {
      const g = G('company', 'Prune-and-distill');
      const s = S('company', 'Training tokens saved by prune-and-distill');
      const m = M('prune-then-distill');
      return {
        a: g.definition + ' ' + s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' + sent(m.whenToUse, 1),
        sources: uniq([s.source, m.url]),
      };
    },
  },
  {
    id: 'defences-against-distillation', perspective: 'company',
    q: 'How do labs defend against having their models distilled?',
    build: () => {
      const f = F('company', 'Defensive measures');
      const g = G('timeline', 'Antidistillation sampling');
      return { a: sent(f.detail, 3) + ' ' + g.term + ': ' + g.definition, sources: uniq(f.sources || []).slice(0, 4) };
    },
  },

  /* ------------------------------------------------------------ developers */
  {
    id: 'which-method-for-classification', perspective: 'library',
    q: 'Which distillation method should I use for a classification task?',
    build: () => {
      const m = M('response-kd');
      const b = M('blackbox-output-distillation');
      return {
        a: 'If you host both models and they share a label set or tokenizer, start with ' + m.name + ' (difficulty ' +
          m.difficulty + '/5, teacher access: ' + m.teacherAccess + ', data needed: ' + m.dataNeeded + '). ' +
          m.whenToUse + ' If the teacher is a closed API, use ' + b.name + ' instead: ' + sent(b.description, 1),
        sources: uniq([m.url, b.url]),
      };
    },
  },
  {
    id: 'which-method-for-reasoning', perspective: 'library',
    q: 'Which distillation method should I use to teach a small model to reason?',
    build: () => {
      const m = M('reasoning-trace-distillation');
      const f = F('library', 'Rationales beat labels');
      return { a: sent(m.description, 2) + ' ' + sent(m.whenToUse, 1) + ' ' + sent(f.detail, 1), sources: uniq([m.url, ...(f.sources || [])]).slice(0, 4) };
    },
  },
  {
    id: 'distil-from-closed-api', perspective: 'developer',
    q: 'How do I distil a model from a closed API I cannot see the logits of?',
    build: () => {
      const r = (P('developer').extras.recipes || [])[0];
      if (!r) throw new Error('developer.extras.recipes is empty');
      return {
        a: r.title + '. First step: ' + (r.steps || []).slice(0, 1).map((s) => period(sent(s, 1))).join(' ') +
          ' Estimated cost: ' + clean(r.estCost) + '; estimated time: ' + clean(r.estTime) + '.',
        sources: uniq([r.source, ...(r.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'tools-for-distillation', perspective: 'developer',
    q: 'What open-source tools can I use to distil a model?',
    build: () => {
      const trl = TOOL('TRL');
      const f = F('developer', 'TRL ships it out of the box');
      const t = T('developer', 'library-feature-matrix');
      return {
        a: sent(f.detail, 2) + ' ' + clean(trl.name) + ': ' + trl.oneLiner + ' The feature matrix compares ' +
          t.rows.length + ' libraries on logit KD, on-policy training, cross-tokenizer support, pruning and PEFT.',
        sources: uniq([trl.url, ...(f.sources || []), ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'gpu-requirements', perspective: 'developer',
    q: 'What GPU do I need to distil a model?',
    build: () => {
      const f = F('developer', 'consumer GPU');
      const t = T('developer', 'gpu-requirements');
      return {
        a: sent(f.detail, 3) + ' The requirements table lists QLoRA and LoRA memory floors for ' + t.rows.length +
          ' student sizes alongside a suitable GPU and its hourly rental price.',
        sources: uniq([...(f.sources || []), ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'open-distillation-datasets', perspective: 'developer',
    q: 'Are there open datasets of teacher reasoning traces I can train on?',
    build: () => {
      const s = S('developer', 'OpenThoughts3');
      const f = F('developer', 'API bill optional');
      const t = T('developer', 'dataset-comparison');
      return {
        a: sent(f.detail, 2) + ' ' + s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' +
          'The dataset table compares ' + t.rows.length + ' open corpora by teacher, domain, licence and download volume.',
        sources: uniq([s.source, ...(f.sources || []), ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'managed-finetuning-price', perspective: 'developer',
    q: 'What is the cheapest managed fine-tuning for a distilled student?',
    build: () => {
      const s = S('developer', 'Cheapest managed LoRA SFT');
      const f = F('developer', 'Managed distillation on the big clouds');
      return {
        a: s.label + ': ' + s.value + ' ' + s.unit + ' (' + clean(s.delta) + '). ' + sent(f.detail, 2),
        sources: uniq([s.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'openai-finetuning-winddown', perspective: 'developer',
    q: 'Can I still fine-tune OpenAI models on teacher outputs?',
    build: () => {
      const s = S('developer', 'start a new OpenAI fine-tuning job');
      const f = F('developer', 'Managed distillation on the big clouds');
      return {
        a: s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' + sent(f.detail, 3),
        sources: uniq([s.source, ...(f.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'speculative-decoding-distillation', perspective: 'developer',
    q: 'Is speculative decoding a form of distillation?',
    build: () => {
      const f = F('developer', 'draft heads');
      const m = M('draft-model-distillation');
      return { a: sent(f.detail, 2) + ' ' + sent(m.description, 2), sources: uniq([m.url, ...(f.sources || [])]).slice(0, 4) };
    },
  },
  {
    id: 'downloads-r1-distill', perspective: 'developer',
    q: 'How widely used are the DeepSeek-R1-Distill models?',
    build: () => {
      const s = S('developer', 'DeepSeek-R1-Distill family');
      const t = T('developer', 'r1-distill-students');
      return {
        a: s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' +
          'The student table lists ' + t.rows.length + ' sizes with AIME, MATH, GPQA and LiveCodeBench scores next to download counts.',
        sources: uniq([s.source, ...(t.sources || [])]).slice(0, 4),
      };
    },
  },

  /* -------------------------------------------------------------- buyers */
  {
    id: 'should-i-buy-cheap-tier', perspective: 'customer',
    q: 'Should I buy a frontier model or a cheaper distilled one?',
    build: () => {
      const f = F('customer', 'good enough');
      const g = F('customer', 'Agentic coding');
      return { a: sent(f.detail, 2) + ' ' + sent(g.detail, 2), sources: uniq([...(f.sources || []), ...(g.sources || [])]).slice(0, 4) };
    },
  },
  {
    id: 'model-for-classification-workload', perspective: 'customer',
    q: 'Which model should I use for high-volume classification and routing?',
    build: () => {
      const g = DG('classification');
      return { a: 'Recommendation: ' + g.recommendation + '. ' + sent(g.why, 3), sources: [url('customer'), jsonUrl('customer')] };
    },
  },
  {
    id: 'model-for-coding-agent', perspective: 'customer',
    q: 'Which model should I use for an autonomous coding agent?',
    build: () => {
      const g = DG('coding agent');
      const f = F('customer', 'Agentic coding');
      return { a: 'Recommendation: ' + g.recommendation + '. ' + sent(g.why, 2) + ' ' + sent(f.detail, 1),
        sources: uniq((f.sources || []).slice(0, 3).concat(jsonUrl('customer'))) };
    },
  },
  {
    id: 'model-for-on-device', perspective: 'customer',
    q: 'Which model should I use on-device or offline?',
    build: () => {
      const g = DG('on-device');
      return { a: 'Recommendation: ' + g.recommendation + '. ' + sent(g.why, 3), sources: [url('customer'), jsonUrl('customer')] };
    },
  },
  {
    id: 'model-for-regulated-workload', perspective: 'customer',
    q: 'Which model can I run when data cannot leave my own infrastructure?',
    build: () => {
      const g = DG('cannot leave your infrastructure');
      const f = F('customer', 'Open weights');
      return { a: 'Recommendation: ' + g.recommendation + '. ' + sent(g.why, 2) + ' ' + sent(f.detail, 1),
        sources: uniq((f.sources || []).slice(0, 3).concat(jsonUrl('customer'))) };
    },
  },
  {
    id: 'best-open-weight-model', perspective: 'customer',
    q: 'What is the strongest open-weight model in this dataset?',
    build: () => {
      const s = S('customer', 'Best open-weight GPQA');
      const f = F('customer', 'Open weights');
      return { a: s.label + ': ' + s.value + ' ' + s.unit + ' (' + clean(s.delta) + '). ' + sent(f.detail, 2),
        sources: uniq([s.source, ...(f.sources || [])]).slice(0, 4) };
    },
  },
  {
    id: 'latency-of-distilled-models', perspective: 'customer',
    q: 'Are distilled models faster than their teachers?',
    build: () => {
      const f = F('customer', 'latency');
      const t = T('customer', 'latency');
      return {
        a: sent(f.detail, 3) + ' The latency table reports measured time-to-first-token and throughput for ' +
          t.rows.length + ' models.',
        sources: uniq([...(f.sources || []), ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'context-window-cheap-tier', perspective: 'customer',
    q: 'Do I have to pay frontier prices to get a long context window?',
    build: () => {
      const f = F('customer', 'Context window');
      return { a: sent(f.detail, 3), sources: uniq(f.sources || []).slice(0, 4) };
    },
  },
  {
    id: 'narrow-vs-broad-skill-transfer', perspective: 'customer',
    q: 'What kind of capability does distillation transfer well?',
    build: () => {
      const f = F('customer', 'narrow skills');
      const a = F('academic', 'Retention degrades');
      return { a: sent(f.detail, 2) + ' ' + sent(a.detail, 2), sources: uniq([...(f.sources || []), ...(a.sources || [])]).slice(0, 4) };
    },
  },

  /* -------------------------------------------------------------- history */
  {
    id: 'january-2025-shock', perspective: 'timeline',
    q: 'What happened in January 2025 with DeepSeek?',
    build: () => {
      const era = F('timeline', 'Era 4');
      const nv = S('financial', 'Nvidia single-day market-cap loss');
      return { a: sent(era.detail, 3) + ' ' + nv.label + ': ' + fmtNum(nv.value) + ' ' + nv.unit + ' (' + clean(nv.delta) + ').',
        sources: uniq([nv.source, ...(era.sources || [])]).slice(0, 4) };
    },
  },
  {
    id: 'how-distillation-evolved', perspective: 'timeline',
    q: 'How has distillation changed since 2006?',
    build: () => {
      const e1 = F('timeline', 'Era 1'), e3 = F('timeline', 'Era 3'), e5 = F('timeline', 'Era 5');
      const span = S('timeline', 'Span from first to last event');
      const total = S('timeline', 'Dated events');
      return {
        a: sent(e1.detail, 1) + ' ' + sent(e3.detail, 1) + ' ' + sent(e5.detail, 1) +
          ' The timeline records ' + fmtNum(total.value) + ' ' + total.unit + ' across ' + span.value + ' ' + span.unit + ' (' + clean(span.delta) + ').',
        sources: uniq([total.source, span.source, ...(e5.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'how-many-papers', perspective: 'academic',
    q: 'How much research is published on knowledge distillation?',
    build: () => {
      const y25 = S('academic', "in abstract (2025)");
      const ytd = S('academic', 'year-to-date');
      return {
        a: y25.label + ': ' + fmtNum(y25.value) + ' ' + y25.unit + ' (' + clean(y25.delta) + '). ' +
          ytd.label + ': ' + fmtNum(ytd.value) + ' ' + ytd.unit + ' (' + clean(ytd.delta) + ').' +
          (LIVE && LIVE.arxiv ? ' The live daily count of all arXiv papers matching the phrase is ' + fmtNum(LIVE.arxiv.totalKD) + ', with ' + fmtNum(LIVE.arxiv.last30d) + ' in the last 30 days.' : ''),
        sources: uniq([y25.source, ytd.source, LIVE ? jsonUrl('live') : null]),
      };
    },
  },
  {
    id: 'sample-efficiency', perspective: 'academic',
    q: 'How many training examples do you need to distil reasoning into a model?',
    build: () => {
      const f = F('academic', 'Sample efficiency');
      const s = S('library', 's1K');
      return { a: sent(f.detail, 2) + ' ' + s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + ').',
        sources: uniq([s.source, ...(f.sources || [])]).slice(0, 4) };
    },
  },
  {
    id: 'can-student-beat-teacher', perspective: 'academic',
    q: 'Can a distilled student ever beat its teacher?',
    build: () => {
      const f = F('academic', 'beat a much larger teacher');
      return { a: sent(f.detail, 3), sources: uniq(f.sources || []).slice(0, 4) };
    },
  },
  {
    id: 'pretraining-distillation', perspective: 'academic',
    q: 'Is distillation used during pretraining, or only for fine-tuning?',
    build: () => {
      const f = F('academic', 'Pretraining-time distillation');
      return { a: sent(f.detail, 3), sources: uniq(f.sources || []).slice(0, 4) };
    },
  },
  {
    id: 'bert-era-compression', perspective: 'library',
    q: 'How much quality did DistilBERT and TinyBERT keep?',
    build: () => {
      const d = S('library', 'DistilBERT GLUE retention');
      const t = S('library', 'TinyBERT-4L GLUE retention');
      const tab = T('academic', 'bert-era-compression');
      return {
        a: d.label + ': ' + d.value + ' ' + d.unit + ' (' + clean(d.delta) + '). ' +
          t.label + ': ' + t.value + ' ' + t.unit + ' (' + clean(t.delta) + '). ' +
          'The BERT-era table compares ' + tab.rows.length + ' compressed models on size reduction, speedup and retention.',
        sources: uniq([d.source, t.source, ...(tab.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'diffusion-distillation', perspective: 'library',
    q: 'Does distillation apply to image and video models too?',
    build: () => {
      const m = M('diffusion-distillation');
      const s = S('library', 'Latent Consistency Model');
      const f = F('library', 'escaped model compression');
      return { a: sent(m.description, 2) + ' ' + s.label + ': ' + fmtNum(s.value) + ' ' + s.unit + ' (' + clean(s.delta) + '). ' + sent(f.detail, 1),
        sources: uniq([m.url, s.source]) };
    },
  },
  {
    id: 'how-many-methods', perspective: 'library',
    q: 'How many distillation methods are there, and how are they organised?',
    build: () => {
      const s = S('library', 'Methods catalogued');
      const t = T('library', 'method-families');
      const f = F('library', 'first question');
      return {
        a: s.label + ': ' + s.value + ' ' + s.unit + ' (' + clean(s.delta) + '), grouped into ' + t.rows.length +
          ' families by what actually crosses from teacher to student. ' + sent(f.detail, 2),
        sources: uniq([s.source, ...(t.sources || [])]).slice(0, 4),
      };
    },
  },
  {
    id: 'how-this-site-is-sourced', perspective: 'overview',
    q: 'Where does Global Distillation get its data, and how often is it updated?',
    build: () => ({
      a: 'Every figure is read from a public JSON dataset at ' + ORIGIN + '/data/ and carries a primary-source URL: ' +
        'papers, model cards, official pricing pages, filings, statutes and named public statements. The eight ' +
        'perspective files are hand-edited and individually dated (most recent: ' + STAMP + '), while data/live.json is ' +
        'regenerated daily at 06:17 UTC with arXiv counts, Hugging Face downloads, repository stars and news. ' +
        'Figures a primary source never published are marked undisclosed rather than estimated, and the content is ' +
        'licensed ' + LICENCE,
      sources: [ORIGIN + '/data/SCHEMA.md', ORIGIN + '/llms-full.txt'],
    }),
  },
];

function buildAnswers() {
  const items = [];
  const dropped = [];
  for (const spec of QUESTIONS) {
    try {
      const { a, sources } = spec.build();
      const answer = clean(a);
      if (!answer) throw new Error('empty answer');
      const nSent = sentences(answer).length;
      const page = spec.perspective === 'overview' ? url('') : url(spec.perspective);
      items.push({
        id: spec.id,
        question: spec.q,
        answer,
        perspective: spec.perspective,
        page,
        sources: uniq(sources).slice(0, 5),
        sentences: nSent,
      });
    } catch (err) {
      dropped.push(spec.id + ': ' + err.message);
    }
  }
  return { items, dropped };
}

/* ------------------------------------------------------------------ main */

const { items: ANSWERS, dropped: DROPPED } = buildAnswers();
const ANSWER_COUNT = ANSWERS.length;

const answersDoc = {
  name: 'Global Distillation — question and answer pairs',
  description:
    'Answers to common questions about AI model distillation, assembled from the published dataset at ' +
    ORIGIN + '/data/. Every answer is composed from values read out of those files at generation time; ' +
    'no claim here is absent from the underlying data.',
  site: ORIGIN + '/',
  licence: LICENCE,
  citation: CITATION + ', accessed <date>.',
  datasetUpdated: STAMP,
  generated: GENERATED,
  generator: 'scripts/gen-llms.mjs',
  count: ANSWERS.length,
  answers: ANSWERS,
};

const outLlms = buildLlms();
const outFull = buildFull();

fs.writeFileSync(path.join(ROOT, 'llms.txt'), outLlms.endsWith('\n') ? outLlms : outLlms + '\n', 'utf8');
fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), outFull.endsWith('\n') ? outFull : outFull + '\n', 'utf8');
fs.writeFileSync(path.join(ROOT, 'data', 'answers.json'), JSON.stringify(answersDoc, null, 2) + '\n', 'utf8');

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1) + ' KB';
console.log('llms.txt        ' + kb(outLlms) + ', ' + outLlms.split('\n').length + ' lines');
console.log('llms-full.txt   ' + kb(outFull) + ', ' + outFull.split('\n').length + ' lines');
console.log('answers.json    ' + ANSWERS.length + ' question/answer pairs');
const OUT_OF_BAND = ANSWERS.filter((a) => a.sentences < 2 || a.sentences > 4);
if (OUT_OF_BAND.length) {
  console.log('answers outside the 2-4 sentence band:');
  OUT_OF_BAND.forEach((a) => console.log('  ' + a.sentences + '  ' + a.id));
}
if (DROPPED.length) {
  console.log('dropped questions (data no longer supports them):');
  DROPPED.forEach((d) => console.log('  ' + d));
}
if (ANSWERS.length < 40) {
  console.error('error: only ' + ANSWERS.length + ' answers survived; expected at least 40');
  process.exitCode = 1;
}
