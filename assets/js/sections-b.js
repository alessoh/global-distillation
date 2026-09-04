// Global Distillation — company, developer and customer perspectives.
//
// Two jobs, both scoped to those three routes:
//   1. tuneSection()  — reshapes a few chart and table specs before the generic
//      renderer sees them, where the published shape draws a misleading figure.
//      It never invents a number: every value comes from data/*.json unchanged.
//   2. sectionExtras() — renders the material those files carry that the generic
//      perspective template has no slot for: 18 company dossiers, 8 costed
//      recipes, 27 tool profiles, a 10-workload decision guide and a buyer's
//      checklist. That material is the strongest part of the dataset.
//
// Owned by the sections-B agent. render.js calls tuneSection, sectionExtras and
// afterRender; nothing else here is imported anywhere.

import { openDrawer } from './app.js';

/* ---------------------------------------------------------------- helpers */

const ROUTES_B = ['company', 'developer', 'customer'];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const attr = (s) => esc(s).replace(/\n/g, ' ');

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch (e) { return String(url || '').replace(/^https?:\/\//, '').split('/')[0]; }
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function longDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(iso).slice(0, 10));
  if (!m) return String(iso);  // "undisclosed" stays a word, not "undisclose"
  if (!m[2]) return m[1];
  if (!m[3]) return MONTHS[Number(m[2]) - 1] + ' ' + m[1];
  return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1];
}

/**
 * Cite a URL only when the page's own catalogue already holds it. A footnote
 * for an uncatalogued URL would append a row to the source list after the
 * header has already printed the count, so those render as a plain link.
 */
function makeCite(d, fn) {
  const known = new Set(((d && d.sources) || []).map((s) => s && s.url).filter(Boolean));
  return (url) => {
    if (!url) return '';
    if (fn && known.has(url)) return fn.refs([url]);
    return '';
  };
}

