// Static prerender: one real, crawlable HTML page per route.
//
//   node scripts/prerender.mjs [--origin https://example.com]
//
// The site is a hash-routed single-page app, so every perspective shares one
// URL and a crawler sees one page. This script reads the same JSON the browser
// reads and writes <route>/index.html for each route: correct title, meta
// description and canonical, then the perspective's h1, summary, key findings,
// stat figures, tables, chart data, timeline, glossary and numbered sources as
// real HTML in the source. No JavaScript is needed to read any of it.
//
// The page also boots the app: it carries the same stylesheet and module
// scripts as index.html and a tiny inline script that points the hash router at
// this route before app.js runs, so a reader with JavaScript sees exactly the
// interactive render they see today and the static copy is replaced by it.
//
// No third-party dependencies. The root index.html (the app shell) is never
// rewritten; the per-page head tags come from scripts/gen-schema.mjs when it is
// present, because two canonicals with different hrefs cancel each other out.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oi = process.argv.indexOf('--origin');
const ORIGIN = (oi > -1 ? process.argv[oi + 1] : process.env.SITE_ORIGIN || 'https://global-distillation.com')
  .replace(/\/+$/, '');

/* ---------------------------------------------------------------- routes */

/** Every route the hash router answers to. `file` names its data file. */
const ROUTES = [
  { id: 'overview', file: null, label: 'Overview',
    desc: 'A public compendium of AI model distillation: the research, the token economics, the policy fights, and which distilled models to buy. Every figure is sourced.' },
  { id: 'academic', file: 'academic', label: 'Academic' },
  { id: 'financial', file: 'financial', label: 'Financial' },
  { id: 'political', file: 'political', label: 'Political' },
  { id: 'company', file: 'company', label: 'Company' },
  { id: 'developer', file: 'developer', label: 'Developer' },
  { id: 'customer', file: 'customer', label: 'Customer' },
  { id: 'library', file: 'library', label: 'Library' },
  { id: 'timeline', file: 'timeline', label: 'Timeline' },
  { id: 'compare', file: null, label: 'Compare',
    desc: 'Compare frontier teacher models against their distilled students on price, quality, latency, context and licence, using the data behind the whole site.' },
  { id: 'methodology', file: null, label: 'Methodology',
    desc: 'How this compendium is built: where every number comes from, what counts as a distilled model, how often each stream refreshes, and what it cannot tell you.' },
];

const NAV_IDS = ['overview', 'academic', 'financial', 'political', 'company',
  'developer', 'customer', 'library', 'timeline'];

const RAIL = {
  perspective: [
    ['overview', 'Overview', 'Key figures, one page'],
    ['academic', 'Academic', 'Papers, benchmarks, retention'],
    ['financial', 'Financial', 'Token prices, training cost'],
    ['political', 'Political', 'Regulation, export controls'],
    ['company', 'Company', 'Terms of service, disputes'],
    ['developer', 'Developer', 'Tooling, recipes, platforms'],
    ['customer', 'Customer', 'What to buy, at what price'],
  ],
  reference: [
    ['library', 'Library', 'Distillation methods explained'],
    ['timeline', 'Timeline', '2006 to today'],
    ['compare', 'Compare', 'Build your own comparison'],
  ],
};

/* ---------------------------------------------------------------- helpers */

const readData = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name + '.json'), 'utf8')); }
  catch { return null; }
};

// scripts/gen-schema.mjs owns the tags that vary per page — canonical, Open
// Graph, Twitter and JSON-LD — and index.html marks the block they occupy.
// Use it when it is there; fall back to the tags no page can do without.
let headMetaFor = null;
try { ({ headMetaFor } = await import('./gen-schema.mjs')); }
catch { headMetaFor = null; }

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const attr = (s) => esc(s).replace(/\n/g, ' ');

const urlFor = (id) => (id === 'overview' ? ORIGIN + '/' : ORIGIN + '/' + id);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** A figure, with thousands separators — except where the number is a year. */
function fmt(v, label) {
  if (v == null || v === '') return '—';
  if (!isNum(v)) return String(v);
  if (/year|release|date/i.test(label || '') && Number.isInteger(v) && v > 1000 && v < 3000) {
    return String(v);
  }
  const a = Math.abs(v);
  const dp = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 4;
  return Number(v.toFixed(dp)).toLocaleString('en-US');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** "4 September 2026" from an ISO date, degrading to the parts that are known. */
function longDate(iso) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const [, y, mo, d] = m;
  if (!mo) return y;
  const month = MONTHS[Number(mo) - 1] || '';
  return (d ? String(Number(d)) + ' ' : '') + month + ' ' + y;
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return String(url || ''); }
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

/** A meta description: whole sentences from the summary, under ~160 characters. */
function describe(text, max = 158) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(' — '));
  if (stop > 80) return s.slice(0, stop + 1).trim();
  return cut.slice(0, cut.lastIndexOf(' ')).trim() + '…';
}

/**
 * A title that survives a search result: the first clause of the file's own
 * title, then the site name. A result snippet truncates near 70 characters, so
 * where the clause is already that long the site name is dropped rather than
 * the subject.
 */
function titleFor(text) {
  const lead = String(text || '').split(/\s*[:—,]\s*/)[0].trim();
  const full = lead + ' — Global Distillation';
  if (full.length <= 70) return full;
  return lead.length <= 70 ? lead : lead.slice(0, 69).replace(/\s+\S*$/, '') + '…';
}

const linkList = (urls) => (urls || []).filter(Boolean).map((u) =>
  '<a href="' + attr(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a>').join(' · ');

const blockHead = (title, count, id) =>
  '<h2 class="subhead"' + (id ? ' id="' + attr(id) + '"' : '') + '>' + esc(title) +
  (count ? '<span class="dim"> · ' + esc(count) + '</span>' : '') + '</h2>';

/* ------------------------------------------------------------ content blocks */

function statsHtml(stats) {
  if (!stats || !stats.length) return '';
  const tile = (s) => {
    const value = fmt(s.value, s.label);
    const len = value.length > 12 ? ' data-len="xlong"' : value.length > 8 ? ' data-len="long"' : '';
    return '<div class="kpi"' + len + '>' +
      '<p class="kpi__label">' + esc(s.label) + '</p>' +
      '<p class="kpi__figure kpi__value">' + esc(value) +
      (s.unit ? ' <span class="kpi__unit">' + esc(s.unit) + '</span>' : '') + '</p>' +
      (s.delta ? '<p class="kpi__delta">' + esc(s.delta) + '</p>' : '') +
      (s.note ? '<p class="kpi__note">' + esc(s.note) + '</p>' : '') +
      (s.source ? '<p class="kpi__source"><a href="' + attr(s.source) + '" target="_blank" rel="noopener">' +
        esc(host(s.source)) + '</a></p>' : '') +
      '</div>';
  };
  return blockHead('Key figures', plural(stats.length, 'figure'), 'sec-figures') +
    '<div class="kpi-row" data-n="' + stats.length + '">' + stats.map(tile).join('') + '</div>';
}

function findingsHtml(list) {
  if (!list || !list.length) return '';
  return blockHead('Key findings', plural(list.length, 'finding'), 'sec-findings') +
    '<ol class="findings">' + list.map((f) =>
      '<li class="finding">' +
      '<h3 class="finding__title">' + esc(f.title) + '</h3>' +
      '<p class="finding__detail">' + esc(f.detail) + '</p>' +
      (f.sources && f.sources.length
        ? '<p class="finding__meta"><span>Sources</span> ' + linkList(f.sources) + '</p>' : '') +
      '</li>').join('') + '</ol>';
}

/**
 * A chart's numbers, as a table a reader without JavaScript (or a crawler) can
 * read: every series value under its own heading, with the unit in the caption.
 */
function chartDataTable(c) {
  const series = (c.series || []).filter((s) => s && Array.isArray(s.data));
  if (!series.length) return '';
  const unit = c.unit || c.yLabel || '';
  const xh = c.xLabel || 'x';
  const yh = c.yLabel || c.unit || 'Value';
  const labelled = series.some((s) => s.data.some((p) => p && (p.label || p.title)));
  // "Papers <papers>" reads as a mistake: only show the unit when it adds something.
  const unitTh = unit && unit.toLowerCase() !== String(yh).toLowerCase()
    ? ' <small>' + esc(unit) + '</small>' : '';

  let head = '';
  let body = '';
  if (labelled || series.length === 1) {
    const flat = [];
    for (const s of series) for (const p of s.data) flat.push({ name: s.name, p });
    const multi = series.length > 1;
    head = '<tr>' + (labelled ? '<th scope="col">Point</th>' : '') +
      (multi ? '<th scope="col">Series</th>' : '') +
      '<th scope="col">' + esc(xh) + '</th>' +
      '<th scope="col" class="num">' + esc(yh) + unitTh + '</th></tr>';
    body = flat.map(({ name, p }) =>
      '<tr>' +
      (labelled ? '<th scope="row">' + esc(p.label || p.title || name) + '</th>' : '') +
      (multi ? '<td>' + esc(name) + '</td>' : '') +
      '<td>' + esc(fmt(p.x, xh)) + '</td>' +
      '<td class="num">' + esc(fmt(p.y, yh)) + '</td></tr>').join('');
  } else {
    // One row per x value, one column per series.
    const xs = [];
    const seen = new Set();
    for (const s of series) for (const p of s.data) {
      const k = String(p.x);
      if (!seen.has(k)) { seen.add(k); xs.push(p.x); }
    }
    head = '<tr><th scope="col">' + esc(xh) + '</th>' + series.map((s) =>
      '<th scope="col" class="num">' + esc(s.name) + unitTh + '</th>').join('') + '</tr>';
    body = xs.map((x) => {
      const k = String(x);
      return '<tr><th scope="row">' + esc(fmt(x, xh)) + '</th>' + series.map((s) => {
        const p = s.data.find((q) => String(q.x) === k);
        return '<td class="num">' + esc(p ? fmt(p.y, yh) : '—') + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  const cap = 'The values plotted in “' + (c.title || 'this chart') + '”' +
    (unit ? ', in ' + unit : '') + '.';
  return '<div class="table-wrap table-wrap--auto" tabindex="0" role="region" aria-label="' +
    attr('Data behind ' + (c.title || 'this chart')) + '">' +
    '<table class="table table--data"><caption>' + esc(cap) + '</caption>' +
    '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
}

function chartHtml(c) {
  return '<div class="panel" id="' + attr('chart-' + (c.id || '')) + '">' +
    '<div class="panel__head"><h3 class="panel__title">' + esc(c.title) + '</h3>' +
    (c.unit ? '<span class="panel__unit">' + esc(c.unit) + '</span>' : '') + '</div>' +
    '<div class="panel__body panel__body--flush">' + chartDataTable(c) + '</div>' +
    (c.notes ? '<p class="panel__note">' + esc(c.notes) + '</p>' : '') +
    (c.sources && c.sources.length
      ? '<p class="panel__sources">Sources: ' + linkList(c.sources) + '</p>' : '') +
    '</div>';
}

function tableHtml(t) {
  const cols = t.columns || [];
  const units = cols.filter((c) => c.unit).map((c) => c.label + ' in ' + c.unit);
  const cap = [t.title, t.description, units.length ? 'Units: ' + units.join('; ') + '.' : '']
    .filter(Boolean).join(' — ');
  const head = '<tr>' + cols.map((c) =>
    '<th scope="col"' + (c.type === 'number' ? ' class="num"' : '') + '>' + esc(c.label) +
    (c.unit ? ' <small class="th__unit">' + esc(c.unit) + '</small>' : '') + '</th>').join('') + '</tr>';
  const body = (t.rows || []).map((r) => '<tr>' + cols.map((c, i) => {
    const v = r[c.key];
    const cell = c.type === 'number' ? fmt(v, c.label + ' ' + c.key) : (v == null || v === '' ? '—' : String(v));
    const inner = esc(cell) + (i === cols.length - 1 && r._source
      ? ' <a class="table__source" href="' + attr(r._source) + '" target="_blank" rel="noopener">' +
        esc(host(r._source)) + '</a>' : '');
    return i === 0
      ? '<th scope="row">' + inner + '</th>'
      : '<td' + (c.type === 'number' ? ' class="num"' : '') + '>' + inner + '</td>';
  }).join('') + '</tr>').join('');

  return '<div class="panel" id="' + attr('table-' + (t.id || '')) + '">' +
    '<div class="panel__head"><h3 class="panel__title">' + esc(t.title) + '</h3>' +
    '<span class="panel__unit">' + esc(plural((t.rows || []).length, 'row')) + '</span></div>' +
    '<div class="panel__body panel__body--flush">' +
    '<div class="table-wrap table-wrap--auto" tabindex="0" role="region" aria-label="' +
    attr(t.title + ', scrollable table') + '">' +
    '<table class="table"><caption>' + esc(cap) + '</caption>' +
    '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>' +
    (t.notes ? '<p class="panel__note">' + esc(t.notes) + '</p>' : '') +
    (t.sources && t.sources.length
      ? '<p class="panel__sources">Sources: ' + linkList(t.sources) + '</p>' : '') +
    '</div>';
}

function timelineHtml(events) {
  if (!events || !events.length) return '';
  const sorted = events.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return blockHead('Timeline', plural(sorted.length, 'event'), 'sec-timeline') +
    '<ol class="timeline">' + sorted.map((e) => {
      const cat = e.category || 'other';
      return '<li class="timeline__item cat--' + esc(cat) + '" data-cat="' + esc(cat) + '">' +
        '<span class="timeline__dot" aria-hidden="true"></span>' +
        '<div class="timeline__body">' +
        '<p class="timeline__meta">' +
        '<time class="timeline__date" datetime="' + attr(e.date) + '">' + esc(longDate(e.date)) + '</time> ' +
        '<span class="timeline__cat">' + esc(cat) + '</span></p>' +
        '<h3 class="timeline__title">' + esc(e.title) + '</h3>' +
        (e.detail ? '<p class="timeline__detail">' + esc(e.detail) + '</p>' : '') +
        (e.source ? '<a class="timeline__source" href="' + attr(e.source) + '" target="_blank" rel="noopener">' +
          'Source: ' + esc(host(e.source)) + '</a>' : '') +
        '</div></li>';
    }).join('') + '</ol>';
}

function glossaryHtml(items) {
  if (!items || !items.length) return '';
  return blockHead('Glossary', plural(items.length, 'term'), 'sec-glossary') +
    '<dl class="glossary">' + items.map((g) =>
      '<div><dt>' + esc(g.term) + '</dt><dd>' + esc(g.definition) + '</dd></div>').join('') + '</dl>';
}

function sourcesHtml(list, updated) {
  if (!list || !list.length) return '';
  return blockHead('Sources', plural(list.length, 'source'), 'sec-sources') +
    '<p class="note note--lede">Every figure on this page comes from one of these primary sources.' +
    (updated ? ' Compiled ' + esc(longDate(updated)) + '.' : '') + '</p>' +
    '<ol class="sources">' + list.map((s) =>
      '<li class="source">' +
      '<span class="source__body">' +
      '<span class="source__title"><a href="' + attr(s.url) + '" target="_blank" rel="noopener">' +
      esc(s.title || host(s.url)) + '</a></span>' +
      '<span class="source__meta">' + esc(s.publisher || host(s.url)) +
      (s.date ? ' · ' + esc(longDate(s.date)) : '') +
      (s.type ? ' · ' + esc(s.type) : '') + '</span></span></li>').join('') + '</ol>';
}

/** The library's methods are that page's subject, so they are prose too. */
function methodsHtml(methods) {
  if (!methods || !methods.length) return '';
  return blockHead('Method library', plural(methods.length, 'method'), 'sec-methods') +
    '<div class="method-list">' + methods.map((m) =>
      '<article class="panel" id="' + attr('method-' + m.id) + '">' +
      '<div class="panel__head"><h3 class="panel__title">' + esc(m.name) + '</h3>' +
      '<span class="panel__unit">' + esc(m.family || '') + (m.year ? ' · ' + esc(m.year) : '') +
      '</span></div>' +
      '<div class="panel__body">' +
      '<p>' + esc(m.description) + '</p>' +
      (m.whenToUse ? '<p><strong>When to use it.</strong> ' + esc(m.whenToUse) + '</p>' : '') +
      '<dl class="glossary">' +
      (m.difficulty ? '<div><dt>Difficulty</dt><dd>' + esc(m.difficulty) + ' of 5</dd></div>' : '') +
      (m.teacherAccess ? '<div><dt>Teacher access</dt><dd>' + esc(m.teacherAccess) + '</dd></div>' : '') +
      (m.dataNeeded ? '<div><dt>Data needed</dt><dd>' + esc(m.dataNeeded) + '</dd></div>' : '') +
      (m.tools && m.tools.length ? '<div><dt>Tools</dt><dd>' + esc(m.tools.join(', ')) + '</dd></div>' : '') +
      (m.examples && m.examples.length
        ? '<div><dt>Examples</dt><dd>' + esc(m.examples.join(', ')) + '</dd></div>' : '') +
      (m.pros && m.pros.length ? '<div><dt>Strengths</dt><dd>' + esc(m.pros.join('; ')) + '</dd></div>' : '') +
      (m.cons && m.cons.length ? '<div><dt>Limits</dt><dd>' + esc(m.cons.join('; ')) + '</dd></div>' : '') +
      '</dl></div>' +
      (m.url ? '<p class="panel__sources">Paper: <a href="' + attr(m.url) + '" target="_blank" rel="noopener">' +
        esc(m.paper || m.url) + '</a></p>' : '') +
      '</article>').join('') + '</div>';
}

/* ------------------------------------------------------------ route bodies */

function sectionHead(route, d) {
  const meta = [route.label, d.updated ? 'compiled ' + longDate(d.updated) : '',
    d.sources ? plural(d.sources.length, 'source') : ''].filter(Boolean).join(' · ');
  return '<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>' + esc(meta) + '</p>' +
    '<h1 class="section__title">' + esc(d.title) + '</h1>' +
    '<p class="section__standfirst">' + esc(d.summary) + '</p>' +
    '</div></header>';
}

/** A data-backed perspective, in document order. */
function perspectiveBody(route, d) {
  const charts = d.charts || [];
  const tables = d.tables || [];
  return '<section class="section" data-perspective="' + esc(route.id) + '">' +
    sectionHead(route, d) +
    statsHtml(d.stats) +
    findingsHtml(d.keyFindings) +
    (route.id === 'library' ? methodsHtml(d.extras && d.extras.methods) : '') +
    (charts.length
      ? blockHead('Charts', plural(charts.length, 'chart'), 'sec-charts') +
        '<div class="panel-stack">' + charts.map(chartHtml).join('') + '</div>' : '') +
    (tables.length
      ? blockHead('Tables', plural(tables.length, 'table'), 'sec-tables') +
        '<div class="panel-stack">' + tables.map(tableHtml).join('') + '</div>' : '') +
    timelineHtml(d.timeline) +
    glossaryHtml(d.glossary) +
    sourcesHtml(d.sources, d.updated) +
    '</section>';
}

/** The front page: one headline figure per perspective, then the way in. */
/**
 * The live-signals panel, as tables a crawler can read. This is the one block
 * on the overview whose numbers appear nowhere else on the site, so without it
 * the front page has no tabular data at all. Every row comes straight out of
 * data/live.json — nothing here is derived or rounded.
 */
function liveSignalsHtml(live) {
  if (!live) return '';
  const stamp = String(live.updated || '').slice(0, 10);
  const src = (u) => [u, ORIGIN + '/data/live.json'];
  const panels = [];

  if (live.arxiv && Array.isArray(live.arxiv.perYear) && live.arxiv.perYear.length) {
    panels.push(tableHtml({
      id: 'live-arxiv',
      title: 'arXiv preprints matching “knowledge distillation”, per year',
      description: 'Counted by the arXiv API on ' + longDate(stamp) + '. The current year is incomplete.',
      columns: [
        { key: 'year', label: 'Year', type: 'text' },
        { key: 'count', label: 'Preprints', type: 'number', unit: 'papers' },
      ],
      rows: live.arxiv.perYear.map((y) => ({ year: String(y.year), count: y.count })),
      notes: 'All time: ' + fmt(live.arxiv.totalKD, 'papers') + ' preprints; last 30 days: ' +
        fmt(live.arxiv.last30d, 'papers') + '. A paper count measures attention, not quality.',
      sources: src('https://info.arxiv.org/help/api/user-manual.html'),
    }));
  }

  const tracked = live.huggingface && live.huggingface.tracked;
  if (Array.isArray(tracked) && tracked.length) {
    panels.push(tableHtml({
      id: 'live-huggingface',
      title: 'Tracked distilled models on Hugging Face',
      description: 'Downloads over the 30 days to ' + longDate(stamp) + ', for a fixed watchlist.',
      columns: [
        { key: 'id', label: 'Model', type: 'text' },
        { key: 'downloads', label: 'Downloads', type: 'number', unit: 'downloads, 30 days' },
        { key: 'likes', label: 'Likes', type: 'number', unit: 'likes' },
      ],
      rows: tracked.map((m) => ({ id: m.id, downloads: m.downloads, likes: m.likes, _source: m.url })),
      notes: live.huggingface.distillModels != null
        ? fmt(live.huggingface.distillModels, 'models') + ' models on the Hub match “distill”.' : '',
      sources: src('https://huggingface.co/docs/hub/api'),
    }));
  }

  const repos = live.github && live.github.repos;
  if (Array.isArray(repos) && repos.length) {
    panels.push(tableHtml({
      id: 'live-github',
      title: 'Distillation tooling on GitHub',
      description: 'Star and fork counts read from the GitHub API on ' + longDate(stamp) + '.',
      columns: [
        { key: 'repo', label: 'Repository', type: 'text' },
        { key: 'stars', label: 'Stars', type: 'number', unit: 'stars' },
        { key: 'forks', label: 'Forks', type: 'number', unit: 'forks' },
      ],
      rows: repos.map((r) => ({ repo: r.repo, stars: r.stars, forks: r.forks, _source: r.url })),
      notes: 'Stars measure attention, not adoption.',
      sources: src('https://docs.github.com/en/rest/repos/repos'),
    }));
  }

  const news = (live.news && live.news.items) || [];
  const newsHtml = news.length
    ? '<div class="panel" id="live-news"><div class="panel__head">' +
      '<h3 class="panel__title">Recent items</h3>' +
      '<span class="panel__unit">' + esc(plural(Math.min(news.length, 8), 'item')) + '</span></div>' +
      '<div class="panel__body"><ul class="sources">' + news.slice(0, 8).map((n) =>
        '<li class="source"><span class="source__body">' +
        '<span class="source__title"><a href="' + attr(n.url) + '" target="_blank" rel="noopener">' +
        esc(n.title) + '</a></span><span class="source__meta">' +
        esc([n.source, n.date ? longDate(String(n.date).slice(0, 10)) : ''].filter(Boolean).join(' · ')) +
        '</span></span></li>').join('') + '</ul></div>' +
      '<p class="panel__note">Items are listed as published, never summarised into a claim.</p></div>'
    : '';

  if (!panels.length && !newsHtml) return '';
  return blockHead('Live signals', 'refreshed ' + longDate(stamp), 'sec-live') +
    '<div class="panel-stack">' + panels.join('') + newsHtml + '</div>';
}

function overviewBody(all, live) {
  const cards = ROUTES.filter((r) => r.file).map((r) => {
    const d = all[r.file];
    if (!d) return '';
    return '<li class="card"><p class="card__eyebrow">' + esc(r.label) + '</p>' +
      '<h3 class="card__title"><a href="/' + esc(r.id) + '">' + esc(d.title) + '</a></h3>' +
      '<p class="card__desc">' + esc(describe(d.summary, 260)) + '</p>' +
      '<p class="card__more">' + esc([plural((d.stats || []).length, 'figure'),
        plural((d.tables || []).length, 'table'),
        plural((d.charts || []).length, 'chart'),
        plural((d.sources || []).length, 'source')].join(' · ')) + '</p></li>';
  }).join('');

  const kpis = ROUTES.filter((r) => r.file)
    .map((r) => (all[r.file] && all[r.file].stats && all[r.file].stats[0]) || null)
    .filter(Boolean);

  const tl = all.timeline && all.timeline.timeline
    ? all.timeline.timeline.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8)
    : [];

  const totalSources = Object.values(all).reduce((n, d) => n + ((d && d.sources && d.sources.length) || 0), 0);

  return '<section class="section" data-perspective="overview">' +
    '<h2 class="subhead" id="sec-figures">Key figures<span class="dim"> · one per perspective</span></h2>' +
    '<div class="kpi-row" data-n="' + kpis.length + '">' + kpis.map((s) =>
      '<div class="kpi"><p class="kpi__label">' + esc(s.label) + '</p>' +
      '<p class="kpi__figure kpi__value">' + esc(fmt(s.value, s.label)) +
      (s.unit ? ' <span class="kpi__unit">' + esc(s.unit) + '</span>' : '') + '</p>' +
      (s.note ? '<p class="kpi__note">' + esc(s.note) + '</p>' : '') +
      (s.source ? '<p class="kpi__source"><a href="' + attr(s.source) + '" target="_blank" rel="noopener">' +
        esc(host(s.source)) + '</a></p>' : '') + '</div>').join('') + '</div>' +
    blockHead('The perspectives', plural(ROUTES.filter((r) => r.file).length, 'section')) +
    '<ul class="card-grid">' + cards + '</ul>' +
    liveSignalsHtml(live) +
    (tl.length ? blockHead('Latest events', 'most recent ' + tl.length) +
      timelineListOnly(tl) : '') +
    blockHead('The data behind every figure', plural(totalSources, 'catalogued source')) +
    '<ul class="sources">' + ROUTES.filter((r) => r.file).map((r) =>
      '<li class="source"><span class="source__body">' +
      '<span class="source__title"><a href="/data/' + esc(r.file) + '.json">data/' + esc(r.file) + '.json</a></span>' +
      '<span class="source__meta">' + esc(r.label) +
      (all[r.file] ? ' · compiled ' + esc(longDate(all[r.file].updated)) +
        ' · ' + esc(plural((all[r.file].sources || []).length, 'source')) : '') +
      '</span></span></li>').join('') + '</ul>' +
    '</section>';
}

function timelineListOnly(events) {
  return '<ol class="timeline">' + events.map((e) => {
    const cat = e.category || 'other';
    return '<li class="timeline__item cat--' + esc(cat) + '" data-cat="' + esc(cat) + '">' +
      '<span class="timeline__dot" aria-hidden="true"></span>' +
      '<div class="timeline__body">' +
      '<p class="timeline__meta"><time class="timeline__date" datetime="' + attr(e.date) + '">' +
      esc(longDate(e.date)) + '</time> <span class="timeline__cat">' + esc(cat) + '</span></p>' +
      '<h3 class="timeline__title">' + esc(e.title) + '</h3>' +
      (e.detail ? '<p class="timeline__detail">' + esc(e.detail) + '</p>' : '') +
      (e.source ? '<a class="timeline__source" href="' + attr(e.source) + '" target="_blank" rel="noopener">' +
        'Source: ' + esc(host(e.source)) + '</a>' : '') +
      '</div></li>';
  }).join('') + '</ol>';
}

/** Compare: the specification table the interactive builder is built from. */
function compareBody(all) {
  const customer = all.customer;
  const models = (customer && customer.extras && customer.extras.models) || [];
  const pricing = (all.financial && all.financial.extras && all.financial.extras.pricing) || [];

  const modelTable = models.length ? {
    id: 'compare-models',
    title: 'Every model in the comparison set',
    description: 'Teachers and their distilled students, on the specifications the builder compares.',
    columns: [
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'vendor', label: 'Vendor', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'distilled', label: 'Distilled', type: 'text' },
      { key: 'teacher', label: 'Teacher', type: 'text' },
      { key: 'input_per_mtok_usd', label: 'Input price', type: 'number', unit: 'USD per million tokens' },
      { key: 'output_per_mtok_usd', label: 'Output price', type: 'number', unit: 'USD per million tokens' },
      { key: 'gpqa', label: 'GPQA', type: 'number', unit: '%' },
      { key: 'latency_ttft_ms', label: 'Time to first token', type: 'number', unit: 'ms' },
      { key: 'contextK', label: 'Context', type: 'number', unit: 'thousand tokens' },
      { key: 'license', label: 'Licence', type: 'text' },
    ],
    rows: models.map((m) => ({ ...m, distilled: m.isDistilled ? 'yes' : 'no' })),
    notes: 'List prices for the standard tier on the date each row was compiled; batch and cache discounts excluded.',
    sources: [],
  } : null;

  const priceTable = pricing.length ? {
    id: 'compare-pricing',
    title: 'Published token prices by tier',
    description: 'Frontier, distilled and open-weight tiers, as listed by each vendor.',
    columns: [
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'vendor', label: 'Vendor', type: 'text' },
      { key: 'tier', label: 'Tier', type: 'text' },
      { key: 'input_per_mtok_usd', label: 'Input price', type: 'number', unit: 'USD per million tokens' },
      { key: 'output_per_mtok_usd', label: 'Output price', type: 'number', unit: 'USD per million tokens' },
      { key: 'params_b', label: 'Parameters', type: 'number', unit: 'billions' },
      { key: 'release', label: 'Released', type: 'text' },
    ],
    rows: pricing,
    notes: 'Prices are list prices in US dollars per million tokens.',
    sources: [],
  } : null;

  return '<section class="section" data-perspective="compare">' +
    '<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>Compare · ' +
    esc(plural(models.length, 'model')) + ' · ' + esc(plural(pricing.length, 'listed price')) + '</p>' +
    '<h1 class="section__title">Compare teachers and their distilled students</h1>' +
    '<p class="section__standfirst">Pick two to four models and the interactive builder puts them side by side on ' +
    'quality, price, latency, context and licence. Every specification it uses is in the tables below, so the ' +
    'comparison can be made by hand, or downloaded as JSON, without running the page.</p>' +
    '</div></header>' +
    '<div class="panel-stack">' +
    (modelTable ? tableHtml(modelTable) : '') +
    (priceTable ? tableHtml(priceTable) : '') +
    '</div>' +
    (customer ? sourcesHtml(customer.sources, customer.updated) : '') +
    '</section>';
}

/** Methodology: the same account the app renders, from the same file inventory. */
function methodologyBody(all) {
  const files = [
    ['academic', 'Papers, benchmark retention, reproductions'],
    ['financial', 'Token prices, training-run costs, market events'],
    ['political', 'Statutes, memoranda, export controls, disputes'],
    ['company', 'Corporate stance, products, terms of service'],
    ['developer', 'Libraries, platforms, GPU budgets, recipes'],
    ['customer', 'Buying guidance, model specifications'],
    ['library', 'Distillation methods, formulas, trade-offs'],
    ['timeline', 'Every dated event, 2006 to today'],
  ];
  const published = files.filter(([k]) => all[k]).length;
  const totalSources = files.reduce((n, [k]) => n + ((all[k] && all[k].sources && all[k].sources.length) || 0), 0);

  const fileTable = {
    id: 'methodology-files',
    title: 'What each data file contains',
    description: 'One JSON file per perspective, validated against data/SCHEMA.md before it is served.',
    columns: [
      { key: 'file', label: 'File', type: 'text' },
      { key: 'contains', label: 'Contains', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'sources', label: 'Sources', type: 'number', unit: 'sources' },
      { key: 'updated', label: 'Compiled', type: 'text' },
    ],
    rows: files.map(([k, contains]) => ({
      file: 'data/' + k + '.json',
      contains,
      status: all[k] ? 'published' : 'in preparation',
      sources: (all[k] && all[k].sources && all[k].sources.length) || 0,
      updated: all[k] ? longDate(all[k].updated) : '—',
    })),
    notes: 'Counts are of catalogued primary sources, not of citations: one source is often cited by several figures.',
    sources: [ORIGIN + '/data/SCHEMA.md'],
  };

  const classTable = {
    id: 'methodology-classification',
    title: 'How a model is classified as distilled',
    description: 'Three levels of evidence. A model is never moved up a level by inference.',
    columns: [
      { key: 'level', label: 'Level', type: 'text' },
      { key: 'test', label: 'What it takes', type: 'text' },
      { key: 'shown', label: 'Shown as', type: 'text' },
    ],
    rows: [
      { level: 'Stated', test: 'The vendor says so in a technical report, model card or launch post.', shown: 'distilled' },
      { level: 'Documented method', test: 'A paper or repository describes the exact procedure and the teacher, even if the vendor avoids the word.', shown: 'distilled (method)' },
      { level: 'Undisclosed', test: 'A small tier is widely assumed to be distilled but the vendor has never said and no paper describes it.', shown: 'undisclosed' },
    ],
    notes: 'The third level is deliberately not counted in any figure on this site.',
    sources: [],
  };

  const cadence = {
    id: 'methodology-cadence',
    title: 'Update cadence',
    description: 'What changes daily, and what changes when the research is redone.',
    columns: [
      { key: 'stream', label: 'Data stream', type: 'text' },
      { key: 'cadence', label: 'Cadence', type: 'text' },
      { key: 'method', label: 'How it is collected', type: 'text' },
    ],
    rows: [
      { stream: 'arXiv paper counts and new preprints', cadence: 'Daily, 06:17 UTC', method: 'arXiv API query for knowledge distillation, counted per year and for the last 30 days.' },
      { stream: 'Hugging Face downloads', cadence: 'Daily, 06:17 UTC', method: 'Hub API, 30-day download totals for a fixed watchlist.' },
      { stream: 'Repository stars', cadence: 'Daily, 06:17 UTC', method: 'GitHub API for the training, serving and evaluation repositories used in distillation work.' },
      { stream: 'News and Hacker News items', cadence: 'Daily, 06:17 UTC', method: 'Search of Hacker News and named outlets; items are listed, never summarised into a claim.' },
      { stream: 'Perspective research files', cadence: 'On revision', method: 'Rewritten end to end when a perspective is revisited; each file carries its own compiled date.' },
      { stream: 'Prices and terms of service', cadence: 'On revision, checked against the vendor page', method: 'List prices for the standard tier on the date given in the row; batch and cache discounts excluded.' },
    ],
    notes: 'A figure is never carried forward silently. If a stream fails, the panel says so rather than showing yesterday’s number.',
    sources: [
      'https://info.arxiv.org/help/api/user-manual.html',
      'https://huggingface.co/docs/hub/api',
      'https://docs.github.com/en/rest/repos/repos',
      'https://hn.algolia.com/api',
    ],
  };

  const para = (title, body) => '<div class="prose__block"><h2 class="prose__head">' + esc(title) + '</h2>' +
    body.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>';

  return '<section class="section" data-perspective="methodology">' +
    '<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>Methodology · ' + published + ' of ' +
    files.length + ' files published · ' + totalSources + ' catalogued sources</p>' +
    '<h1 class="section__title">How this compendium is built</h1>' +
    '<p class="section__standfirst">Every figure on this site comes from a primary source that you can open in ' +
    'one click. Figures that could not be verified are written as undisclosed rather than estimated.</p>' +
    '</div></header>' +
    '<div class="prose">' +
    para('What this is', [
      'Global Distillation is a compendium of one technique: training a small student model on the behaviour of a large teacher. The same technique is a research method, a product line, a pricing strategy, a contract term and, since 2025, an accusation. Each of those readings gets its own section, built from the same catalogue of sources.',
      'The site is static. Perspective research is written into JSON files that follow a published schema; the browser fetches them and renders every table and chart from the same data a reader can download. There is no server-side model, no summarisation step between the source and the figure, and no number that exists only in a chart.',
    ]) +
    para('Where the numbers come from', [
      'Sources are ranked in this order: the paper or technical report; the vendor’s own model card, pricing page or terms of service; a filing, statute or official memorandum; then reporting by a named outlet. A claim that exists only in reporting is attributed to whoever made it, in the text, not presented as fact.',
      'Prices are list prices for the standard tier on the date shown, in US dollars per million tokens, excluding batch, cache and volume discounts, because those vary by contract. Benchmark scores are the figures the model’s own authors published, which is a real limitation: labs choose their comparisons. Where an independent reproduction exists, both are shown.',
      'Download counts, star counts and paper counts are activity measures collected from public APIs. They measure attention, not quality, and they are labelled that way wherever they appear.',
    ]) +
    para('What this method cannot tell you', [
      'Three of the most interesting questions are unanswerable from public evidence, and this site does not pretend otherwise: whether a given closed small model was distilled, what a training run really cost, and whether a particular model was trained on a competitor’s outputs. Evidence offered in public disputes is circumstantial and is reported here as a claim by a named party, with its rebuttal.',
      'Benchmark retention percentages compare a student against its own teacher on one benchmark. They do not transfer across benchmarks, and they say nothing about robustness, long-context behaviour, or how a model degrades outside the distribution it was distilled on.',
    ]) +
    '</div>' +
    '<div class="panel-stack">' + tableHtml(classTable) + tableHtml(cadence) + tableHtml(fileTable) + '</div>' +
    blockHead('Sources for this page', plural(files.length + 4, 'endpoint'), 'sec-sources') +
    '<ul class="sources">' +
    files.filter(([k]) => all[k]).map(([k, contains]) =>
      '<li class="source"><span class="source__body">' +
      '<span class="source__title"><a href="' + attr(ORIGIN + '/data/' + k + '.json') + '">data/' + esc(k) +
      '.json</a></span><span class="source__meta">' + esc(contains) +
      ' · ' + esc(plural((all[k].sources || []).length, 'catalogued source')) + '</span></span></li>').join('') +
    [['data/SCHEMA.md', ORIGIN + '/data/SCHEMA.md', 'The schema every data file is validated against'],
      ['data/live.json', ORIGIN + '/data/live.json', 'The daily signals feed, refreshed 06:17 UTC'],
      ['Source repository', 'https://github.com/alessoh/global-distillation',
        'Every generator that builds this site, including scripts/prerender.mjs'],
      ['Licence', ORIGIN + '/LICENSE', 'MIT — free to quote, excerpt and redistribute with attribution']]
      .map(([label, url, meta]) =>
        '<li class="source"><span class="source__body">' +
        '<span class="source__title"><a href="' + attr(url) + '">' + esc(label) + '</a></span>' +
        '<span class="source__meta">' + esc(meta) + '</span></span></li>').join('') +
    '</ul>' +
    '</section>';
}

/* ------------------------------------------------------------------ shell */

/**
 * A replacement that has to land. The shell is written and owned elsewhere, so
 * a page that quietly lost its static body would be worse than a failed build.
 */
function swap(html, needle, replacement, what) {
  if (!html.includes(needle)) {
    throw new Error('index.html no longer contains ' + what +
      '; scripts/prerender.mjs needs updating to match the shell');
  }
  return html.replace(needle, replacement);
}

const META_START = '<!-- per-page-meta:start';
const META_END = '<!-- per-page-meta:end -->';

// Vercel serves index.html at /, and a rewrite would not change that: vercel.json
// rewrites are only consulted when no file matches, and index.html always does.
// So the home page — the canonical URL for the overview, and the one an answer
// engine cites — can only become crawlable by carrying the overview as real HTML.
// It is written between these markers, and stripped back out before the shell is
// used, so index.html is never its own input twice and the build stays idempotent.
const BODY_START = '<!-- prerendered-body:start (written by scripts/prerender.mjs) -->';
const BODY_END = '<!-- prerendered-body:end -->';
const VIEW_EMPTY = '<div id="view" class="view" aria-live="polite"></div>';

/** index.html with any previously injected body removed: the shell as authored. */
function cleanShell(html) {
  const a = html.indexOf(BODY_START);
  const b = html.indexOf(BODY_END);
  if (a < 0 || b < 0) return html;
  return html.slice(0, a) + html.slice(b + BODY_END.length);
}

/**
 * Swap the block index.html marks as varying per page. Appending instead would
 * leave two canonicals and two og:urls on the page, which cancel each other
 * out — the marker comment in index.html says so, and it is right.
 */
function replaceHeadMeta(html, route, all, title, desc, url) {
  // gen-schema.mjs keys the overview off an empty id and does not know the
  // methodology route, which the hash router serves but ROUTES omits.
  const schemaRoute = route.id === 'overview' ? ''
    : route.id === 'methodology'
      ? { id: 'methodology', file: null, name: 'Methodology', sub: route.desc }
      : route.id;

  const tags = headMetaFor
    ? headMetaFor(schemaRoute, all, { title, description: desc })
    : [
      '<link rel="canonical" href="' + url + '">',
      '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">',
      '<meta property="og:url" content="' + url + '">',
      '<meta property="og:site_name" content="Global Distillation">',
      '<meta property="og:image" content="' + ORIGIN + '/assets/og.png">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="' + attr(title) + '">',
      '<meta name="twitter:description" content="' + attr(desc) + '">',
      '<meta name="twitter:image" content="' + ORIGIN + '/assets/og.png">',
    ].join('\n');

  const block = META_START + ' (written by scripts/prerender.mjs) -->\n' + tags + '\n' + META_END;
  const a = html.indexOf(META_START);
  const b = html.indexOf(META_END);
  if (a < 0 || b < 0) {
    // No markers: the shell has no per-page tags of its own to displace.
    return html.replace('</head>', tags + '\n</head>');
  }
  return html.slice(0, a) + block + html.slice(b + META_END.length);
}

/**
 * The generated page is the app shell with the static document inside #view.
 * Asset URLs are made root-absolute so the page works at /route and /route/
 * alike, and the hash router is pointed at this route before app.js boots.
 */
function pageFor(route, all, shell, live) {
  const d = route.file ? all[route.file] : null;
  const title = d
    ? titleFor(d.title)
    : (route.id === 'overview'
      ? 'Global Distillation — a compendium of AI model distillation'
      : route.label + ' — Global Distillation');
  // Every description goes through describe(): a search snippet truncates near 160
  // characters, and a route's own copy must not be exempt from that.
  const desc = describe(d ? d.summary : route.desc);
  const url = urlFor(route.id);

  let html = shell;

  // ---- head ---------------------------------------------------------------
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>')
    .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="' + attr(desc) + '">')
    .replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="' + attr(title) + '">')
    .replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="' + attr(desc) + '">');
  html = replaceHeadMeta(html, route, all, title, desc, url);

  // ---- root-absolute assets ----------------------------------------------
  html = html
    .replace(/(href|src)="(assets|vendor)\//g, '$1="/$2/')
    .replace(/"\.\/vendor\//g, '"/vendor/');

  // ---- navigation that works without JavaScript ---------------------------
  // app.js rebuilds all three lists on boot; these are the crawlable copy.
  html = html.replace('<nav class="nav__links" id="nav-links" aria-label="Perspectives"></nav>',
    '<nav class="nav__links" id="nav-links" aria-label="Perspectives">' +
    NAV_IDS.map((id) => {
      const r = ROUTES.find((x) => x.id === id);
      return '<a class="nav__link" href="/' + r.id + '"' +
        (r.id === route.id ? ' aria-current="page"' : '') + '>' + esc(r.label) + '</a>';
    }).join('') + '</nav>');

  const railList = (group, offset) => RAIL[group].map(([id, label, sub], i) =>
    '<li><a class="rail__item" href="/' + id + '"' + (id === route.id ? ' aria-current="page"' : '') + '>' +
    '<span class="rail__num">' + String(i + offset).padStart(2, '0') + '</span>' +
    '<span class="rail__text"><span class="rail__name">' + esc(label) + '</span>' +
    '<span class="rail__sub">' + esc(sub) + '</span></span></a></li>').join('');
  html = html
    .replace('<ul class="rail__list" id="rail-list"></ul>',
      '<ul class="rail__list" id="rail-list">' + railList('perspective', 0) + '</ul>')
    .replace('<ul class="rail__list" id="rail-list-ref"></ul>',
      '<ul class="rail__list" id="rail-list-ref">' + railList('reference', 7) + '</ul>');

  // ---- the hero belongs to the overview only ------------------------------
  // The element itself has to stay: app.js hides and shows it by id, and
  // hero.js mounts into its canvas when the reader navigates to the overview.
  // Its h1 does not — every other page has an h1 of its own, and a page must
  // not ship two, one of them hidden. .hero__title is a class rule, so the
  // demoted paragraph looks identical if the reader does navigate here.
  if (route.id !== 'overview') {
    html = html
      .replace('<section class="hero" id="hero" data-route="overview">',
        '<section class="hero" id="hero" data-route="overview" hidden>')
      .replace(/<h1 class="hero__title">([\s\S]*?)<\/h1>/,
        '<p class="hero__title">$1</p>');
  }

  // ---- the static document ------------------------------------------------
  const body = route.id === 'overview' ? overviewBody(all, live)
    : route.id === 'compare' ? compareBody(all)
      : route.id === 'methodology' ? methodologyBody(all)
        : perspectiveBody(route, d);
  html = swap(html, '<div id="view" class="view" aria-live="polite"></div>',
    '<div id="view" class="view" aria-live="polite">' + body + '</div>',
    'the empty #view container the app renders into');

  // ---- boot the app on this route ----------------------------------------
  // Classic inline script: it runs before the deferred module, so app.js reads
  // the hash this sets and renders the live view over the static copy.
  const boot = '<script>(function(){if(!location.hash){try{history.replaceState(null,"",' +
    'location.pathname+location.search+"#/' + route.id + '");}catch(e){location.hash="#/' +
    route.id + '";}}})();</script>\n';
  html = swap(html, '<script src="/vendor/echarts.min.js"></script>',
    boot + '<script src="/vendor/echarts.min.js"></script>',
    'the vendor script tags the boot script has to run before');

  return html;
}

/* ------------------------------------------------------------------- main */

function main() {
  const shellFile = path.join(ROOT, 'index.html');
  const shell = cleanShell(fs.readFileSync(shellFile, 'utf8'));
  const live = readData('live');
  const all = {};
  for (const r of ROUTES) if (r.file) { const d = readData(r.file); if (d) all[r.file] = d; }

  const written = [];
  for (const route of ROUTES) {
    if (route.file && !all[route.file]) {
      console.warn('skipped ' + route.id + ': data/' + route.file + '.json is missing');
      continue;
    }
    const dir = path.join(ROOT, route.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'index.html');
    const html = pageFor(route, all, shell, live);
    fs.writeFileSync(file, html, 'utf8');
    written.push([route.id + '/index.html', html.length]);
  }

  /* ---------------------------------------------------- the home page */
  // Only the head is owned elsewhere (gen-schema.mjs writes the marked block in
  // it); this touches nothing but the inside of #view.
  const rootHtml = swap(shell, VIEW_EMPTY,
    '<div id="view" class="view" aria-live="polite">' + BODY_START +
    overviewBody(all, live) + BODY_END + '</div>',
    'the empty #view container the app renders into');
  fs.writeFileSync(shellFile, rootHtml, 'utf8');
  written.push(['index.html', rootHtml.length]);

  /* ------------------------------------------------------------- sitemap */
  const newest = [...Object.values(all).map((d) => String(d.updated || '').slice(0, 10)),
    String((live && live.updated) || '').slice(0, 10)]
    .filter(Boolean).sort().pop() || new Date().toISOString().slice(0, 10);

  // The overview lives at the root, so / is listed and /overview canonicalises
  // to it rather than competing with it.
  const entries = [{ loc: ORIGIN + '/', lastmod: newest, freq: 'daily', pri: '1.0' }];
  for (const r of ROUTES) {
    if (r.id === 'overview') continue;
    const d = r.file ? all[r.file] : null;
    if (r.file && !d) continue;
    entries.push({
      loc: urlFor(r.id),
      lastmod: (d && String(d.updated).slice(0, 10)) || newest,
      freq: r.file ? 'daily' : 'weekly',
      pri: ['library', 'customer', 'financial'].includes(r.id) ? '0.9'
        : ['compare', 'methodology'].includes(r.id) ? '0.6' : '0.8',
    });
  }
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map((e) => '  <url>\n    <loc>' + e.loc + '</loc>\n    <lastmod>' + e.lastmod +
      '</lastmod>\n    <changefreq>' + e.freq + '</changefreq>\n    <priority>' + e.pri +
      '</priority>\n  </url>').join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

  /* ------------------------------------------------- robots.txt sitemap line */
  const robotsPath = path.join(ROOT, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    const robots = fs.readFileSync(robotsPath, 'utf8');
    const line = 'Sitemap: ' + ORIGIN + '/sitemap.xml';
    const next = /^Sitemap:.*$/m.test(robots)
      ? robots.replace(/^Sitemap:.*$/m, line)
      : robots.replace(/\s*$/, '\n\n' + line + '\n');
    if (next !== robots) { fs.writeFileSync(robotsPath, next, 'utf8'); console.log('robots.txt: sitemap line updated'); }
  }

  console.log('prerendered ' + written.length + ' pages:');
  for (const [name, len] of written) console.log('  ' + name.padEnd(24) + (len / 1024).toFixed(0) + ' KB');
  console.log('sitemap.xml: ' + entries.length + ' urls, lastmod ' + newest);
}

main();