function sourceLine(urls, cite, label) {
  const list = [...new Set((urls || []).filter(Boolean))];
  if (!list.length) return '';
  return '<p class="panel__sources">' + esc(label || 'Sources') + ': ' + list.map((u) =>
    '<a href="' + attr(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a>' +
    cite(u)).join(' · ') + '</p>';
}

/** Same markup as render.js's blockHead, so every block label on a page is one level. */
function head2(title, count, note, id) {
  return '<h2 class="subhead"' + (id ? ' id="' + attr(id) + '"' : '') + '>' + esc(title) +
    (count != null ? '<span class="dim"> · ' + esc(count) + '</span>' : '') + '</h2>' +
    (note ? '<p class="note note--lede">' + esc(note) + '</p>' : '');
}

/* ============================================================================
   1. tuneSection — chart and table shapes, per route
   ========================================================================== */

/** Shallow clone deep enough that nothing written here touches the cached JSON. */
function cloneCharts(d, fnMap) {
  const charts = (d.charts || []).map((c) => {
    const f = fnMap[c.id];
    if (!f) return c;
    return f(JSON.parse(JSON.stringify(c))) || c;
  });
  return charts;
}

function cloneTables(d, fnMap) {
  return (d.tables || []).map((t) => {
    const f = fnMap[t.id];
    if (!f) return t;
    return f(JSON.parse(JSON.stringify(t))) || t;
  });
}

/** "Arcee DistillKit (preview)" -> "Arcee DistillKit": the qualifier is in the note. */
function trimParenthetical(s) {
  return String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const COMPANY_CHART_TUNES = {
  // A donut asks the reader to compare three angles that differ by 1.4x. The
  // same three integers read directly off a horizontal bar, and the stance
  // ramp is kept away from the vendor hues used two panels down.
  'stance-donut': (c) => {
    const ramp = ['#7C3A17', '#CE9E85', '#B87759'];
    c.type = 'bar';
    c.series[0].data = c.series[0].data.map((p, i) => ({ ...p, color: ramp[i % ramp.length] }));
    return c;
  },
  // Twelve stacked categorical series cannot be decoded: the segments carry no
  // label, four hue pairs are near-identical, and the stack order changes
  // between years. Transposed, it is three years per company — one bar each,
  // one hue per year, sorted by 2025 then 2024.
  'distilled-releases-by-year': (c) => {
    const years = [];
    for (const s of c.series) for (const p of s.data) {
      const y = String(p.x);
      if (!years.includes(y)) years.push(y);
    }
    years.sort();
    const companies = c.series.map((s) => ({
      name: s.name,
      byYear: new Map(s.data.map((p) => [String(p.x), p.y])),
    }));
    // Ranked by the most recent year first, earlier years breaking the tie.
    const score = (co) => years
      .reduce((n, y, i) => n + (co.byYear.get(y) || 0) * Math.pow(100, i), 0);
    companies.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
    c.type = 'bar';
    c.xLabel = 'Company';
    c.series = years.map((y) => ({
      name: y === '2026' ? '2026 (to 3 September)' : y,
      data: companies.map((co) => ({ x: co.name, y: co.byYear.get(y) || 0 })),
    }));
    return c;
  },
  // $0.40 to $50 is a 125x span: as bar lengths, GPT-5 nano and GPT-4o mini —
  // the tiers the page's own headline figure is about — were 2-4px stubs.
  'flagship-vs-small-output-price': (c) => {
    // The authored title names two vendors; the series carries three (Grok 4
    // Fast is xAI). Naming what is plotted, rather than dropping the row.
    const t = rankedDots(c,
      'USD per 1M output tokens (log scale)',
      'Ordered by price on a logarithmic axis, so the 125x gap between the flagship and the nano tier is ' +
      'readable at both ends; the figure beside each dot is the list price.');
    t.title = 'Output price: flagship vs small tier at OpenAI, Anthropic and xAI';
    return t;
  },
  // 0.15M to 28.8M exchanges on a linear axis drew DeepSeek as a 4px sliver.
  'attack-exchanges': (c) => rankedDots(c,
    'Exchanges attributed, in millions (log scale)',
    'Ordered by volume on a logarithmic axis; the figure beside each dot is the accuser\'s own count.'),
  // Point labels ran past the plot edge and were clipped mid-word. The
  // parenthetical qualifiers they ended in are all restated in the method note.
  'product-launch-timeline': (c) => {
    c.series.forEach((s) => s.data.forEach((p) => { p.label = trimParenthetical(p.label); }));
    // The last point sits against the right edge, where a 34-character label
    // has nowhere to go; the series name and the method note carry the rest.
    const ret = c.series.find((s) => /retirement/i.test(s.name));
    if (ret) ret.data.forEach((p) => { p.label = String(p.label).replace(/^Azure.*$/, 'Azure retirement'); });
    return c;
  },
};

/**
 * A ranked dot plot: the mark is a position, so it can sit on a logarithmic
 * axis without misstating a length, and every value is printed beside its dot.
 * Used where a bar chart's span made the small values invisible.
 */
function rankedDots(c, xLabel, extraNote) {
  const pts = [];
  for (const s of c.series) for (const p of s.data) pts.push(p);
  pts.sort((a, b) => b.y - a.y);
  return {
    ...c,
    type: 'dot',
    xLabel: xLabel || c.yLabel || c.xLabel,
    series: [{ name: c.series[0].name, data: pts }],
    notes: (c.notes ? c.notes + ' ' : '') + extraNote,
  };
}

const COMPANY_TABLE_TUNES = {
  // The filter chips are derived from the first text column, which here was an
  // exact date: nine chips at mixed granularity (2026-02 and 2026-02-12 both
  // present) over eleven rows. Leading with the accuser makes the filter the
  // one a reader of a disputes table actually wants, and the date keeps its
  // column.
  disputes: (t) => {
    const order = ['accuser', 'accused', 'date', 'exchanges', 'accounts', 'claim', 'outcome'];
    const cols = t.columns.slice().sort((a, b) => {
      const ia = order.indexOf(a.key);
      const ib = order.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    t.columns = cols;
    return t;
  },
  // Seventeen distilled-vs-baseline pairs in six different units. The ratio is
  // the claim every one of them is making, and it was the one column missing.
  'efficiency-claims': (t) => {
    const lowerBetter = /hour|token|cost|usd|memory|latency|size|time|saved/i;
    const cols = t.columns.slice();
    const at = cols.findIndex((c) => c.key === 'unit');
    const ratioCol = { key: '_ratio', label: 'Distilled vs baseline', type: 'text' };
    cols.splice(at < 0 ? cols.length : at, 0, ratioCol);
    t.columns = cols;
    t.rows = t.rows.map((r) => {
      const a = r.distilled;
      const b = r.baseline;
      let text = '—';
      if (typeof a === 'number' && typeof b === 'number' && a > 0 && b > 0) {
        const lower = lowerBetter.test(String(r.unit) + ' ' + String(r.metric));
        const ratio = lower ? b / a : a / b;
        const n = ratio >= 9.5 ? Math.round(ratio)
          : (ratio >= 2 ? Math.round(ratio * 10) / 10 : Math.round(ratio * 100) / 100);
        if (lower) text = ratio >= 1.02 ? n + '× fewer' : (1 / ratio).toFixed(2) + '× more';
        else text = ratio >= 1.005 ? n + '× better' : n + '×';
      }
      return { ...r, _ratio: text };
    });
    t.notes = (t.notes ? t.notes + ' ' : '') +
      'The ratio column is computed from the two published figures in the same row; ' +
      'rows whose baseline is zero or not comparable are left blank rather than forced into a ratio.';
    return t;
  },
};

const DEVELOPER_CHART_TUNES = {
  // Three labelled dots in a 900x450 rectangle, with an x-axis that spanned
  // 5-35B for three x-positions. The comparison the panel is making is between
  // the runs themselves, which is a ranked bar.
  'gpu-hours-vs-student-size': (c) => {
    const pts = [];
    for (const s of c.series) for (const p of s.data) {
      pts.push({ x: p.label || s.name, y: p.y, note: s.name });
    }
    pts.sort((a, b) => b.y - a.y);
    c.type = 'bar';
    c.xLabel = 'Published run';
    c.series = [{ name: 'GPU-hours (H100-class)', data: pts }];
    return c;
  },
  // 3B to 405B on a linear axis puts the ten students anybody is choosing
  // between into the leftmost seventh of the plot, and makes VRAM look linear
  // in parameters. On a log x the QLoRA-versus-LoRA gap is the chart.
  'vram-vs-student-size': (c) => ({ ...c, opts: { ...(c.opts || {}), logX: true } }),
};

/** A price-versus-score scatter: log price, and a score axis clipped to its data. */
function zoomedScatter(c) {
  return {
    ...c,
    opts: { ...(c.opts || {}), logX: true, yZoom: true },
    notes: (c.notes ? c.notes + ' ' : '') +
      'Price is on a logarithmic axis because four fifths of the models sit under $2 per million ' +
      'tokens. The score axis is clipped to the range of the plotted scores and does not start at zero.',
  };
}

const CUSTOMER_CHART_TUNES = {
  // Roughly four fifths of the models sit between $0.03 and $2.00 a million
  // tokens, so a linear price axis crushes the upper-left corner — where the
  // whole argument lives — into the left fifth of the frame.
  'price-vs-gpqa': (c) => zoomedScatter(c),
  'price-vs-mmlupro': (c) => zoomedScatter(c),
  // $28 to $9,000 is a 320x spread: as bar lengths on a linear axis the
  // fourteen cheapest models — the ones this page exists to choose between —
  // are 1-4px slivers. A dot is a position, not a length, so it can sit on a
  // logarithmic axis honestly, and each value is still printed beside it.
  'cost-per-1m-requests': (c) => ({
    ...c,
    type: 'dot',
    xLabel: 'USD per 1,000,000 requests (log scale)',
    series: [{
      ...c.series[0],
      data: c.series[0].data.slice().sort((a, b) => b.y - a.y),
    }],
    notes: (c.notes ? c.notes + ' ' : '') +
      'Plotted on a logarithmic axis and ordered by cost; the printed figure beside each dot is the value.',
  }),
  // series[1] suffixed three of its keys with " (coding)" purely to keep them
  // distinct in a flat list. Stripping the suffix pairs them with the knowledge
  // bars they belong to; the series name already says which benchmark family
  // each bar is. Categories are then ordered by knowledge retention, so the
  // fall from 97.8% to 47.3% is the shape of the chart.
  'quality-retention': (c) => {
    const know = c.series[0];
    const code = c.series[1];
    if (code) code.data.forEach((p) => { p.x = String(p.x).replace(/\s*\(coding\)$/i, ''); });
    know.data.sort((a, b) => b.y - a.y);
    if (code) {
      const rank = new Map(know.data.map((p, i) => [String(p.x), i]));
      code.data.sort((a, b) => (rank.has(String(a.x)) ? rank.get(String(a.x)) : 99) -
        (rank.has(String(b.x)) ? rank.get(String(b.x)) : 99));
    }
    return c;
  },
};

/**
 * Return the perspective data with the route's fixes applied. The original
 * object is never mutated: app.js caches it and the palette indexes it.
 */
export function tuneSection(d, routeId) {
  if (!d || !ROUTES_B.includes(routeId)) return d;
  if (routeId === 'company') {
    return { ...d, charts: cloneCharts(d, COMPANY_CHART_TUNES), tables: cloneTables(d, COMPANY_TABLE_TUNES) };
  }
  if (routeId === 'developer') {
    return { ...d, charts: cloneCharts(d, DEVELOPER_CHART_TUNES) };
  }
  // The 24-point chart that carries the argument was behind tab 2, with a
  // six-point chart in front of it.
  const charts = cloneCharts(d, CUSTOMER_CHART_TUNES).slice();
  const gpqa = charts.findIndex((c) => c.id === 'price-vs-gpqa');
  const mmlu = charts.findIndex((c) => c.id === 'price-vs-mmlupro');
  if (gpqa > mmlu && mmlu >= 0) {
    const [g] = charts.splice(gpqa, 1);
    charts.splice(mmlu, 0, g);
  }
  return { ...d, charts };
}

/* ============================================================================
   2. Company dossiers
   ========================================================================== */

const COMPANIES = new Map();

const STANCE_NOTE = {
  restrictive: 'closed weights and a terms-of-service clause against training competing models',
  permissive: 'open weights under a licence that allows derivative distillation',
  mixed: 'sells or uses distillation but does not publish weights for its frontier tier',
};

function companyCard(c) {
  const id = slug(c.name);
  const facts = [
    (c.distilledModels || []).length ? (c.distilledModels || []).length + ' distilled' : '',
    (c.distillationProducts || []).length ? (c.distillationProducts || []).length + ' product' +
      ((c.distillationProducts || []).length === 1 ? '' : 's') : '',
    (c.notableEvents || []).length ? (c.notableEvents || []).length + ' events' : '',
  ].filter(Boolean);
  return '<button type="button" class="dossier" data-company="' + attr(id) + '" aria-haspopup="dialog">' +
    '<span class="dossier__top">' +
    '<span class="dossier__name">' + esc(c.name) + '</span>' +
    '<span class="badge badge--stance is-' + attr(c.stance || 'mixed') + '">' + esc(c.stance || 'unstated') + '</span>' +
    '</span>' +
    '<span class="dossier__hq">' + esc(c.hq || 'HQ not published') + '</span>' +
    '<span class="dossier__facts">' + facts.map((f) => '<span>' + esc(f) + '</span>').join('') + '</span>' +
    '</button>';
}

function companyDossiersHtml(d, cite) {
  const list = (d.extras && d.extras.companies) || [];
  if (!list.length) return '';
  list.forEach((c) => COMPANIES.set(slug(c.name), c));
  const order = ['restrictive', 'mixed', 'permissive'];
  const groups = order.map((st) => [st, list.filter((c) => (c.stance || 'mixed') === st)])
    .filter(([, arr]) => arr.length);
  return head2('Company dossiers', list.length + ' companies',
    'One card per company: where it is based, whether it bans distillation of its own outputs, ' +
    'what it has distilled, and its dated record. Rows in the company matrix below open the same dossier.',
    'sec-dossiers') +
    '<div class="dossiers">' + groups.map(([st, arr]) =>
      '<div class="dossiers__group">' +
      '<p class="dossiers__label">' + esc(st) + '<span class="dim"> · ' + arr.length + ' · ' +
      esc(STANCE_NOTE[st] || '') + '</span></p>' +
      '<div class="dossier-grid">' + arr.map(companyCard).join('') + '</div></div>').join('') +
    '</div>' +
    sourceLine([...new Set(list.map((c) => c.source).filter(Boolean))].slice(0, 6), cite,
      'Company records');
}

function companyDrawerHtml(c) {
  const list = (arr, empty) => ((arr || []).length
    ? '<ul>' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>'
    : '<p class="note">' + esc(empty) + '</p>');

  const tos = c.tosClause || '';
  const url = (tos.match(/https?:\/\/\S+/) || [])[0] || '';
  // The clause carries its own URL inline; the link belongs under the quote,
  // not inside it.
  const quote = tos.replace(/\s*[—–-]?\s*https?:\/\/\S+/, '').replace(/\s{2,}/g, ' ').trim();

  const events = (c.notableEvents || []).map((e) => {
    const m = /^(\d{4}(?:-\d{2}){0,2}):\s*(.+)$/.exec(String(e));
    return m
      ? '<li class="dossier__event"><time datetime="' + attr(m[1]) + '">' + esc(longDate(m[1])) + '</time>' +
        '<span>' + esc(m[2]) + '</span></li>'
      : '<li class="dossier__event"><span>' + esc(e) + '</span></li>';
  }).join('');

  return '<p class="drawer__eyebrow"><span>Company</span><span>' + esc(c.stance || 'unstated') + ' stance</span></p>' +
    '<h2 id="drawer-title" tabindex="-1">' + esc(c.name) + '</h2>' +
    '<p class="drawer__lede">' + esc(c.hq || 'Headquarters not published') + ' · ' +
    esc(STANCE_NOTE[c.stance] || 'stance not classified') + '.</p>' +
    '<h4 class="drawer__section">Terms of service on distillation</h4>' +
    (quote
      ? '<blockquote class="quote">' + esc(quote) +
        (url ? '<span class="quote__source"><a href="' + attr(url) + '" target="_blank" rel="noopener">' +
          esc(host(url)) + '</a></span>' : '') + '</blockquote>'
      : '<p class="note">No clause on distillation of outputs is published for this company.</p>') +
    '<h4 class="drawer__section">Distillation products sold</h4>' +
    list(c.distillationProducts, 'None documented.') +
    '<h4 class="drawer__section">Distilled models</h4>' +
    list(c.distilledModels, 'No distilled model is publicly documented.') +
    '<h4 class="drawer__section">Record</h4>' +
    (events ? '<ol class="dossier__events">' + events + '</ol>'
      : '<p class="note">No dated events recorded.</p>') +
    (c.source
      ? '<h4 class="drawer__section">Source</h4><p><a href="' + attr(c.source) +
        '" target="_blank" rel="noopener">' + esc(host(c.source)) + '</a></p>'
      : '');
}

/** Open a company dossier by slug. Used by the cards, the matrix and the palette. */
export function openCompany(id) {
  const c = COMPANIES.get(slug(id)) ||
    [...COMPANIES.values()].find((x) => slug(x.name).startsWith(slug(id)));
  if (!c) return false;
  openDrawer(companyDrawerHtml(c), c.name);
  return true;
}

/* ============================================================================
   3. Developer: recipes and tool profiles
   ========================================================================== */

function recipesHtml(d, cite) {
  const list = (d.extras && d.extras.recipes) || [];
  if (!list.length) return '';
  return head2('Costed recipes', list.length + ' recipes',
    'Each one is a published route from a teacher to a serving student, with the author\'s own cost and ' +
    'time estimate at the list prices in the tables below.', 'sec-recipes') +
    '<div class="recipes">' + list.map((r, i) => {
      const srcs = [...new Set([...(r.sources || []), r.source].filter(Boolean))];
      return '<figure class="recipe panel">' +
        '<div class="panel__head recipe__head">' +
        '<h3 class="panel__title">' +
        '<span class="recipe__n">' + String(i + 1).padStart(2, '0') + '</span>' + esc(r.title) + '</h3>' +
        '</div>' +
        '<div class="panel__body recipe__body">' +
        '<dl class="recipe__stats">' +
        (r.estCost ? '<div><dt>Estimated cost</dt><dd>' + esc(r.estCost) + '</dd></div>' : '') +
        (r.estTime ? '<div><dt>Estimated time</dt><dd>' + esc(r.estTime) + '</dd></div>' : '') +
        (r.tool ? '<div><dt>Tooling</dt><dd>' + esc(r.tool) + '</dd></div>' : '') +
        '</dl>' +
        '<ol class="recipe__steps">' + (r.steps || []).map((s) =>
          '<li>' + esc(s) + '</li>').join('') + '</ol>' +
        '</div>' +
        sourceLine(srcs, cite, 'Prices from') +
        '</figure>';
    }).join('') + '</div>';
}

const TOOL_GROUPS = [
  ['library', 'Open-source libraries', 'Run them on your own GPUs; the licence is yours to read.'],
  ['platform', 'Managed platforms', 'You upload data and pay per token or per GPU-hour.'],
  ['api', 'Vendor distillation APIs', 'The teacher, the student and the store all sit inside one vendor.'],
];

function toolCard(t, cite) {
  const cols = (title, arr, cls) => ((arr || []).length
    ? '<div class="tool__col ' + cls + '"><p class="tool__coltitle">' + esc(title) + '</p><ul>' +
      arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>'
    : '');
  const chips = (arr) => ((arr || []).length
    ? '<p class="tool__chips">' + arr.map((x) =>
      '<span class="badge badge--neutral">' + esc(x) + '</span>').join('') + '</p>'
    : '');
  return '<details class="tool">' +
    '<summary class="tool__summary">' +
    '<span class="tool__name">' + esc(t.name) + '</span>' +
    '<span class="tool__one">' + esc(t.oneLiner || '') + '</span>' +
    '<span class="tool__meta">' + esc(t.vendor || '') +
    (t.pricing ? ' · ' + esc(t.pricing) : '') + '</span>' +
    '</summary>' +
    '<div class="tool__detail">' +
    '<div class="tool__cols">' +
    cols('Strengths', t.pros, 'tool__col--pro') +
    cols('Limits', t.cons, 'tool__col--con') +
    '</div>' +
    (t.techniques && t.techniques.length
      ? '<p class="tool__coltitle">Techniques implemented</p>' + chips(t.techniques) : '') +
    (t.teachersSupported && t.teachersSupported.length
      ? '<p class="tool__coltitle">Teachers supported</p><ul class="tool__list">' +
        t.teachersSupported.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
    (t.studentsSupported && t.studentsSupported.length
      ? '<p class="tool__coltitle">Students supported</p><ul class="tool__list">' +
        t.studentsSupported.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
    (t.url ? '<p class="tool__link"><a href="' + attr(t.url) + '" target="_blank" rel="noopener">' +
      esc(host(t.url)) + '</a>' + cite(t.url) + '</p>' : '') +
    '</div></details>';
}

function toolsHtml(d, cite) {
  const list = (d.extras && d.extras.tools) || [];
  if (!list.length) return '';
  const groups = TOOL_GROUPS
    .map(([k, label, note]) => [label, note, list.filter((t) => t.type === k)])
    .filter(([, , arr]) => arr.length);
  const other = list.filter((t) => !TOOL_GROUPS.some(([k]) => k === t.type));
  if (other.length) groups.push(['Other tooling', '', other]);
  return head2('Tool profiles', list.length + ' tools',
    'The judgement behind the feature matrix below: what each tool is for, what it does well, and where ' +
    'it will cost you a day. Open a row for the detail.', 'sec-tools') +
    '<div class="tools">' + groups.map(([label, note, arr]) =>
      '<div class="tools__group">' +
      '<p class="tools__label">' + esc(label) + '<span class="dim"> · ' + arr.length +
      (note ? ' · ' + esc(note) : '') + '</span></p>' +
      arr.map((t) => toolCard(t, cite)).join('') + '</div>').join('') + '</div>';
}

/* ============================================================================
   4. Customer: decision guide and buyer's checklist
   ========================================================================== */

function decisionGuideHtml(d) {
  const list = (d.extras && d.extras.decisionGuide) || [];
  if (!list.length) return '';
  return head2('Which model for which workload', list.length + ' workloads',
    'The page in one block: the workload, what to buy for it, and why. Model names are chips; every one of ' +
    'them is a row in the master comparison table below.', 'sec-guide') +
    '<div class="guide">' + list.map((g, i) =>
      '<article class="guide__row">' +
      '<p class="guide__n">' + String(i + 1).padStart(2, '0') + '</p>' +
      '<div class="guide__case">' +
      '<h3 class="guide__title">' + esc(g.useCase) + '</h3>' +
      '<p class="guide__rec">' + esc(g.recommendation) + '</p>' +
      '</div>' +
      '<div class="guide__why"><p>' + esc(g.why) + '</p>' +
      ((g.models || []).length
        ? '<p class="guide__models">' + g.models.map((m) =>
          '<button type="button" class="chip chip--model" data-model="' + attr(m) + '">' +
          esc(m) + '</button>').join('') + '</p>'
        : '') +
      '</div></article>').join('') + '</div>';
}

function checklistHtml(d) {
  const list = (d.extras && d.extras.buyerChecklist) || [];
  if (!list.length) return '';
  return head2('Before you sign', list.length + ' checks',
    'Procurement steps that follow from the figures above. Each one is a thing to do before the contract, ' +
    'not a thing to believe.', 'sec-checklist') +
    '<ol class="checklist">' + list.map((c) =>
      '<li class="checklist__item">' + esc(typeof c === 'string' ? c : (c.check || c.title || '')) +
      '</li>').join('') + '</ol>';
}

/* ============================================================================
   5. Public entry points used by render.js
   ========================================================================== */

/**
 * Extra blocks for one of the three routes at a named slot.
 * slot: 'lead'   — directly under the KPI row, before key findings
 *       'body'   — after key findings, before the charts
 *       'tables' — directly after the evidence tables
 *       'close'  — after the timeline, before the sources list
 */
export function sectionExtras(d, routeId, slot, fn, nav) {
  if (!d || !ROUTES_B.includes(routeId)) return '';
  const cite = makeCite(d, fn);
  const ex = d.extras || {};
  const mark = (id, label, count) => {
    if (Array.isArray(nav) && count) nav.push({ id, label, count });
  };
  if (routeId === 'company' && slot === 'body') {
    mark('sec-dossiers', 'Dossiers', (ex.companies || []).length);
    return companyDossiersHtml(d, cite);
  }
  if (routeId === 'developer') {
    if (slot === 'body') {
      mark('sec-recipes', 'Recipes', (ex.recipes || []).length);
      return recipesHtml(d, cite);
    }
    // The profiles sit directly under the feature matrix they explain.
    if (slot === 'tables') {
      mark('sec-tools', 'Tools', (ex.tools || []).length);
      return toolsHtml(d, cite);
    }
  }
  if (routeId === 'customer') {
    if (slot === 'lead') {
      mark('sec-guide', 'Decision guide', (ex.decisionGuide || []).length);
      return decisionGuideHtml(d);
    }
    if (slot === 'close') {
      mark('sec-checklist', 'Checklist', (ex.buyerChecklist || []).length);
      return checklistHtml(d);
    }
  }
  return '';
}

/* ---- post-render DOM work: tables, jump links, matrix rows -------------- */

const CSV_TABLES = new WeakSet();

function cellText(td) {
  const clone = td.cloneNode(true);
  clone.querySelectorAll('sup').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function tableToCsv(fig) {
  const table = fig.querySelector('table');
  if (!table) return '';
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const head = [...table.tHead.rows[0].cells].map((th) => q(cellText(th))).join(',');
  const body = [...table.tBodies[0].rows].filter((tr) => !tr.hidden)
    .map((tr) => [...tr.cells].map((td) => q(cellText(td))).join(',')).join('\n');
  return head + '\n' + body + '\n';
}

/**
 * Column widths were allocated with no reference to content, so a column of
 * em-dashes held 120px while a 90-character claim wrapped to eight lines. Width
 * is shared out in proportion to the square root of each column's average
 * length: prose columns win the majority without numeric columns collapsing.
 */
function balanceColumns(table) {
  const body = table.tBodies[0];
  const headRow = table.tHead && table.tHead.rows[0];
  if (!body || !headRow || table.querySelector('colgroup')) return;
  const n = headRow.cells.length;
  const rows = [...body.rows].slice(0, 40);
  if (n < 4 || !rows.length) return;
  const avg = [];
  const headWord = [];
  for (let i = 0; i < n; i += 1) {
    const label = cellText(headRow.cells[i]);
    headWord[i] = label.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
    let sum = label.length * 0.6;
    for (const tr of rows) sum += tr.cells[i] ? cellText(tr.cells[i]).length : 0;
    avg[i] = sum / (rows.length + 0.6);
  }
  if (Math.max(...avg) < 40) return;
  // A table that already needs sideways scrolling is left to the browser: the
  // fix there is the pinned first column, not a redistribution of width.
  const wrap = table.closest('.table-wrap');
  if (wrap && table.scrollWidth > wrap.clientWidth + 4) return;
  // The floor is the longest unbreakable word in the header: a column narrower
  // than its own label clips the label.
  const w = avg.map((a, i) => Math.max(2.2, Math.sqrt(Math.max(a, 2)), Math.sqrt(headWord[i] * 1.1)));
  const total = w.reduce((a, b) => a + b, 0);
  const cg = document.createElement('colgroup');
  w.forEach((x) => {
    const col = document.createElement('col');
    col.style.width = ((x / total) * 100).toFixed(2) + '%';
    cg.appendChild(col);
  });
  table.insertBefore(cg, table.firstChild);
  table.style.tableLayout = 'fixed';
  table.classList.add('table--balanced');
}

/**
 * A long table is capped at a whole number of rows with an explicit expander,
 * never at an arbitrary pixel height that slices a row in half. Re-measured
 * once the web fonts land, because row heights change when they do.
 */
function capTable(wrap, table) {
  const body = table.tBodies[0];
  const rows = body ? body.rows.length : 0;
  if (rows <= 14) return;
  const measure = () => {
    if (!wrap.isConnected) return;
    if (wrap.dataset.uncapped === '1') return;
    const headH = table.tHead ? table.tHead.getBoundingClientRect().height : 0;
    let used = 0;
    let shown = 0;
    for (const tr of body.rows) {
      const h = tr.getBoundingClientRect().height;
      if (used + h > 560 && shown >= 6) break;
      used += h;
      shown += 1;
    }
    if (shown >= rows) {
      wrap.classList.remove('is-capped');
      wrap.style.maxHeight = '';
      return;
    }
    wrap.classList.add('is-capped');
    wrap.style.maxHeight = Math.floor(headH + used) + 'px';
    if (!wrap.nextElementSibling || !wrap.nextElementSibling.classList.contains('table__more')) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn--ghost table__more';
      more.textContent = 'Show all ' + rows + ' rows';
      more.addEventListener('click', () => {
        wrap.dataset.uncapped = '1';
        wrap.classList.remove('is-capped');
        wrap.style.maxHeight = '';
        more.remove();
      });
      wrap.insertAdjacentElement('afterend', more);
    }
  };
  measure();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(measure)).catch(() => {});
  }
}

/** "GitHub stars stars, button" tells a screen-reader user nothing about sorting. */
function labelSorts(table) {
  table.querySelectorAll('.table__sort').forEach((btn) => {
    const th = btn.closest('th');
    const name = cellText(btn).replace(/\s+/g, ' ').trim();
    const state = th ? th.getAttribute('aria-sort') : 'none';
    btn.setAttribute('aria-label', 'Sort by ' + name +
      (state === 'ascending' ? ', currently ascending'
        : (state === 'descending' ? ', currently descending' : '')));
  });
}

/**
 * A licence string is one token: breaking "Apache-2.0" at its hyphen leaves a
 * line starting with "-2.0", which is a hard typographic error.
 */
function keepTokensWhole(table) {
  const body = table.tBodies[0];
  if (!body) return;
  for (const tr of body.rows) {
    for (const td of tr.cells) {
      const t = cellText(td);
      if (t.length <= 14 && /^[A-Za-z0-9][\w.+/-]*$/.test(t)) td.style.whiteSpace = 'nowrap';
    }
  }
}

/** Filtering three rows down to one is not a task anybody has. */
function dropTinyFilter(fig, table) {
  const rows = table.tBodies[0] ? table.tBodies[0].rows.length : 0;
  if (rows > 6) return;
  const chips = fig.querySelector('.panel__tools .chips');
  if (chips) chips.remove();
  const tools = fig.querySelector('.panel__tools');
  if (tools && !tools.children.length) tools.remove();
}

/**
 * Table affordances: a pinned first column, balanced widths, labelled sort
 * buttons, a row cap with "Show all", and a CSV download. Written for these
 * three routes, but nothing in it is route-specific, and a table that behaved
 * differently on #/political than on #/company was the reader's problem, not
 * an authoring decision. Exported so every route can call it.
 */
export function enhanceTables(root) {
  root.querySelectorAll('.panel[data-table]').forEach((fig) => {
    if (CSV_TABLES.has(fig)) return;
    CSV_TABLES.add(fig);
    const title = (fig.querySelector('.panel__title') || {}).textContent || 'table';
    const wrap = fig.querySelector('.table-wrap');
    const table = fig.querySelector('table');
    if (wrap && table) {
      // A scroll container that only a mouse can reach is unreachable for a
      // keyboard user (WCAG 2.1.1), so it becomes a labelled, focusable region.
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', title.trim() + ', scrollable table');
      if (table.tHead && table.tHead.rows[0] && table.tHead.rows[0].cells.length >= 5) {
        table.classList.add('table--pin1');
      }
      balanceColumns(table);
      labelSorts(table);
      keepTokensWhole(table);
      dropTinyFilter(fig, table);
      capTable(wrap, table);
    }
    const unit = fig.querySelector('.panel__unit');
    if (unit && !fig.querySelector('[data-csv]')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn--link table__csv';
      btn.setAttribute('data-csv', '1');
      btn.textContent = 'Download this data (CSV)';
      btn.addEventListener('click', () => {
        const csv = tableToCsv(fig);
        if (!csv) return;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = (fig.id || 'table').replace(/^tbl-/, '') + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
      unit.insertAdjacentElement('afterend', btn);
    }
  });
}

/** The company matrix is 18 rows of the same 18 dossiers; make the rows open them. */
function wireMatrixRows(root) {
  const fig = root.querySelector('.panel[data-table="tbl-company-matrix"]');
  if (!fig) return;
  fig.classList.add('table--rowlink');
  fig.querySelectorAll('tbody tr').forEach((tr) => {
    const name = tr.cells[0] ? cellText(tr.cells[0]) : '';
    if (!COMPANIES.has(slug(name))) return;
    tr.setAttribute('data-company-row', slug(name));
    tr.setAttribute('tabindex', '0');
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', name + ' — open dossier');
  });
}

/** Turn the header's count list into jumps: the in-page navigation it looked like. */
function wireJumps(root) {
  const meta = root.querySelector('.section__meta');
  if (!meta) return;
  // The block labels are the page's real section boundaries; give each an id
  // so the header's count list can become the in-page navigation it resembles.
  const named = new Map();
  root.querySelectorAll('.subhead').forEach((p) => {
    const text = p.textContent.toLowerCase();
    const key = /^charts/.test(text) ? 'charts'
      : (/^evidence tables/.test(text) ? 'tables'
        : (/^what happened|^the record/.test(text) ? 'events'
          : (/^sources/.test(text) ? 'sources' : null)));
    if (!key || named.has(key)) return;
    if (!p.id) p.id = 'sec-' + key;
    named.set(key, p.id);
  });
  const kpi = root.querySelector('.kpi-row');
  if (kpi) {
    const box = kpi.closest('[id]') || kpi;
    if (!box.id) box.id = 'sec-figures';
    named.set('figures', box.id);
  }
  const html = meta.innerHTML.split('<br>').map((line) => {
    const text = line.replace(/<[^>]*>/g, '').trim();
    const key = ['figures', 'charts', 'tables', 'events', 'sources'].find((k) => text.endsWith(k));
    const target = key ? named.get(key) : null;
    if (!target) return line;
    return '<button type="button" class="meta__jump" data-jump="' + attr(target) + '">' +
      esc(text) + '</button>';
  }).join('<br>');
  meta.innerHTML = html;
}

let wiredB = false;

function wireB() {
  if (wiredB) return;
  wiredB = true;

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    const card = t.closest('[data-company]');
    if (card) { openCompany(card.getAttribute('data-company')); return; }

    const row = t.closest('[data-company-row]');
    if (row && !t.closest('a')) { openCompany(row.getAttribute('data-company-row')); return; }

    const chip = t.closest('[data-model]');
    if (chip) { findModelRow(chip.getAttribute('data-model')); return; }

    const jump = t.closest('[data-jump]');
    if (jump) { jumpTo(jump.getAttribute('data-jump')); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target && e.target.closest ? e.target.closest('[data-company-row]') : null;
    if (!row) return;
    e.preventDefault();
    openCompany(row.getAttribute('data-company-row'));
  });
}

const reduceMotion = () => typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

function jumpTo(sel) {
  const key = String(sel || '').replace(/^#/, '');
  const node = document.getElementById(key) || document.querySelector(key ? '#' + key : sel);
  if (!node) return;
  try {
    node.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  } catch (err) { node.scrollIntoView(); }
}

/** A model chip in the decision guide highlights that model's row in the master table. */
function findModelRow(name) {
  const key = String(name || '').toLowerCase().trim();
  const rows = [...document.querySelectorAll('.panel[data-table] tbody tr')];
  const hit = rows.find((tr) => tr.cells[0] &&
    cellText(tr.cells[0]).toLowerCase().indexOf(key) === 0) ||
    rows.find((tr) => tr.cells[0] && cellText(tr.cells[0]).toLowerCase().includes(key));
  if (!hit) return;
  document.querySelectorAll('tr.is-cited').forEach((n) => n.classList.remove('is-cited'));
  hit.classList.add('is-cited');
  hit.hidden = false;
  try {
    hit.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  } catch (err) { hit.scrollIntoView(); }
}

/** Called by render.js once a perspective section is in the document. */
export function afterRender(el, routeId) {
  wireB();
  if (!el) return;
  // Eight figures on a six-column grid wrap 6 + 2 and leave four empty cells.
  el.querySelectorAll('.kpi-row').forEach((row) => {
    row.setAttribute('data-n', String(row.children.length));
  });
  wireJumps(el);
  enhanceTables(el);
  if (!ROUTES_B.includes(routeId)) return;
  if (routeId === 'company') wireMatrixRows(el);
}
