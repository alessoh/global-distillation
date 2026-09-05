// Global Distillation — rendering module.
// Owns: perspective sections, the overview front page, the comparison builder,
// the methodology page, tables and every ECharts instance on the site.
// Contract: BUILD-CONTRACT.md. Design tokens and component classes: DESIGN.md.

// The company, developer and customer perspectives carry material the generic
// template has no slot for (company dossiers, costed recipes, tool profiles,
// the buyer's decision guide) and a few chart shapes that need reworking before
// they are drawn. Both live in sections-b.js so this file stays generic.
import { tuneSection, sectionExtras, afterRender, enhanceTables, enhanceHead } from './sections-b.js';
// The drawer is the shell's; a table row that carries more prose than a cell
// can hold opens it rather than truncating the text (BUILD-CONTRACT.md).
import { openDrawer } from './app.js';

/* ============================================================================
   1. ECharts theme (DESIGN.md section 4) — registered as 'gd'
   ========================================================================== */

export const echartsTheme = {
  color: ['#B5451B', '#1F6A99', '#2E7D53', '#9A6C10', '#6B4FA8', '#A8324E', '#3F6470', '#7A6A57'],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Schibsted Grotesk, system-ui, sans-serif', color: '#4C4740' },
  title: { textStyle: { fontFamily: 'Newsreader, Georgia, serif', color: '#1A1814', fontWeight: 400 } },
  grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#CEC6B6' } },
    axisTick: { show: false },
    axisLabel: { color: '#655F55', fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#655F55', fontSize: 11 },
    splitLine: { lineStyle: { color: '#E4DED2', type: 'solid' } },
  },
  legend: { show: false },
  tooltip: {
    backgroundColor: '#FFFFFF', borderColor: '#CEC6B6', borderWidth: 1,
    textStyle: { color: '#1A1814', fontSize: 12 },
    extraCssText: 'box-shadow:0 12px 40px rgba(26,24,20,.16);border-radius:6px;',
  },
  bar: { itemStyle: { borderRadius: [3, 3, 0, 0] } },
  line: { symbol: 'circle', symbolSize: 6, lineStyle: { width: 2 } },
  scatter: { symbolSize: 10, itemStyle: { opacity: 0.85 } },
};

const EC = typeof window !== 'undefined' ? window.echarts : null;
if (EC && !EC.__gdThemeRegistered) {
  EC.registerTheme('gd', echartsTheme);
  EC.__gdThemeRegistered = true;
}

/* ============================================================================
   2. Constants, palettes, formatting
   ========================================================================== */

const PALETTE = echartsTheme.color;
// --ink-3 was #837C71, which measures 3.89:1 on the paper ground and fails AA
// for the 11-13px tier it is used on (axis labels, column headers, captions).
// Darkened to 5.4:1 here and in app.css so chart text matches the page.
const INK = '#1A1814', INK2 = '#4C4740', INK3 = '#655F55', RULE = '#E4DED2', RULE_S = '#CEC6B6';

// One neutral ink for a single-series chart, with the accent spent on the one
// mark that carries the argument. Colour only encodes something when there is
// something to encode (DESIGN.md section 6).
const SERIES_INK = '#6E6459';
const MARK_INK = PALETTE[0];

// Vendor hues are fixed site-wide (DESIGN.md section 6: never re-map a hue).
const VENDOR_HUE = [
  [/openai|gpt|o1\b|o3\b|o4\b/i, PALETTE[0]],
  [/deepseek|r1\b/i, PALETTE[1]],
  [/google|gemini|gemma|deepmind/i, PALETTE[2]],
  [/anthropic|claude|haiku|sonnet|opus/i, PALETTE[3]],
  [/meta|llama/i, PALETTE[4]],
  [/alibaba|qwen|moonshot|kimi|minimax|zhipu/i, PALETTE[5]],
  [/microsoft|phi-|azure|nvidia|nemo|minitron|nemotron/i, PALETTE[6]],
  [/mistral|ministral|apple|cohere|xai|grok|open|other|hugging/i, PALETTE[7]],
];

// Matches the .cat--* custom properties in app.css so dots, chips and charts agree.
const CAT_HUE = {
  research: PALETTE[1], product: PALETTE[2], market: PALETTE[3],
  policy: PALETTE[4], legal: PALETTE[5], company: PALETTE[0], other: PALETTE[7],
};

const assigned = new Map();
let nextSlot = 0;

function baseHue(name) {
  const key = String(name || '').trim();
  if (!key) return PALETTE[7];
  // A timeline category keeps the hue its chips and dots already use, so a
  // stacked bar and the record below it never disagree about what blue means.
  const cat = CAT_HUE[key.toLowerCase()];
  if (cat) return cat;
  if (assigned.has(key)) return assigned.get(key);
  let hue = null;
  for (const [re, c] of VENDOR_HUE) if (re.test(key)) { hue = c; break; }
  if (!hue) { hue = PALETTE[nextSlot % PALETTE.length]; nextSlot += 1; }
  assigned.set(key, hue);
  return hue;
}

/** Stable colour for a series/category, unique within one chart. */
function hueFactory() {
  const used = new Set();
  return (name, i) => {
    let c = baseHue(name);
    if (used.has(c)) {
      const free = PALETTE.find((p) => !used.has(p));
      c = free || PALETTE[(i || 0) % PALETTE.length];
    }
    used.add(c);
    return c;
  };
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const attr = (s) => esc(s).replace(/\n/g, ' ');

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

/**
 * Authored prose occasionally names the JSON field it was computed from
 * ("this dashboard's own timeline[]"), which on the page reads as an
 * unrendered template token rather than as a method note.
 */
function prose(s) {
  return String(s == null ? '' : s)
    .replace(/\b(\w+)\[\]/g, '$1')
    .replace(/\$\.(\w+)/g, '$1');
}

function trimNum(n, dp) {
  const s = n.toFixed(dp == null ? 1 : dp);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** Long form: 126910 -> "126,910"; 5.4e6 -> "5.4M". */
function fmt(v) {
  if (v == null || v === '') return '—';
  if (!isNum(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 1e9) return trimNum(v / 1e9, 2) + 'bn';
  if (a >= 1e6) return trimNum(v / 1e6, 2) + 'M';
  if (a >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a === 0) return '0';
  if (a < 0.01) return String(v);
  return trimNum(v, a < 1 ? 3 : 2);
}

/** Compact form for axis ticks and in-chart labels. */
function fmtShort(v) {
  if (!isNum(v)) return String(v == null ? '' : v);
  const a = Math.abs(v);
  if (a >= 1e9) return trimNum(v / 1e9, 1) + 'bn';
  if (a >= 1e6) return trimNum(v / 1e6, 1) + 'M';
  if (a >= 1e4) return trimNum(v / 1e3, 0) + 'k';
  if (a >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a === 0) return '0';
  if (a < 0.01) return String(v);
  return trimNum(v, a < 1 ? 2 : 1);
}

/**
 * Compact form used when an axis or a column carries a large magnitude, so one
 * run of figures never mixes "18k" with "9,000" (a reader should not have to
 * re-scale mentally inside a single visual run).
 */
function compactNum(v) {
  if (!isNum(v)) return String(v == null ? '' : v);
  const a = Math.abs(v);
  if (a >= 1e9) return trimNum(v / 1e9, 1) + 'bn';
  if (a >= 1e6) return trimNum(v / 1e6, 1) + 'M';
  if (a >= 1000) return trimNum(v / 1e3, a >= 1e4 ? 0 : 1) + 'k';
  if (a === 0) return '0';
  if (a < 0.01) return String(v);
  return trimNum(v, a < 1 ? 2 : 1);
}

/** One formatter for a whole axis, chosen once from that axis's largest value. */
function magFormatter(values) {
  const nums = (values || []).filter(isNum).map((v) => Math.abs(v));
  const max = nums.length ? Math.max(...nums) : 0;
  return max >= 1e4 ? compactNum : fmtShort;
}

/**
 * Truncate a category label from the middle. The distinguishing part of a
 * label is usually its tail ("DeepSeek-R1 → R1-Distill-Qwen-1.5B", "Alibaba /
 * Qwen (Jun 2026)"), which a trailing ellipsis destroys.
 */
function shortenCat(s, max) {
  const t = String(s == null ? '' : s);
  const lim = max || 24;
  if (t.length <= lim) return t;
  const head = Math.max(6, Math.round(lim * 0.42));
  const tail = Math.max(4, lim - head - 1);
  return t.slice(0, head).replace(/[\s-]+$/, '') + '…' + t.slice(t.length - tail).replace(/^[\s-]+/, '');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** ISO (or partial ISO) date -> "3 September 2026" (DESIGN.md section 7). */
function longDate(iso) {
  if (!iso) return '';
  const raw = String(iso);
  const s = raw.slice(0, 10);
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s);
  // Not a date at all ("undisclosed"): return the word, not its first ten
  // letters, which printed as "undisclose" in two source rows.
  if (!m) return raw;
  const [, y, mo, d] = m;
  if (!mo) return y;
  if (!d) return MONTHS[Number(mo) - 1] + ' ' + y;
  return Number(d) + ' ' + MONTHS[Number(mo) - 1] + ' ' + y;
}

function shortDate(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s);
  if (!m) return s;
  if (!m[2]) return m[1];
  if (!m[3]) return m[1] + '-' + m[2];
  return s;
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch (e) { return String(url || '').replace(/^https?:\/\//, '').split('/')[0]; }
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function firstSentences(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return { head: t, rest: '' };
  const parts = t.split(/(?<=\.)\s+/);
  let head = '';
  let i = 0;
  while (i < parts.length && (head + parts[i]).length <= max) { head += (head ? ' ' : '') + parts[i]; i += 1; }
  if (!head) { head = parts[0] || t; i = 1; }
  return { head, rest: parts.slice(i).join(' ') };
}

/**
 * Split a long block of authored prose into two or three paragraphs at its own
 * sentence boundaries. A 260-word wall is the least readable text on the page
 * and it is the first thing the reader meets.
 */
function paragraphs(text, target) {
  const t = String(text || '').trim();
  if (!t) return [];
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const max = target || 340;
  if (t.length <= max) return [t];
  const wanted = Math.min(4, Math.max(2, Math.round(t.length / max)));
  const per = Math.ceil(sentences.length / wanted);
  const out = [];
  for (let i = 0; i < sentences.length; i += per) out.push(sentences.slice(i, i + per).join(' '));
  return out.filter(Boolean);
}

let uid = 0;
const nid = (p) => (p || 'gd') + '-' + (uid += 1);

/* ============================================================================
   3. Footnote registry — every figure resolves to a numbered source
   ========================================================================== */

/**
 * Every URL this page will cite, in a stable order: the catalogue first, then
 * anything cited by a figure, finding, chart or table row that the catalogue
 * missed. Seeding the registry with this list up front means the source count
 * is known before a single byte of the page is written, so the hero metadata,
 * the left rail and the sources heading can all read the same number.
 */
function citedUrls(d) {
  const out = [];
  const add = (u) => { if (u && typeof u === 'string') out.push(u); };
  for (const s of (d && d.sources) || []) add(s && s.url);
  for (const s of (d && d.stats) || []) add(s && s.source);
  for (const f of (d && d.keyFindings) || []) for (const u of (f && f.sources) || []) add(u);
  for (const c of (d && d.charts) || []) for (const u of (c && c.sources) || []) add(u);
  for (const t of (d && d.tables) || []) {
    for (const r of (t && t.rows) || []) add(r && r._source);
    for (const u of (t && t.sources) || []) add(u);
  }
  // The perspective files carry material the generic template has no slot for
  // — a bibliography, a price register, an accusation ledger, a policy
  // register — and this build renders all of it. Those citations are seeded
  // here so the count is still known before the first byte is written.
  const ex = (d && d.extras) || {};
  for (const p of ex.papers || []) add(p && p.url);
  for (const p of ex.pricing || []) add(p && p.source);
  for (const g of ex.gpuRentalRates || []) add(g && g.source);
  for (const x of ex.disputes || []) add(x && x.source);
  for (const x of ex.policies || []) add(x && x.source);
  for (const u of (ex.tcoAssumptions && ex.tcoAssumptions.sources) || []) add(u);
  const mc = ex.marketContext || {};
  for (const k of Object.keys(mc)) {
    for (const u of (mc[k] && mc[k].sources) || []) add(u);
  }
  return out;
}

/**
 * The same paper is cited as /abs/, /html/, /pdf/, with and without a version
 * suffix and a trailing slash. Those are one source, and a citation that does
 * not match its catalogue entry renders as a bare hostname with no title,
 * which is the opposite of what a citation is for.
 */
function urlKey(u) {
  let t = String(u || '').trim().toLowerCase();
  t = t.replace(/^https?:\/\//, '').replace(/^(www|export)\./, '');
  t = t.split('#')[0].split('?')[0];
  t = t.replace(/\.pdf$/, '');
  t = t.replace(/\/(abs|html|pdf|forum)\//, '/abs/');
  t = t.replace(/(\/abs\/[^/]+?)v\d+$/, '$1');
  return t.replace(/\/+$/, '');
}

/** "https://huggingface.co/datasets/open-thoughts/OpenThoughts3-1.2M" ->
 *  "huggingface.co — datasets / open-thoughts / OpenThoughts3-1.2M" */
function urlTitle(url) {
  let path = '';
  try { path = new URL(url).pathname; } catch (e) { path = ''; }
  const parts = path.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  if (!parts.length) return host(url);
  return host(url) + ' — ' + parts.join(' / ');
}

function makeFootnotes(d, ns) {
  const list = [];
  const index = new Map();
  const prefix = 'src-' + (ns || 'x');
  const meta = new Map();
  const addMeta = (u, m) => { const k = urlKey(u); if (u && m && !meta.has(k)) meta.set(k, m); };
  for (const s of (d && d.sources) || []) addMeta(s && s.url, s);
  // A paper the catalogue missed is still a fully described work in the file's
  // own bibliography; fall back to that before writing a hostname stub.
  for (const p of ((d && d.extras && d.extras.papers) || [])) {
    addMeta(p && p.url, p && {
      url: p.url,
      title: p.title,
      publisher: p.venue || host(p.url || ''),
      date: p.year ? String(p.year) : '',
      type: 'paper',
    });
  }

  function add(url) {
    if (!url) return 0;
    const k = urlKey(url);
    if (index.has(k)) return index.get(k);
    const n = list.length + 1;
    index.set(k, n);
    const m = meta.get(k);
    list.push(m
      ? { ...m, url: m.url || url, n, catalogued: true }
      // Last resort: name the page from its own path rather than printing the
      // hostname twice ("huggingface.co / huggingface.co"), and say plainly
      // that this one is not in the catalogue.
      : { url, title: urlTitle(url), publisher: host(url), type: 'uncatalogued', n, catalogued: false });
    return n;
  }
  citedUrls(d).forEach(add);

  return {
    prefix,
    /** number for a url, adding it to the list when it was not catalogued */
    n: add,
    refs(urls) {
      const items = (urls || []).filter(Boolean).map((u) => ({ n: add(u), url: u }));
      return items.length ? refHtml(items, prefix) : '';
    },
    all() { return list; },
    size() { return list.length; },
  };
}

/** The one number every source count on a page derives from. */
export function sourceCount(d) {
  return d ? makeFootnotes(d).size() : 0;
}

// The left rail's total is written by the shell (app.js), which counts only the
// catalogued `sources` array and so under-reports every page that cites a URL
// the catalogue missed. app.js is fixed by the build contract, so the count is
// corrected here from the same registry the page itself renders, on the frame
// after the shell has written it. Reported in the handover notes.
const SOURCE_COUNTS = new Map();

function noteSourceCount(key, n) {
  if (key) SOURCE_COUNTS.set(key, n);
}

/**
 * The same slot, in the same type, showed 638 on the overview and 65 on the
 * financial page with no label to say the scope had changed — and on the
 * overview it disagreed with that page's own "461 sources in the six
 * perspectives". It now counts one thing, says which thing it is counting, and
 * takes the figure from the same registry the page itself renders.
 */
let PAGE_SOURCES = null;

/**
 * The shell stamps the live feed's date in ISO ("Live data refreshed
 * 2026-09-04") a few centimetres from the page's own "Research updated 3
 * September 2026". Two formats in one viewport, and two different dates with
 * nothing to say they measure different things, made the page look as though
 * it were contradicting itself about its own freshness. app.js is fixed by the
 * build contract, so the stamp is rewritten here: one format everywhere
 * (DESIGN.md section 7), and a subject — the live signals feed — that cannot be
 * confused with the date this perspective's research was last revised.
 */
function normaliseFeedStamp() {
  // innerHTML, not textContent: the rail stamp is two lines separated by a
  // <br> and carries the source-count slot written just below.
  const write = (node) => {
    if (!node) return;
    const html = node.innerHTML;
    const next = html
      .replace(/Live data refreshed/, 'Live signals refreshed')
      .replace(/(\d{4})-(\d{2})-(\d{2})/, (s) => longDate(s));
    if (next !== html) node.innerHTML = next;
  };
  const foot = document.getElementById('rail-foot');
  if (foot) foot.querySelectorAll('span:not(.rail__pulse)').forEach(write);
  write(document.getElementById('foot-updated'));
}

function syncRailSourceCount(n, label) {
  if (isNum(n)) PAGE_SOURCES = { n, label: label || 'sources on this page' };
  if (typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(() => {
    normaliseFeedStamp();
    const foot = document.getElementById('rail-foot');
    if (!foot) return;
    const scope = PAGE_SOURCES || { n: 0, label: 'sources catalogued' };
    const total = scope.n || [...SOURCE_COUNTS.values()].reduce((a, b) => a + b, 0);
    if (!total) return;
    const span = foot.querySelector('span:not(.rail__pulse)');
    if (!span) return;
    let slot = span.querySelector('[data-src-count]');
    if (!slot) {
      const html = span.innerHTML
        .replace(/\d[\d,]*\s+primary sources|Loading sources/, '<span data-src-count></span>');
      if (html === span.innerHTML) return;
      span.innerHTML = html;
      slot = span.querySelector('[data-src-count]');
    }
    if (slot) slot.textContent = total + ' ' + scope.label;
  });
}

/**
 * The site is hash-routed, so a footnote may never write to location.hash: the
 * router would tear the page down. The href therefore carries the source's own
 * URL as a working fallback (and opens in a new tab if scripting is off or the
 * source row is missing), while `data-footnote` names the row to scroll to.
 */
function refHtml(items, prefix) {
  return '<sup class="footnote">' + items.map(({ n, url }) =>
    '<a class="footnote__ref" href="' + attr(url) + '" target="_blank" rel="noopener"' +
    ' data-footnote="' + prefix + '-' + n + '"' +
    ' aria-label="Source ' + n + ' — jump to the source list">' + n + '</a>')
    .join('<span class="footnote__sep">,</span>') + '</sup>';
}

/**
 * A direct label at the end of a line needs a gutter to sit in. On a phone
 * there is no gutter, so the series are named in a key above the plot instead
 * of being truncated against the right edge.
 */
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < 700;

const prefersReducedMotion = () => typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scroll a cited source row into view and mark it. Returns false if absent. */
function jumpToSource(id) {
  const row = document.getElementById(id);
  if (!row) return false;
  // The bibliography is collapsed at rest; a citation has to open it.
  for (let n = row.parentNode; n && n !== document.body; n = n.parentNode) {
    if (n.tagName === 'DETAILS') n.open = true;
  }
  document.querySelectorAll('.source.is-cited').forEach((n) => n.classList.remove('is-cited'));
  row.classList.add('is-cited');
  row.setAttribute('tabindex', '-1');
  try {
    row.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } catch (e) { row.scrollIntoView(); }
  try { row.focus({ preventScroll: true }); } catch (e) { /* noop */ }
  return true;
}

/* ============================================================================
   4. Chart instance registry — disposed whenever a view is replaced
   ========================================================================== */

const instances = [];

function disposeCharts() {
  while (instances.length) {
    const rec = instances.pop();
    try { if (rec.ro) rec.ro.disconnect(); } catch (e) { /* noop */ }
    try { if (rec.chart && !rec.chart.isDisposed()) rec.chart.dispose(); } catch (e) { /* noop */ }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', disposeCharts);
}

/* ============================================================================
   5. Chart option builder
   ========================================================================== */

function seriesOf(spec) {
  const raw = (spec && spec.series) || [];
  return raw.filter((s) => s && Array.isArray(s.data) && s.data.length);
}

function xIsNumeric(series) {
  return series.every((s) => s.data.every((p) => isNum(p.x)));
}

// Years are numbers, but a value axis renders them from zero and prints them
// with a thousands separator. Treat a run of plain years as categories.
function xIsYear(series) {
  return series.every((s) => s.data.length > 0 &&
    s.data.every((p) => isNum(p.x) && Number.isInteger(p.x) && p.x >= 1900 && p.x <= 2100));
}

const DATEISH = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

/**
 * Partial ISO dates are plotted at a representative instant: a bare year sits
 * mid-year and a bare month mid-month, so "2024" and "2024-08-01" can share one
 * axis without either pretending to a precision it does not have. The tooltip
 * and the data table still show the string exactly as it was published.
 */
function dateValue(v) {
  const m = DATEISH.exec(String(v));
  if (!m) return null;
  const y = Number(m[1]);
  if (!m[2]) return Date.UTC(y, 6, 1);
  if (!m[3]) return Date.UTC(y, Number(m[2]) - 1, 15);
  return Date.UTC(y, Number(m[2]) - 1, Number(m[3]));
}

/**
 * Date-like x values only earn a time axis once at least one of them is finer
 * than a year. A run of bare years is a set of labels, not a continuum, and a
 * category axis reads better for it (and keeps bar charts one bar per year).
 */
function xIsDate(series) {
  let any = false;
  let finer = false;
  for (const s of series) {
    for (const p of s.data) {
      if (typeof p.x !== 'string' || !DATEISH.test(p.x)) return false;
      any = true;
      if (p.x.length > 4) finer = true;
    }
  }
  return any && finer;
}

/**
 * Wrap a category label onto its own lines rather than rotating it or dropping
 * it. Rotation clips against the plot's left edge at narrow widths, and a
 * dropped label leaves a bar nobody can identify.
 */
function wrapLabel(v, per) {
  // A label that already carries its own line break has decided where to break.
  if (String(v).indexOf(String.fromCharCode(10)) >= 0) return String(v);
  const words = String(v).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= per) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
    if (lines.length === 2) break;
  }
  if (cur && lines.length < 3) lines.push(cur);
  return lines.slice(0, 3).map((l) => (l.length > per + 6 ? l.slice(0, per + 5) + '…' : l)).join(String.fromCharCode(10));
}

function categories(series) {
  const out = [];
  const seen = new Set();
  for (const s of series) for (const p of s.data) {
    const k = String(p.x);
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}

/**
 * A category axis places data by index, so a series that does not carry a point
 * for every category has to be padded: without this, the second series of a
 * grouped chart slides left and every bar is drawn under the wrong label. That
 * mis-attributes figures to the wrong subject, which on this site is a factual
 * error, not a layout one.
 */
function alignToCategories(s, cats, colour) {
  const byX = new Map();
  for (const p of s.data) if (!byX.has(String(p.x))) byX.set(String(p.x), p);
  return cats.map((c) => {
    const p = byX.get(c);
    if (!p) return { value: null, name: c };
    const item = { value: p.y, name: c, _raw: p };
    const fill = p.color || (colour ? colour(p, c) : null);
    if (fill) item.itemStyle = { color: fill };
    // An outlined bar is a different kind of observation from a filled one —
    // a multi-week drawdown beside a single session, a year still running.
    if (p.hollow) {
      item.itemStyle = {
        ...(item.itemStyle || {}),
        color: 'rgba(0,0,0,0)',
        borderColor: (item.itemStyle && item.itemStyle.color) || SERIES_INK,
        borderWidth: 2,
      };
    }
    if (p.partial) {
      item.itemStyle = {
        ...(item.itemStyle || {}),
        color: 'rgba(0,0,0,0)',
        borderColor: (item.itemStyle && item.itemStyle.color) || SERIES_INK,
        borderWidth: 1.5,
        borderType: 'dashed',
      };
    }
    return item;
  });
}

/** True only for the seven named vendor families, never the catch-all slot. */
function knownVendorHue(name) {
  const key = String(name || '');
  for (let i = 0; i < VENDOR_HUE.length - 1; i += 1) {
    if (VENDOR_HUE[i][0].test(key)) return VENDOR_HUE[i][1];
  }
  return null;
}

const QUARTERISH = /^\d{4}(\s*Q[1-4])?$/i;

/** Years and quarters read left to right; they never become horizontal bars. */
function catsAreTime(cats) {
  return cats.length > 0 && cats.every((c) => QUARTERISH.test(String(c).trim()) || DATEISH.test(String(c).trim()));
}

function allValues(series) {
  const out = [];
  for (const s of series) for (const p of s.data) if (isNum(p.y)) out.push(p.y);
  return out;
}

/**
 * A year with no events is still a year. When a series is indexed by bare
 * years, the missing ones are put back so the axis runs at an even pace: an
 * eight-year gap must not be drawn the same width as a one-year gap, or a
 * plateau reads as a climb. Counted series fill with zero; a running total
 * carries forward (a cumulative curve is flat across a year with no events);
 * anything else is left as a hole rather than invented.
 */
function fillYearGaps(spec) {
  const series = seriesOf(spec);
  const type = String((spec && spec.type) || 'bar');
  if (!series.length || !['bar', 'stackedBar', 'line', 'area'].includes(type)) return spec;
  const years = [];
  for (const s of series) for (const p of s.data) {
    if (!/^\d{4}$/.test(String(p.x))) return spec;
    years.push(Number(p.x));
  }
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  const span = hi - lo + 1;
  const present = new Set(years).size;
  if (span === present || span > 80) return spec;
  const all = [];
  for (let y = lo; y <= hi; y += 1) all.push(String(y));
  const counted = type === 'bar' || type === 'stackedBar';
  return {
    ...spec,
    series: series.map((s) => {
      const by = new Map(s.data.map((p) => [String(p.x), p]));
      const vals = s.data.filter((p) => isNum(p.y)).map((p) => p.y);
      const running = vals.length > 2 && vals.every((v, i) => i === 0 || v >= vals[i - 1]);
      let last = null;
      return {
        ...s,
        data: all.map((y) => {
          const p = by.get(y);
          if (p) { last = p; return p; }
          if (counted) return { x: y, y: 0, _filled: true };
          if (running && last) return { x: y, y: last.y, _filled: true };
          return { x: y, y: null, _filled: true };
        }),
      };
    }),
  };
}

/**
 * True when a value axis spans two orders of magnitude or more. A log axis is
 * only ever offered when every plotted value is positive, because a log axis
 * cannot place a zero and would silently drop the row.
 */
function wantsLog(series, threshold) {
  const v = allValues(series);
  if (v.length < 4) return false;
  if (v.some((n) => n <= 0)) return false;
  return Math.max(...v) / Math.min(...v) >= (threshold || 100);
}

// A bar encodes a length from a zero baseline, which a log axis misstates, so
// the scale control is offered only where the mark is a position, not a length.
// A dot and a dumbbell mark a position rather than a length, so both belong on
// this list with the line and the scatter; only the bar family is excluded.
const LOG_DEFAULT_TYPES = ['line', 'area', 'scatter', 'dot', 'dumbbell'];
const LOG_TOGGLE_TYPES = LOG_DEFAULT_TYPES;

function tooltipValue(unit) {
  return (v) => fmt(v) + (unit ? ' ' + unit : '');
}

function axisNameStyle(name) {
  return name ? {
    name, nameLocation: 'middle', nameGap: 34,
    nameTextStyle: { color: INK3, fontSize: 11 },
  } : {};
}

/**
 * Build a complete ECharts option from a data-file chart spec.
 * spec: { id, title, type, xLabel, yLabel, unit, series:[{name,data:[{x,y,label?,note?}]}] }
 * opts: { log:boolean, orient:'h'|'v', compact:boolean, maxCats:number }
 */
function buildOption(spec, opts) {
  const o = opts || {};
  const type = String(spec.type || 'bar');
  const series = seriesOf(spec);
  const unit = spec.unit || '';
  const hue = hueFactory();
  if (!series.length) return null;

  if (type === 'donut') return donutOption(spec, series, hue, unit);
  if (type === 'radar') return radarOption(spec, series, hue, unit);
  if (type === 'scatter') return scatterOption(spec, series, hue, unit, o);
  if (type === 'dot') return dotOption(spec, series, unit, o);
  if (type === 'dumbbell') return dumbbellOption(spec, series, hue, unit, o);
  if (type === 'stage') return stageOption(spec, series, unit, o);

  const yearX = xIsYear(series);
  const numericX = !yearX && xIsNumeric(series);
  const dateX = !numericX && xIsDate(series);
  const cats = numericX || dateX ? null : categories(series);
  const timeCats = !!cats && catsAreTime(cats);
  const horizontal = o.orient === 'h' || (!!cats && !timeCats && type === 'bar' && series.length === 1 &&
    (cats.length > 7 || cats.some((c) => c.length > 16)));
  const log = !!o.log;
  // One notation per axis, chosen from that axis's own largest value: a run of
  // ticks reading 18k, 15k, 12k, 9,000, 6,000 makes the reader re-scale twice.
  const vfmt = magFormatter(allValues(series));
  // Counts are integers. Without this a four-release axis prints 0, 0.5, 1, 1.5,
  // 2 and invites the reader to imagine half a released model family.
  const vals = allValues(series);
  const wholeCounts = vals.length > 0 && vals.every((v) => Number.isInteger(v)) &&
    Math.max(...vals.map(Math.abs)) <= 20;
  const valueAxis = {
    type: log ? 'log' : 'value',
    ...(wholeCounts && !log ? { minInterval: 1 } : {}),
    axisLabel: { color: INK3, fontSize: 11, formatter: (v) => vfmt(v), hideOverlap: true },
    splitLine: { lineStyle: { color: RULE, type: 'solid' } },
    axisLine: { show: false },
    axisTick: { show: false },
  };
  if (log) valueAxis.minorSplitLine = { show: false };

  const marksAreLines = type === 'line' || type === 'area';
  // A numeric x that spans orders of magnitude (student size, 3B to 405B) puts
  // every point a reader is choosing between into the leftmost tenth of the
  // plot. Opt-in per chart, and only where every value is positive.
  const logX = !cats && !dateX && numericX && !!o.logX &&
    series.every((s) => s.data.every((p) => isNum(p.x) && p.x > 0));
  const catAxis = {
    type: cats ? 'category' : (dateX ? 'time' : (logX ? 'log' : 'value')),
    ...(cats ? { data: cats } : {}),
    ...(horizontal ? { inverse: true } : {}),
    ...axisNameStyle(cats ? '' : spec.xLabel),
    axisLabel: {
      color: INK3, fontSize: 11, ...(horizontal ? { lineHeight: 14 } : {}),
      formatter: cats
        ? (cats.length <= 8 && !horizontal
          ? ((v) => wrapLabel(v, cats.length <= 4 ? 16 : 12))
          // A horizontal bar's category label sits in a gutter that grows with
          // it (containLabel), so it wraps rather than truncating: a label cut
          // through the middle ("27 Jan 20…one session") reads as a rendering
          // fault, and one cut at the end loses the fact.
          : (horizontal
            ? ((v) => wrapLabel(v, isNarrow() ? 24 : 40))
            : ((v) => shortenCat(v, 30))))
        : (dateX ? undefined : (v) => fmtShort(v)),
      // Every category keeps its label. Dropping one leaves an unidentifiable
      // bar; a few categories wrap onto two lines instead of rotating, which is
      // what clipped "United States" to "ited States" at the plot's left edge.
      // A line is continuous, so a skipped tick still reads; twelve years at
      // 390px otherwise print as one solid smear. Bars keep every label.
      ...(cats && !horizontal
        ? (marksAreLines
          ? { interval: 'auto' }
          : (cats.length <= 8
            ? { interval: 0, rotate: 0 }
            : { interval: 0, rotate: cats.some((c) => c.length > 9) ? 32 : 0 }))
        : {}),
      hideOverlap: cats && !marksAreLines ? false : true,
    },
    axisLine: { lineStyle: { color: RULE_S } },
    axisTick: { show: false },
    splitLine: { show: false },
  };

  const showBarLabels = series.length === 1 || (cats && series.length * cats.length <= 14);
  const isArea = type === 'area';
  // An area fill encodes the region between the baseline and the curve. A log
  // axis compresses that region unevenly, so the fill is proportional to
  // nothing: the flat early years of a series spanning four orders of
  // magnitude collect the most ink, and a doubling near the top is drawn
  // thinner than a rounding error near the bottom. On a log axis the same
  // series is drawn as a plain line; switch the panel to Linear and the fill
  // comes back, because there it means something again.
  const fillArea = isArea && !log;
  const stacked = type === 'stackedBar';

  // A single series has nothing to encode with colour: one ink for every mark,
  // with the accent spent on the one that carries the argument. Per-category
  // vendor hues survive only when every category actually names a vendor.
  const singleSeries = series.length === 1 && !!cats && cats.length > 1;
  const vendorCats = singleSeries && cats.every((c) => knownVendorHue(c));
  const peak = singleSeries && !vendorCats
    ? (() => {
      let best = null;
      for (const p of series[0].data) if (isNum(p.y) && (!best || p.y > best.y)) best = p;
      return best ? String(best.x) : null;
    })()
    : null;

  const ecSeries = series.map((s, i) => {
    const color = s.color || (singleSeries && !vendorCats ? SERIES_INK : hue(s.name, i));
    const data = cats
      ? alignToCategories(s, cats, singleSeries
        ? (p, c) => (vendorCats ? knownVendorHue(c) : (c === peak ? MARK_INK : SERIES_INK))
        : null)
      : s.data.map((p) => ({
        value: [dateX ? dateValue(p.x) : p.x, p.y],
        name: String(p.x),
        _raw: p,
        ...(p.color ? { itemStyle: { color: p.color } } : {}),
      }));
    if (type === 'line' || isArea) {
      return {
        name: s.name, type: 'line', data,
        smooth: false, symbolSize: 6, showSymbol: s.data.length <= 24,
        // A cumulative count moves in steps, not on a slope: it is unchanged
        // until the day it changes, and a diagonal invents the days between.
        ...(o.step ? { step: o.step } : {}),
        // A provisional run (a year still in progress) is drawn dashed and
        // faint, so the reader sees it is not the same kind of observation.
        // Line weight is a second channel: three tiers of one vendor keep that
        // vendor's hue (DESIGN.md section 6 forbids re-mapping it) and separate
        // by weight and by the label at each line's end.
        lineStyle: { width: s.lineWidth || 2, color, ...(s.dashed ? { type: 'dashed' } : {}) },
        itemStyle: { color },
        ...(fillArea ? { areaStyle: { color, opacity: s.dashed ? 0.05 : 0.12 } } : {}),
        ...((series.length <= 4 || o.endLabels === 'all') && !o.compact && s.endLabel !== false &&
          o.endLabels !== false && !isNarrow() ? {
          endLabel: {
            show: true, color: INK, fontSize: 11, fontWeight: 500,
            distance: 6, formatter: () => s.endLabelText || s.name,
            // Two lines that finish a few pixels apart print two labels on top
            // of one another; the gap is opened by hand where it is needed.
            ...(s.endLabelOffset ? { offset: s.endLabelOffset } : {}),
          },
        } : {}),
        markPoint: s.marks
          ? crossMarks(s.marks, dateX)
          : markMax(s, cats, unit, series.length === 1 && !o.compact, dateX),
      };
    }
    // bar family
    return {
      name: s.name, type: 'bar', data,
      ...(stacked ? { stack: 'total' } : {}),
      barMaxWidth: horizontal ? 18 : 46,
      itemStyle: {
        color, borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
      },
      label: showBarLabels && !stacked ? {
        show: true, position: horizontal ? 'right' : 'top',
        color: INK2, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace',
        // Value labels print the exact figure: the chart exists for precise
        // comparison, and rounding it here contradicts the table beside it.
        formatter: (p) => {
          const v = Array.isArray(p.value) ? p.value[1] : p.value;
          if (!isNum(v)) return '';
          const raw = p.data && p.data._raw;
          if (raw && raw._filled) return '';
          // Where two bars are not the same kind of measurement, the mark says
          // so beside its own figure rather than in the footnote.
          if (raw && raw.valueLabel) return String(raw.valueLabel);
          return fmt(v) + (raw && raw.partial ? ' YTD' : '');
        },
      } : { show: false },
    };
  });

  // The gutter has to clear whatever the end label actually prints, which is
  // not always the series name.
  const longest = Math.max(...series.map((s) => String(s.endLabelText || s.name || '').length));
  const endLabelled = (type === 'line' || isArea) && (series.length <= 4 || o.endLabels === 'all') &&
    !o.compact && o.endLabels !== false && !isNarrow();
  const rotatedCats = !!cats && !horizontal && !marksAreLines && cats.length > 8 &&
    cats.some((c) => String(c).length > 9);
  // A horizontal bar prints its figure past the end of the bar, so the gutter
  // has to clear whatever that figure actually says — "-589 in one trading
  // session" is not 62px wide.
  const valueLabelChars = Math.max(0, ...series.map((s) => Math.max(0, ...s.data
    .map((p) => String(p.valueLabel || '').length))));
  const grid = horizontal
    ? {
      left: 8, right: Math.min(240, Math.max(62, Math.round(valueLabelChars * 6.3) + 14)),
      top: 12, bottom: 6, containLabel: true,
    }
    : {
      // A rotated category label is anchored at its tick and runs left of it,
      // so the leftmost one needs somewhere to go.
      left: rotatedCats ? Math.min(96, Math.max(8, (String(cats[0] || '').length - 10) * 5)) : 8,
      // 6.6px per character left "GPQA Diamond" one glyph short of its gutter;
      // the 14px covers the label's own offset from its last point.
      right: endLabelled ? Math.min(170, Math.max(74, longest * 7 + 14)) : 22,
      top: (type === 'line' || isArea) && series.length === 1 && !o.compact ? 40
        : (showBarLabels && !stacked ? 30 : 22),
      bottom: spec.xLabel && !cats ? 32 : 6, containLabel: true,
    };

  return {
    animationDuration: 320,
    grid,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: cats ? 'shadow' : 'line', lineStyle: { color: RULE_S } },
      valueFormatter: tooltipValue(unit),
      confine: true,
      order: stacked ? 'seriesDesc' : undefined,
    },
    xAxis: horizontal ? valueAxis : catAxis,
    yAxis: horizontal ? catAxis : valueAxis,
    series: ecSeries,
  };
}

/**
 * Named crossings, drawn on the plot. A chart whose headline asks "when does
 * self-hosting win?" has to show where the answer is; stating the three
 * crossing volumes in the footnote leaves the chart itself mute. The labels
 * alternate above and below the line, and same-side neighbours also alternate
 * distance, so three marks on one horizontal never collide however narrow the
 * plot is.
 */
function crossMarks(marks, dateX) {
  // At 390px the crossings sit where every line has converged, so there is no
  // clear space left for a two-line caption: "329M vs Sonnet 5" printed over
  // the gold, red and blue lines at once and neither the label nor the series
  // could be read. Below 640px the ring keeps a numeral and the phrase moves
  // to the key beneath the plot, the same device the named scatters use.
  const narrow = isPhone();
  return {
    symbol: 'circle', symbolSize: 9, silent: true,
    itemStyle: { color: '#FFFFFF', borderColor: MARK_INK, borderWidth: 2 },
    data: marks.map((m, i) => ({
      coord: [dateX ? dateValue(m.x) : m.x, m.y],
      label: narrow ? {
        show: true, position: i % 2 ? 'bottom' : 'top', distance: 7,
        color: INK, fontSize: 10, fontWeight: 600, align: 'center',
        backgroundColor: 'rgba(250,248,244,.9)', padding: [1, 3], borderRadius: 2,
        formatter: String(i + 1),
      } : {
        show: true, position: m.position || (i % 2 ? 'bottom' : 'top'),
        distance: isNum(m.distance) ? m.distance : 8,
        color: INK, fontSize: 10.5, lineHeight: 13, align: m.align || 'center',
        backgroundColor: 'rgba(255,255,255,.92)', padding: [2, 4], borderRadius: 3,
        formatter: String(m.text || ''),
      },
    })),
  };
}

function markMax(s, cats, unit, on, dateX) {
  if (!on) return undefined;
  let best = null;
  for (const p of s.data) if (isNum(p.y) && (!best || p.y > best.y)) best = p;
  if (!best) return undefined;
  const text = (best.label || String(best.x)) + ' · ' + fmtShort(best.y) + (unit ? ' ' + unit : '');
  return {
    symbol: 'circle', symbolSize: 7, silent: true,
    itemStyle: { color: PALETTE[0], borderColor: '#FFFFFF', borderWidth: 1.5 },
    label: {
      show: true, position: 'top', distance: 10, color: INK, fontSize: 11,
      backgroundColor: 'rgba(255,255,255,.86)', padding: [3, 5], borderRadius: 3,
      formatter: text,
    },
    data: [{ coord: cats ? [String(best.x), best.y] : [dateX ? dateValue(best.x) : best.x, best.y] }],
  };
}

/** Under 640px a point label is wider than the plot it sits in. */
const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 640;

/**
 * The points a scatter names, in plot order. At phone width the name moves to
 * a numbered key beneath the chart and the mark keeps only its numeral, so the
 * chart still names exactly the points its caption says it names.
 */
function namedPoints(spec) {
  const out = [];
  for (const s of seriesOf(spec)) for (const p of s.data) if (p.label) out.push(p);
  // Numbered left to right, so the key reads in the order the eye crosses the
  // plot rather than in the order the series happen to be filed.
  if (out.every((p) => isNum(p.x))) out.sort((a, b) => a.x - b.x);
  return out;
}

/**
 * Two dozen named marks on one price-against-score plot is a knot: at 1440
 * "GPT-5.6 Sol" printed across the Gemini 3.1 Pro marker, "GPT-5.4 nano" landed
 * on a green one, and the whole top-right corner ran together. ECharts can hide
 * whichever labels collide, but hiding is silent and arbitrary — the reader
 * cannot tell a model that was not plotted from one whose name lost a race.
 *
 * The chart's own argument is the frontier: the cheapest model at each level of
 * score, which is what "the upper-left corner is the whole story" means. Those
 * marks keep their names, the dearest model on the plot keeps its as the other
 * end of the trade, and every other name stays one tap away in the tooltip and
 * printed in full in the table beneath. Labels alternate above and below the
 * staircase so neighbours a few pixels apart never share a line.
 */
function frontierLabels(spec) {
  if (!spec || String(spec.type) !== 'scatter') return spec;
  const series = seriesOf(spec);
  const pts = [];
  for (const s of series) for (const p of s.data) if (p.label) pts.push(p);
  if (pts.length <= 12) return spec;
  // Only a cost axis has a cheap end, and only then is "cheapest at this score"
  // the reading. Anywhere else the direction would be an assumption.
  if (!/price|cost|usd|\$/i.test(String(spec.xLabel || ''))) return spec;
  if (!pts.every((p) => isNum(p.x) && isNum(p.y))) return spec;
  const keep = new Set(pts.filter((p) => !pts.some((q) =>
    q !== p && q.x <= p.x && q.y >= p.y && (q.x < p.x || q.y > p.y))));
  const dearest = pts.reduce((a, c) => (!a || c.x > a.x ? c : a), null);
  if (dearest) keep.add(dearest);
  const order = [...keep].sort((a, b) => a.x - b.x);
  // Every mark up and to the left of a frontier point would dominate it, so
  // that quadrant is empty by construction. A name set above its mark and
  // anchored to end at it therefore runs into guaranteed clear space — which
  // sending half of them below did not: "Gemini 3.1 Pro (Preview)" dropped
  // straight onto the DeepSeek-V4-Pro marker. Two frontier points can still sit
  // a point of score apart, so the height alternates instead of the side.
  const xs = pts.map((p) => p.x).filter((v) => v > 0);
  const ys = pts.map((p) => p.y);
  const xlo = Math.log10(Math.min(...xs));
  const xhi = Math.log10(Math.max(...xs));
  const ylo = Math.min(...ys);
  const yhi = Math.max(...ys);
  const fx = (v) => (xhi > xlo ? (Math.log10(v) - xlo) / (xhi - xlo) : 0.5);
  const fy = (v) => (yhi > ylo ? (v - ylo) / (yhi - ylo) : 0.5);
  const align = new Map();
  const dist = new Map();
  order.forEach((p, i) => {
    align.set(p, fx(p.x) < 0.22 ? 'left' : 'right');
    // The highest-scoring marks have the plot's ceiling just above them and no
    // room for the raised slot.
    dist.set(p, fy(p.y) > 0.95 ? 8 : (i % 2 ? 34 : 8));
  });
  return {
    ...spec,
    series: series.map((s) => ({
      ...s,
      data: s.data.map((p) => {
        if (!p.label) return p;
        // The name is not lost, only moved: the tooltip and the data table
        // both read `title` when there is no label.
        if (!keep.has(p)) return { ...p, title: p.title || p.label, label: null };
        return { ...p, labelPos: 'top', labelAlign: align.get(p), labelDist: dist.get(p) };
      }),
    })),
    notes: (spec.notes ? spec.notes + ' ' : '') + keep.size + ' of the ' + pts.length +
      ' marks are named on the plot: the price-and-score frontier, where no other model shown is ' +
      'both cheaper and higher-scoring, plus the dearest model plotted. Tap or hover any other dot ' +
      'for its name; all ' + pts.length + ' are listed in the data beneath.',
  };
}

function pointKeyHtml(spec) {
  if (!isPhone()) return '';
  const items = [];
  if (String(spec.type) === 'scatter') for (const p of namedPoints(spec)) items.push(String(p.label));
  // Crossing annotations are numbered in the same way and in the same order
  // the marks were built in, which is left to right along the axis.
  for (const s of seriesOf(spec)) {
    if (!Array.isArray(s.marks)) continue;
    for (const m of s.marks) items.push(String(m.text || '').replace(/\s*\n\s*/g, ' '));
  }
  if (!items.length || items.length > 12) return '';
  return '<ol class="ptkey">' + items.map((t, i) =>
    '<li class="ptkey__i"><span class="ptkey__n">' + (i + 1) + '</span>' +
    esc(t) + '</li>').join('') + '</ol>';
}

function scatterOption(spec, series, hue, unit, o) {
  const dateX = xIsDate(series);
  const log = !!o.log;
  const labelled = series.reduce((n, s) => n + s.data.filter((p) => p.label).length, 0);
  // Model size runs from 1.5B to 671B: on a linear axis every small student is
  // crushed against the y-axis, which is exactly where the finding lives.
  const xs = [];
  for (const s of series) for (const p of s.data) if (isNum(p.x)) xs.push(p.x);
  const logX = !dateX && !!o.logX && xs.length > 1 && xs.every((v) => v > 0);
  const connect = !!o.connect;
  const endLabelled = connect && series.length <= 4 && !isNarrow();
  const narrow = isPhone();
  // Below 640px a model name is wider than the plot, so the name moves to a
  // numbered key beneath the chart and the mark carries its numeral. Dropping
  // the labels outright left an unlabelled cloud under a caption still saying
  // five points are named. The numbers are assigned over the unsorted series,
  // which is the order pointKeyHtml() prints the key in, and travel on the
  // data item so a connected scatter's x-sort cannot renumber them.
  const nOf = new Map();
  if (narrow) namedPoints(spec).forEach((p, i) => nOf.set(p, i + 1));
  // A point label anchored to the right of a mark in the right-hand cluster
  // ran outside the plot frame, where a 152px gutter stacked five of them into
  // a leaderless column no longer aligned with the dots they named. Labels on
  // the right of the domain flip to the left of their own mark and stay inside
  // the frame, which also gives the plot the card's full width.
  const xvals = [];
  for (const s of series) {
    for (const p of s.data) {
      const v = dateX ? dateValue(p.x) : p.x;
      if (isNum(v)) xvals.push(v);
    }
  }
  const xlo = xvals.length ? Math.min(...xvals) : 0;
  const xhi = xvals.length ? Math.max(...xvals) : 1;
  const flip = (v) => isNum(v) && xhi > xlo && ((logX
    ? (Math.log10(v) - Math.log10(xlo)) / (Math.log10(xhi) - Math.log10(xlo))
    : (v - xlo) / (xhi - xlo)) > 0.62);
  return {
    animationDuration: 320,
    grid: {
      left: 8,
      right: endLabelled ? Math.min(160, Math.max(80, Math.max(...series.map((s) => String(s.name || '').length)) * 6.4))
        : 24,
      // A numeral sits above its mark, so the topmost named point needs a line
      // of clearance the unnumbered version did not.
      top: narrow && labelled ? 26 : 18, bottom: spec.xLabel ? 34 : 8, containLabel: true,
    },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p) => {
        const raw = p.data && p.data._raw ? p.data._raw : {};
        const x = dateX ? longDate(raw.x) : fmt(raw.x);
        return '<strong>' + esc(raw.title || raw.label || p.seriesName) + '</strong><br>' +
          esc(spec.xLabel || 'x') + ': ' + esc(x) + '<br>' +
          esc(spec.yLabel || 'y') + ': ' + esc(fmt(raw.y)) + (unit ? ' ' + esc(unit) : '');
      },
    },
    xAxis: {
      type: dateX ? 'time' : (logX ? 'log' : 'value'),
      ...axisNameStyle(spec.xLabel),
      axisLabel: { color: INK3, fontSize: 11, ...(dateX ? {} : { formatter: (v) => fmtShort(v) }) },
      axisLine: { lineStyle: { color: RULE_S } }, axisTick: { show: false },
      splitLine: { show: false }, scale: !dateX && !logX,
      ...(logX && o.xTicks ? { min: o.xTicks[0], max: o.xTicks[o.xTicks.length - 1], interval: null } : {}),
    },
    yAxis: {
      type: log ? 'log' : 'value',
      axisLabel: { color: INK3, fontSize: 11, formatter: (v) => fmtShort(v), hideOverlap: true },
      splitLine: { lineStyle: { color: RULE, type: 'solid' } },
      axisLine: { show: false }, axisTick: { show: false },
      // Opt-in only, and the panel note says so: a scatter's y is a position,
      // not a length, so a zero baseline that no point comes near is 40% of
      // the plot spent on nothing.
      scale: !!o.yZoom,
    },
    series: series.map((s, i) => {
      const color = hue(s.name, i);
      const pts = s.data.slice().sort((p, q) => (connect && isNum(p.x) && isNum(q.x) ? p.x - q.x : 0));
      return {
        name: s.name, type: connect ? 'line' : 'scatter', symbolSize: connect ? 9 : 11,
        ...(connect ? { showSymbol: true, smooth: false, lineStyle: { width: 1.5, color, opacity: 0.55 } } : {}),
        itemStyle: { color, opacity: 0.9, borderColor: '#FFFFFF', borderWidth: 1 },
        data: pts.map((p) => {
          const xv = dateX ? dateValue(p.x) : p.x;
          return {
            value: [xv, p.y], name: p.label || s.name, _raw: p,
            ...(p.label && narrow ? { _n: nOf.get(p) } : {}),
            ...(p.label && !narrow && p.labelPos
              ? {
                label: {
                  position: p.labelPos,
                  align: p.labelAlign || 'center',
                  distance: isNum(p.labelDist) ? p.labelDist : 8,
                },
              }
              : (p.label && !narrow && flip(xv) ? { label: { position: 'left' } } : {})),
          };
        }),
        label: {
          show: !!s.data.some((p) => p.label),
          ...(narrow
            ? {
              position: 'top', distance: 3, color: INK, fontSize: 10, fontWeight: 600,
              backgroundColor: 'rgba(250,248,244,.9)', padding: [1, 3], borderRadius: 2,
              formatter: (p) => String(p.data._n || ''),
            }
            : {
              position: 'right', distance: 7, color: INK2, fontSize: 11,
              // Never truncated: "deepseek-v4-pro (pre-16…" cannot be resolved
              // to a model, which is the one thing a point label is for. Charts
              // that cannot fit every name label fewer points instead.
              formatter: (p) => String(p.data._raw.label || ''),
            }),
        },
        labelLayout: { hideOverlap: true },
        ...(endLabelled ? {
          endLabel: {
            show: true, color: INK, fontSize: 11, fontWeight: 500, distance: 6,
            formatter: () => s.name,
          },
        } : {}),
        // A horizontal reference line ("parity with the teacher") turns the
        // points above it from an oddity into the finding they are.
        ...(i === 0 && spec.refLine ? {
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: RULE_S, type: 'dashed', width: 1 },
            label: {
              // The left edge of a log size axis is where the smallest students
              // cluster, and their point labels sit exactly here; the line's own
              // label goes to the empty end of the plot, on a plate.
              show: true, position: 'insideEndTop', color: INK3, fontSize: 10.5,
              backgroundColor: 'rgba(255,255,255,.92)', padding: [2, 4], borderRadius: 3,
              formatter: spec.refLine.text || '',
            },
            data: [{ yAxis: spec.refLine.y }],
          },
        } : {}),
      };
    }),
  };
}

/**
 * Dot plot. A bar states a length from zero, which a logarithmic axis
 * misreports; a dot states a position, which it does not. So a single series
 * spanning three orders of magnitude — 817 samples against 1.2 million — is
 * drawn as dots on a log axis, where every value is legible at once.
 */
function dotOption(spec, series, unit, o) {
  const s = series[0];
  const cats = s.data.map((p) => String(p.x));
  const vals = s.data.filter((p) => isNum(p.y)).map((p) => p.y);
  // The panel decides the scale (and offers the toggle); the local span check
  // is only the fallback for a dot chart drawn outside a panel.
  const positive = vals.length > 1 && vals.every((v) => v > 0);
  const log = positive && (o.log === true ||
    (o.log !== false && Math.max(...vals) / Math.min(...vals) >= 100));
  let peak = null;
  for (const p of s.data) if (isNum(p.y) && (!peak || p.y > peak.y)) peak = p;
  const dfmt = magFormatter(vals);
  return {
    animationDuration: 320,
    grid: { left: 8, right: 74, top: 14, bottom: spec.xLabel ? 34 : 8, containLabel: true },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p) => '<strong>' + esc(p.name) + '</strong><br>' +
        esc(spec.yLabel || 'Value') + ': ' + fmt(p.data._raw.y) + (unit ? ' ' + esc(unit) : ''),
    },
    xAxis: {
      type: log ? 'log' : 'value',
      ...axisNameStyle(spec.xLabel),
      axisLabel: { color: INK3, fontSize: 11, formatter: (v) => dfmt(v), hideOverlap: true },
      splitLine: { lineStyle: { color: RULE, type: 'solid' } },
      axisLine: { show: false }, axisTick: { show: false },
    },
    yAxis: {
      type: 'category', data: cats, inverse: true,
      axisLabel: {
        // Wrapped, never cut: "AWS / GCP / A…100 (8-GPU node)" reads as a bug.
        color: INK3, fontSize: 11, lineHeight: 13,
        formatter: (v) => wrapLabel(v, isNarrow() ? 22 : 34),
      },
      axisLine: { lineStyle: { color: RULE_S } }, axisTick: { show: false },
      splitLine: { show: false },
    },
    series: [{
      name: s.name, type: 'scatter', symbolSize: 11,
      itemStyle: { color: (p) => (peak && String(p.data.name) === String(peak.x) ? MARK_INK : SERIES_INK), opacity: 0.95 },
      data: s.data.map((p) => ({ value: [p.y, String(p.x)], name: String(p.x), _raw: p })),
      label: {
        show: true, position: 'right', distance: 8, color: INK2, fontSize: 11,
        fontFamily: 'IBM Plex Mono, monospace',
        formatter: (p) => fmt(p.data._raw.y),
      },
      labelLayout: { hideOverlap: true },
    }],
  };
}

/**
 * Dumbbell. Two comparable prices for the same subject, joined by a rule, with
 * the ratio printed in a fixed column at the right.
 *
 * The two model names live in the axis gutter, tinted to match their own dot,
 * so the only text inside the plot is a price. A name and a price concatenated
 * into one run ("Haiku 4.5 5") cannot be parsed back into a name and a number,
 * and at 390px a name-length label crosses the axis rule, the row rule and its
 * neighbour's label. One short figure per dot, staggered above and below the
 * joining rule, stays inside its own row at every width.
 */
function dumbbellOption(spec, series, hue, unit, o) {
  const cats = categories(series);
  const [a, b] = series;
  const at = new Map(a.data.map((p) => [String(p.x), p]));
  const bt = new Map((b ? b.data : []).map((p) => [String(p.x), p]));
  const vals = [...allValues(series)].filter((v) => v > 0);
  const log = vals.length > 1 && (o.log === true ||
    (o.log !== false && Math.max(...vals) / Math.min(...vals) >= 100));
  const rows = cats.map((c, i) => ({ i, c, a: at.get(c), b: bt.get(c) }));
  const colA = hue(a.name, 0);
  const colB = b ? hue(b.name, 1) : colA;
  const narrow = isNarrow();
  const money = /usd|\$|dollar/i.test(String(unit) + ' ' + String(spec.xLabel || ''));
  // A price column reads as a column only at one precision: $0.10 beside $1.04
  // beside $50, never $0.1 beside $1.04.
  const price = (v) => (money
    ? '$' + (Number.isInteger(v) ? String(v) : v.toFixed(2))
    : trimNum(v, 2));

  // A small tier shared by two frontier rows is one observation drawn twice.
  // It is named as shared in the gutter and drawn as a hollow ring rather than
  // passed off as two independent measurements.
  const smallSeen = new Map();
  for (const r of rows) {
    const k = r.b && r.b.label ? String(r.b.label) : null;
    if (k) smallSeen.set(k, (smallSeen.get(k) || 0) + 1);
  }
  const isShared = (r) => !!(r.b && r.b.label && smallSeen.get(String(r.b.label)) > 1);

  // A fixed axis domain gives the ratio column something to hang on: anchored
  // at the axis maximum, every ratio prints at the same x, which is what makes
  // it a column rather than nine floating figures.
  const maxv = vals.length ? Math.max(...vals) : 1;
  const minv = vals.length ? Math.min(...vals) : 1;
  let axisMax = log
    ? Math.pow(10, Math.ceil(Math.log10(maxv)))
    : Math.ceil(maxv / Math.pow(10, Math.floor(Math.log10(maxv)))) *
      Math.pow(10, Math.floor(Math.log10(maxv)));
  // The ratio column hangs off the axis maximum, so no dot may sit on it.
  if (axisMax <= maxv * 1.02) {
    axisMax = log
      ? axisMax * 10
      : axisMax + Math.pow(10, Math.floor(Math.log10(maxv)));
  }
  const axisMin = log ? Math.pow(10, Math.floor(Math.log10(minv))) : 0;

  const rowByCat = new Map(rows.map((r) => [r.c, r]));
  // Names are never cut: at narrow widths they wrap onto a second gutter line
  // instead, because a truncated model name cannot be resolved to a model.
  const richLines = (tag, text) => String(narrow ? wrapLabel(String(text), 15) : text)
    .split(String.fromCharCode(10)).map((l) => '{' + tag + '|' + l + '}').join(String.fromCharCode(10));

  // A centred label on the leftmost dot runs out of the plot and over the
  // gutter text; one on the rightmost runs over the ratio column. The two
  // extremes anchor their label at the dot instead of centring it on it.
  const span = log ? Math.log10(axisMax) - Math.log10(axisMin) : axisMax - axisMin;
  const frac = (v) => (log
    ? (Math.log10(v) - Math.log10(axisMin)) / span
    : (v - axisMin) / span);
  const edgeLabel = (v) => {
    if (!isNum(v) || !(v > 0)) return {};
    const f = frac(v);
    if (f < 0.09) return { label: { align: 'left' } };
    if (f > 0.93) return { label: { align: 'right' } };
    return {};
  };

  const point = (name, get, color, pos) => ({
    name,
    type: 'scatter',
    symbolSize: 11,
    z: 3,
    itemStyle: { color, borderColor: '#FFFFFF', borderWidth: 1 },
    data: rows.filter((r) => get(r) && isNum(get(r).y))
      .map((r) => ({
        value: [get(r).y, r.c],
        name: r.c,
        _raw: get(r),
        ...edgeLabel(get(r).y),
        ...(pos === 'bottom' && isShared(r)
          ? { itemStyle: { color: '#FFFFFF', borderColor: color, borderWidth: 2 } }
          : {}),
      })),
    label: {
      show: true, position: pos, distance: 7,
      color: INK, fontSize: 10.5, fontFamily: 'IBM Plex Mono, monospace',
      formatter: (p) => price(p.data._raw.y),
    },
    labelLayout: { hideOverlap: true },
  });

  // `containLabel` mis-measures a three-line rich-text axis label and clipped
  // "Gemini 2.5 Flash-Lite" against the card edge, so the gutter is measured
  // from the strings that will actually be printed.
  const gutterLines = [];
  for (const r of rows) {
    gutterLines.push(String(r.c).split(' · ')[0].length * (narrow ? 6.0 : 6.4));
    const mono = (t) => String(narrow ? wrapLabel(String(t), 15) : t)
      .split(String.fromCharCode(10)).forEach((l) => gutterLines.push(l.length * (narrow ? 5.5 : 5.9)));
    if (r.a && r.a.label) mono(r.a.label);
    if (r.b && r.b.label) mono(r.b.label + (isShared(r) ? ' (shared)' : ''));
  }
  const gutter = Math.round(Math.min(narrow ? 128 : 180,
    Math.max(56, Math.max(...gutterLines, 0) + 16)));

  return {
    animationDuration: 320,
    grid: {
      left: gutter, right: narrow ? 44 : 52, top: 14,
      bottom: spec.xLabel ? 50 : 26, containLabel: false,
    },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true,
      formatter: (ps) => {
        if (!ps.length) return '';
        const c = ps[0].name;
        const ra = at.get(c), rb = bt.get(c);
        const line = (p, r) => (r ? '<br>' + esc(p) + ': ' + fmt(r.y) + (unit ? ' ' + esc(unit) : '') +
          (r.label ? ' <span style="color:#6B655C">(' + esc(r.label) + ')</span>' : '') : '');
        const ratio = ra && rb && isNum(ra.y) && isNum(rb.y) && rb.y > 0
          ? '<br><strong>' + trimNum(ra.y / rb.y, 1) + 'x</strong> spread' : '';
        return '<strong>' + esc(c) + '</strong>' + line(a.name, ra) + (b ? line(b.name, rb) : '') + ratio;
      },
    },
    xAxis: {
      type: log ? 'log' : 'value',
      min: axisMin, max: axisMax,
      ...axisNameStyle(spec.xLabel),
      axisLabel: { color: INK3, fontSize: 11, formatter: (v) => fmtShort(v), hideOverlap: true },
      splitLine: { lineStyle: { color: RULE, type: 'solid' } },
      axisLine: { show: false }, axisTick: { show: false },
    },
    yAxis: {
      type: 'category', data: cats, inverse: true,
      axisLabel: {
        color: INK2, fontSize: 11, margin: 10, lineHeight: 14,
        formatter: (v) => {
          const r = rowByCat.get(v);
          if (!r) return String(v);
          const out = ['{v|' + String(v).split(' · ')[0] + '}'];
          if (r.a && r.a.label) out.push(richLines('f', r.a.label));
          if (r.b && r.b.label) {
            out.push(richLines('s', r.b.label + (isShared(r) ? ' (shared)' : '')));
          }
          return out.join(String.fromCharCode(10));
        },
        rich: {
          v: { color: INK2, fontSize: 11, fontWeight: 500, lineHeight: 15, align: 'right' },
          f: {
            color: colA, fontSize: narrow ? 9.5 : 10, lineHeight: 13,
            fontFamily: 'IBM Plex Mono, monospace', align: 'right',
          },
          s: {
            color: colB, fontSize: narrow ? 9.5 : 10, lineHeight: 13,
            fontFamily: 'IBM Plex Mono, monospace', align: 'right',
          },
        },
      },
      axisLine: { lineStyle: { color: RULE_S } }, axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: RULE, type: 'solid' } },
    },
    series: [
      {
        name: 'spread', type: 'custom', silent: true, z: 1,
        renderItem: (params, api) => {
          const idx = api.value(0);
          const p1 = api.coord([api.value(1), idx]);
          const p2 = api.coord([api.value(2), idx]);
          if (!isFinite(p1[0]) || !isFinite(p2[0])) return null;
          return {
            type: 'line',
            shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] },
            style: { stroke: RULE_S, lineWidth: 2 },
          };
        },
        encode: { x: [1, 2], y: 0 },
        data: rows.filter((r) => r.a && r.b && isNum(r.a.y) && isNum(r.b.y))
          .map((r) => [r.c, r.a.y, r.b.y]),
      },
      point(a.name, (r) => r.a, colA, 'top'),
      ...(b ? [point(b.name, (r) => r.b, colB, 'bottom')] : []),
      {
        name: 'ratio', type: 'scatter', symbolSize: 0, silent: true, clip: false, z: 2,
        data: rows.filter((r) => r.a && r.b && isNum(r.a.y) && isNum(r.b.y) && r.b.y > 0)
          .map((r) => ({ value: [axisMax, r.c], _ratio: r.a.y / r.b.y })),
        label: {
          show: true, position: 'right', distance: 7, align: 'left',
          color: INK, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 500,
          formatter: (p) => trimNum(p.data._ratio, 1) + 'x',
        },
      },
    ],
  };
}

/**
 * Ordinal stage chart. A legislative stage is a named position, not a quantity,
 * so the axis carries the five stage names and the cleared stages are drawn
 * behind the current one rather than implied by a bar length.
 */
function stageOption(spec, series, unit, o) {
  const stages = (o.stages || []).slice();
  const s = series[0];
  const cats = s.data.map((p) => String(p.x));
  // On a phone the four stage names collide into one another and the row
  // labels eat two thirds of the plot, so both are cut to their short forms.
  const narrow = typeof window !== 'undefined' && window.innerWidth < 700;
  const shortStage = (v) => {
    const t = String(v);
    if (!narrow) return t;
    return t.replace('Reported by committee', 'Committee').replace('Passed a chamber', 'Passed');
  };
  return {
    animationDuration: 320,
    grid: { left: 8, right: narrow ? 12 : 26, top: 14, bottom: narrow ? 44 : 34, containLabel: true },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p) => '<strong>' + esc(p.name) + '</strong><br>Furthest stage: ' +
        esc(stages[Math.round(p.data._raw.y) - 1] || String(p.data._raw.y)),
    },
    xAxis: {
      type: 'category', data: stages, boundaryGap: true,
      axisLabel: {
        color: INK3, fontSize: narrow ? 10 : 11, interval: 0, hideOverlap: false,
        rotate: narrow ? 32 : 0, formatter: (v) => wrapLabel(shortStage(v), 12),
      },
      axisLine: { lineStyle: { color: RULE_S } }, axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: RULE, type: 'solid' } },
    },
    yAxis: {
      type: 'category', data: cats, inverse: true,
      axisLabel: {
        color: INK2, fontSize: narrow ? 10 : 11,
        formatter: (v) => (narrow ? String(v).split(' — ')[0] : v),
      },
      axisLine: { lineStyle: { color: RULE_S } }, axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: RULE, type: 'solid' } },
    },
    series: [
      {
        name: 'Stages cleared', type: 'scatter', symbolSize: 8, silent: true,
        itemStyle: { color: '#D8D0C2' },
        data: s.data.flatMap((p) => {
          const n = Math.round(p.y);
          const out = [];
          for (let i = 1; i < n; i += 1) out.push({ value: [stages[i - 1], String(p.x)] });
          return out;
        }),
      },
      {
        name: s.name, type: 'scatter', symbolSize: 13,
        itemStyle: { color: MARK_INK, borderColor: '#FFFFFF', borderWidth: 1.5 },
        data: s.data.filter((p) => isNum(p.y))
          .map((p) => ({ value: [stages[Math.round(p.y) - 1], String(p.x)], name: String(p.x), _raw: p })),
      },
    ],
  };
}

function donutOption(spec, series, hue, unit) {
  const pts = series[0].data;
  const total = pts.reduce((n, p) => n + (isNum(p.y) ? p.y : 0), 0);
  return {
    animationDuration: 320,
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p) => '<strong>' + esc(p.name) + '</strong><br>' + fmt(p.value) +
        (unit ? ' ' + esc(unit) : '') + ' · ' + (total ? Math.round((p.value / total) * 100) : 0) + '%',
    },
    series: [{
      type: 'pie', radius: ['54%', '76%'], center: ['50%', '52%'],
      avoidLabelOverlap: true, minAngle: 6,
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      label: {
        color: INK2, fontSize: 11, lineHeight: 15,
        // A part-to-whole chart has to print the part: the share leads and the
        // count follows it, so the label answers the question the mark asks.
        formatter: (p) => '{a|' + shortLabel(p.name) + '}\n{b|' +
          (total ? trimNum((p.value / total) * 100, 1) + '%' : '—') + ' · ' +
          fmt(p.value) + ' ' + (unit || '') + '}',
        rich: {
          a: { color: INK, fontSize: 12, fontWeight: 500 },
          b: { color: INK3, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' },
        },
      },
      labelLine: { length: 10, length2: 14, lineStyle: { color: RULE_S } },
      data: pts.map((p, i) => ({
        name: String(p.x), value: p.y, itemStyle: { color: hue(String(p.x), i) },
      })),
    }],
  };
}

function shortLabel(s) {
  const t = String(s);
  const cut = t.indexOf(' (');
  return cut > 0 ? t.slice(0, cut) : (t.length > 26 ? t.slice(0, 25) + '…' : t);
}

function radarOption(spec, series, hue, unit) {
  const inds = categories(series);
  const maxima = inds.map((k) => {
    let m = 0;
    for (const s of series) for (const p of s.data) if (String(p.x) === k && isNum(p.y)) m = Math.max(m, p.y);
    return m || 1;
  });
  return {
    animationDuration: 320,
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p) => '<strong>' + esc(p.name) + '</strong><br>' + inds.map((k, i) =>
        esc(k) + ': ' + fmt(p.value[i]) + (unit ? ' ' + esc(unit) : '')).join('<br>'),
    },
    radar: {
      indicator: inds.map((k, i) => ({ name: shortLabel(k), max: maxima[i] * 1.05 })),
      radius: '66%', center: ['50%', '54%'],
      axisName: { color: INK2, fontSize: 11 },
      splitLine: { lineStyle: { color: RULE } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,0)', 'rgba(243,240,234,.5)'] } },
      axisLine: { lineStyle: { color: RULE } },
    },
    series: [{
      type: 'radar',
      data: series.map((s, i) => {
        const color = hue(s.name, i);
        const byX = new Map(s.data.map((p) => [String(p.x), p.y]));
        return {
          name: s.name,
          value: inds.map((k) => (isNum(byX.get(k)) ? byX.get(k) : 0)),
          lineStyle: { color, width: 2 },
          itemStyle: { color },
          areaStyle: { color, opacity: 0.1 },
        };
      }),
    }],
  };
}

/**
 * A radar is only defensible for a handful of overlapping outlines. Six filled
 * polygons on six axes make *area* the dominant read, and area on a radar is an
 * artefact of the axis order, not a quantity: reorder the axes and the same six
 * scores draw six different shapes. The axis names have nowhere to go either —
 * at 390px four of the six were clipped by the card edge and a fifth ellipsised.
 *
 * Small integer ranks are drawn instead as a matrix of filled dots: one row per
 * method, one column per dimension, every name printed in full, every value on
 * its own line and legible at any width.
 */
const MATRIX_MAX_STEPS = 7;

function isScoreMatrix(spec) {
  if (String(spec && spec.type) !== 'radar') return false;
  const series = seriesOf(spec);
  if (series.length <= 4) return false;
  const dims = categories(series);
  if (dims.length < 3 || dims.length > 10) return false;
  const vals = allValues(series);
  if (!vals.length) return false;
  return vals.every((v) => Number.isInteger(v) && v >= 0 && v <= MATRIX_MAX_STEPS);
}

function scoreMatrixHtml(spec, key) {
  const series = seriesOf(spec);
  const dims = categories(series);
  const hue = hueFactory();
  const steps = Math.max(5, ...allValues(series));
  const dots = (v) => {
    let out = '';
    for (let k = 0; k < steps; k += 1) out += '<i class="scorematrix__d' + (k < v ? ' is-on' : '') + '"></i>';
    return out;
  };
  const head = '<tr><th scope="col" class="scorematrix__corner">' +
    esc(spec.seriesHeader || 'Method') + '</th>' +
    dims.map((d) => '<th scope="col">' + esc(d) + '</th>').join('') + '</tr>';
  const body = series.map((s, i) => {
    const color = s.color || hue(s.name, i);
    const byX = new Map(s.data.map((p) => [String(p.x), p.y]));
    return '<tr style="--sm-hue:' + attr(color) + '">' +
      '<th scope="row" class="scorematrix__name">' +
      '<span class="scorematrix__key" aria-hidden="true"></span>' + esc(s.name) + '</th>' +
      dims.map((d) => {
        const v = byX.get(d);
        return '<td data-label="' + attr(d) + '">' + (isNum(v)
          ? '<span class="scorematrix__dots" aria-hidden="true">' + dots(v) + '</span>' +
            '<span class="scorematrix__n">' + esc(v) + '<span class="sr-only"> of ' + steps + '</span></span>'
          : '<span class="scorematrix__n scorematrix__n--none">—</span>') + '</td>';
      }).join('') + '</tr>';
  }).join('');
  return '<div class="scorematrix">' +
    (spec.yLabel ? '<p class="scorematrix__scale">' + esc(prose(spec.yLabel)) + '</p>' : '') +
    '<table class="scorematrix__t">' +
    '<caption class="sr-only">' + esc(spec.title || 'Scores') + '</caption>' +
    '<thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
    // No "Show data" disclosure: the matrix already prints every value with
    // its full row and column name, so the table beneath would be the same
    // numbers a second time. The download the disclosure carried stays.
    (key ? '<p class="scorematrix__foot"><button type="button" class="btn--link chart-data__csv"' +
      ' data-csv-chart="' + attr(key) + '">Download this data (CSV)</button></p>' : '') +
    '</div>';
}

/* ============================================================================
   6. renderChart — mounts an ECharts instance on a node
   ========================================================================== */

export function renderChart(node, spec) {
  if (!node) return null;
  if (!EC) {
    node.innerHTML = '<p class="empty">Charts require the vendored ECharts build, which did not load.</p>';
    return null;
  }
  const option = spec && spec.option ? spec.option : buildOption(spec || {}, (spec && spec.opts) || {});
  if (!option) {
    node.innerHTML = '<p class="empty">No data points for this chart.</p>';
    return null;
  }
  let chart;
  try {
    chart = EC.init(node, 'gd', { renderer: 'canvas' });
    chart.setOption(option, true);
  } catch (err) {
    node.innerHTML = '<p class="empty">This chart could not be drawn.</p>';
    return null;
  }
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { try { chart.resize(); } catch (e) { /* noop */ } });
    ro.observe(node);
  }
  const rec = { chart, ro, node, spec };
  instances.push(rec);
  node.__gdChart = rec;
  return chart;
}

/** Mount every chart surface that is actually visible (hidden tabs mount on switch). */
function mountCharts(root) {
  root.querySelectorAll('[data-chart]').forEach((node) => {
    if (node.__gdChart) return;
    if (!node.clientWidth || !node.clientHeight) return;
    const spec = CHART_SPECS.get(node.getAttribute('data-chart'));
    if (spec) renderChart(node, spec);
  });
}

const CHART_SPECS = new Map();

/**
 * A horizontal bar chart needs a row per category; everything else uses the
 * stylesheet's own chart heights so it can respond at narrow widths.
 */
function chartSizing(spec, hint) {
  // An explicit pixel hint pins every chart in a tab group to one height, so
  // switching tabs is a crossfade rather than a reflow of everything below it.
  if (typeof hint === 'number' && hint > 0) return { cls: 'chart', px: Math.round(hint) };
  const series = seriesOf(spec);
  const cats = categories(series);
  const rowMarks = spec.type === 'dot' || spec.type === 'dumbbell' || spec.type === 'stage';
  const horizontal = rowMarks || (spec.type === 'bar' && series.length === 1 && !catsAreTime(cats) &&
    (cats.length > 7 || cats.some((c) => c.length > 16)));
  if (horizontal) {
    // A dumbbell row carries a three-line gutter label (subject, frontier
    // model, small model), and a fourth line once those names wrap at narrow
    // widths; a dot row carries up to two. Two or three bars do not need the
    // 260px floor a nine-row chart does.
    const per = spec.type === 'dumbbell' ? (isNarrow() ? 62 : 50)
      : (spec.type === 'bar' && cats.length <= 3 ? 46 : 32);
    const floor = cats.length <= 3 ? 150 : 260;
    return { cls: 'chart', px: Math.max(floor, Math.min(780, 74 + cats.length * per)) };
  }
  if (hint === 'short') return { cls: 'chart chart--short', px: null };
  if (hint === 'tall') return { cls: 'chart chart--tall', px: null };
  return { cls: 'chart', px: null };
}

/**
 * The text alternative every chart carries (DESIGN.md section 8: no fact is
 * vision-only). Series that all use distinct x values become a matrix, one row
 * per x; anything with repeated x values (a scatter of several launches in one
 * year, say) is listed one point per row so nothing is silently merged.
 */
const DATA_TABLE_MAX = 60;

function chartDataTable(spec, id) {
  const series = seriesOf(spec);
  if (!series.length) return '';
  const unit = spec.unit || '';
  // The axis label may carry a scale note ("…, log scale") that means nothing
  // in a table, so a spec may name its column separately.
  const xh = spec.xHeader || spec.xLabel || 'Category';
  const yh = spec.yLabel || 'Value';
  // A unit that merely restates the column name doubles the header.
  const unitTh = (label) => (unitAdds(label, unit) ? ' <small>' + esc(unit) + '</small>' : '');
  // `tableLayout:'long'` forces one row per point even when every x is unique:
  // a chart whose series are groups (price tier, benchmark family) reads as a
  // list of observations, not as a mostly-empty matrix 60 columns wide.
  const repeats = spec.tableLayout === 'long' ||
    series.some((s) => new Set(s.data.map((p) => String(p.x))).size !== s.data.length);

  let head;
  let body;
  let total;
  if (!repeats) {
    const cats = categories(series);
    total = cats.length;
    head = '<tr><th scope="col">' + esc(xh) + '</th>' + series.map((s) =>
      '<th scope="col" class="num">' + esc(s.name) + unitTh(s.name) + '</th>').join('') + '</tr>';
    body = cats.slice(0, DATA_TABLE_MAX).map((c) =>
      '<tr><th scope="row" class="txt">' + esc(c) + '</th>' + series.map((s) => {
        const p = s.data.find((q) => String(q.x) === c);
        return '<td class="num" data-type="number">' +
          (p && isNum(p.y) ? esc(fmt(p.y)) : '—') + '</td>';
      }).join('') + '</tr>').join('');
  } else {
    const flat = [];
    for (const s of series) for (const p of s.data) flat.push({ s: s.name, p });
    total = flat.length;
    head = '<tr><th scope="col">' + esc(spec.seriesHeader ||
      (flat.some((f) => f.p.title || f.p.label) ? 'Point' : 'Series')) +
      '</th><th scope="col">' + esc(xh) + '</th>' +
      '<th scope="col" class="num">' + esc(yh) + unitTh(yh) + '</th></tr>';
    body = flat.slice(0, DATA_TABLE_MAX).map(({ s, p }) =>
      '<tr><th scope="row" class="txt">' + esc(p.title || p.label || s) + '</th>' +
      '<td class="txt">' + esc(String(p.x)) + '</td>' +
      '<td class="num" data-type="number">' + (isNum(p.y) ? esc(fmt(p.y)) : '—') + '</td></tr>').join('');
  }

  const capId = id + '-cap';
  const cap = 'The values plotted above' + (unit ? ', in ' + unit : '') + '.' +
    (total > DATA_TABLE_MAX ? ' First ' + DATA_TABLE_MAX + ' of ' + total + ' rows.' : '');

  return '<details class="chart-data" id="' + id + '">' +
    '<summary class="chart-data__toggle" aria-label="Show the data behind ' +
    attr(spec.title || 'this chart') + '"><span>Show data</span></summary>' +
    '<p class="chart-data__cap" id="' + capId + '">' + esc(cap) +
    '<button type="button" class="btn--link chart-data__csv" data-csv-chart="' +
    attr(id.replace(/-data$/, '')) + '">Download this data (CSV)</button></p>' +
    // Same scroll affordance as every other table on the site: a chart's own
    // data must not be the one place a column can be lost off the edge.
    '<div class="table-scroll" data-x="none">' +
    '<p class="table-scroll__hint" aria-hidden="true">Scrolls sideways for more columns →</p>' +
    '<div class="table-wrap table-wrap--auto" tabindex="0" role="region" aria-label="' +
    attr('Data behind ' + (spec.title || 'this chart') + ', scrollable table') + '">' +
    '<table class="table table--data" aria-labelledby="' + capId + '">' +
    '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div></details>';
}

/** Register a spec and return the HTML for its chart surface plus its table. */
function chartSurface(rawSpec, hint, opts) {
  const key = nid('chart');
  // The chart and its data table are built from one gap-filled spec, so the
  // table never lists years the chart has drawn (or omits ones it has not).
  const spec = fillYearGaps(rawSpec);
  CHART_SPECS.set(key, { ...spec, opts: { ...(spec.opts || {}), ...(opts || {}) } });
  // Drawn in HTML rather than on a canvas: the marks are text-sized, they wrap
  // where a canvas would clip, and the CSV button beneath still resolves
  // because the spec is registered under the same key.
  if (isScoreMatrix(spec)) return scoreMatrixHtml(spec, key);
  const size = chartSizing(spec, hint);
  const unit = spec.unit || spec.yLabel || '';
  // A chart that knows its own finding says it; the rest fall back to the
  // title and unit, which is still enough to know what is being shown.
  const label = spec.ariaLabel || ((spec.title || 'Chart') + (unit ? ' — ' + unit : '') +
    ((opts && opts.log) ? ', logarithmic scale' : ''));
  return '<div class="' + size.cls + '" data-chart="' + key + '"' +
    (size.px ? ' style="height:' + size.px + 'px"' : '') +
    ' role="img" aria-label="' + attr(label) + '"></div>' +
    pointKeyHtml(spec) +
    chartDataTable(spec, key + '-data');
}

function reChart(node, spec, opts) {
  const rec = node.__gdChart;
  const option = buildOption(spec, opts);
  if (rec && rec.chart && option) rec.chart.setOption(option, true);
}

/* ============================================================================
   7. Small HTML components
   ========================================================================== */

/**
 * A delta chip is tinted only when it states a signed change. "512 H800s x 80
 * hours" is a hardware configuration, not a favourable outcome, and colouring
 * it green says something the data does not. Everything else is neutral, and
 * the arrow appears only where a direction is genuinely asserted.
 */
function deltaKind(delta) {
  const t = String(delta || '').trim();
  if (/^[-−]\s*\d|↓|\bfell\b|\bdown\b|\bdrop/i.test(t)) return 'down';
  if (/^\+\s*\d|↑|\brose\b|\bgrew\b|\bup\b\s|\bincrease/i.test(t)) return 'up';
  return 'flat';
}

function kpiHtml(stat, fn) {
  if (!stat) return '';
  const unit = stat.unit && String(stat.unit).length <= 30 ? stat.unit : '';
  const delta = stat.delta ? String(stat.delta) : '';
  const dir = deltaKind(delta);
  // Step the figure down a size when the value plus its unit is long, so a
  // number is never clipped. Thresholds are in rendered characters.
  const figLen = String(fmt(stat.value)).length;
  const len = figLen > 11 ? ' data-len="xlong"' : (figLen > 6 ? ' data-len="long"' : '');
  return '<div class="kpi"' + len + '>' +
    '<p class="kpi__label">' + esc(stat.label) + '</p>' +
    '<p class="kpi__figure kpi__value">' + esc(fmt(stat.value)) + '</p>' +
    // The unit sits in its own slot beneath the numeral on every card, so a
    // bare "900" can never read as a different kind of quantity from "42x".
    '<p class="kpi__unit-line">' + (unit ? esc(unit) : '<span aria-hidden="true">&#8203;</span>') + '</p>' +
    (delta ? '<p class="kpi__delta kpi__delta--' + dir + '">' + esc(delta) + '</p>' : '') +
    (stat.note ? '<p class="kpi__note">' + esc(stat.note) + '</p>' : '') +
    // A publisher name ("US Senate Banking Committee") is an attribution; a CDN
    // hostname ("d1e00ek4ebabms.cloudfront.net") is not. Use the catalogued
    // publisher whenever the caller could resolve one.
    // The attribution block is one element, hung from the bottom of the card,
    // so its rule lands at the same height on every card in a row however long
    // the note above it runs.
    ((stat.source || stat.from) ? '<div class="kpi__foot">' +
      (stat.source ? '<p class="kpi__source"><a href="' + attr(stat.source) + '" target="_blank" rel="noopener">' +
        esc(stat.publisher || host(stat.source)) + '</a>' + (fn ? fn.refs([stat.source]) : '') + '</p>' : '') +
      (stat.from ? '<p class="kpi__source"><a href="#/' + esc(stat.from) + '">' +
        esc(stat.from.charAt(0).toUpperCase() + stat.from.slice(1)) + ' section</a></p>' : '') +
      '</div>' : '') +
    '</div>';
}

function kpiRow(stats, fn) {
  if (!stats || !stats.length) return '';
  // The count drives the grid: eight tiles on a six-column grid wrap 6 + 2 and
  // strand four empty cells directly under the standfirst.
  return '<div class="kpi-row" data-n="' + stats.length + '">' +
    stats.map((s) => kpiHtml(s, fn)).join('') + '</div>';
}

/**
 * Block label above a group of panels. A real `<h3>` rather than a paragraph
 * wearing `role="heading"`: these five labels are the page's landmarks, and a
 * reader browsing by heading has to be able to reach them.
 */
function blockHead(title, count, note, id, countId) {
  return '<h2 class="subhead"' + (id ? ' id="' + attr(id) + '"' : '') + '>' +
    '<span class="subhead__t">' + esc(title) + '</span>' +
    (count != null ? '<span class="subhead__sep" aria-hidden="true"> · </span>' +
      '<span class="subhead__n"' + (countId ? ' data-head-count="' + attr(countId) + '"' : '') +
      '>' + esc(trimCount(title, count)) + '</span>' : '') + '</h2>' +
    (note ? '<p class="note note--lede">' + esc(note) + '</p>' : '');
}

/**
 * "Sources · 65 sources" says the noun twice. When the count's noun is already
 * the heading's, only the number is new information.
 */
function trimCount(title, count) {
  const c = String(count);
  const m = /^(\d[\d,]*)\s+(.+)$/.exec(c);
  if (!m) return c;
  const stem = (s) => String(s).toLowerCase().replace(/[^a-z]+$/, '').replace(/(ies|es|s)$/, '');
  const last = String(title).trim().split(/\s+/).pop();
  return stem(m[2]) && stem(m[2]) === stem(last) ? m[1] : c;
}

/** "1 table", "3 tables" — a count and its noun, agreeing. */
function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : (many || one + 's'));
}

/** In-page landmarks, collected while a section renders. */
function sectionNav(items) {
  const list = items.filter(Boolean);
  if (list.length < 3) return '';
  return '<nav class="pagenav" aria-label="On this page">' +
    '<span class="pagenav__label">On this page</span>' +
    '<span class="pagenav__links">' +
    list.map((it) => '<a class="pagenav__link" href="#" data-jump="' + attr(it.id) + '">' +
      esc(it.label) + (it.count != null ? '<span class="pagenav__n">' + esc(it.count) + '</span>' : '') +
      '</a>').join('') + '</span>' +
    '</nav>' +
    // A 25,000px page needs a way back as much as a way down. It is a sibling
    // of the bar rather than an item in it: the two sticky bars already take
    // 105px off an 844px phone and this must not make it a third row.
    '<button type="button" class="totop" data-scroll-top="1" hidden aria-label="Back to the top of this page">' +
    '<span aria-hidden="true">↑</span><span class="totop__t">Top</span></button>';
}

/**
 * Scroll spy for the in-page index. A bar that lists eleven destinations and
 * never says which one you are standing in tells you where you can go and
 * nothing about where you are. The current link carries aria-current="true",
 * so the state is announced and not only drawn.
 */
let spyOff = null;

function wireSectionSpy(root) {
  if (spyOff) { spyOff(); spyOff = null; }
  const nav = root.querySelector('.pagenav');
  if (!nav || typeof IntersectionObserver !== 'function') return;
  const links = [...nav.querySelectorAll('.pagenav__link')];
  const targets = links.map((a) => document.getElementById(a.getAttribute('data-jump')));
  if (!targets.some(Boolean)) return;

  const mark = (i) => {
    links.forEach((a, k) => {
      const on = k === i;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };

  const pick = () => {
    // The heading a reader is "in" is the last one above a line set a third of
    // the way down the viewport. Reading from the bar's own edge marked the
    // previous section as current the instant you jumped to a new one, because
    // the heading you landed on sits just below the bar.
    const line = nav.getBoundingClientRect().bottom +
      Math.min(300, (window.innerHeight || 800) * 0.34);
    let best = -1;
    targets.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= line) best = i; });
    mark(best);
  };

  const top = root.querySelector('.totop');
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      pick();
      if (top) top.hidden = window.scrollY < 900;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  pick();
  spyOff = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}

/**
 * Edge fades and the "scrolls sideways" hint appear only while there is
 * something past the edge to reach. A table that is hard-clipped with no
 * affordance loses a whole column silently.
 */
const scrollWired = new WeakSet();

function markScrollers(root) {
  root.querySelectorAll('.table-scroll').forEach((box) => {
    const wrap = box.querySelector('.table-wrap');
    if (!wrap) return;
    const sync = () => {
      const over = wrap.scrollWidth - wrap.clientWidth;
      if (over <= 2) { box.dataset.x = 'none'; return; }
      const l = wrap.scrollLeft > 2;
      const r = wrap.scrollLeft < over - 2;
      box.dataset.x = l && r ? 'both' : (l ? 'end' : 'start');
    };
    if (!scrollWired.has(wrap)) {
      scrollWired.add(wrap);
      wrap.addEventListener('scroll', sync, { passive: true });
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(sync);
        ro.observe(wrap);
        const t = wrap.querySelector('table');
        if (t) ro.observe(t);
      }
    }
    sync();
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(sync)).catch(() => {});
    }
  });
  // A chart's tab strip is the same problem one scale down. At 390px the third
  // view of the price panel was hard-clipped at the card border — "Frontier vs
  // small | Fixed capability | DeepSeek reversa" — with no fade and no arrow,
  // so a whole chart read as unavailable. The strip carries the same data-x
  // contract as the tables: the affordance shows only while there is something
  // past the edge to reach, and a strip that fits stays clean.
  root.querySelectorAll('.seg').forEach((seg) => {
    const sync = () => {
      const over = seg.scrollWidth - seg.clientWidth;
      if (over <= 2) { seg.removeAttribute('data-x'); return; }
      const l = seg.scrollLeft > 2;
      const r = seg.scrollLeft < over - 2;
      seg.dataset.x = l && r ? 'both' : (l ? 'end' : 'start');
    };
    if (!scrollWired.has(seg)) {
      scrollWired.add(seg);
      seg.addEventListener('scroll', sync, { passive: true });
      if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(seg);
    }
    sync();
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(sync)).catch(() => {});
    }
  });
}

const SOURCE_TYPE_ORDER = ['paper', 'law', 'filing', 'docs', 'pricing', 'blog', 'news', 'data', 'other'];

function sourceTypeLabel(t) {
  const k = String(t || 'other').toLowerCase();
  const named = {
    paper: 'Papers and preprints',
    law: 'Statutes, bills and official memoranda',
    filing: 'Filings and submissions',
    docs: 'Vendor documentation',
    pricing: 'Pricing pages',
    blog: 'Vendor and lab posts',
    news: 'Reporting',
    data: 'Datasets and trackers',
  };
  return named[k] || 'Other sources';
}

// The audiences a finding names are the other sections of this compendium, so
// each one is made the link to it rather than left as a grey word.
const AUDIENCE_ROUTES = ['academic', 'financial', 'political', 'company',
  'developer', 'customer', 'library', 'timeline'];

function audienceBadge(a) {
  const key = String(a || '').toLowerCase().trim();
  if (AUDIENCE_ROUTES.includes(key)) {
    return '<a class="badge badge--route" href="#/' + esc(key) + '">' + esc(a) + '</a>';
  }
  return '<span class="badge badge--neutral">' + esc(a) + '</span>';
}

function findingsHtml(findings, fn, id) {
  if (!findings || !findings.length) return '';
  return blockHead('Key findings', plural(findings.length, 'finding'),
    // Two entries run the full width and eight run in columns. Say why, or the
    // change of measure halfway down the list reads as a layout that ran out.
    findings.length > 2
      ? 'In the order the section makes its case, and read top to bottom. The first two carry the ' +
        'argument and are set large; the rest follow, numbered, in the order they were filed.'
      : null, id) +
    // Ten cards of identical weight give a reader no way in. The list is
    // numbered, and the first two — which the files order deliberately — run
    // the full width so the opening argument reads before the rest.
    '<ol class="findings">' + findings.map((f, i) =>
      '<li class="finding' + (i < 2 ? ' finding--lead' : '') + '">' +
      '<span class="finding__n" aria-hidden="true">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<h3 class="finding__title">' + esc(f.title) + (fn ? fn.refs(f.sources) : '') + '</h3>' +
      '<p class="finding__detail">' + esc(f.detail) + '</p>' +
      ((f.audience && f.audience.length)
        ? '<p class="finding__meta"><span>Matters most to</span>' + f.audience.map((a) =>
          audienceBadge(a)).join('') + '</p>'
        : '') +
      '</li>').join('') + '</ol>';
}

function glossaryHtml(items, id) {
  if (!items || !items.length) return '';
  return blockHead('Glossary', plural(items.length, 'term'), null, id) +
    '<dl class="glossary">' + items.map((g) =>
      '<div><dt>' + esc(g.term) + '</dt><dd>' + esc(g.definition) + '</dd></div>').join('') + '</dl>';
}

/**
 * The bibliography is grouped by kind of source and set in columns, and it
 * opens rather than occupying a fifth of the page at rest. It still has to be
 * reachable the instant a footnote is clicked, so jumpToSource opens the
 * disclosure before it scrolls.
 */
function sourcesHtml(fn, updated) {
  const list = fn.all();
  if (!list.length) return '';
  const groups = new Map();
  for (const s of list) {
    const k = String(s.type || 'other').toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = SOURCE_TYPE_ORDER.indexOf(a), ib = SOURCE_TYPE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  // The number on the row IS the footnote number. A list counter would restart
  // inside each group and send the reader to the wrong source.
  const item = (s, anchor) => '<li class="source"' +
    (anchor === false ? '' : ' id="' + fn.prefix + '-' + s.n + '"') +
    ' style="counter-set: src ' + s.n + '" data-n="' + s.n + '">' +
    '<span class="source__body">' +
    '<span class="source__title"><a href="' + attr(s.url) + '" target="_blank" rel="noopener">' +
    esc(s.title || host(s.url)) + '</a></span>' +
    '<span class="source__meta">' + esc(s.publisher || host(s.url)) +
    (s.date ? ' · ' + esc(longDate(s.date)) : '') +
    (s.type ? ' · ' + esc(s.type) : '') + '</span></span></li>';

  const body = keys.map((k) =>
    '<div class="sources__group">' +
    '<h3 class="sources__kind">' + esc(sourceTypeLabel(k)) +
    '<span class="dim"> · ' + groups.get(k).length + '</span></h3>' +
    '<ol class="sources">' + groups.get(k).map(item).join('') + '</ol></div>').join('');

  // A heading that advertises sixty-five sources over a closed disclosure makes
  // the claim and hides the evidence. Three entries stand above the fold so the
  // bibliography is visible before it is opened.
  const peek = list.slice(0, 3);
  const preview = '<ol class="sources sources--peek">' +
    peek.map((s2) => item(s2, false)).join('') + '</ol>';

  return blockHead('Sources', plural(list.length, 'source'),
    'Every figure on this page carries a numbered footnote to an entry below.' +
    (updated ? ' Compiled ' + longDate(updated) + '.' : ''), 'sec-sources') +
    preview +
    '<details class="sources-wrap" id="' + fn.prefix + '-list">' +
    '<summary class="sources__toggle"><span>Show all ' + list.length + ' sources</span></summary>' +
    '<div class="sources__cols">' + body + '</div></details>';
}

function emptyState(title, body, links) {
  return '<div class="empty">' +
    '<p class="empty__title">' + esc(title) + '</p>' +
    '<p class="empty__text">' + esc(body) + '</p>' +
    (links ? '<p class="cluster">' + links + '</p>' : '') + '</div>';
}

/* ============================================================================
   8. renderTable — sortable, filterable, sourced
   ========================================================================== */

/**
 * A year is an identifier, not a quantity: 2,015 is not a year. Columns whose
 * type says year, or whose key or label names one and whose values are plausible
 * years, print without a thousands separator.
 */
function isYearColumn(col, sample) {
  if (!col) return false;
  if (col.type === 'year') return true;
  if (!/year|^yr$|introduced|published/i.test(String(col.key) + ' ' + String(col.label))) return false;
  return isNum(sample) && Number.isInteger(sample) && sample >= 1900 && sample <= 2100;
}

function fmtCell(v, col) {
  if (isYearColumn(col, v) && isNum(v)) return String(v);
  return fmt(v);
}

/** Decimal places a value is actually written with: 1.32 -> 2, 16 -> 0. */
function decimalsOf(v) {
  const s = String(v);
  if (/e/i.test(s)) return 0;
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.min(4, s.length - i - 1);
}

/**
 * One formatter for a whole numeric column. A right-aligned run of figures
 * only reads as a column when every value carries the same scale and the same
 * number of decimals: 41.7 above 16 above 5 puts three decimal points at three
 * different x, and "999,000" above "5.4M" asks the reader to re-scale between
 * two adjacent rows. The precision is taken from the data — the most precise
 * value in the pool sets it — so nothing is invented and nothing is lost.
 *
 * `keys` widens that pool to every column sharing one unit, because precision
 * has to be governed per unit and not per column: a price row reading 10.00,
 * 0.200 and 1.20 puts three precisions on one unit (USD/MTok) and makes the
 * reader re-read to compare two figures of the same kind.
 */
function columnFormatter(col, rows, keys) {
  const ks = keys && keys.length ? keys : [col.key];
  const vals = ks.reduce((acc, k) => acc.concat(rows.map((r) => r[k])), []).filter(isNum);
  if (!vals.length || isYearColumn(col, vals[0])) return (v) => fmtCell(v, col);
  const abs = vals.map((v) => Math.abs(v)).filter((v) => v > 0);
  const maxAbs = abs.length ? Math.max(...abs) : 0;
  const minAbs = abs.length ? Math.min(...abs) : 0;
  const present = Math.max(...vals.map(decimalsOf));
  let scale = 1, suffix = '', dp = 0;
  if (maxAbs >= 1e9) { scale = 1e9; suffix = 'bn'; dp = maxAbs / 1e9 >= 10 ? 1 : 2; }
  else if (maxAbs >= 1e6) { scale = 1e6; suffix = 'M'; dp = maxAbs / 1e6 >= 10 ? 1 : 2; }
  // A scale that rounds the smallest figure in the column to zero is not a
  // scale, it is a deletion: $30,000 beside $500M must not print as "0.0M".
  if (scale > 1 && minAbs && minAbs / scale < 0.5 * Math.pow(10, -dp)) { scale = 1; suffix = ''; }
  if (scale === 1) dp = maxAbs >= 1000 ? Math.min(present, 1) : Math.min(present, 3);
  return (v) => {
    if (v == null || v === '') return '—';
    if (!isNum(v)) return String(v);
    return (v / scale).toLocaleString('en-US',
      { minimumFractionDigits: dp, maximumFractionDigits: dp }) + suffix;
  };
}

/**
 * A unit that only restates its own column label ("Citations" in citations) is
 * noise: it doubles the header and pads the caption with a tautology.
 */
function unitAdds(label, unit) {
  if (!unit) return false;
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return norm(unit) !== norm(label);
}

/**
 * @param {object} spec  { id, title, description, columns, rows, notes, sources, unit, updated }
 * @param {object} [opts] { footnotes, compact, caption }
 * @returns {string} HTML
 */
export function renderTable(spec, opts) {
  if (!spec || !Array.isArray(spec.columns) || !Array.isArray(spec.rows) || !spec.rows.length) {
    return emptyState('Table unavailable', 'This table has no rows yet.');
  }
  const o = opts || {};
  const fn = o.footnotes || null;
  const cols = spec.columns;
  const rows = spec.rows;
  const tid = 'tbl-' + (slug(spec.id) || nid('t'));

  // A filter has to answer a question. One chip per row is a row selector
  // wearing a filter's clothes, and dates of mixed granularity are not a facet
  // anyone would use, so the column is chosen for cardinality that actually
  // groups rows and the chip row is suppressed when no column does.
  let filterCol = -1;
  let filterVals = [];
  if (o.facet !== false) {
    const key = (i, r) => String(r[cols[i].key] == null ? '' : r[cols[i].key]).trim();
    let bestScore = 0;
    for (let i = 0; i < cols.length; i += 1) {
      if (cols[i].type && cols[i].type !== 'text') continue;
      if (o.facetKey && cols[i].key !== o.facetKey) continue;
      const vals = [...new Set(rows.map((r) => key(i, r)).filter(Boolean))];
      if (vals.length < 2 || vals.length > (o.facetKey ? 10 : 8)) continue;
      if (vals.some((v) => v.length > 34)) continue;
      if (vals.some((v) => DATEISH.test(v))) continue;      // ISO dates are not a facet
      // A rendered date ('4 September 2026') is the same non-facet in prose form:
      // "filter these eight files by the day they were compiled" is not a question.
      if (vals.some((v) => /^\d{1,2} [A-Z][a-z]+ \d{4}$/.test(v))) continue;
      if (vals.length > rows.length - 2) continue;          // one chip per row is not a filter
      const hits = vals.map((v) => rows.filter((r) => key(i, r) === v).length);
      const biggest = Math.max(...hits);
      if (biggest < 2) continue;
      // A facet has to group the table, not label it. Six valuations, five of
      // which pick out one row of eight, is a row selector wearing a filter's
      // clothes: at least two of the values have to gather rows together.
      if (hits.filter((n) => n > 1).length < 2) continue;
      // Prefer a column that splits the table into a few substantial groups.
      const score = biggest * 10 - Math.abs(vals.length - 4) - i;
      if (score > bestScore) { bestScore = score; filterCol = i; filterVals = vals; }
    }
  }

  // Six numeric columns that all count events printed "events" six times under
  // the header and then again, column by column, in the caption. When one unit
  // covers three or more columns it is stated once and the headers stay clean.
  const unitCols = cols.filter((c) => unitAdds(c.label, c.unit));
  const sharedUnit = unitCols.length >= 3 &&
    new Set(unitCols.map((c) => String(c.unit).toLowerCase())).size === 1
    ? unitCols[0].unit : '';
  // A two- or three-column table is a label and its figure. Stretched to a
  // 950px card it leaves 800px of white between them, and a four-line stacked
  // unit under the heading inflates the header block to match; the unit is
  // stated once in the caption instead and the table sizes to its content.
  const narrow = cols.length <= 3;
  const showColUnit = (c) => unitAdds(c.label, c.unit) && !sharedUnit && !narrow;
  const units = sharedUnit
    ? ['All figures in ' + sharedUnit]
    : unitCols.map((c) => c.label + ' in ' + c.unit);
  // The authored description often already carries its own as-of date; adding
  // a generated one stamps the same fact twice in consecutive sentences.
  const hasOwnDate = /\bas of\b/i.test(String(spec.description || ''));
  const caption = o.caption || [
    spec.description || '',
    units.length ? (sharedUnit ? units[0] + '.' : 'Units: ' + units.join('; ') + '.') : '',
    spec.updated && !hasOwnDate ? 'As of ' + longDate(spec.updated) + '.' : '',
  ].filter(Boolean).join(' ');

  // A column that is empty in the rows on screen reads as a failed data load.
  // Saying how many of the rows carry a figure turns it into what it is: a
  // field the vendors mostly do not publish.
  const filled = (c) => rows.filter((r) => r[c.key] != null && r[c.key] !== '').length;

  const head = '<tr>' + cols.map((c, i) => {
    const numeric = c.type === 'number';
    const have = filled(c);
    const sparse = have && have * 2 < rows.length
      ? have + ' of ' + rows.length + ' published' : '';
    const sub = [showColUnit(c) ? c.unit : '', sparse].filter(Boolean).join(' · ');
    return '<th scope="col"' + (numeric ? ' class="num" data-type="number"' : '') + ' aria-sort="none">' +
      '<button type="button" class="table__sort" data-sort="' + i + '" data-type="' + (numeric ? 'number' : 'text') + '">' +
      esc(c.label) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + '</button></th>';
  }).join('') + '</tr>';

  // One formatter per unit, not per column: numeric columns carrying the same
  // unit are formatted from their pooled values so USD/MTok is written to the
  // same number of decimals wherever it appears in the row.
  const unitKey = (c) => String(c.unit || '').toLowerCase().replace(/[^a-z0-9/%$]+/g, '');
  const unitGroups = new Map();
  for (const c of cols) {
    if (c.type !== 'number' || !c.unit) continue;
    const k = unitKey(c);
    if (!unitGroups.has(k)) unitGroups.set(k, []);
    unitGroups.get(k).push(c.key);
  }
  const colFmt = cols.map((c) => {
    if (c.type !== 'number') return null;
    const g = c.unit ? unitGroups.get(unitKey(c)) : null;
    return columnFormatter(c, rows, g && g.length > 1 ? g : null);
  });

  // Below 640px a table's rows are as tall as their tallest cell, including the
  // cells scrolled out of the window: a four-word row of the licence table
  // stood 250px tall because a 100-character buyer note sat off screen. A table
  // carrying a prose column therefore stacks into one block per row at that
  // width, with each value under its own column name. Registers of short
  // figures keep the horizontal scroller, which reads better for them.
  const avgLen = (c) => rows.reduce((n, r) =>
    n + String(r[c.key] == null ? '' : r[c.key]).length, 0) / rows.length;
  const stacks = cols.length >= 5 && cols.some((c) => c.type !== 'number' && avgLen(c) > 45);

  const body = rows.map((r, ri) => {
    const key = filterCol >= 0 ? String(r[cols[filterCol].key] == null ? '' : r[cols[filterCol].key]).trim() : '';
    return '<tr' + (filterCol >= 0 ? ' data-fv="' + attr(key) + '"' : '') +
      (o.rowDetail ? ' class="row--open" data-row-detail="' + tid + '" data-row-i="' + ri + '" tabindex="0"' : '') +
      '>' + cols.map((c, i) => {
      const v = r[c.key];
      const numeric = c.type === 'number';
      const blank = v == null || v === '';
      const sortV = c.sortValue ? c.sortValue(v, r)
        : (numeric ? (isNum(v) ? v : Number.NEGATIVE_INFINITY) : String(v == null ? '' : v).toLowerCase());
      const shown = numeric ? colFmt[i](v) : (blank ? '—' : String(v));
      // The row's source belongs to the row, not to whatever happens to sit in
      // its last column. Hung off the em dash of an undisclosed date it read as
      // broken markup — "— ¹" — rather than as a citation; on the row's own
      // identifier it says what it means.
      const ref = i === 0 && fn && r._source ? fn.refs([r._source]) : '';
      const dim = !numeric && blank ? ' dim' : '';
      // A field of structural zeros competes with the figures beside it; the
      // zero is still printed, just no longer shouted.
      const zero = numeric && v === 0 ? ' is-zero' : '';
      const mark = c.mark ? c.mark(v, r) : '';
      const after = c.after ? c.after(v, r) : '';
      // An empty cell is a published gap, not a rendering failure: it is
      // labelled as one for a screen reader and for a hovering mouse.
      const cell = blank
        ? '<span class="cell-null" title="Not published"><span aria-hidden="true">—</span>' +
          '<span class="sr-only">Not published</span></span>'
        : esc(shown);
      // A value and its reference marker are one token. Left to break, the
      // marker dropped to a line of its own and made that row 20px taller
      // than its neighbours.
      // A superscript numeral set immediately after a bare figure reads as an
      // exponent — the TCO volume column printed 1², 10², 1,000² — so in a
      // numeric column the row's citation is set on the baseline in brackets,
      // where it can only be a reference.
      const value = ref
        ? '<span class="cell-val">' + cell +
          (numeric ? '<span class="cell-ref cell-ref--flat">' + ref + '</span>' : ref) + '</span>'
        : cell;
      return '<td class="' + (numeric ? 'num' : 'txt') + dim + zero + '"' + (numeric ? ' data-type="number"' : '') +
        ' data-label="' + attr(c.label) + '" data-v="' + attr(sortV) + '">' + mark + value + after + '</td>';
    }).join('') + '</tr>';
  }).join('');

  // Filter chips are multi-select (the values are OR-ed) and the All chip is
  // the pressed state when nothing is selected, so the group always shows which
  // rows are on screen.
  const filterHits = filterCol >= 0
    ? filterVals.map((v) => rows.filter((r) =>
      String(r[cols[filterCol].key] == null ? '' : r[cols[filterCol].key]).trim() === v).length)
    : [];
  // A count on every chip is noise when each value picks out a single row.
  const showHits = filterHits.some((n) => n > 1);
  const chips = filterCol >= 0
    ? '<div class="chips" role="group" aria-label="Filter by ' + attr(cols[filterCol].label) + '">' +
      filterVals.map((v, i) => '<button type="button" class="chip" data-filter="' + tid + '" data-value="' + attr(v) +
        '" aria-pressed="false">' + esc(v) +
        (showHits ? '<span class="chip__count">' + filterHits[i] + '</span>' : '') + '</button>').join('') +
      '<button type="button" class="chip is-active" data-filter-reset="' + tid +
      '" aria-pressed="true">All<span class="chip__count">' +
      rows.length + '</span></button></div>'
    : '';

  const srcLine = spec.sources && spec.sources.length
    ? '<p class="panel__sources">Sources: ' + spec.sources.map((u) =>
      '<a href="' + attr(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a>' +
      (fn ? fn.refs([u]) : '')).join(' · ') + '</p>'
    : '';

  const title = spec.title || 'Table';
  return '<figure class="panel" id="' + tid + '" data-table="' + tid + '">' +
    '<div class="panel__head">' +
    '<h3 class="panel__title">' + esc(title) + '</h3>' +
    '<span class="panel__unit" data-rows-for="' + tid + '">' + esc(rows.length + ' rows') + '</span>' +
    (chips ? '<div class="panel__tools">' + chips + '</div>' : '') +
    '</div>' +
    // The caption sits outside the scroll container: inside it, it would take
    // the table's width and the reader would have to scroll sideways to read
    // the units. It stays the table's accessible name via aria-labelledby.
    (caption ? '<p class="table__caption" id="' + tid + '-cap">' + esc(caption) +
      (o.rowDetail ? ' Select a row for the full text.' : '') +
      '<span class="table__count" data-count-for="' + tid + '" hidden></span></p>' : '') +
    // The scroll container is a labelled, focusable region: without a tabindex
    // a keyboard-only reader cannot scroll it, and the columns past the clip
    // edge are unreachable. The scroller wrapping it carries the edge fades and
    // the "scrolls sideways" hint, both of which appear only while there is
    // something past the edge to reach (wired in markScrollers).
    '<div class="table-scroll" data-x="none">' +
    '<p class="table-scroll__hint" aria-hidden="true">Scrolls sideways for ' +
    (cols.length - 4 > 0 ? cols.length - 4 + ' more columns' : 'more columns') + ' →</p>' +
    '<div class="table-wrap table-wrap--sticky" tabindex="0" role="region" aria-label="' +
    attr(title + ', scrollable table') + '">' +
    '<table class="table' + (rows.length > 12 ? ' table--zebra' : '') +
    (o.matrix ? ' table--matrix' : '') + (narrow ? ' table--narrow' : '') +
    (stacks ? ' table--stack' : '') + '"' +
    (caption ? ' aria-labelledby="' + tid + '-cap"' : '') + '>' +
    '<caption class="sr-only">' + esc(title) + ' — ' + rows.length + ' rows' +
    (caption ? '. ' + esc(caption) : '') + '</caption>' +
    '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>' +
    (spec.notes ? '<figcaption class="panel__note">' + esc(spec.notes) + '</figcaption>' : '') +
    srcLine + '</figure>';
}

/* ============================================================================
   9. Chart panels (with segmented control when several share a subject)
   ========================================================================== */

function panelHtml(charts, fn, opts) {
  const o = opts || {};
  const group = charts.filter(Boolean).map(frontierLabels);
  if (!group.length) return '';
  const pid = nid('panel');
  const multi = group.length > 1;
  const height = o.height || null;

  const tabs = (active) => (multi
    ? '<div class="seg" role="tablist" aria-label="Chart view">' + group.map((c, i) =>
      '<button type="button" class="seg__btn' + (i === active ? ' is-active' : '') + '" role="tab"' +
      ' aria-selected="' + (i === active) + '" aria-controls="' + pid + '-p' + i + '" tabindex="' + (i === active ? '0' : '-1') +
      '" data-seg="' + pid + '" data-seg-i="' + i + '">' + esc(segLabel(c, group)) + '</button>').join('') + '</div>'
    : '');

  const bodies = group.map((c, i) => {
    const paneId = pid + '-p' + i;
    // Two orders of magnitude or more: offer the scale control, and start on a
    // log axis unless the mark is a length from zero (DESIGN.md section 6).
    const wide = wantsLog(seriesOf(c), c.logThreshold);
    const type = String(c.type || 'bar');
    // A chart that ships its own ECharts option owns its axes; a Linear button
    // wired to the generic builder would redraw it as a different chart.
    const fixedScale = !!c.fixedScale || !!c.option;
    const canToggle = wide && LOG_TOGGLE_TYPES.includes(type) && !fixedScale;
    const logOn = fixedScale ? !!c.logAxis : (wide && LOG_DEFAULT_TYPES.includes(type));
    const legend = legendHtml(c);
    const scale = canToggle
      ? '<div class="seg" role="group" aria-label="Value scale">' +
        '<button type="button" class="seg__btn' + (logOn ? '' : ' is-active') + '" data-scale="' + paneId +
        '" data-scale-mode="linear" aria-pressed="' + (!logOn) + '">Linear</button>' +
        '<button type="button" class="seg__btn' + (logOn ? ' is-active' : '') + '" data-scale="' + paneId +
        '" data-scale-mode="log" aria-pressed="' + logOn + '">Log</button>' +
        '</div>'
      : '';
    const baseUnit = c.unit || c.yLabel || '';
    const unitText = logOn ? (baseUnit ? baseUnit + ' · log scale' : 'log scale') : baseUnit;
    return '<div class="panel__pane" id="' + paneId + '"' +
      (multi ? ' role="tabpanel"' : '') + (i === 0 ? '' : ' hidden') + '>' +
      '<div class="panel__head">' +
      '<h3 class="panel__title">' + esc(c.title) + '</h3>' +
      '<span class="panel__unit" data-unit-for="' + paneId + '" data-unit-base="' + attr(baseUnit) + '">' +
      esc(unitText) + '</span>' +
      (legend || scale
        ? '<div class="panel__tools">' + legend + scale + '</div>' : '') +
      '</div>' +
      '<div class="panel__body">' + chartSurface(c, height, { log: logOn }) + '</div>' +
      (c.notes ? '<p class="panel__note">' + esc(prose(c.notes)) + '</p>' : '') +
      (c.sources && c.sources.length
        ? '<p class="panel__sources">Sources: ' + c.sources.map((u) =>
          '<a href="' + attr(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a>' +
          (fn ? fn.refs([u]) : '')).join(' · ') + '</p>'
        : '') +
      '</div>';
  }).join('');

  // One tablist per panel, above the panes. Rendering it inside every pane
  // put three copies of the same tablist in the document, two of them zero-
  // width, all claiming to control the same panels.
  return '<figure class="panel" data-panel="' + pid + '">' +
    (multi ? '<div class="panel__tabs">' + tabs(0) + '</div>' : '') +
    bodies + '</figure>';
}

/**
 * A tab label has to survive on its own. A spec may name its own (`tabLabel`);
 * otherwise the words the panels share are dropped from the front and the back
 * of the title and what is left is kept in its original order, so the label
 * reads as a phrase rather than as a bag of adjectives.
 */
function segLabel(c, group) {
  if (c && c.tabLabel) return String(c.tabLabel);
  const clean = (t) => String(t || '').replace(/[:,.;]$/, '').trim();
  const words = clean(c.title).split(/\s+/).filter(Boolean);
  if (!words.length) return 'View';
  const others = group.filter((g) => g !== c).map((g) => clean(g.title).split(/\s+/).filter(Boolean));
  if (!others.length) return words.slice(0, 4).join(' ');
  const same = (a, b) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');
  let lead = 0;
  while (lead < words.length - 1 && others.every((o) => o[lead] && same(o[lead], words[lead]))) lead += 1;
  let tail = 0;
  while (tail < words.length - lead - 1 &&
    others.every((o) => o[o.length - 1 - tail] && same(o[o.length - 1 - tail], words[words.length - 1 - tail]))) tail += 1;
  const rest = words.slice(lead, words.length - tail);
  const kept = (rest.length ? rest : words).slice(0, 4);
  while (kept.length > 1 && /^\d{4}[,.]?$/.test(kept[kept.length - 1])) kept.pop();
  // Cutting at four words can end the tab on a function word: "DeepSeek-R1-
  // Distill downloads in the" reads as a sentence someone forgot to finish.
  while (kept.length > 1 &&
    /^(the|a|an|in|on|of|by|per|for|at|to|and|or|with|vs|from|its|last)$/i.test(kept[kept.length - 1])) kept.pop();
  const pick = kept.join(' ');
  return clean(pick.replace(/^(the|of|by|per|and|in)\s+/i, '')) || 'View';
}

function legendHtml(spec) {
  const series = seriesOf(spec);
  const type = spec.type;
  // A chart whose groups are already named on an axis does not also need a key.
  if (spec.noLegend) return '';
  // A score matrix names every method at the head of its own row.
  if (isScoreMatrix(spec)) return '';
  // A donut carries one series whose categories are the encoding, so its key
  // is the list of slices; without it the panel loses the colour legend the
  // tab beside it establishes.
  if (type === 'donut') {
    const pts = (series[0] && series[0].data) || [];
    if (pts.length < 2) return '';
    const dhue = hueFactory();
    return '<ul class="legend">' + pts.map((p, i) =>
      '<li class="legend__item"><span class="legend__dot" style="background:' +
      dhue(String(p.x), i) + '"></span>' + esc(shortLabel(String(p.x))) + '</li>').join('') + '</ul>';
  }
  // A stage chart's second series is the ghosted trail behind each marker, not
  // a category, and a connected scatter direct-labels its own series ends.
  if (type === 'stage') return '';
  // A series that names its own colour (a vendor ladder in one hue, a neutral
  // baseline) must see that colour in the key, or the key points at the wrong
  // line. Where weight is the second channel, the swatch carries the weight.
  const swatch = (s, c) => (s.lineWidth
    ? '<span class="legend__dot legend__dot--rule" style="background:' + c +
      ';height:' + Math.max(2, Math.round(s.lineWidth)) + 'px"></span>'
    : '<span class="legend__dot" style="background:' + c + '"></span>');
  if (spec.forceLegend && series.length >= 2) {
    const fhue = hueFactory();
    return '<ul class="legend">' + series.map((s, i) =>
      '<li class="legend__item">' + swatch(s, s.color || fhue(s.name, i)) +
      esc(s.name) + '</li>').join('') + '</ul>';
  }
  const endAll = !!(spec.opts && spec.opts.endLabels === 'all');
  const directLabelled = !isNarrow() && (type === 'line' || type === 'area' ||
    (type === 'scatter' && spec.opts && spec.opts.connect)) && (series.length <= 4 || endAll) &&
    !(spec.opts && spec.opts.endLabels === false);
  if (directLabelled || series.length < 2) return '';
  const hue = hueFactory();
  return '<ul class="legend">' + series.map((s, i) =>
    '<li class="legend__item">' + swatch(s, s.color || hue(s.name, i)) +
    esc(s.name) + '</li>').join('') + '</ul>';
}

/** Group charts that share a subject (same unit) into one segmented panel. */
function groupCharts(charts) {
  const list = (charts || []).filter((c) => c && seriesOf(c).length);
  const byUnit = new Map();
  for (const c of list) {
    const k = (c.unit || c.yLabel || '').toLowerCase().trim();
    if (!k) continue;
    if (!byUnit.has(k)) byUnit.set(k, []);
    byUnit.get(k).push(c);
  }
  const grouped = new Set();
  const out = [];
  for (const c of list) {
    if (grouped.has(c)) continue;
    const k = (c.unit || c.yLabel || '').toLowerCase().trim();
    const g = k ? byUnit.get(k) : null;
    if (g && g.length >= 2 && g.length <= 4) {
      g.forEach((x) => grouped.add(x));
      out.push(g);
    } else {
      grouped.add(c);
      out.push([c]);
    }
  }
  return out;
}

/* ============================================================================
   10. Timeline
   ========================================================================== */

/** Categories in one fixed order, so the chips, the dots and a chart agree. */
const CAT_ORDER = ['research', 'product', 'market', 'policy', 'legal', 'company', 'other'];

function orderCats(cats) {
  return cats.slice().sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

function eventHtml(e) {
  const cat = e.category || 'other';
  return '<li class="timeline__item cat--' + esc(cat) + '" data-cat="' + esc(cat) + '">' +
    '<span class="timeline__dot" aria-hidden="true"></span>' +
    '<div class="timeline__body">' +
    '<p class="timeline__meta">' +
    '<time class="timeline__date" datetime="' + attr(shortDate(e.date)) + '">' + esc(longDate(e.date)) + '</time>' +
    '<span class="timeline__cat">' + esc(cat) + '</span></p>' +
    '<h4 class="timeline__title">' + esc(e.title) + '</h4>' +
    (e.detail ? '<p class="timeline__detail">' + esc(e.detail) + '</p>' : '') +
    (e.source ? '<a class="timeline__source" href="' + attr(e.source) + '" target="_blank" rel="noopener">' +
      'Source: ' + esc(host(e.source)) + '</a>' : '') +
    '</div></li>';
}

/**
 * The record, grouped under its years. A run of a hundred identical rows has no
 * structure a reader can hold, so each year is a group with a heading that
 * stays on screen while its events scroll past, and the detail line can be
 * folded away to scan the record at a glance.
 */
function timelineListHtml(ordered) {
  const groups = [];
  for (const e of ordered) {
    const year = String(e.date).slice(0, 4);
    if (!groups.length || groups[groups.length - 1].year !== year) groups.push({ year, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  return '<ol class="timeline">' + groups.map((g) =>
    '<li class="timeline__group" data-year="' + esc(g.year) + '">' +
    '<h3 class="timeline__yearhead"><span class="timeline__yearnum">' + esc(g.year) + '</span>' +
    '<span class="timeline__yearn" data-year-count>' + plural(g.items.length, 'event') + '</span></h3>' +
    '<ol class="timeline__events">' + g.items.map(eventHtml).join('') + '</ol>' +
    '</li>').join('') + '</ol>';
}

function timelineHtml(events, opts) {
  const o = opts || {};
  const list = (events || []).filter((e) => e && e.date);
  if (!list.length) return '';
  const tid = nid('tl');
  const cats = orderCats([...new Set(list.map((e) => e.category || 'other'))]);
  const sorted = list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const ordered = o.newestFirst ? sorted.slice().reverse() : sorted;
  const listHtml = timelineListHtml(ordered);

  if (o.register === false) return listHtml;

  const chips = '<div class="chips" role="group" aria-label="Filter events by category">' +
    cats.map((c) => '<button type="button" class="chip cat--' + esc(c) + '" data-tl-filter="' + tid +
      '" data-value="' + esc(c) + '" aria-pressed="false">' +
      '<span class="chip__dot" aria-hidden="true"></span>' + esc(c) +
      '<span class="chip__count">' + list.filter((e) => (e.category || 'other') === c).length + '</span></button>').join('') +
    '<button type="button" class="chip is-active" data-tl-reset="' + tid +
    '" aria-pressed="true">All<span class="chip__count">' +
    list.length + '</span></button>' +
    '<span class="table__count" data-tl-count="' + tid + '" hidden></span></div>';

  const order = '<div class="seg" role="group" aria-label="Event order">' +
    '<button type="button" class="seg__btn' + (o.newestFirst ? '' : ' is-active') + '" data-tl-order="' + tid +
    '" data-order="asc" aria-pressed="' + (!o.newestFirst) + '">Oldest first</button>' +
    '<button type="button" class="seg__btn' + (o.newestFirst ? ' is-active' : '') + '" data-tl-order="' + tid +
    '" data-order="desc" aria-pressed="' + (!!o.newestFirst) + '">Newest first</button></div>';

  const density = '<div class="seg" role="group" aria-label="Row density">' +
    '<button type="button" class="seg__btn is-active" data-tl-density="' + tid +
    '" data-density="full" aria-pressed="true">Full</button>' +
    '<button type="button" class="seg__btn" data-tl-density="' + tid +
    '" data-density="compact" aria-pressed="false">Compact</button></div>';

  TIMELINE_DATA.set(tid, list);
  return blockHead(o.title || 'Timeline', plural(list.length, 'event'),
    o.note || 'Every event carries a date and a primary source.', o.headId, tid) +
    '<div class="tl-wrap" id="' + tid + '"><div class="split tl-tools">' + chips +
    '<div class="tl-tools__right">' + density + order + '</div></div>' +
    listHtml + '</div>';
}

const TIMELINE_DATA = new Map();

/** Rebuild a timeline list in place (order toggle). */
function redrawTimeline(tid, newestFirst) {
  const wrap = document.getElementById(tid);
  if (!wrap) return;
  const events = TIMELINE_DATA.get(tid);
  if (!events) return;
  const active = activeTlValues(wrap);
  const html = timelineHtml(events, { newestFirst, register: false });
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const fresh = tmp.querySelector('.timeline');
  const list = wrap.querySelector('.timeline');
  if (fresh && list) list.replaceWith(fresh);
  wrap.querySelectorAll('[data-tl-order]').forEach((b) => {
    const on = (b.dataset.order === 'desc') === !!newestFirst;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  applyTimelineFilter(wrap, active);
}

function applyTimelineFilter(wrap, values) {
  const set = new Set(values);
  let shown = 0;
  const items = wrap.querySelectorAll('.timeline__item');
  items.forEach((li) => {
    const on = set.size === 0 || set.has(li.dataset.cat);
    li.hidden = !on;
    if (on) shown += 1;
  });
  // A year with nothing left in it is not a year in this view.
  wrap.querySelectorAll('.timeline__group').forEach((g) => {
    const live = [...g.querySelectorAll('.timeline__item')].filter((li) => !li.hidden).length;
    g.hidden = live === 0;
    const n = g.querySelector('[data-year-count]');
    if (n) n.textContent = plural(live, 'event');
  });
  const unfiltered = set.size === 0;
  wrap.querySelectorAll('[data-tl-reset]').forEach((b) => {
    b.classList.toggle('is-active', unfiltered);
    b.setAttribute('aria-pressed', String(unfiltered));
  });
  const count = wrap.querySelector('[data-tl-count]');
  if (count) {
    count.hidden = unfiltered;
    count.textContent = 'Showing ' + shown + ' of ' + items.length + ' events.';
  }
  // The block heading counts what is on screen, not what is on file.
  const head = document.querySelector('[data-head-count="' + wrap.id + '"]');
  if (head) {
    head.textContent = unfiltered ? plural(items.length, 'event')
      : shown + ' of ' + plural(items.length, 'event');
  }
}

/** Events-per-year-by-category chart, derived from the events themselves. */
function timelineChartSpec(events, title) {
  const byCat = new Map();
  const years = [...new Set(events.map((e) => String(e.date).slice(0, 4)))].sort();
  for (const e of events) {
    const c = e.category || 'other';
    if (!byCat.has(c)) byCat.set(c, new Map());
    const m = byCat.get(c);
    const y = String(e.date).slice(0, 4);
    m.set(y, (m.get(y) || 0) + 1);
  }
  return {
    id: 'derived-events-per-year',
    title: title || 'Recorded events per year, by category',
    type: 'stackedBar',
    xLabel: 'Year', yLabel: 'Events', unit: 'events',
    series: [...byCat.entries()].map(([cat, m]) => ({
      name: cat,
      data: years.map((y) => ({ x: y, y: m.get(y) || 0, color: CAT_HUE[cat] || CAT_HUE.other })),
    })),
    notes: 'Derived from the dated events listed below; it counts what this compendium records, not everything that happened.',
    sources: [],
  };
}

/* ============================================================================
   10b. Route-specific rendering

   Two jobs. First, a small number of charts whose published shape does not
   match what the data says: a 500:1 price pair that cannot be read as two bars,
   an ordinal legislative stage plotted on a continuous axis, a quarterly series
   with its empty quarters dropped. Second, the datasets the generic renderer
   has no slot for — a 46-paper bibliography, a 14-row accusation ledger, 63
   list prices — which are the richest material in these files.
   ========================================================================== */

/** Fill the gaps in a quarterly category series so a rise reads as a rise. */
function fillQuarters(points) {
  const key = (y, q) => y + ' Q' + q;
  const at = new Map(points.map((p) => [String(p.x).trim(), p]));
  const parse = (s) => {
    const m = /^(\d{4})\s*Q([1-4])$/i.exec(String(s).trim());
    return m ? { y: Number(m[1]), q: Number(m[2]) } : null;
  };
  const bounds = points.map((p) => parse(p.x)).filter(Boolean);
  if (bounds.length < 2) return points;
  const first = bounds[0];
  const last = bounds[bounds.length - 1];
  const out = [];
  for (let y = first.y; y <= last.y; y += 1) {
    for (let q = 1; q <= 4; q += 1) {
      if (y === first.y && q < first.q) continue;
      if (y === last.y && q > last.q) break;
      const k = key(y, q);
      out.push(at.has(k) ? at.get(k) : { x: k, y: 0 });
    }
  }
  return out;
}

const vendorOf = (s) => String(s).replace(/\s*\(.*$/, '').trim();
const modelOf = (s) => {
  const m = /\(([^)]+)\)/.exec(String(s));
  return m ? m[1] : String(s);
};

/** Financial chart 1: a vendor's two prices, joined, with the ratio printed. */
function priceDumbbell(c) {
  const f = c.series[0];
  const s = c.series[1];
  if (!f || !s) return c;
  const seen = new Map();
  for (const p of f.data) seen.set(vendorOf(p.x), (seen.get(vendorOf(p.x)) || 0) + 1);
  const rows = f.data.map((p, i) => {
    const q = s.data[i];
    const v = vendorOf(p.x);
    return {
      cat: seen.get(v) > 1 ? v + ' · ' + modelOf(p.x) : v,
      f: p.y,
      fLabel: modelOf(p.x),
      s: q ? q.y : null,
      sLabel: q ? modelOf(q.x) : '',
      ratio: q && q.y ? p.y / q.y : 0,
    };
  }).sort((a, b) => b.ratio - a.ratio);
  // A small tier that serves two frontier models is one price plotted on two
  // rows. Say so, and name the model, rather than leaving a reader to notice
  // two dots at the same x.
  const smallCount = new Map();
  for (const r of rows) smallCount.set(r.sLabel, (smallCount.get(r.sLabel) || 0) + 1);
  const sharedNames = [...smallCount.entries()].filter(([k, n]) => k && n > 1).map(([k]) => k);
  const sharedNote = sharedNames.length
    ? ' ' + sharedNames.join(' and ') + ' is the small tier for more than one frontier model on this ' +
      'chart, so the same price is plotted on each of those rows; those dots are drawn as hollow rings ' +
      'and the gutter marks them shared.'
    : '';
  return {
    ...c,
    type: 'dumbbell',
    tabLabel: 'Frontier vs small',
    title: 'The frontier-to-small price spread, by vendor',
    xLabel: 'USD per million output tokens',
    series: [
      { name: f.name, data: rows.map((r) => ({ x: r.cat, y: r.f, label: r.fLabel })) },
      { name: s.name, data: rows.map((r) => ({ x: r.cat, y: r.s, label: r.sLabel })) },
    ],
    notes: 'Each rule joins one vendor’s frontier model to its own small tier; the two models are named ' +
      'in the gutter in their own dot’s colour, the figure beside each dot is that model’s list price, ' +
      'and the column at the right is the ratio between them.' + sharedNote + ' ' + c.notes,
  };
}

/** Financial chart 6: a change and a level are not commensurable on one axis. */
function nvidiaSplit(c) {
  const change = c.series[0];
  const level = c.series[1];
  const red = '#B23127';
  return [
    {
      ...c,
      id: 'nvidia-market-cap-impact',
      tabLabel: 'The two shocks',
      title: 'Nvidia market-capitalisation loss at each shock',
      type: 'bar',
      series: [{
        name: change.name,
        // A one-session fall and a 55-day drawdown are not the same kind of
        // measurement, and identical bars say they are. The window is named on
        // the axis and again beside the figure, and the multi-week bar is drawn
        // as an outline so the two encodings are visibly different marks.
        data: change.data.map((p) => {
          const session = /one session/i.test(String(p.x));
          const span = /^(\d{1,2}\s+[A-Za-z]{3,})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]{3,}\s+(\d{4}))/
            .exec(String(p.x));
          const days = span
            ? Math.round((Date.parse(span[2]) - Date.parse(span[1] + ' ' + span[3])) / 86400000)
            : null;
          const basis = session ? 'in one trading session'
            : (days ? 'over ' + days + ' days' : '');
          return {
            ...p,
            // The published category strings are full sentences, which a
            // category axis has no room for on one line.
            x: String(p.x).replace(/^(.*?):\s*(.*)$/, '$1' + String.fromCharCode(10) + '$2')
              .replace('DeepSeek-R1 shock (one session)', 'DeepSeek-R1 shock')
              .replace('drawdown from peak', 'Drawdown from the peak')
              .replace(' - ', ' – ') +
              (basis ? String.fromCharCode(10) + basis.replace(/^(in|over) /, '') : ''),
            color: red,
            hollow: !session,
            valueLabel: fmt(p.y),
          };
        }),
      }],
      notes: 'The bars are the same unit but not the same kind of measurement, so each row names its own ' +
        'window: the filled bar is a single trading session, the outlined bar a drawdown running weeks. ' +
        'A bar length here is a fall in market capitalisation, not a rate, and the two are not comparable ' +
        'per day. The precisions differ because the sources do: the 2025 move is published to the billion ' +
        'and the 2026 drawdown as a round trillion. ' + c.notes,
    },
    {
      ...c,
      id: 'nvidia-market-cap-level',
      tabLabel: 'Level, for scale',
      title: 'Nvidia market capitalisation, for scale',
      type: 'bar',
      series: [{ name: level.name, data: level.data }],
      notes: 'Shown in its own view because a one-session change and a total market capitalisation cannot ' +
        'share a linear axis: the 589 billion dollar fall is 11 per cent of the 5.06 trillion level beside it.',
    },
  ];
}

/**
 * Financial chart 3: the breakeven chart has to answer its own headline.
 *
 * The volumes run 1M to 1,000M against a cost axis running 2 to 45,000, so a
 * linear volume axis puts every crossing the chart exists to show inside the
 * leftmost sixth of the plot — and inside the leftmost 15px of a phone. The
 * volume axis goes logarithmic, the crossings are computed from the plotted
 * series and drawn on the line, and the three Claude tiers keep Anthropic's
 * single hue and separate by line weight, so no two series are near-identical
 * blues.
 */
const TCO_STYLE = [
  [/opus/i, { color: PALETTE[3], lineWidth: 2.6, endLabelText: 'Opus 5' }],
  [/sonnet/i, { color: PALETTE[3], lineWidth: 1.8, endLabelText: 'Sonnet 5', endLabelOffset: [0, -5] }],
  [/haiku/i, { color: PALETTE[3], lineWidth: 1.1, endLabelText: 'Haiku 4.5', endLabelOffset: [0, 6] }],
  [/gpt|luna/i, { color: PALETTE[0], lineWidth: 1.8, endLabelText: 'gpt-5.6-luna', endLabelOffset: [0, -7] }],
  [/deepseek/i, { color: PALETTE[1], lineWidth: 1.8, endLabelText: 'V4-Flash off-peak', endLabelOffset: [0, 7] }],
  [/self-host/i, { color: SERIES_INK, lineWidth: 2.6, endLabelText: 'Self-hosted 8B', endLabelOffset: [0, 13] }],
];

/** Where a rising series crosses a flat one, read off the plotted points. */
function crossingX(pts, level) {
  const p = pts.filter((q) => isNum(q.x) && isNum(q.y)).sort((q, r) => q.x - r.x);
  for (let i = 1; i < p.length; i += 1) {
    const lo = p[i - 1], hi = p[i];
    if ((lo.y - level) * (hi.y - level) <= 0 && hi.y !== lo.y) {
      return lo.x + ((level - lo.y) / (hi.y - lo.y)) * (hi.x - lo.x);
    }
  }
  return null;
}

function tcoBreakeven(c) {
  const styled = c.series.map((s) => {
    const hit = TCO_STYLE.find(([re]) => re.test(s.name));
    return { ...s, ...(hit ? hit[1] : {}) };
  });
  // The flat series is the fixed-cost baseline every other line is measured
  // against; it is found by its own shape, not by its position in the file.
  const flat = styled.find((s) => {
    const ys = s.data.map((p) => p.y).filter(isNum);
    return ys.length > 1 && ys.every((y) => y === ys[0]);
  });
  const level = flat ? flat.data.find((p) => isNum(p.y)).y : null;
  const marks = [];
  if (flat && isNum(level)) {
    for (const s of styled) {
      if (s === flat) continue;
      const x = crossingX(s.data, level);
      if (isNum(x)) marks.push({ x, y: level, name: s.endLabelText || s.name, text: '' });
    }
    marks.sort((m, n) => m.x - n.x);
    // A crossing near either end of the axis anchors its label at the mark
    // rather than centring it on it, or the label prints past the plot frame.
    const xs = [];
    for (const s of styled) for (const p of s.data) if (isNum(p.x) && p.x > 0) xs.push(p.x);
    const lo = Math.log10(Math.min(...xs));
    const hi = Math.log10(Math.max(...xs));
    // Alternating sides alone is not enough. On a log volume axis the 132M and
    // 658M crossings are 0.23 of the domain apart, which is ~69px at 390 — less
    // than one label wide — so both "top" labels overprinted each other into
    // "13(2M) vs O(vs Haiku 4.5)". Same-side neighbours are now also a
    // label-height apart vertically, which separates them at any plot width.
    const SLOTS = [
      { position: 'top', distance: 8 },
      { position: 'bottom', distance: 8 },
      { position: 'bottom', distance: 42 },
      { position: 'top', distance: 42 },
    ];
    marks.forEach((m, i) => {
      const f = hi > lo ? (Math.log10(m.x) - lo) / (hi - lo) : 0.5;
      m.text = fmtShort(Math.round(m.x)) + 'M' + String.fromCharCode(10) + 'vs ' + m.name;
      const slot = SLOTS[i % SLOTS.length];
      m.position = slot.position;
      m.distance = slot.distance;
      if (f > 0.84) m.align = 'right';
      else if (f < 0.16) m.align = 'left';
    });
  }
  const crossText = marks.length
    ? ' The ringed points are where the self-hosted line crosses a vendor line: ' +
      marks.map((m) => Math.round(m.x) + 'M output tokens a month against ' + m.name).join(', ') +
      '. Below a crossing the vendor is cheaper; above it the self-hosted deployment is.'
    : '';
  return {
    ...c,
    tabLabel: 'Self-host breakeven',
    xLabel: 'Output tokens per month (millions), log scale',
    xHeader: 'Output tokens per month (millions)',
    opts: { ...(c.opts || {}), logX: true, endLabels: 'all' },
    series: styled.map((s) => (s === flat && marks.length ? { ...s, marks } : s)),
    notes: c.notes + ' Volume is on a logarithmic axis: on a linear one every crossing falls in the ' +
      'leftmost sixth of the plot.' + crossText + ' The three Claude tiers share Anthropic’s colour and ' +
      'are told apart by line weight and by the label at each line’s end.',
  };
}

function shortenBill(x) {
  const m = /^(\S+\s\S+)\s+(.*)$/.exec(String(x));
  return m ? m[1] + ' — ' + m[2] : String(x);
}

function methodologyNote(d, key) {
  const m = d && d.extras && d.extras.methodology;
  return m && m[key] ? String(m[key]) : '';
}

/**
 * The file's methodology block and a chart's own note often state the same
 * retrieval method in different words. Keep only the sentences the note has
 * not already made, so the caveat is added rather than repeated.
 */
function lastSentence(text) {
  const parts = String(text || '').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function mergeNote(base, extra) {
  const b = String(base || '');
  const add = String(extra || '').split(/(?<=[.!?])\s+/)
    .filter((sen) => {
      const key = sen.trim().slice(0, 26).toLowerCase();
      return key.length > 8 && !b.toLowerCase().includes(key);
    });
  return add.length ? b + ' ' + add.join(' ') : b;
}

/**
 * Per-route chart rewrites, keyed by chart id. A rewrite returns one spec or
 * several; returning null drops the chart, which is used where a chart is
 * replaced by a better-shaped object elsewhere on the page.
 */
const CHART_ADAPTERS = {
  academic: {
    'papers-per-year': (c, d) => ({
      ...c,
      tabLabel: 'Papers per year',
      series: c.series.map((s) => ({
        ...s,
        data: s.data.map((p) => (String(p.x) === '2026' ? { ...p, partial: true } : p)),
      })),
      notes: c.notes + ' The 2026 column is drawn as an outline because it is a year-to-date count, not a ' +
        'complete year.',
    }),
    'landmark-citations': (c, d) => ({
      ...c,
      type: 'dot',
      tabLabel: 'Citations',
      xLabel: 'Citations',
      // 433 to 25,899 is sixty-fold: on a linear axis fourteen of the eighteen
      // papers sit in the leftmost tenth of the plot.
      logThreshold: 25,
      notes: mergeNote(c.notes, lastSentence(methodologyNote(d, 'citationCounts'))),
    }),
    'sample-efficiency-collapse': (c) => ({
      ...c,
      type: 'dot',
      tabLabel: 'Sample efficiency',
      xLabel: 'Training samples',
      yLabel: 'Training samples',
      notes: 'Drawn as dots on a logarithmic axis: these recipes span 817 samples to 1.2 million, and a bar ' +
        'length measured from zero cannot show three orders of magnitude at once. ' + c.notes,
    }),
    'retention-vs-student-size': (c, d) => ({
      ...c,
      tabLabel: 'Retention vs size',
      opts: { logX: true, connect: true },
      yLabel: 'Teacher score retained (%)',
      notes: mergeNote(c.notes + ' Student size is on a logarithmic axis, without which every student ' +
        'below 14B falls into the leftmost fifth of the plot.', methodologyNote(d, 'retention')),
    }),
    'distill-vs-rl-bars': (c) => ({ ...c, tabLabel: 'Distillation vs RL' }),
    'method-adoption-by-year': (c) => ({ ...c, tabLabel: 'Method adoption' }),
  },

  financial: {
    'price-per-mtok-frontier-vs-small': priceDumbbell,
    'nvidia-market-cap-impact': nvidiaSplit,
    'capability-price-decline': (c) => ({
      ...c,
      tabLabel: 'Fixed capability',
      // Four end labels land within a few pixels of one another on this data,
      // so the series are named in a key instead of at the line ends.
      forceLegend: true,
      opts: { endLabels: false },
      series: c.series.map((s) => ({ ...s, name: s.name.replace(/\s*-\s*(a16z|Epoch)$/, '') })),
      notes: c.notes + ' Series are named in the key above the plot.',
    }),
    'tco-breakeven': tcoBreakeven,
    'training-cost-ladder-chart': (c) => ({ ...c, tabLabel: 'Training runs', type: 'dot', xLabel: 'USD' }),
    'corpus-cost-by-teacher': (c) => ({ ...c, tabLabel: 'Teacher-query bill' }),
    'deepseek-price-reversal': (c) => ({ ...c, tabLabel: 'DeepSeek reversal' }),
  },

  political: {
    'policy-actions-per-quarter': (c) => ({
      ...c,
      tabLabel: 'Actions per quarter',
      series: c.series.map((s) => ({ ...s, data: fillQuarters(s.data) })),
      notes: prose(c.notes).replace('Quarters with zero catalogued events are omitted.',
        'Quarters with no catalogued event are drawn empty rather than dropped, so the escalation is legible.'),
    }),
    // Four independent yes/no flags summed into one column produce a total that
    // means nothing. The same data is a tick matrix, rendered below the charts.
    'jurisdiction-policy-mix': () => null,
    'disclosed-extraction-volume': (c) => ({
      ...c,
      tabLabel: 'Disclosed volume',
      notes: c.notes + ' The two disclosures name different companies, so each bar sits under the company it ' +
        'was actually attributed to and a company the other disclosure does not name is left empty.',
    }),
    'bill-progress': (c) => ({
      ...c,
      type: 'stage',
      tabLabel: 'Bill progress',
      yLabel: '',
      unit: 'furthest stage reached',
      opts: { stages: ['Introduced', 'Reported by committee', 'Passed a chamber', 'Enacted'] },
      series: c.series.map((s) => ({
        ...s,
        data: s.data.map((p) => ({ ...p, x: shortenBill(p.x) })),
      })),
      notes: 'The filled marker is the furthest stage each bill has reached; the faint dots behind it are the ' +
        'stages already cleared. ' + c.notes,
    }),
    'deepseek-restrictions-cumulative': (c) => ({
      ...c,
      tabLabel: 'DeepSeek restrictions',
      title: 'Cumulative jurisdictions restricting DeepSeek, January to April 2025',
      // Month names rather than partial ISO dates: four observations do not
      // earn a continuous time axis, and one drew weekly ticks between them.
      series: c.series.map((s) => ({
        name: 'Jurisdictions with a public restriction',
        data: s.data.map((p) => ({ ...p, x: longDate(p.x) })),
      })),
      opts: { step: 'end' },
      notes: c.notes,
    }),
  },
};

function adaptCharts(ns, charts, d) {
  const table = CHART_ADAPTERS[ns];
  if (!table) return charts;
  const out = [];
  for (const c of charts) {
    const adapt = table[c.id];
    if (!adapt) { out.push(c); continue; }
    const res = adapt(c, d);
    if (!res) continue;
    if (Array.isArray(res)) out.push(...res);
    else out.push(res);
  }
  return out;
}

/* ---- row detail: a table row that opens the drawer ----------------------- */

const ROW_DETAILS = new Map();

function openRowDetail(tid, i) {
  const build = ROW_DETAILS.get(tid);
  if (!build) return;
  const d = build(Number(i));
  if (!d) return;
  openDrawer(d.html, d.title);
}

/**
 * The shell's drawer is labelled by an h2#drawer-title that lives inside the
 * body it replaces, so every panel has to re-create it or the dialog is left
 * pointing at nothing.
 */
function detailHtml(title, meta, blocks, source) {
  return '<div class="detail">' +
    (meta ? '<p class="detail__meta">' + meta + '</p>' : '') +
    '<h2 class="detail__title" id="drawer-title">' + esc(title) + '</h2>' +
    blocks.map((b) => (b && b.body
      ? '<div class="detail__block"><h4>' + esc(b.head) + '</h4><p>' + esc(b.body) + '</p></div>'
      : '')).join('') +
    (source ? '<p class="detail__source"><a href="' + attr(source) + '" target="_blank" rel="noopener">' +
      esc(host(source)) + '</a></p>' : '') +
    '</div>';
}

/* ---- academic: the 46-paper bibliography --------------------------------- */

const PAPER_FAMILY = {
  origins: 'Origins',
  theory: 'Theory and measurement',
  objective: 'Theory and measurement',
  measurement: 'Theory and measurement',
  survey: 'Surveys',
  'taxonomy-feature': 'Taxonomy',
  'taxonomy-online': 'Taxonomy',
  'taxonomy-self': 'Taxonomy',
  'taxonomy-relation': 'Taxonomy',
  feature: 'Taxonomy',
  sequence: 'Sequence and reasoning',
  'cot-distillation': 'Sequence and reasoning',
  'reasoning-distillation': 'Sequence and reasoning',
  'on-policy': 'Sequence and reasoning',
  'encoder-compression': 'Compression',
  'pruning-distillation': 'Compression',
  'pretraining-kd': 'Compression',
  'dataset-distillation': 'Data and inference',
  inference: 'Data and inference',
  alignment: 'Alignment and risk',
  'cross-tokenizer': 'Data and inference',
  risk: 'Alignment and risk',
};

function paperFamily(cat) {
  return PAPER_FAMILY[String(cat || '').toLowerCase()] || 'Other';
}

function literaturePanel(d, fn) {
  const papers = (d.extras && d.extras.papers) || [];
  if (!papers.length) return '';
  const rows = papers.slice().sort((a, b) => (b.citations_est || 0) - (a.citations_est || 0));
  const tid = 'tbl-literature';
  ROW_DETAILS.set(tid, (i) => {
    const p = rows[i];
    if (!p) return null;
    return {
      title: p.title,
      html: detailHtml(p.title,
        esc(p.authors) + ' · ' + esc(p.venue || '') + ' ' + esc(String(p.year || '')),
        [
          { head: 'What it says', body: p.oneLiner },
          { head: 'Why it matters', body: p.significance },
          { head: 'Method', body: p.method },
          {
            head: 'Citations',
            body: isNum(p.citations_est)
              ? fmt(p.citations_est) + ' (Semantic Scholar, September 2026)' : '',
          },
        ], p.url),
    };
  });

  const spec = {
    id: 'literature',
    title: 'The literature this page is built on',
    description: 'Forty-six works, from the 2006 model-compression result to the 2026 on-policy papers, ' +
      'each with the one thing it established. Sorted by citation count.',
    columns: [
      {
        key: 'title',
        label: 'Paper',
        type: 'text',
        after: (v, r) => '<span class="cell-sub">' + esc(r.oneLiner || '') + '</span>',
      },
      { key: 'authors', label: 'Authors', type: 'text' },
      { key: 'year', label: 'Year', type: 'year' },
      { key: 'venue', label: 'Venue', type: 'text' },
      { key: 'family', label: 'Family', type: 'text' },
      { key: 'citations_est', label: 'Citations', type: 'number' },
    ],
    rows: rows.map((p) => ({
      title: p.title,
      oneLiner: p.oneLiner,
      authors: shortAuthors(p.authors),
      year: p.year,
      venue: p.venue,
      family: paperFamily(p.category),
      citations_est: p.citations_est,
      _source: p.url,
    })),
    notes: 'Citation counts are Semantic Scholar figures retrieved on 4 September 2026 and typically run ' +
      '10 to 30 per cent below Google Scholar. Select any row for the paper\'s significance and its link.',
    sources: [],
  };
  return blockHead('Literature', papers.length + ' papers',
    'The curated bibliography behind this section: what each work established, in one line, ' +
    'filterable by family and sortable by year or citation count.', 'sec-literature') +
    '<div class="panel-stack">' +
    renderTable(spec, { footnotes: fn, facetKey: 'family', rowDetail: true }) + '</div>';
}

function shortAuthors(a) {
  const list = String(a || '').split(/,\s*/);
  if (list.length <= 2) return String(a || '');
  return list[0] + ' and ' + (list.length - 1) + ' others';
}

/* ---- financial: 63 list prices, the market context, the GPU spread ------- */

function pricingPanel(d, fn) {
  const pricing = (d.extras && d.extras.pricing) || [];
  if (!pricing.length) return '';
  const tierName = { frontier: 'Frontier', distilled: 'Distilled or small tier', open: 'Open weights' };
  const dated = pricing.filter((p) => p.release && isNum(p.output_per_mtok_usd) && p.output_per_mtok_usd > 0);
  const byTier = new Map();
  for (const p of dated) {
    if (!byTier.has(p.tier)) byTier.set(p.tier, []);
    byTier.get(p.tier).push(p);
  }
  // Thirty-one names cannot be printed inside one plot: the previous version
  // truncated them to "deepseek-v4-pro (pre-16…" and stacked the survivors in
  // a leaderless column outside the frame. Only the marks that carry the
  // argument are labelled — the extremes of the price range, the cheapest
  // frontier model, the dearest small-tier one, and the newest release — and
  // each keeps its full name. Every other name is one hover away, and all 63
  // are in the register below.
  const anchors = new Set();
  const best = (list, cmp) => list.reduce((a, c) => (!a || cmp(c, a) ? c : a), null);
  const add = (p) => { if (p) anchors.add(p); };
  add(best(dated, (c, a) => c.output_per_mtok_usd > a.output_per_mtok_usd));
  add(best(dated, (c, a) => c.output_per_mtok_usd < a.output_per_mtok_usd));
  add(best(dated, (c, a) => String(c.release) > String(a.release)));
  add(best(dated.filter((p) => p.tier === 'frontier'),
    (c, a) => c.output_per_mtok_usd < a.output_per_mtok_usd));
  add(best(dated.filter((p) => p.tier === 'distilled'),
    (c, a) => c.output_per_mtok_usd > a.output_per_mtok_usd));
  const plotted = dated.map((p) => p.output_per_mtok_usd);
  const priceSpan = '$' + trimNum(Math.min(...plotted), 2) + ' to $' + trimNum(Math.max(...plotted), 2);

  const scatter = {
    id: 'pricing-scatter-by-tier',
    title: 'Every tracked model: output price against release date',
    tabLabel: 'Price against release',
    type: 'scatter',
    xLabel: 'Release date',
    yLabel: 'USD per million output tokens',
    unit: 'USD/MTok',
    series: ['frontier', 'distilled', 'open'].filter((t) => byTier.has(t)).map((t) => ({
      name: tierName[t],
      data: byTier.get(t).map((p) => ({
        x: p.release,
        y: p.output_per_mtok_usd,
        title: p.model,
        ...(anchors.has(p) ? { label: p.model } : {}),
      })),
    })),
    notes: 'List prices for the standard tier, on a logarithmic axis because the plotted prices run ' +
      priceSpan + ' per million output tokens. ' + dated.length + ' of ' + pricing.length +
      ' tracked models publish a release date; the rest are in the table below. ' + anchors.size +
      ' points are named — the dearest and cheapest plotted, the cheapest frontier model, the dearest ' +
      'small tier and the newest release; tap or hover any other dot for its model.' +
      (isPhone() ? ' At this width those names sit in the numbered key beneath the plot.' : '') +
      ' Tier is the vendor\'s own description where it gives one, and "distilled" is never inferred ' +
      'from price alone.',
    sources: [...new Set(pricing.map((p) => p.source).filter(Boolean))].slice(0, 4),
  };

  const table = {
    id: 'pricing-all-models',
    title: 'List prices for every tracked model',
    description: 'The full price register behind every figure on this page, as of 3 September 2026, ' +
      'in US dollars per million tokens, standard tier, excluding batch and cache discounts.',
    columns: [
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'vendor', label: 'Vendor', type: 'text' },
      { key: 'tier', label: 'Tier', type: 'text' },
      { key: 'input_per_mtok_usd', label: 'Input', unit: 'USD/MTok', type: 'number' },
      { key: 'output_per_mtok_usd', label: 'Output', unit: 'USD/MTok', type: 'number' },
      { key: 'params_b', label: 'Parameters', unit: 'billions', type: 'number' },
      { key: 'release', label: 'Released', type: 'text' },
    ],
    rows: pricing.slice()
      .sort((a, b) => (b.output_per_mtok_usd || 0) - (a.output_per_mtok_usd || 0))
      .map((p) => ({
        model: p.model,
        vendor: p.vendor,
        tier: tierName[p.tier] || p.tier,
        input_per_mtok_usd: p.input_per_mtok_usd,
        output_per_mtok_usd: p.output_per_mtok_usd,
        params_b: p.params_b,
        release: p.release ? longDate(p.release) : '',
        _source: p.source,
      })),
    notes: 'Parameter counts are given only where the vendor publishes them: 12 of ' + pricing.length +
      ' models. An empty cell is an undisclosed figure, never an estimate.',
    sources: [],
  };

  return blockHead('The price register', pricing.length + ' models',
    'The whole dataset the price figures on this page are computed from, chartable by tier and ' +
    'sortable by any column.', 'sec-prices') +
    '<div class="panel-stack">' + panelHtml([scatter], fn) +
    renderTable(table, { footnotes: fn, facetKey: 'tier' }) + '</div>';
}

function marketContextPanel(d, fn) {
  const mc = (d.extras && d.extras.marketContext) || {};
  const ot = mc.openrouterTokenShare;
  const gpu = (d.extras && d.extras.gpuRentalRates) || [];
  if (!ot && !gpu.length) return '';
  const parts = [];

  if (ot) {
    // These four were a third stat treatment of their own — a top rule, a
    // detached unit glyph and a caption on some cards but not others — beside
    // the bordered figure cards used everywhere else on the site. They are the
    // same kind of thing, so they are now the same component, and each carries
    // the study it comes from rather than leaving the row unsourced.
    const src = (ot.sources || [])[0];
    const sig = (label, value, note) =>
      ({ label, value, unit: '%', note, source: src, publisher: 'OpenRouter, 100-trillion-token study' });
    parts.push(kpiRow([
      sig('Share of routed tokens going to US models, June 2025', ot.usModelShareJune2025_pct,
        'The study’s own baseline for the shift below'),
      sig('The same share, mid-2026', ot.usModelShareMid2026_pct,
        'A fall of 40 points in twelve months'),
      sig('Chinese open-weight share, May 2026', ot.chineseOpenWeightShareMay2026_pct,
        'Press-reported rather than peer-reviewed'),
      sig('Open-weight share, late 2025', ot.openWeightShareLate2025_pct,
        'Reported as a majority by mid-2026, without a figure'),
    ], fn));
    parts.push('<figure class="panel"><div class="panel__head">' +
      '<h3 class="panel__title">What the routing data says about price</h4>' +
      '<span class="panel__unit">2 findings</span></div>' +
      '<div class="panel__body">' +
      '<blockquote class="quote"><p>' + esc(ot.priceElasticity) + '</p>' +
      '<cite>OpenRouter, 100-trillion-token study' + (fn ? '' : '') + '</cite></blockquote>' +
      '<blockquote class="quote"><p>' + esc(ot.smallModelTrend) + '</p>' +
      '<cite>The same study, on models under 15B parameters</cite></blockquote>' +
      '<p class="panel__note">' + esc(ot.note) + ' Both findings cut against the race-to-zero reading of the ' +
      'price charts above: if demand barely responds to price, a price cut buys share rather than volume.' +
      '</p></div>' +
      ((ot.sources || []).length
        ? '<p class="panel__sources">Sources: ' + ot.sources.map((u) =>
          '<a href="' + attr(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a>' +
          (fn ? fn.refs([u]) : '')).join(' · ') + '</p>'
        : '') +
      '</figure>');
  }

  if (gpu.length) {
    const rows = gpu.slice().sort((a, b) => b.usd_per_hour - a.usd_per_hour);
    parts.push(panelHtml([{
      id: 'gpu-rental-spread',
      title: 'What an H100 hour costs, by provider',
      tabLabel: 'GPU rental spread',
      type: 'dot',
      xLabel: 'USD per GPU-hour',
      yLabel: 'USD per GPU-hour',
      unit: 'USD/GPU-hour',
      series: [{
        name: 'On-demand rate',
        data: rows.map((r) => ({ x: r.provider + ' · ' + r.gpu.replace(/^NVIDIA\s+/, ''), y: r.usd_per_hour })),
      }],
      logThreshold: 20,
      notes: 'A 4.6x spread across single H100 rates alone, and 28x once the hyperscalers’ eight-GPU node ' +
        'price is included — the single largest free variable in every self-hosting figure on this page. ' +
        'Rates are on-demand list prices; reserved and spot capacity is cheaper. The bottom row is the rate ' +
        'the cost model on this page actually uses.',
      sources: [...new Set(rows.map((r) => r.source).filter(Boolean))].slice(0, 3),
    }], fn));
  }

  return blockHead('Market context', (ot ? '4 figures' : '') + (ot && gpu.length ? ' · ' : '') +
    (gpu.length ? gpu.length + ' GPU rates' : ''),
    'Two things the price charts cannot show on their own: where the tokens actually go, and how much ' +
    'of a self-hosting estimate is just the GPU rate you happened to pick.', 'sec-market') +
    '<div class="panel-stack">' + parts.join('') + '</div>';
}

function tcoAssumptionsPanel(d, fn) {
  const t = (d.extras && d.extras.tcoAssumptions) || null;
  if (!t) return '';
  const money = (v) => (isNum(v) ? '$' + fmt(v) : '—');
  const items = [
    ['Workload shape', t.workloadShape],
    ['GPU hourly rate', money(t.gpuHourlyRate) + ' per hour. ' + (t.gpuHourlyRateNote || '')],
    ['Hours per month', fmt(t.hoursPerMonth) + ' (one instance, always on)'],
    ['Monthly GPU cost', money(t.monthlyGpuCost)],
    ['Staffing', t.staffingFte + ' FTE at ' + money(t.staffingAnnualFullyLoaded) +
      ' fully loaded, or ' + money(t.monthlyStaffingCost) + ' a month'],
    ['Monthly total, self-hosted', money(t.monthlyTotalSelfHosted)],
    ['Assumed throughput', fmt(t.assumedThroughputTokensPerSec) + ' output tokens per second. ' +
      (t.throughputNote || '')],
    ['Monthly capacity', fmt(t.monthlyCapacityMtokOut) + ' million output tokens'],
  ];
  const be = t.breakevenMtokOutPerMonth || {};
  // The keys are field names; the models have published names, and a table
  // that prints "Claude Haiku 4 5" is a table nobody trusts with a price.
  const BE_NAMES = {
    vs_claude_opus_5: 'Claude Opus 5',
    vs_claude_sonnet_5: 'Claude Sonnet 5',
    vs_claude_haiku_4_5: 'Claude Haiku 4.5',
    vs_gpt_5_6_luna: 'gpt-5.6-luna',
    vs_deepseek_v4_flash_offpeak: 'DeepSeek V4-Flash, off-peak',
  };
  const beRows = Object.keys(be).map((k) => ({
    against: BE_NAMES[k] || k.replace(/^vs_/, '').replace(/_/g, ' '),
    mtok: be[k],
  }));
  const beTable = beRows.length ? renderTable({
    id: 'tco-breakeven-points',
    title: 'Where self-hosting overtakes each API',
    description: 'Monthly output volume at which the self-hosted total beats the vendor bill, ' +
      'under the assumptions listed above.',
    columns: [
      { key: 'against', label: 'Compared with', type: 'text' },
      { key: 'mtok', label: 'Breakeven volume', unit: 'million output tokens a month', type: 'number' },
    ],
    rows: beRows,
    notes: 'Below the breakeven volume the API is cheaper; above it the self-hosted instance is. ' +
      'The comparison ignores the quality gap between the student and the model it replaces.',
    sources: [],
  }, { footnotes: fn, facet: false }) : '';

  return blockHead('Assumptions behind the cost model', items.length + ' inputs',
    (t.description || '') + ' Change any of them and the breakeven moves; the excluded costs at the ' +
    'end are the ones that would move it furthest.', 'sec-assumptions') +
    '<div class="panel-stack">' +
    '<figure class="panel"><div class="panel__head">' +
    '<h3 class="panel__title">Inputs</h4>' +
    '<span class="panel__unit">' + items.length + ' assumptions</span></div>' +
    '<div class="panel__body"><dl class="assumptions">' +
    items.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') +
    '</dl>' +
    ((t.excluded || []).length
      ? '<h4 class="assumptions__head">Deliberately excluded</h4><ul class="ticklist">' +
        t.excluded.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>'
      : '') +
    '</div>' +
    ((t.sources || []).length
      ? '<p class="panel__sources">Sources: ' + t.sources.map((u) =>
        '<a href="' + attr(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a>' +
        (fn ? fn.refs([u]) : '')).join(' · ') + '</p>'
      : '') +
    '</figure>' + beTable + '</div>';
}

/* ---- political: the tick matrix, the ledger, the instruments ------------- */

function policyMatrixPanel(d, fn) {
  const c = (d.charts || []).find((x) => x.id === 'jurisdiction-policy-mix');
  if (!c || !(c.series || []).length) return '';
  const jurisdictions = categories(seriesOf(c));
  const cols = [{ key: 'jurisdiction', label: 'Jurisdiction', type: 'text' }].concat(
    c.series.map((s, i) => ({
      key: 'c' + i,
      label: s.name,
      type: 'text',
      mark: (v) => '<span class="tick tick--' + (v === 'Yes' ? 'on' : 'off') + '" aria-hidden="true"></span>',
    })));
  const rows = jurisdictions.map((j) => {
    const row = { jurisdiction: j };
    c.series.forEach((s, i) => {
      const p = s.data.find((q) => String(q.x) === j);
      row['c' + i] = p && p.y ? 'Yes' : 'No';
    });
    return row;
  });
  return blockHead('Which policy tools are actually in place', jurisdictions.length + ' jurisdictions',
    'Four independent instruments, read across a row or down a column. They are not summed: a ' +
    'jurisdiction with three of them does not have three times anything, and the United Kingdom\'s ' +
    'empty row is the finding, not missing data.', 'sec-matrix') +
    '<div class="panel-stack">' + renderTable({
      id: 'policy-tool-matrix',
      title: 'Policy tools in place, by jurisdiction',
      description: 'A filled mark is an instrument in force; a hollow mark is its absence.',
      columns: cols,
      rows,
      notes: prose(c.notes),
      sources: c.sources || [],
    }, { footnotes: fn, facet: false, matrix: true }) + '</div>';
}

/**
 * The published strength wording maps onto four positions. The prose is never
 * replaced by the rank — it sits in the same cell — so a reader can disagree
 * with the reading and see exactly what was read.
 */
const STRENGTH_RANK = [
  [/strongest|most likely operative/i, 4],
  [/^strong/i, 3],
  [/moderate/i, 2],
  [/contested|untested/i, 2],
  [/weak/i, 1],
];

function strengthRank(v) {
  for (const [re, n] of STRENGTH_RANK) if (re.test(String(v || ''))) return n;
  return 0;
}

function strengthMeter(v) {
  const n = strengthRank(v);
  if (!n) return '';
  let out = '<span class="meter" aria-hidden="true">';
  for (let i = 1; i <= 4; i += 1) out += '<span class="meter__seg' + (i <= n ? ' is-on' : '') + '"></span>';
  return out + '</span>';
}

const NO_EVIDENCE = /no evidence|not detailed|no public|without publishing|no details|not published|declined to|no specifics|unspecified/i;

function disputesPanel(d, fn) {
  const disputes = (d.extras && d.extras.disputes) || [];
  if (!disputes.length) return '';
  const rows = disputes.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const tid = 'tbl-accusation-ledger';
  ROW_DETAILS.set(tid, (i) => {
    const r = rows[i];
    if (!r) return null;
    return {
      title: r.accuser + ' on ' + r.accused,
      html: detailHtml(r.accuser + ' on ' + r.accused, esc(longDate(r.date)), [
        { head: 'The claim', body: r.claim },
        { head: 'Evidence published', body: r.evidence },
        { head: 'Outcome', body: r.outcome },
      ], r.source),
    };
  });
  const published = rows.filter((r) => !NO_EVIDENCE.test(String(r.evidence || ''))).length;
  return blockHead('Who accused whom, and what evidence was published', rows.length + ' accusations',
    'The page\'s central claim, as a ledger. Each row is one public accusation of distillation, with what ' +
    'its author actually put on the record.', 'sec-ledger') +
    '<div class="panel-stack">' + renderTable({
      id: 'accusation-ledger',
      title: 'The accusation ledger, January 2025 to July 2026',
      description: 'Sorted oldest first. A filled mark means evidence was published alongside the claim; ' +
        'a hollow mark means the claim was asserted without published evidence.',
      columns: [
        { key: 'date', label: 'Date', type: 'text' },
        { key: 'accuser', label: 'Accuser', type: 'text' },
        { key: 'accused', label: 'Accused', type: 'text' },
        { key: 'claim', label: 'Claim', type: 'text' },
        {
          key: 'evidence',
          label: 'Evidence published',
          type: 'text',
          mark: (v) => '<span class="tick tick--' + (NO_EVIDENCE.test(String(v || '')) ? 'off' : 'on') +
            '" aria-hidden="true"></span>',
        },
        { key: 'outcome', label: 'Outcome', type: 'text' },
      ],
      rows: rows.map((r) => ({
        date: longDate(r.date),
        accuser: r.accuser,
        accused: r.accused,
        claim: r.claim,
        evidence: r.evidence,
        outcome: r.outcome,
        _source: r.source,
      })),
      notes: published + ' of ' + rows.length + ' accusations were published with evidence a reader can ' +
        'inspect; the mark is derived from the wording of the evidence column itself, which is quoted in ' +
        'full in the cell beside it. Select a row for the full text of the claim and its outcome.',
      sources: [],
    }, { footnotes: fn, facet: false, rowDetail: true }) + '</div>';
}

function policyInstrumentsPanel(d, fn) {
  const policies = (d.extras && d.extras.policies) || [];
  if (!policies.length) return '';
  const rows = policies.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const tid = 'tbl-policy-instruments';
  ROW_DETAILS.set(tid, (i) => {
    const p = rows[i];
    if (!p) return null;
    return {
      title: p.name,
      html: detailHtml(p.name, esc(p.jurisdiction) + ' · ' + esc(p.status) + ' · ' + esc(longDate(p.date)), [
        { head: 'What it says', body: p.whatItSays },
        { head: 'Why it matters for distillation', body: p.distillationRelevance },
      ], p.source),
    };
  });
  return blockHead('Every instrument, in full', policies.length + ' instruments',
    'The jurisdiction matrix above collapses thirteen US federal instruments into three rows. This is the ' +
    'full register: select any row for what the instrument says and what it means for distillation.',
    'sec-instruments') +
    '<div class="panel-stack">' + renderTable({
      id: 'policy-instruments',
      title: 'Policy instruments naming or bearing on distillation',
      description: 'Newest first.',
      columns: [
        { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' },
        { key: 'name', label: 'Instrument', type: 'text' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'date', label: 'Date', type: 'text' },
        { key: 'relevance', label: 'Bearing on distillation', type: 'text' },
      ],
      rows: rows.map((p) => ({
        jurisdiction: p.jurisdiction,
        name: p.name,
        status: p.status,
        date: longDate(p.date),
        relevance: firstSentences(p.distillationRelevance, 120).head,
        _source: p.source,
      })),
      notes: 'The bearing column is the first sentence of the full analysis; select a row for both ' +
        'paragraphs and the primary source.',
      sources: [],
    }, { footnotes: fn, facetKey: 'status', rowDetail: true }) + '</div>';
}

/* ---- what each route adds, and where -------------------------------------- */

const EXTRA_BLOCKS = {
  academic: {
    // The file's own methodology block explains why several 2025-26 recipes
    // have no cost at all; that belongs on the cost table, not in a key
    // nothing reads.
    tuneTable: (t, d) => (t.id !== 'compute-cost-per-method' ? t : {
      ...t,
      notes: mergeNote(t.notes, methodologyNote(d, 'omissions')),
    }),
    afterTables: (d, fn, nav) => {
      const html = literaturePanel(d, fn);
      if (html) nav.push({ id: 'sec-literature', label: 'Literature', count: (d.extras.papers || []).length });
      return html;
    },
  },
  financial: {
    // The ratio is the column the page's headline figure is computed from, and
    // it was the one column past the clip edge. It moves next to the vendor.
    tuneTable: (t) => (t.id !== 'price-matrix-frontier-vs-small' ? t : {
      ...t,
      columns: [
        ...t.columns.filter((c) => c.key === 'vendor'),
        ...t.columns.filter((c) => c.key === 'ratio_out'),
        ...t.columns.filter((c) => c.key !== 'vendor' && c.key !== 'ratio_out'),
      ],
    }),
    afterCharts: (d, fn, nav) => {
      const price = pricingPanel(d, fn);
      if (price) nav.push({ id: 'sec-prices', label: 'Prices', count: (d.extras.pricing || []).length });
      const market = marketContextPanel(d, fn);
      if (market) nav.push({ id: 'sec-market', label: 'Market context' });
      return price + market;
    },
    afterTables: (d, fn, nav) => {
      const html = tcoAssumptionsPanel(d, fn);
      if (html) nav.push({ id: 'sec-assumptions', label: 'Assumptions' });
      return html;
    },
  },
  political: {
    // The strength column is the direct evidence for the page's second finding
    // and it was unordered free text: eight cells a reader had to rank in their
    // head. The meter states the rank the wording already carries, the wording
    // stays beside it verbatim, and the column now sorts by strength.
    tuneTable: (t) => (t.id !== 'legal-theories' ? t : {
      ...t,
      columns: t.columns.map((c) => (c.key !== 'strength' ? c : {
        ...c,
        label: 'Strength',
        sortValue: (v) => -strengthRank(v),
        mark: (v) => strengthMeter(v),
      })),
    }),
    afterCharts: (d, fn, nav) => {
      const matrix = policyMatrixPanel(d, fn);
      if (matrix) nav.push({ id: 'sec-matrix', label: 'Policy tools' });
      const ledger = disputesPanel(d, fn);
      if (ledger) nav.push({ id: 'sec-ledger', label: 'Accusations', count: (d.extras.disputes || []).length });
      return matrix + ledger;
    },
    afterTables: (d, fn, nav) => {
      const html = policyInstrumentsPanel(d, fn);
      if (html) nav.push({ id: 'sec-instruments', label: 'Instruments', count: (d.extras.policies || []).length });
      return html;
    },
  },
};

/* ============================================================================
   11. renderSection — the generic perspective page
   ========================================================================== */

export function renderSection(el, d, route) {
  disposeCharts();
  CHART_SPECS.clear();
  const r = typeof route === 'string' ? { id: route, label: route } : (route || {});
  const label = r.label || (d && d.perspective) || 'Section';
  const kind = r.group === 'reference' ? 'reference' : 'perspective';

  if (!d) {
    el.innerHTML = '<section class="section">' +
      '<header class="section__head"><div>' +
      '<p class="eyebrow"><span class="eyebrow__dot"></span>' + esc(label) + ' ' + kind + ' · in preparation</p>' +
      '<h1 class="section__title">' + esc(label) + '</h1>' +
      '<p class="section__standfirst">This ' + kind + ' has not been published yet.</p>' +
      '</div></header>' +
      emptyState(
        'Not yet compiled',
        'The research pipeline writes one JSON file per perspective, each with its own statistics, ' +
        'tables, charts, timeline and numbered sources. This one is still being assembled and will ' +
        'appear here as soon as it passes source checks. Nothing is shown until every figure has a primary source.',
        '<a class="btn btn--ghost" href="#/overview">Back to the overview</a> ' +
        '<a class="btn--link" href="#/methodology">How this compendium is built</a>'
      ) + '</section>';
    return;
  }

  // Route-specific reshaping of chart and table specs (sections-b.js). It
  // returns the same object for every route it does not own.
  d = tuneSection(d, r.id);

  const fn = makeFootnotes(d, d.perspective || r.id);
  // One count, one source of truth: the registry is seeded with every URL the
  // page cites, so the header, the left rail and the sources heading agree.
  const nSources = fn.size();
  noteSourceCount(d.perspective || r.id, nSources);
  const { head, rest } = firstSentences(d.summary, 260);
  // Count what the page actually draws: one chart may be split into two views,
  // and one may be replaced by a table that reads better than it did.
  const drawnCharts = adaptCharts(d.perspective || r.id,
    (d.charts || []).filter((c) => seriesOf(c).length), d);
  const counts = [
    (d.stats || []).length ? plural((d.stats || []).length, 'figure') : '',
    drawnCharts.length ? plural(drawnCharts.length, 'chart') : '',
    (d.tables || []).length ? plural((d.tables || []).length, 'table') : '',
    (d.timeline || []).length ? plural((d.timeline || []).length, 'event') : '',
    nSources ? plural(nSources, 'source') : '',
  ].filter(Boolean);

  const ns = d.perspective || r.id;
  const ex = EXTRA_BLOCKS[ns] || {};
  const nav = [];
  const parts = [];
  parts.push('<section class="section" data-perspective="' + esc(ns) + '">');
  parts.push('<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>' + esc(label) + ' ' + kind + '</p>' +
    // The page's own title is the document's h1: the site headline it used to
    // sit under belongs to the overview route and is hidden here, so the
    // accessible outline named a page the reader was not on.
    '<h1 class="section__title">' + esc(d.title || label) + '</h1>' +
    (head ? '<p class="section__standfirst">' + esc(head) + '</p>' : '') +
    // A single fourteen-line paragraph is the densest text on the page and the
    // first thing a reader meets; it is broken at its own sentence seams.
    (rest ? paragraphs(rest).map((p) =>
      '<p class="section__standfirst section__standfirst--rest">' + esc(p) + '</p>').join('') : '') +
    '</div>' +
    '<p class="section__meta">Research updated ' + esc(longDate(d.updated)) +
    counts.map((c) => '<br>' + esc(c)).join('') + '</p>' +
    '</header>');

  if ((d.stats || []).length) {
    nav.push({ id: 'sec-figures', label: 'Figures', count: d.stats.length });
    parts.push('<div id="sec-figures">' + kpiRow(d.stats, fn) + '</div>');
  }

  // The buyer's decision guide answers the customer route's own title, so it
  // leads; the company dossiers and the developer recipes follow the findings.
  parts.push(sectionExtras(d, ns, 'lead', fn, nav));

  if ((d.keyFindings || []).length) {
    nav.push({ id: 'sec-findings', label: 'Findings', count: d.keyFindings.length });
  }
  parts.push(findingsHtml(d.keyFindings, fn, 'sec-findings'));
  parts.push(sectionExtras(d, ns, 'body', fn, nav));

  const charts = drawnCharts;
  if (charts.length) {
    nav.push({ id: 'sec-charts', label: 'Charts', count: charts.length });
    parts.push(blockHead('Charts', plural(charts.length, 'chart'),
      'One ink for a single series, with the accent on the mark that carries the argument; ' +
      'where colour separates two or more series it names a vendor or a category and never changes. ' +
      'Units are in each panel header, and every panel opens its own data table.', 'sec-charts'));
    parts.push('<div class="panel-stack">' + groupCharts(charts).map((g) => panelHtml(g, fn)).join('') + '</div>');
  }

  if (ex.afterCharts) parts.push(ex.afterCharts(d, fn, nav));

  const tables = (d.tables || []).filter((t) => t && (t.rows || []).length);
  if (tables.length) {
    nav.push({ id: 'sec-tables', label: 'Tables', count: tables.length });
    parts.push(blockHead('Evidence tables', plural(tables.length, 'table'),
      'Select any column heading to sort — the caret beside it shows the direction, and a third click ' +
      'restores the published order. Numeric columns are right-aligned, and every row links to its source.',
      'sec-tables'));
    parts.push('<div class="panel-stack">' + tables.map((t) => {
      const spec = ex.tuneTable ? ex.tuneTable(t, d) : t;
      return renderTable({ ...spec, updated: spec.updated || d.updated },
        { footnotes: fn, ...((ex.tableOpts && ex.tableOpts(spec, d)) || {}) });
    }).join('') + '</div>');
  }

  if (ex.afterTables) parts.push(ex.afterTables(d, fn, nav));
  parts.push(sectionExtras(d, ns, 'tables', fn, nav));

  const events = (d.timeline || []).filter((e) => e && e.date);
  if (events.length) {
    if (!charts.length && events.length >= 12) {
      parts.push('<div class="panel-stack">' + panelHtml([timelineChartSpec(events)], fn, { height: 'short' }) + '</div>');
    }
    nav.push({ id: 'sec-timeline', label: 'Timeline', count: events.length });
    parts.push(timelineHtml(events, {
      title: r.id === 'timeline' ? 'The record' : 'What happened, when',
      note: 'Filter by category; every entry links to its primary source.',
      headId: 'sec-timeline',
      // These three routes argue about what is happening now and what is about
      // to stop (a retirement date, a last-order date), so they open on the
      // most recent event rather than two years in the past.
      newestFirst: ['company', 'developer', 'customer'].includes(r.id),
    }));
  }

  parts.push(sectionExtras(d, ns, 'close', fn, nav));

  if ((d.glossary || []).length) nav.push({ id: 'sec-glossary', label: 'Glossary', count: d.glossary.length });
  parts.push(glossaryHtml(d.glossary, 'sec-glossary'));
  nav.push({ id: 'sec-sources', label: 'Sources', count: nSources });
  parts.push(sourcesHtml(fn, d.updated));
  parts.push('</section>');

  // The rail navigates between routes; a 20,000px route needs its own index.
  parts.splice(2, 0, sectionNav(nav));

  el.innerHTML = parts.join('');
  mountCharts(el);
  wireDelegates();
  afterRender(el, ns);
  markScrollers(el);
  wireSectionSpy(el);
  syncRailSourceCount(nSources);
}

/**
 * The rendering blocks of a perspective page, handed to a route that lays its
 * own page out (the method library). Same footnote registry, same tables, same
 * charts and the same source list as `renderSection`, so a reference route is
 * never a second-class citizen with its own half-built components.
 */
export function sectionBlocks(d, ns) {
  const key = ns || (d && d.perspective) || 'section';
  const fn = makeFootnotes(d, key);
  noteSourceCount(key, fn.size());
  PAGE_SOURCES = { n: fn.size(), label: 'sources on this page' };
  const charts = adaptCharts(key, ((d && d.charts) || []).filter((c) => seriesOf(c).length), d);
  const tables = ((d && d.tables) || []).filter((t) => t && (t.rows || []).length);
  return {
    fn,
    nSources: fn.size(),
    nCharts: charts.length,
    nTables: tables.length,
    stats: ((d && d.stats) || []).length ? kpiRow(d.stats, fn) : '',
    findings: findingsHtml(d && d.keyFindings, fn, 'sec-findings'),
    charts: charts.length
      ? blockHead('Charts', plural(charts.length, 'chart'),
        'One ink for a single series, with the accent on the mark that carries the argument. Units are in ' +
        'each panel header, and every panel opens its own data table.', 'sec-charts') +
        '<div class="panel-stack">' + groupCharts(charts).map((g) => panelHtml(g, fn)).join('') + '</div>'
      : '',
    tables: tables.length
      ? blockHead('Evidence tables', plural(tables.length, 'table'),
        'Select any column heading to sort — the caret beside it shows the direction, and a third click ' +
        'restores the published order. Every row links to its source.', 'sec-tables') +
        '<div class="panel-stack">' + tables.map((t) =>
          renderTable({ ...t, updated: t.updated || (d && d.updated) }, { footnotes: fn })).join('') + '</div>'
      : '',
    glossary: glossaryHtml(d && d.glossary, 'sec-glossary'),
    sources: sourcesHtml(fn, d && d.updated),
  };
}

/** In-page contents for a route that builds its own page. */
export function navBlock(items) { return sectionNav(items); }

/** Split authored prose at its own sentence seams. */
export function splitParagraphs(text, target) { return paragraphs(text, target); }

/** Charts on the outgoing view are disposed before another route draws. */
export function resetCharts() { disposeCharts(); CHART_SPECS.clear(); }

/** Mount every chart in a freshly written view and wire its controls. */
export function mountRendered(el) {
  mountCharts(el);
  wireDelegates();
  // The masthead is normalised on every route, not only on the six that go
  // through renderSection: the library writes its own header with the same
  // components and had the same wall of prose above its first figure.
  enhanceHead(el);
  // Every route's tables get the same affordances: a pinned first column,
  // balanced widths, a row cap and a CSV download. Written for three routes,
  // wired here so a table does not behave differently depending on the page
  // it happens to sit on.
  enhanceTables(el);
  markScrollers(el);
  wireSectionSpy(el);
  syncRailSourceCount();
}

/* ============================================================================
   12. renderOverview
   ========================================================================== */

const PERSPECTIVES = ['academic', 'financial', 'political', 'company', 'developer', 'customer'];

const PERSPECTIVE_BLURB = {
  academic: 'Papers, benchmark retention, and what the literature can and cannot show.',
  financial: 'Token prices, training-run costs, and the margin structure distillation creates.',
  political: 'Export controls, national-security memoranda, and bills naming distillation.',
  company: 'Who distils, who sells it, who bans it, and who has been publicly accused.',
  developer: 'Libraries, managed platforms, GPU budgets and published recipes.',
  customer: 'What to buy at what price, and when a distilled model is enough.',
};

/**
 * The six figures on the front page are an editorial choice, not the output of
 * a scoring function. Ranking on "has a delta, has a source, appears early"
 * opened the page on a decade-old citation count and spent two of six slots on
 * the same Anthropic-versus-Alibaba story, while the pair that actually makes
 * the argument — $450 to distil Sky-T1-32B against $294,000 for the
 * DeepSeek-R1 reinforcement-learning run — never appeared at all.
 *
 * Each entry names the perspective and matches a stat already published in that
 * file, so nothing here is a figure its own section does not carry; only the
 * wording, the magnitude convention and the comparison line are set here. The
 * six are six different arguments: cost, compute, capability, adoption,
 * conflict, regulation.
 */
const OVERVIEW_KPIS = [
  {
    from: 'financial', match: /Sky-T1-32B/i,
    label: 'Cost of one o1-class distillation run, Sky-T1-32B',
    value: '$450', unit: '8 H100s for 19 hours',
    delta: '650x less than DeepSeek-R1\'s $294,000 RL run',
  },
  {
    from: 'academic', match: /compute efficiency/i,
    label: 'Compute to distil an 8B student, against training it from scratch',
    value: '2,000x', unit: 'less compute',
    delta: 'controlled 2026 benchmark study',
  },
  {
    from: 'customer', match: /GPQA retained by GPT-5\.6 Luna/i,
    label: 'GPQA Diamond that GPT-5.6 Luna keeps of its larger sibling',
    value: '94.2%', unit: 'of the teacher score',
    delta: 'at 5% of the input price',
  },
  {
    from: 'developer', match: /all-time HF downloads/i,
    label: 'DeepSeek-R1-Distill downloads on Hugging Face, all time',
    value: '97.8M', unit: 'downloads',
    delta: '2.23M in the last 30 days',
  },
  {
    from: 'company', match: /Largest single distillation attack/i,
    label: 'Largest distillation campaign a lab has publicly alleged',
    value: '28.8M', unit: 'exchanges with Claude',
    delta: '25,000 accounts in about six weeks',
  },
  {
    from: 'political', match: /states restricting DeepSeek/i,
    label: 'US states restricting DeepSeek on government devices',
    value: '14', unit: 'states',
    delta: 'none before 31 January 2025',
  },
];

/** Publisher name for a URL, from the perspective's own source catalogue. */
function publisherFor(d, url) {
  for (const s of (d && d.sources) || []) if (s && s.url === url && s.publisher) return s.publisher;
  return null;
}

/**
 * Resolve the hand-picked row against the loaded file. A card only renders when
 * its figure is still in the data, so a rewritten perspective drops the card
 * rather than stranding a number the sections no longer support.
 */
function overviewKpis(data) {
  const out = [];
  for (const k of OVERVIEW_KPIS) {
    const d = data[k.from];
    if (!d) continue;
    const stat = (d.stats || []).find((s) => k.match.test(String(s.label || '')));
    if (!stat) continue;
    out.push({
      label: k.label, value: k.value, unit: k.unit, delta: k.delta,
      note: stat.note, source: stat.source,
      publisher: publisherFor(d, stat.source), from: k.from,
    });
  }
  return out;
}

/** best single stat for a perspective: prefer one with a delta and a source */
function strongestStat(d) {
  const stats = (d && d.stats) || [];
  if (!stats.length) return null;
  let best = null;
  let bestScore = -1;
  stats.forEach((s, i) => {
    let score = 0;
    if (s.delta) score += 3;
    if (s.source) score += 2;
    if (s.note) score += 1;
    if (isNum(s.value)) score += 1;
    score += Math.max(0, 4 - i);
    if (score > bestScore) { bestScore = score; best = s; }
  });
  return best;
}

function findChart(data, ids, keywords) {
  for (const key of Object.keys(data || {})) {
    for (const c of (data[key] && data[key].charts) || []) {
      if (ids.includes(c.id)) return { chart: c, from: key };
    }
  }
  for (const key of Object.keys(data || {})) {
    for (const c of (data[key] && data[key].charts) || []) {
      const t = String(c.title || '').toLowerCase();
      if (keywords.some((k) => t.includes(k)) && seriesOf(c).length) return { chart: c, from: key };
    }
  }
  return null;
}

/* Tiers are an ordered magnitude, not a set of vendors, so they take the
   sequential ramp from DESIGN.md section 2 rather than the categorical slots —
   the vendor hues stay reserved for vendors across the whole site. */
const TIERS = [
  { key: 'frontier', name: 'Frontier', colour: '#7C3A17' },
  { key: 'distilled', name: 'Distilled and small', colour: '#9E5433' },
  { key: 'open', name: 'Open weights', colour: '#B87759' },
];

const median = (xs) => {
  const v = xs.slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/* One money format for the whole chart: cents below $10, whole dollars above,
   so "$0.60" never renders as "$0.6" beside "$10". */
const usd = (v) => (v >= 10 ? '$' + Math.round(v).toLocaleString('en-US') : '$' + v.toFixed(2));

/* Points on one row would sit on top of each other, so each is nudged off the
   row centre by a repeatable amount derived from its position in the tier. */
const jitter = (i, n) => (n < 2 ? 0 : (((i * 7) % n) / (n - 1) - 0.5) * 0.5);

/**
 * Output price by tier, as a strip plot on a logarithmic axis.
 *
 * The earlier version plotted the eight dearest models of each tier as three
 * bar series against the union of their names, which put two out of every
 * three bars under the wrong label, and squeezed a 1,800:1 range onto a linear
 * axis where every distilled model rendered sub-pixel. This draws all 63 rows —
 * the whole tier, not its top end — as one dot each against a log axis, with
 * the tier median called out, so the gap the page is about is the thing the
 * chart shows.
 */
function priceGapChart(data) {
  const pricing = data.financial && data.financial.extras && data.financial.extras.pricing;
  if (!Array.isArray(pricing) || !pricing.length) {
    return findChart(data, ['flagship-vs-small-output-price', 'price-per-mtok'],
      ['output price', 'price', 'usd per']);
  }
  const rows = TIERS.map((t) => ({
    ...t,
    rows: pricing.filter((p) => p.tier === t.key && isNum(p.output_per_mtok_usd))
      .sort((a, b) => a.output_per_mtok_usd - b.output_per_mtok_usd),
  })).filter((t) => t.rows.length);
  if (rows.length < 2) {
    return findChart(data, ['flagship-vs-small-output-price', 'price-per-mtok'],
      ['output price', 'price', 'usd per']);
  }

  const meds = rows.map((t) => median(t.rows.map((p) => p.output_per_mtok_usd)));
  const all = pricing.filter((p) => isNum(p.output_per_mtok_usd)).map((p) => p.output_per_mtok_usd);
  const names = rows.map((t) => t.name);
  const ratio = (meds[0] && meds[1]) ? trimNum(meds[0] / meds[1], 1) : null;

  // Two stacked y axes over one grid: a category axis carries the tier names
  // and the band rules, and a value axis running -0.5 to n-0.5 carries the
  // marks. An ordinal scale rounds a fractional coordinate, so the points would
  // otherwise pile onto the row's centre line and hide how many there are.
  const dots = rows.map((t, ti) => ({
    name: t.name, type: 'scatter', yAxisIndex: 1, symbolSize: 8,
    itemStyle: { color: SERIES_INK, opacity: 0.8, borderColor: '#FFFFFF', borderWidth: 0.75 },
    data: t.rows.map((p, i) => ({
      value: [p.output_per_mtok_usd, ti + jitter(i, t.rows.length)],
      _raw: p, _tier: t.name,
    })),
  }));

  const medians = {
    name: 'Tier median', type: 'scatter', yAxisIndex: 1,
    symbol: 'diamond', symbolSize: 15, z: 5,
    itemStyle: { color: MARK_INK, borderColor: '#FFFFFF', borderWidth: 1.5 },
    data: rows.map((t, ti) => ({ value: [meds[ti], ti], _med: true, _tier: t.name })),
    label: {
      // A strip plot puts unlabelled dots at the same height as this label, so
      // it is set on a plate: without one a neighbouring dot lands inside the
      // numeral and "median $1.23" reads as "median $1|23".
      show: true, position: 'top', distance: 9, color: INK, fontSize: 11, fontWeight: 500,
      fontFamily: 'IBM Plex Mono, monospace',
      backgroundColor: 'rgba(255,255,255,.92)', padding: [2, 4], borderRadius: 3,
      formatter: (p) => 'median ' + usd(p.value[0]),
    },
    // The gap between the top two medians is the whole argument of the page,
    // so it is drawn on the chart rather than left to the note beneath it.
    // It is drawn horizontally, inside the frontier band: the y axis is a list
    // of tiers, so a diagonal from one median to the other had a slope that
    // encoded nothing and crossed the band between them on the way. Drawn flat,
    // the rule's length is the ratio, measured on the one axis that carries a
    // quantity.
    ...(ratio ? {
      markLine: {
        silent: true, symbol: ['none', 'none'],
        lineStyle: { color: MARK_INK, type: 'dashed', width: 1, opacity: 0.7 },
        label: {
          show: true, position: 'middle', rotate: 0, color: MARK_INK,
          fontSize: 11, fontWeight: 500, fontFamily: 'IBM Plex Mono, monospace',
          backgroundColor: 'rgba(255,255,255,.92)', padding: [3, 5], borderRadius: 3,
          formatter: ratio + 'x gap',
        },
        data: [[{ coord: [meds[1], 0.38] }, { coord: [meds[0], 0.38] }]],
      },
    } : {}),
  };

  const option = {
    animationDuration: 320,
    grid: { left: 8, right: 34, top: 22, bottom: 34, containLabel: true },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p) => {
        const d = p.data;
        if (d._med) return '<strong>' + esc(d._tier) + '</strong><br>Median output price: ' + esc(usd(d.value[0]));
        const r = d._raw;
        return '<strong>' + esc(r.model) + '</strong><br>' + esc(r.vendor || '') +
          ' · ' + esc(d._tier) + '<br>Output: ' + esc(usd(r.output_per_mtok_usd)) + ' per 1M tokens' +
          (isNum(r.input_per_mtok_usd) ? '<br>Input: ' + esc(usd(r.input_per_mtok_usd)) + ' per 1M tokens' : '');
      },
    },
    xAxis: {
      type: 'log', min: 0.1, max: 200,
      ...axisNameStyle('USD per 1M output tokens, log scale'),
      axisLabel: { color: INK3, fontSize: 11, formatter: (v) => usd(v), hideOverlap: true },
      splitLine: { lineStyle: { color: RULE, type: 'solid' } },
      axisLine: { show: false }, axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'category', data: names, inverse: true,
        axisLabel: { color: INK2, fontSize: 12 },
        axisLine: { lineStyle: { color: RULE_S } }, axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: RULE, type: 'solid' } },
      },
      {
        type: 'value', min: -0.5, max: names.length - 0.5, inverse: true,
        axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    series: [...dots, medians],
  };

  return {
    chart: {
      id: 'overview-price-gap',
      title: 'Output price per million tokens, by tier',
      type: 'scatter', xLabel: 'Model', yLabel: 'Output price',
      unit: 'USD / 1M output tokens',
      option, logAxis: true, fixedScale: true, noLegend: true,
      tableLayout: 'long', seriesHeader: 'Tier',
      ariaLabel: 'Output price per million tokens by tier, logarithmic scale. Median ' +
        rows.map((t, i) => t.name.toLowerCase() + ' ' + usd(meds[i])).join(', ') + '.',
      series: rows.map((t) => ({
        name: t.name,
        data: t.rows.slice().reverse().map((p) => ({ x: p.model, y: p.output_per_mtok_usd })),
      })),
      notes: 'Every one of the ' + all.length + ' list prices in the financial section, one dot each, on a ' +
        'logarithmic axis; the diamond is the tier median. ' +
        (ratio ? 'The frontier median is ' + ratio + ' times the distilled median, and the dashed rule ' +
          'inside the frontier band spans the two medians on the price axis. ' : '') +
        'Standard-tier list prices only, excluding batch and cache discounts.',
      sources: [...new Set(pricing.map((p) => p.source).filter(Boolean))].slice(0, 3),
    }, from: 'financial',
  };
}

/* Benchmarks group into families so that difficulty, not size, can be read off
   the chart: AIME is a competition-maths pass@1 and behaves nothing like GLUE. */
function benchFamily(name) {
  const t = String(name || '');
  if (/AIME/i.test(t)) return 'AIME (competition maths)';
  if (/MATH-500/i.test(t)) return 'MATH-500';
  if (/GPQA/i.test(t)) return 'GPQA Diamond';
  if (/GLUE|SQuAD/i.test(t)) return 'GLUE and SQuAD';
  return 'Other benchmarks';
}

/**
 * Retention against student size. Four faults fixed against the first version:
 * a logarithmic x-axis (students run from 14.5M to 70B parameters), one series
 * per benchmark family (difficulty drives retention far harder than size does),
 * labels on four anchor points instead of all 24, and a dashed line at 100 so
 * the two MobileBERT results above their teacher read as the finding they are.
 */
function retentionChart(data) {
  const b = data.academic && data.academic.extras && data.academic.extras.benchmarks;
  if (!Array.isArray(b) || !b.length) {
    return findChart(data, ['r1-distill-aime-vs-size', 'qwen3-distill-vs-rl'],
      ['retention', 'aime', 'benchmark', 'score']);
  }
  const pts = b.filter((x) => isNum(x.retention_pct) && isNum(x.params_student_b) && x.params_student_b > 0);
  if (pts.length < 3) {
    return findChart(data, ['r1-distill-aime-vs-size', 'qwen3-distill-vs-rl'],
      ['retention', 'aime', 'benchmark', 'score']);
  }

  // Anchors: the weakest result, the strongest reasoning result, the smallest
  // student on the chart, and the one that beats its own teacher.
  const anchors = new Set();
  const pick = (fn) => { const p = pts.reduce(fn); if (p) anchors.add(p); return p; };
  pick((a, c) => (c.retention_pct < a.retention_pct ? c : a));
  pick((a, c) => (c.params_student_b < a.params_student_b ? c : a));
  pick((a, c) => (c.retention_pct > a.retention_pct ? c : a));
  const bestAime = pts.filter((p) => /AIME/i.test(p.benchmark))
    .reduce((a, c) => (!a || c.retention_pct > a.retention_pct ? c : a), null);
  if (bestAime) anchors.add(bestAime);

  const fams = [];
  const byFam = new Map();
  for (const p of pts) {
    const f = benchFamily(p.benchmark);
    if (!byFam.has(f)) { byFam.set(f, []); fams.push(f); }
    byFam.get(f).push(p);
  }
  const above = pts.filter((p) => p.retention_pct >= 100);
  const aime = pts.filter((p) => /AIME/i.test(p.benchmark)).map((p) => p.retention_pct);
  const rest = pts.filter((p) => !/AIME/i.test(p.benchmark)).map((p) => p.retention_pct);
  const span = (v) => trimNum(Math.min(...v), 0) + '–' + trimNum(Math.max(...v), 0) + '%';

  return {
    chart: {
      id: 'overview-retention',
      title: 'Benchmark retention against student size',
      type: 'scatter', xLabel: 'Student parameters (B), log scale',
      xHeader: 'Student parameters (B)',
      // A bare "%" in the panel's unit slot reads as a glyph dropped beside the
      // legend rather than as the y axis's unit; the unit line says what the
      // percentage is of. yZoom fits the axis to the observations instead of
      // running to 120 on a measure whose data stops at parity.
      yLabel: 'Teacher score retained', unit: '% of the teacher’s score',
      opts: { logX: true, yZoom: true },
      refLine: { y: 100, text: 'parity with the teacher' },
      tableLayout: 'long', seriesHeader: 'Benchmark',
      ariaLabel: 'Teacher score retained against student parameter count, logarithmic size axis. ' +
        'AIME retention runs ' + span(aime) + ' while the easier benchmarks run ' + span(rest) + '.',
      series: fams.map((f) => ({
        name: f,
        data: byFam.get(f).map((p) => ({
          x: p.params_student_b, y: p.retention_pct,
          title: p.student + ' · ' + p.benchmark,
          ...(anchors.has(p) ? { label: p.student } : {}),
        })),
      })),
      notes: 'Retention is the student score divided by its own teacher\'s score on the same benchmark, ' +
        'as reported by the model\'s authors. Difficulty separates the results far more than size does: ' +
        'AIME retention runs ' + span(aime) + ' against ' + span(rest) + ' on the rest. ' +
        (above.length ? above.length + ' results sit at or above parity, all of them MobileBERT against ' +
          'IB-BERT-LARGE on SQuAD. ' : '') +
        'Four points are labelled; hover, or open the data below, for the other ' + (pts.length - 4) + '.',
      sources: [...new Set(pts.map((p) => p.source).filter(Boolean))].slice(0, 3),
    }, from: 'academic',
  };
}

function liveSignals(live) {
  if (!live) {
    return '<div class="panel-stack">' + emptyState('Live signals unavailable',
      'The daily collector writes data/live.json with arXiv counts, Hugging Face downloads, ' +
      'repository stars and recent coverage. That file could not be read, so nothing is shown ' +
      'rather than showing a stale figure.') + '</div>';
  }
  const specs = [];
  const ax = live.arxiv || {};
  if ((ax.perYear || []).length) {
    const upd = new Date(live.updated || Date.now());
    const cur = upd.getUTCFullYear();
    const months = upd.getUTCMonth() + 1;
    const per = ax.perYear.slice();
    const last = per[per.length - 1];
    // The running year is not the same kind of observation as a finished one.
    // It is drawn as a dashed, faint continuation rather than as a crash from
    // 1,122 to 731 that has not happened, and its endpoint says so.
    const partial = last && last.year === cur;
    const done = partial ? per.slice(0, -1) : per;
    const pace = partial && months ? Math.round((last.count / months) * 12) : null;
    const arxivSeries = [{
      name: 'Papers', color: SERIES_INK, endLabel: partial ? false : undefined,
      data: done.map((p) => ({ x: p.year, y: p.count })),
    }];
    if (partial) {
      arxivSeries.push({
        name: cur + ' to date', dashed: true, color: INK3,
        endLabelText: cur + ' to date · ' + fmt(last.count),
        data: [done[done.length - 1], last].filter(Boolean).map((p) => ({ x: p.year, y: p.count })),
      });
    }
    specs.push({
      id: 'live-arxiv', tabLabel: 'arXiv papers',
      title: 'arXiv papers matching "knowledge distillation", per year',
      type: 'area', xLabel: 'Year', yLabel: 'Papers', unit: 'papers',
      series: arxivSeries,
      ariaLabel: 'arXiv papers matching "knowledge distillation" per year, 2015 to ' + cur +
        '. The last point is a part year and is drawn dashed.',
      notes: 'Full-text search of the arXiv API. The dashed segment is ' + cur + ' to date — ' +
        months + ' of 12 months, to ' + longDate(live.updated) + ' — and is not comparable with a ' +
        'complete year' + (pace ? '; at that rate the full year lands near ' + fmt(pace) + ' papers' : '') +
        '. ' + fmt(ax.totalKD) + ' papers in total, ' + fmt(ax.last30d) + ' in the last 30 days.',
      sources: ['https://arxiv.org/'],
    });
  }
  if ((live.huggingface && live.huggingface.tracked || []).length) {
    specs.push({
      id: 'live-hf', tabLabel: 'Model downloads',
      title: 'Downloads of tracked distilled models, last 30 days',
      type: 'bar', xLabel: 'Model', yLabel: 'Downloads', unit: 'downloads',
      series: [{
        name: 'Downloads', data: live.huggingface.tracked.slice()
          .sort((a, b) => b.downloads - a.downloads)
          .map((m) => ({ x: m.id.split('/').pop(), y: m.downloads })),
      }],
      notes: 'Hugging Face Hub download counts for a fixed watchlist of ten distilled or distillation-trained checkpoints. ' +
        fmt(live.huggingface.distillModels) + ' models on the Hub match "distill" in total.',
      sources: ['https://huggingface.co/models'],
    });
  }
  if ((live.github && live.github.repos || []).length) {
    const all = live.github.repos.slice().sort((a, b) => b.stars - a.stars);
    // Ten rows, the same as the Hugging Face watchlist, so the two bar charts
    // in this tab group are the same height and a tab switch does not reflow.
    const top = all.slice(0, 10);
    specs.push({
      id: 'live-gh', tabLabel: 'Repository stars',
      title: 'Stars on distillation tooling repositories',
      type: 'bar', xLabel: 'Repository', yLabel: 'Stars', unit: 'stars',
      series: [{ name: 'Stars', data: top.map((r) => ({ x: r.repo.split('/').pop(), y: r.stars })) }],
      notes: 'GitHub star counts for the training, serving and evaluation repositories a distillation run ' +
        'typically uses. The ten most-starred of ' + all.length + ' tracked; the full list is in the ' +
        'developer section.',
      sources: ['https://github.com/'],
    });
  }

  // One height for the whole tab group. Each chart would otherwise size itself,
  // so switching tabs moved everything below the panel by up to 150px.
  const liveHeight = specs.length
    ? Math.max(300, ...specs.map((s) => chartSizing(s).px || 300))
    : 300;

  const news = (live.news && live.news.items || []).slice(0, 8);
  const papers = (ax.recent || []).slice(0, 6);
  const tracked = (live.huggingface && live.huggingface.tracked) || [];
  const repos = (live.github && live.github.repos) || [];

  const signal = (label, value, unit) =>
    '<div class="signal"><p class="signal__label">' + esc(label) + '</p>' +
    '<p class="signal__figure">' + esc(fmt(value)) + (unit ? '<span class="kpi__unit">' + esc(unit) + '</span>' : '') + '</p></div>';

  const signals = '<div class="signals">' +
    signal('arXiv papers on distillation, all years', ax.totalKD, 'papers') +
    signal('New in the last 30 days', ax.last30d, 'papers') +
    signal('Hub models matching "distill"', live.huggingface && live.huggingface.distillModels, 'models') +
    signal('Downloads of ten tracked students, 30 days',
      tracked.reduce((n, m) => n + (m.downloads || 0), 0), 'downloads') +
    '</div>';

  const newsHtml = news.length
    ? '<ol class="newslist">' + news.map((n) =>
      '<li><time datetime="' + attr(String(n.date || '').slice(0, 10)) + '">' + esc(shortDate(n.date)) + '</time>' +
      '<span><a href="' + attr(n.url) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a>' +
      // A Hacker News score is a measure of that thread, not of the piece, and
      // printing "2 points" next to a New York Times report says nothing useful
      // about either. The publication is the attribution that matters.
      '<small class="dim"> ' + esc(n.source || host(n.url)) + '</small></span></li>').join('') + '</ol>'
    : '<p class="note">No recent items.</p>';

  const papersHtml = papers.length
    ? '<ol class="newslist">' + papers.map((p) =>
      '<li><time datetime="' + attr(String(p.published || '').slice(0, 10)) + '">' + esc(shortDate(p.published)) + '</time>' +
      '<span><a href="' + attr(p.url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a>' +
      '<small class="dim"> ' + esc((p.authors || []).slice(0, 2).join(', ')) +
      ((p.authors || []).length > 2 ? ' and others' : '') + '</small></span></li>').join('') + '</ol>'
    : '<p class="note">No recent papers.</p>';

  return blockHead('Live signals', 'refreshed ' + longDate(live.updated),
    'Collected automatically from public APIs each day at 06:17 UTC. These are activity measures, not quality measures.') +
    signals +
    '<div class="panel-stack panel-stack--live">' +
    (specs.length ? panelHtml(specs, null, { height: liveHeight }) : '') +
    '<div class="panel">' +
    '<div class="panel__head"><h3 class="panel__title">Recent coverage and papers</h3>' +
    '<span class="panel__unit">' + esc(news.length + papers.length) + ' items</span></div>' +
    '<div class="panel__body grid--2">' +
    '<div><p class="subhead">In the press, surfaced on Hacker News</p>' + newsHtml + '</div>' +
    '<div><p class="subhead">New on arXiv</p>' + papersHtml + '</div>' +
    '</div>' +
    '<p class="panel__sources">Sources: ' +
    '<a href="https://arxiv.org/" target="_blank" rel="noopener">arxiv.org</a> · ' +
    '<a href="https://huggingface.co/models" target="_blank" rel="noopener">huggingface.co</a> · ' +
    '<a href="https://github.com/" target="_blank" rel="noopener">github.com</a> · ' +
    '<a href="https://news.ycombinator.com/" target="_blank" rel="noopener">news.ycombinator.com</a>' +
    (repos.length ? ' · ' + repos.length + ' repositories tracked' : '') + '</p>' +
    '</div></div>';
}

export function renderOverview(el, ctx) {
  // ROUTES has no entry for #/methodology, so the shell falls back to the overview.
  // Honour the hash the hero links to rather than silently showing the wrong page.
  if (typeof location !== 'undefined' &&
      /^#\/?methodology\b/.test(location.hash || '')) {
    const hero = document.getElementById('hero');
    if (hero) hero.hidden = true;
    renderMethodology(el, ctx);
    return;
  }
  disposeCharts();
  CHART_SPECS.clear();
  const data = (ctx && ctx.data) || {};
  const live = (ctx && ctx.live) || null;
  for (const key of Object.keys(data)) noteSourceCount(key, sourceCount(data[key]));

  const parts = [];

  // --- KPI row: six hand-picked figures, one argument each ------------------
  let kpis = overviewKpis(data);
  if (!kpis.length) {
    for (const p of PERSPECTIVES) {
      const s = strongestStat(data[p]);
      if (s) kpis.push({ ...s, from: p });
    }
  }
  kpis = kpis.slice(0, 6);
  const loaded = PERSPECTIVES.filter((p) => data[p]);
  const totalSources = loaded.reduce((n, p) => n + sourceCount(data[p]), 0);
  const totalCharts = loaded.reduce((n, p) => n + ((data[p].charts || []).length), 0);
  parts.push('<section class="section" data-perspective="overview">');
  parts.push('<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>Overview</p>' +
    '<h2 class="section__title">The state of distillation, on one page</h2>' +
    '<p class="section__standfirst">Distillation trains a small student model on the behaviour of a large ' +
    'teacher. It is how nearly every cheap model on the market is built, and it is now argued over in ' +
    'filings, export-control memoranda and terms of service.</p>' +
    '<p class="section__standfirst section__standfirst--rest">Below: six figures that make the case, the ' +
    'two charts that carry it, and the signals that move daily. Every figure is repeated in its own ' +
    'section with full method notes and a numbered source.</p>' +
    '</div>' +
    // The refresh date is stated once, in the left rail. This slot carries the
    // two counts a reader can actually use to judge the page.
    // Scope the count: the left rail states the site-wide total, so an unlabelled
    // number here reads as a contradiction rather than a narrower tally.
    '<p class="section__meta">' + esc(fmt(totalSources)) + ' sources in the ' +
    esc(loaded.length === 6 ? 'six' : String(loaded.length)) + ' perspectives<br>' +
    esc(plural(totalCharts, 'chart')) + '</p>' +
    '</header>');

  if (kpis.length) {
    parts.push('<div class="kpi-row kpi-row--lede">' +
      kpis.map((s) => kpiHtml(s, null)).join('') + '</div>');
  } else {
    parts.push(emptyState('No published figures yet',
      'Perspective files are still being compiled. Figures appear here once each has a primary source.'));
  }

  // --- six angles ----------------------------------------------------------
  parts.push(blockHead('Six angles on the same technique', PERSPECTIVES.length + ' perspectives',
    'The same events look different depending on whether you are training a model, buying one, or regulating one.'));
  parts.push('<div class="card-grid">' + PERSPECTIVES.map((p, i) => {
    const d = data[p];
    // Short enough to hold one line at every width: the old form wrapped and
    // orphaned "SOURCES" onto a second line on all six cards.
    const n = d ? [
      (d.charts || []).length + ' charts',
      sourceCount(d) + ' sources',
    ].join(' · ') : 'In preparation';
    return '<a class="card" href="#/' + p + '">' +
      '<span class="card__eyebrow">' + String(i + 1).padStart(2, '0') + ' · ' + esc(n) + '</span>' +
      '<span class="card__title">' + esc(p.charAt(0).toUpperCase() + p.slice(1)) + '</span>' +
      '<span class="card__desc">' + esc(PERSPECTIVE_BLURB[p] || '') + '</span>' +
      (d ? '<span class="card__more">Read the section</span>'
        : '<span><span class="badge badge--neutral">In preparation</span></span>') +
      '</a>';
  }).join('') + '</div>');

  // --- headline charts -----------------------------------------------------
  const headline = [priceGapChart(data), retentionChart(data)].filter(Boolean);
  if (headline.length) {
    parts.push(blockHead('The two numbers that matter', headline.length + ' charts',
      'What a distilled model costs, and how much of its teacher it keeps.'));
    parts.push('<div class="panel-stack">' + headline.map(({ chart, from }) =>
      panelHtml([{
        ...chart,
        notes: (chart.notes ? chart.notes + ' ' : '') + 'Full context in the ' + from + ' section.',
      }], null, {})).join('') + '</div>');
  }

  // --- live signals --------------------------------------------------------
  parts.push(liveSignals(live));

  // --- latest events -------------------------------------------------------
  const allEvents = [];
  for (const key of Object.keys(data)) {
    for (const e of (data[key] && data[key].timeline) || []) {
      if (e && e.date) allEvents.push({ ...e, _from: key });
    }
  }
  const seen = new Set();
  const ordered = allEvents
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .filter((e) => { const k = e.title; if (seen.has(k)) return false; seen.add(k); return true; });

  // A dated deprecation four months out is not a recent event. Future-dated
  // entries move to their own group with a countdown, so "most recent" means
  // most recent and nothing on the list is presented as having happened.
  const today = String((live && live.updated) || new Date().toISOString()).slice(0, 10);
  const dayMs = 86400000;
  const daysFrom = (iso) => Math.round(
    (Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / dayMs);
  const scheduled = ordered.filter((e) => String(e.date).slice(0, 10) > today).reverse();
  const latest = ordered.filter((e) => String(e.date).slice(0, 10) <= today).slice(0, 6);

  const eventItem = (e, prevYear, ahead) => {
    const cat = e.category || 'other';
    const year = String(e.date).slice(0, 4);
    const days = ahead ? daysFrom(e.date) : null;
    return '<li class="timeline__item cat--' + esc(cat) + (ahead ? ' timeline__item--ahead' : '') + '">' +
      // A print chronology prints the year once and lets the eye carry it down.
      '<span class="timeline__year">' + (year === prevYear ? '' : esc(year)) + '</span>' +
      '<span class="timeline__dot" aria-hidden="true"></span>' +
      '<div class="timeline__body">' +
      '<div class="timeline__main">' +
      '<time class="timeline__date" datetime="' + attr(shortDate(e.date)) + '">' + esc(longDate(e.date)) + '</time>' +
      '<span class="timeline__cat">' + esc(cat) + '</span>' +
      '<h3 class="timeline__title">' + esc(e.title) + '</h3>' +
      (e.detail ? '<p class="timeline__detail">' + esc(firstSentences(e.detail, 200).head) + '</p>' : '') +
      '</div>' +
      // The dead column on the right becomes the provenance rail: who reported
      // it, and which section of this compendium carries the full account.
      '<div class="timeline__side">' +
      (days != null ? '<span class="badge badge--warn">in ' + esc(fmt(days)) + ' days</span>' : '') +
      (e.source ? '<a class="timeline__source" href="' + attr(e.source) + '" target="_blank" rel="noopener">' +
        esc(host(e.source)) + '</a>' : '') +
      (e._from ? '<a class="timeline__from" href="#/' + esc(e._from) + '">' +
        esc(e._from.charAt(0).toUpperCase() + e._from.slice(1)) + ' section</a>' : '') +
      '</div></div></li>';
  };

  const list = (items, ahead) => {
    let prev = '';
    return '<ol class="timeline timeline--wide">' + items.map((e) => {
      const html = eventItem(e, prev, ahead);
      prev = String(e.date).slice(0, 4);
      return html;
    }).join('') + '</ol>';
  };

  if (latest.length) {
    parts.push(blockHead('Latest events', latest.length + ' most recent',
      'Drawn from every perspective timeline, and dated no later than ' + longDate(today) +
      '. The full record runs from 2006.'));
    parts.push(list(latest, false));
  }
  if (scheduled.length) {
    parts.push(blockHead('Scheduled', scheduled.length + (scheduled.length === 1 ? ' date' : ' dates'),
      'Announced but not yet in effect, counted from ' + longDate(today) + '.'));
    parts.push(list(scheduled, true));
  }
  if (latest.length || scheduled.length) {
    parts.push('<p class="cluster"><a class="btn btn--ghost" href="#/timeline">' +
      'See the full timeline, 2006 to today</a></p>');
  }

  parts.push('</section>');
  el.innerHTML = parts.join('');
  mountCharts(el);
  wireDelegates();
  markScrollers(el);
  wireSectionSpy(el);
  syncRailSourceCount(totalSources, 'sources in the six perspectives');
}

/* ============================================================================
   13. renderCompare — interactive model comparison builder
   ========================================================================== */

const LS_KEY = 'gd.compare.selection';

function lsGet() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
}
function lsSet(v) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) { /* noop */ }
}

/**
 * Every measured field, in one fixed order so the table does not reshuffle
 * when the selection changes. The third entry is the direction: `neutral`
 * marks a descriptive attribute — a parameter count is a fact about a model,
 * not a score, and on a site about small models beating large ones, crowning
 * the biggest number would be editorially backwards.
 */
const FIELD_LABELS = {
  params_b: ['Parameters', 'B', 'neutral'],
  active_params_b: ['Active parameters', 'B', 'neutral'],
  contextK: ['Context window', 'K tokens', 'higher'],
  maxOutputK: ['Maximum output', 'K tokens', 'neutral'],
  input_per_mtok_usd: ['Input price', 'USD / 1M tokens', 'lower'],
  output_per_mtok_usd: ['Output price', 'USD / 1M tokens', 'lower'],
  blended_per_mtok_usd: ['Blended price', 'USD / 1M tokens', 'lower'],
  cost_per_1m_requests_usd: ['Cost per 1M requests', 'USD', 'lower'],
  mmlu: ['MMLU', '%', 'higher'],
  gpqa: ['GPQA Diamond', '%', 'higher'],
  humaneval_or_swe: ['Coding benchmark', '%', 'higher'],
  aime: ['AIME', '%', 'higher'],
  latency_ttft_ms: ['Time to first token', 'ms', 'lower'],
};

// The data file names which benchmark each score comes from. A SWE-bench
// Verified score and a HumanEval score are not the same measurement, so the
// variant travels with the number and a row that mixes them is never scored.
const FIELD_VARIANT = { humaneval_or_swe: 'coding_benchmark', mmlu: 'mmlu_variant' };
const FIELD_SOURCE = {
  mmlu: 'benchmarkSource', gpqa: 'benchmarkSource', humaneval_or_swe: 'benchmarkSource',
  aime: 'benchmarkSource', latency_ttft_ms: 'latencySource', contextK: 'contextSource',
};
const FIELD_CAVEAT = {
  latency_ttft_ms: 'Published time to first token. A figure measured with reasoning on is not comparable with one measured without.',
};
const RETENTION_FIELDS = ['mmlu', 'gpqa', 'humaneval_or_swe', 'aime'];
const ROLE_LABELS = {
  teacher: 'Teacher', distilled: 'Distilled student',
  'small-sibling': 'Small sibling', open: 'Open weights',
};

/** "DeepSeek / Qwen base" and "DeepSeek" are one vendor to a reader. */
function vendorKey(v) {
  return String(v || '').split(/\s+[/(]/)[0].replace(/\s*\(.*$/, '').trim() || 'Other';
}

/** "Qwen3-32B / Qwen3-235B-A22B (off-policy …)" -> "Qwen3-32B". */
function teacherKey(t) {
  const s = String(t || '').trim();
  if (!s || /^(n\/a|none|undisclosed)$/i.test(s)) return '';
  return s.split(' / ')[0].replace(/\s*\(.*$/, '').trim();
}

/**
 * A teacher is named as "DeepSeek-R1" while the row for it is called
 * "DeepSeek-R1 (0528)". Resolve the name to the model on file so the
 * teacher-and-students presets do not silently lose their best example.
 */
function resolveTeacher(models, key) {
  if (!key) return null;
  const exact = models.find((m) => m.name === key);
  if (exact) return exact;
  const k = key.toLowerCase();
  return models.find((m) => {
    const nm = m.name.toLowerCase();
    return nm === k || nm.replace(/\s*\(.*$/, '') === k || nm.startsWith(k + ' (');
  }) || null;
}

function numsOf(m, coverage) {
  return Object.keys(FIELD_LABELS).filter((k) => isNum(m[k])).map((k) => ({
    key: k,
    label: FIELD_LABELS[k][0],
    unit: FIELD_LABELS[k][1],
    better: FIELD_LABELS[k][2],
    value: m[k],
    variant: FIELD_VARIANT[k] ? (m[FIELD_VARIANT[k]] || '') : '',
    source: FIELD_SOURCE[k] ? (m[FIELD_SOURCE[k]] || '') : '',
    coverage: coverage ? coverage[k] : null,
  }));
}

/** Normalise every available source of model rows into one shape. */
function collectModels(data) {
  const out = [];
  const cust = data.customer && data.customer.extras && data.customer.extras.models;
  if (Array.isArray(cust) && cust.length) {
    const coverage = {};
    Object.keys(FIELD_LABELS).forEach((k) => { coverage[k] = cust.filter((m) => isNum(m[k])).length; });
    cust.forEach((m) => out.push({
      name: m.model,
      vendor: m.vendor || '',
      vendorKey: vendorKey(m.vendor || m.model),
      source: m.source,
      role: m.role || '',
      note: m.note || '',
      teacher: m.teacher || '',
      teacherKey: teacherKey(m.teacher),
      badges: [m.isDistilled ? 'distilled' : 'not distilled'],
      text: [
        ['Vendor', m.vendor],
        ['Role', ROLE_LABELS[m.role] || m.role],
        ['Distilled', m.isDistilled == null ? 'undisclosed' : (m.isDistilled ? 'yes' : 'no')],
        ['Teacher', m.teacher || 'undisclosed'],
        ['Weights', m.weights], ['Hosting', m.hosting],
        ['License', m.license], ['Released', longDate(m.releaseDate)],
      ].filter((p) => p[1]),
      nums: numsOf(m, coverage),
    }));
    return { models: out, origin: 'the 74-model price and benchmark table kept for the Customer perspective', originRoute: 'customer', total: cust.length };
  }
  const price = data.financial && data.financial.extras && data.financial.extras.pricing;
  if (Array.isArray(price) && price.length) {
    price.forEach((m) => out.push({
      name: m.model, vendor: m.vendor || '', vendorKey: vendorKey(m.vendor || m.model), source: m.source,
      role: m.tier || '', note: '', teacher: '', teacherKey: '',
      badges: [m.tier].filter(Boolean),
      text: [['Vendor', m.vendor], ['Tier', m.tier], ['Released', longDate(m.release)]].filter((p) => p[1]),
      nums: numsOf(m, null),
    }));
    return { models: out, origin: 'the price list kept for the Financial perspective', originRoute: 'financial', total: price.length };
  }
  // Fallback: the richest model-shaped table anywhere in the loaded data.
  let best = null;
  for (const key of Object.keys(data)) {
    for (const t of (data[key] && data[key].tables) || []) {
      const cols = t.columns || [];
      const nameCol = cols.find((c) => (c.type || 'text') === 'text' && /model|student|name|checkpoint/i.test(c.key + ' ' + c.label));
      const numCols = cols.filter((c) => c.type === 'number');
      if (!nameCol || numCols.length < 2 || !(t.rows || []).length) continue;
      const score = numCols.length * Math.min(t.rows.length, 12);
      if (!best || score > best.score) best = { score, table: t, nameCol, numCols, from: key };
    }
  }
  if (best) {
    best.table.rows.forEach((r) => out.push({
      name: String(r[best.nameCol.key]), vendor: '', vendorKey: 'Other', source: r._source,
      role: '', note: '', teacher: '', teacherKey: '',
      badges: [],
      text: (best.table.columns || []).filter((c) => (c.type || 'text') === 'text' && c.key !== best.nameCol.key)
        .map((c) => [c.label, r[c.key]]).filter((p) => p[1]),
      nums: best.numCols.filter((c) => isNum(r[c.key])).map((c) => ({
        key: c.key, label: c.label, unit: c.unit || '', better: /price|cost|latency|vram|hours/i.test(c.key + c.label) ? 'lower' : 'higher',
        value: r[c.key], variant: '', source: '', coverage: null,
      })),
    }));
    return { models: out, origin: (best.table.title || best.table.id) + ', from the ' + best.from + ' perspective', originRoute: best.from, total: best.table.rows.length };
  }
  return { models: [], origin: null, originRoute: null, total: 0 };
}

let COMPARE_STATE = { models: [], selected: [], origin: null, q: '', role: '', showAll: false };

/* ------------------------------------------------------------ selection URL */

/**
 * The selection is the product, so it lives in the address bar: the site is
 * hash-routed, so it rides as the route's own path segment rather than as a
 * query string, which the router would read as an unknown route.
 */
function selectionFromHash() {
  const m = /^#\/compare\/(.+)$/.exec(location.hash || '');
  if (!m) return [];
  return m[1].split(',').map((s) => {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }).filter(Boolean).slice(0, 4);
}

function writeSelectionHash(sel) {
  const target = sel.length >= 2
    ? '#/compare/' + sel.map(encodeURIComponent).join(',')
    : '#/compare';
  if (target === location.hash) return;
  try { history.replaceState(history.state, '', location.pathname + location.search + target); }
  catch (e) { /* an unwritable history is not worth a broken page */ }
}

/** The teacher with the most students that publish the most figures. */
function teacherFamilies(models) {
  const out = new Map();
  for (const m of models) {
    const t = resolveTeacher(models, m.teacherKey);
    if (!t || t === m) continue;
    if (!out.has(t.name)) out.set(t.name, []);
    out.get(t.name).push(m);
  }
  return out;
}

function defaultSelection(models) {
  const byName = new Map(models.map((m) => [m.name, m]));
  let best = null;
  for (const [t, students] of teacherFamilies(models)) {
    const rank = (x) => x.nums.length;
    const kids = students.slice().sort((a, b) => rank(b) - rank(a));
    // The largest teaching family first, then the one whose rows publish most:
    // a comparison should open on a teacher with real students, not on three
    // near-identical flagships that happen to head the file.
    const score = students.length * 100 + rank(byName.get(t)) +
      kids.slice(0, 2).reduce((n, k) => n + rank(k), 0);
    if (!best || score > best.score) best = { score, names: [t, ...kids.slice(0, 2).map((k) => k.name)] };
  }
  if (best && best.names.length >= 2) return best.names;
  return models.slice(0, Math.min(3, models.length)).map((m) => m.name);
}

/** Teacher-and-students presets, generated from the data's own teacher field. */
function comparePresets(models) {
  return [...teacherFamilies(models).entries()].map(([t, students]) => ({
    teacher: t,
    names: [t, ...students.slice().sort((a, b) => b.nums.length - a.nums.length).slice(0, 3).map((s) => s.name)],
    n: students.length,
  })).sort((a, b) => b.n - a.n).slice(0, 4);
}

export function renderCompare(el, ctx) {
  disposeCharts();
  CHART_SPECS.clear();
  const data = (ctx && ctx.data) || {};
  for (const key of Object.keys(data)) noteSourceCount(key, sourceCount(data[key]));
  syncRailSourceCount();
  const { models, origin, originRoute } = collectModels(data);

  if (!models.length) {
    el.innerHTML = '<section class="section"><header class="section__head"><div>' +
      '<p class="eyebrow"><span class="eyebrow__dot"></span>Compare</p>' +
      '<h1 class="section__title">Two to four models, side by side</h1>' +
      '<p class="section__standfirst">Pick two to four models and see price, size and benchmark scores side by side.</p>' +
      '</div></header>' +
      emptyState('No model table published yet',
        'The comparison builder reads the customer perspective\'s model list, falling back to the financial ' +
        'perspective\'s price list. Neither has been published yet, so there is nothing honest to compare. ' +
        'The developer section already carries measured figures for the DeepSeek-R1 student family.',
        '<a class="btn btn--ghost" href="#/developer">Developer section</a> ' +
        '<a class="btn--link" href="#/methodology">How this compendium is built</a>') +
      '</section>';
    return;
  }

  const known = (names) => names.filter((n) => models.some((m) => m.name === n));
  const linked = known(selectionFromHash());
  const saved = known(lsGet());
  const selected = linked.length >= 2 ? linked.slice(0, 4)
    : (saved.length >= 2 ? saved.slice(0, 4) : defaultSelection(models));
  COMPARE_STATE = { models, selected, origin, originRoute, q: '', role: '', showAll: false };

  el.innerHTML = '<section class="section" data-perspective="compare">' +
    '<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>Compare</p>' +
    '<h1 class="section__title">Two to four models, side by side</h1>' +
    '<p class="section__standfirst">Pick two to four models. The table lists every published figure; ' +
    'quality measures and price are charted separately because they run in opposite directions, and each ' +
    'chart carries one unit.</p>' +
    '<p class="section__standfirst section__standfirst--rest">Figures come from ' + esc(origin) +
    (originRoute ? ' (<a href="#/' + esc(originRoute) + '">open that section</a>)' : '') +
    '. The address bar carries your selection, so a comparison can be sent to someone else.</p>' +
    '</div>' +
    '<p class="section__meta">' + plural(models.length, 'model') + ' on file<br>2 to 4 at a time</p>' +
    '</header>' +
    '<div id="compare-pick"></div>' +
    '<p class="cmp-status" id="cmp-status" role="status"></p>' +
    '<div id="compare-out"></div>' +
    '</section>';

  drawPicker();
  drawCompare();
  wireDelegates();
  markScrollers(el);
  wireSectionSpy(el);
  syncRailSourceCount(0, 'sources catalogued');
}

/* ------------------------------------------------------------------ picker */

function pickerMatches(m) {
  const { q, role } = COMPARE_STATE;
  if (role && m.role !== role) return false;
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return (m.name + ' ' + m.vendor + ' ' + m.teacher).toLowerCase().includes(t);
}

function chipHtmlFor(m, selected, full) {
  const on = selected.includes(m.name);
  const blocked = !on && full;
  return '<button type="button" class="chip' + (on ? ' is-active' : '') + (blocked ? ' is-disabled' : '') +
    '" data-compare="' + attr(m.name) + '" aria-pressed="' + on + '"' +
    (blocked ? ' aria-disabled="true"' : '') + '>' +
    '<span class="chip__dot" style="background:' + baseHue(m.vendorKey || m.name) + '"></span>' +
    esc(m.name) + '</button>';
}

function drawPicker() {
  const pick = document.getElementById('compare-pick');
  if (!pick) return;
  const { models, selected, q, role, showAll } = COMPARE_STATE;
  const full = selected.length >= 4;
  const shown = models.filter(pickerMatches);

  const groups = [];
  for (const m of shown) {
    const k = m.vendorKey || 'Other';
    let g = groups.find((x) => x.k === k);
    if (!g) { g = { k, items: [] }; groups.push(g); }
    g.items.push(m);
  }

  const roles = [...new Set(models.map((m) => m.role).filter(Boolean))];
  const roleChips = roles.length > 1
    ? '<div class="chips chips--sm" role="group" aria-label="Filter models by role">' +
      roles.map((r) => '<button type="button" class="chip' + (role === r ? ' is-active' : '') +
        '" data-cmp-role="' + attr(r) + '" aria-pressed="' + (role === r) + '">' +
        esc(ROLE_LABELS[r] || r) + '<span class="chip__count">' +
        models.filter((m) => m.role === r).length + '</span></button>').join('') +
      (role ? '<button type="button" class="chip" data-cmp-role="" aria-pressed="false">All roles</button>' : '') +
      '</div>'
    : '';

  const presets = comparePresets(models);
  const presetRow = presets.length
    ? '<div class="cmp-presets"><span class="cmp-presets__label">Teacher and its students</span>' +
      '<div class="chips chips--sm">' + presets.map((p) =>
        '<button type="button" class="chip" data-cmp-preset="' + attr(p.names.join(',')) + '">' +
        esc(p.teacher) + '<span class="chip__count">' + p.n + '</span></button>').join('') +
      '</div></div>'
    : '';

  const list = groups.length
    ? groups.map((g) => '<div class="cmp-group"><p class="cmp-group__head">' + esc(g.k) + '</p>' +
      '<div class="chips">' + g.items.map((m) => chipHtmlFor(m, selected, full)).join('') + '</div></div>').join('')
    : '<p class="note">No model matches that filter.</p>';

  pick.innerHTML = blockHead('Choose models', selected.length + ' of 4 selected', null, null, 'cmp-count') +
    presetRow +
    '<div class="cmp-controls">' +
    '<div class="field"><label class="field__label" for="cmp-q">Find a model</label>' +
    '<input class="field__input" id="cmp-q" type="search" autocomplete="off" spellcheck="false" ' +
    'placeholder="Name, vendor or teacher" value="' + attr(q) + '"></div>' +
    roleChips + '</div>' +
    '<div class="cmp-chips' + (showAll || shown.length <= 18 ? '' : ' is-capped') + '" id="cmp-chips">' + list + '</div>' +
    (shown.length > 18
      ? '<p class="cmp-more"><button type="button" class="btn--link" data-cmp-showall="' + (showAll ? '0' : '1') + '">' +
        (showAll ? 'Show fewer' : 'Show all ' + plural(shown.length, 'model')) + '</button></p>'
      : '');

  const input = document.getElementById('cmp-q');
  if (input) {
    input.addEventListener('input', () => {
      COMPARE_STATE.q = input.value;
      drawPicker();
      const again = document.getElementById('cmp-q');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
  }
}

function announceCompare(msg) {
  const el = document.getElementById('cmp-status');
  if (el) el.textContent = msg;
}

/* ------------------------------------------------------------------- table */

function valueOf(m, key) {
  const f = m.nums.find((x) => x.key === key);
  return f ? f.value : null;
}
function variantOf(m, key) {
  const f = m.nums.find((x) => x.key === key);
  return f ? (f.variant || '') : '';
}

function drawCompare() {
  const out = document.getElementById('compare-out');
  if (!out) return;
  CHART_SPECS.clear();
  const { models, selected } = COMPARE_STATE;

  const chosen = selected.map((n) => models.find((m) => m.name === n)).filter(Boolean);
  if (chosen.length < 2) {
    out.innerHTML = emptyState('Pick at least two models',
      'Select two to four models above to build the comparison.');
    return;
  }

  // The row set is the same whatever is selected, so nothing jumps when the
  // selection changes; a row no selected model publishes is dimmed, not dropped.
  const fields = [];
  const seenF = new Set();
  for (const m of models) for (const f of m.nums) {
    if (!seenF.has(f.key)) { seenF.add(f.key); fields.push(f); }
  }
  fields.sort((a, b) => {
    const keys = Object.keys(FIELD_LABELS);
    const ia = keys.indexOf(a.key), ib = keys.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const textKeys = [];
  const seenT = new Set();
  for (const m of chosen) for (const [k] of m.text) {
    if (!seenT.has(k)) { seenT.add(k); textKeys.push(k); }
  }

  // A row whose selected models report different benchmarks is not one
  // measurement, so it is never scored and never charted.
  const mixed = (key) => {
    if (!FIELD_VARIANT[key]) return false;
    const vs = [...new Set(chosen.filter((m) => isNum(valueOf(m, key))).map((m) => variantOf(m, key)).filter(Boolean))];
    return vs.length > 1;
  };
  const bestOf = (f) => {
    if (f.better === 'neutral' || mixed(f.key)) return null;
    const vals = chosen.map((m) => valueOf(m, f.key)).filter(isNum);
    if (vals.length < 2) return null;
    if (Math.min(...vals) === Math.max(...vals)) return null;   // a tie is not a win
    return f.better === 'lower' ? Math.min(...vals) : Math.max(...vals);
  };

  const dirLabel = (f) => (f.better === 'lower' ? 'lower is better'
    : f.better === 'higher' ? 'higher is better' : 'descriptive');

  const numRow = (f) => {
    const best = bestOf(f);
    const covered = f.coverage != null ? ' · ' + f.coverage + '/' + models.length + ' published' : '';
    const anyValue = chosen.some((m) => isNum(valueOf(m, f.key)));
    // The direction is what the accent marking means, so it is stated at body
    // size beside the label and not only in micro type underneath it.
    const glyph = f.better === 'lower' ? '↓' : (f.better === 'higher' ? '↑' : '');
    return '<tr' + (anyValue ? '' : ' class="is-empty"') + '><th scope="row" class="txt">' +
      (glyph ? '<span class="dirmark" aria-hidden="true">' + glyph + '</span>' : '') + esc(f.label) +
      (f.unit ? ' <small>' + esc(f.unit) + '</small>' : '') +
      '<small class="cell__sub">' + esc(dirLabel(f) + covered) + '</small>' +
      (FIELD_CAVEAT[f.key] && anyValue ? '<small class="cell__sub cell__sub--warn">' + esc(FIELD_CAVEAT[f.key]) + '</small>' : '') +
      (mixed(f.key) ? '<small class="cell__sub cell__sub--warn">Different benchmarks: not scored or charted.</small>' : '') +
      '</th>' +
      chosen.map((m) => {
        const v = valueOf(m, f.key);
        const win = isNum(v) && best != null && v === best;
        const variant = variantOf(m, f.key);
        return '<td class="num' + (win ? ' is-best' : '') + '" data-type="number">' +
          (isNum(v) ? esc(fmt(v)) : '—') +
          (variant ? '<small class="cell__sub">' + esc(variant) + '</small>' : '') + '</td>';
      }).join('') + '</tr>';
  };

  // Retention: the one number a distillation compendium should be able to show.
  const teachers = chosen.filter((t) => chosen.some((s) => s !== t && resolveTeacher(chosen, s.teacherKey) === t));
  const teacher = teachers.length === 1 ? teachers[0] : null;
  const retentionRows = teacher
    ? RETENTION_FIELDS.filter((k) => isNum(valueOf(teacher, k)) && !mixed(k) &&
      chosen.some((m) => m !== teacher && isNum(valueOf(m, k)) &&
        resolveTeacher(chosen, m.teacherKey) === teacher))
      .map((k) => '<tr class="is-derived"><th scope="row" class="txt">' +
        esc(FIELD_LABELS[k][0]) + ' retained <small>% of ' + esc(teacher.name) + '</small>' +
        '<small class="cell__sub">derived, not published</small></th>' +
        chosen.map((m) => {
          const t = valueOf(teacher, k);
          const v = valueOf(m, k);
          if (m === teacher) return '<td class="num dim" data-type="number">teacher</td>';
          if (!isNum(v) || !isNum(t) || !t) return '<td class="num" data-type="number">—</td>';
          return '<td class="num" data-type="number">' + trimNum((v / t) * 100, 1) + '%</td>';
        }).join('') + '</tr>')
    : [];

  const rowsHtml = [
    ...textKeys.map((k) => '<tr><th scope="row" class="txt">' + esc(k) + '</th>' +
      chosen.map((m) => {
        const p = m.text.find((x) => x[0] === k);
        return '<td class="txt' + (p ? '' : ' dim') + '">' + esc(p ? p[1] : '—') + '</td>';
      }).join('') + '</tr>'),
    ...fields.map(numRow),
    ...retentionRows,
    (chosen.some((m) => m.note)
      ? '<tr><th scope="row" class="txt">Note<small class="cell__sub">editorial</small></th>' +
        chosen.map((m) => '<td class="txt' + (m.note ? '' : ' dim') + '">' + esc(m.note || '—') + '</td>').join('') + '</tr>'
      : ''),
    '<tr><th scope="row" class="txt">Source</th>' + chosen.map((m) => '<td class="txt">' +
      (m.source ? '<a href="' + attr(m.source) + '" target="_blank" rel="noopener">' + esc(host(m.source)) + '</a>' : '—') +
      '</td>').join('') + '</tr>',
  ].filter(Boolean).join('');

  const tools = '<div class="panel__tools">' +
    '<button type="button" class="btn btn--ghost btn--sm" data-cmp-action="copy">Copy link</button>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-cmp-action="csv">Download this data (CSV)</button>' +
    '</div>';

  const table = '<figure class="panel">' +
    '<div class="panel__head"><h3 class="panel__title">Side by side</h3>' +
    '<span class="panel__unit">' + plural(chosen.length, 'model') + '</span>' + tools + '</div>' +
    '<p class="table__caption" id="cmp-cap">Every attribute on file for the selected models. ' +
    'Units are given in each row label; where a row is a like-for-like measurement the best value is marked. ' +
    'Rows no selected model publishes are dimmed rather than removed.</p>' +
    '<div class="table-wrap" tabindex="0" role="region" aria-label="Comparison table, scrolls sideways">' +
    '<table class="table table--compare" aria-labelledby="cmp-cap">' +
    '<thead><tr><th scope="col">Attribute</th>' +
    chosen.map((m) => '<th scope="col">' +
      '<span class="legend__dot" style="background:' + baseHue(m.vendorKey || m.name) + '"></span> ' +
      esc(m.name) + (m.badges && m.badges.length
        ? ' <small>' + esc(m.badges.join(' · ')) + '</small>' : '') +
      '</th>').join('') + '</tr></thead>' +
    '<tbody>' + rowsHtml + '</tbody></table></div>' +
    '<figcaption class="panel__note">Blank cells mean the figure is not published for that model; ' +
    'they are never filled with an estimate.</figcaption></figure>';

  /* ------------------------------------------------------------- charts */
  // One unit per chart. A price in dollars and a latency in milliseconds on one
  // axis is not a comparison, it is a coincidence of scale.
  const charted = fields.filter((f) => f.better !== 'neutral' && !mixed(f.key) &&
    chosen.filter((m) => isNum(valueOf(m, f.key))).length >= 2);
  const groups = [];
  for (const f of charted) {
    const k = f.better + '|' + f.unit;
    let g = groups.find((x) => x.k === k);
    if (!g) { g = { k, unit: f.unit, better: f.better, fields: [] }; groups.push(g); }
    g.fields.push(f);
  }
  const dropped = fields.filter((f) => mixed(f.key)).map((f) => f.label);

  const charts = groups.map((g) => ({
    id: 'compare-' + slug(g.k),
    title: (g.fields.length === 1 ? g.fields[0].label : g.fields.map((f) => f.label).join(' and ')) +
      (g.unit ? ', ' + g.unit : ''),
    tabLabel: g.unit || g.fields[0].label,
    type: 'bar',
    unit: g.unit,
    xLabel: '', yLabel: g.unit,
    series: chosen.map((m) => ({
      name: m.name,
      data: g.fields.map((f) => ({ x: f.label, y: valueOf(m, f.key) })),
    })),
    notes: (g.better === 'lower' ? 'Lower is better. ' : 'Higher is better. ') +
      'Values as published, one unit per chart' +
      (dropped.length ? '; ' + dropped.join(' and ') +
        ' left out because the selected models report different benchmarks' : '') + '.',
    sources: [...new Set(chosen.map((m) => m.source).filter(Boolean))].slice(0, 4),
  }));

  out.innerHTML = '<div class="panel-stack">' + table +
    (charts.length ? panelHtml(charts, null, {}) : '') + '</div>';
  mountCharts(out);
  markScrollers(out);
}

/* -------------------------------------------------------------- CSV export */

function compareCsv() {
  const { models, selected } = COMPARE_STATE;
  const chosen = selected.map((n) => models.find((m) => m.name === n)).filter(Boolean);
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Attribute', 'Unit', ...chosen.map((m) => m.name)]];
  const textKeys = [];
  for (const m of chosen) for (const [k] of m.text) if (!textKeys.includes(k)) textKeys.push(k);
  for (const k of textKeys) {
    rows.push([k, '', ...chosen.map((m) => (m.text.find((x) => x[0] === k) || [])[1] || '')]);
  }
  for (const key of Object.keys(FIELD_LABELS)) {
    if (!chosen.some((m) => isNum(valueOf(m, key)))) continue;
    rows.push([FIELD_LABELS[key][0], FIELD_LABELS[key][1],
      ...chosen.map((m) => (isNum(valueOf(m, key)) ? valueOf(m, key) : ''))]);
  }
  rows.push(['Note', '', ...chosen.map((m) => m.note || '')]);
  rows.push(['Source', '', ...chosen.map((m) => m.source || '')]);
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}

function downloadCompareCsv() {
  saveCsv(compareCsv(), 'global-distillation-comparison.csv');
  announceCompare('Comparison downloaded as CSV.');
}

function copyCompareLink() {
  const url = location.href;
  const done = () => announceCompare('Link copied: ' + url);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => announceCompare('Copy the address bar to share this comparison.'));
  } else {
    announceCompare('Copy the address bar to share this comparison.');
  }
}

/* ============================================================================
   14. renderMethodology
   ========================================================================== */

export function renderMethodology(el, ctx) {
  disposeCharts();
  CHART_SPECS.clear();
  const data = (ctx && ctx.data) || {};
  const live = (ctx && ctx.live) || null;

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
  for (const key of Object.keys(data)) noteSourceCount(key, sourceCount(data[key]));
  const totalSources = Object.values(data).reduce((n, d) => n + sourceCount(d), 0);
  const published = files.filter(([k]) => data[k]).length;

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
      status: data[k] ? 'published' : 'in preparation',
      sources: sourceCount(data[k]),
      updated: data[k] ? longDate(data[k].updated) : '—',
    })),
    notes: 'Counts are of catalogued primary sources, not of citations: one source is often cited by several figures.',
    sources: [],
  };

  const classTable = {
    id: 'methodology-classification',
    title: 'How a model is classified as distilled',
    description: 'Three levels of evidence. A model is never moved up a level by inference.',
    columns: [
      { key: 'level', label: 'Level', type: 'text' },
      { key: 'test', label: 'What it takes', type: 'text' },
      { key: 'example', label: 'Example', type: 'text' },
      { key: 'shown', label: 'Shown as', type: 'text' },
    ],
    rows: [
      {
        level: 'Stated',
        test: 'The vendor says so in a technical report, model card or launch post.',
        example: 'Gemini 2.5 Flash; Gemma 2 and 3; Llama 3.2 1B/3B; DeepSeek-R1-Distill students.',
        shown: 'distilled',
      },
      {
        level: 'Documented method',
        test: 'A paper or repository describes the exact procedure and the teacher, even if the vendor avoids the word.',
        example: 'NVIDIA Minitron pruning-plus-distillation of Llama 3.1 8B.',
        shown: 'distilled (method)',
      },
      {
        level: 'Undisclosed',
        test: 'A small tier is widely assumed to be distilled but the vendor has never said and no paper describes it.',
        example: 'GPT-5 mini and nano; Claude Haiku.',
        shown: 'undisclosed',
      },
    ],
    notes: 'The third level is deliberately not counted in any figure on this site. Where a total would be ' +
      'misleading without it, the figure notes say so.',
    sources: [],
  };

  const cadence = {
    id: 'methodology-cadence',
    title: 'Update cadence',
    description: 'What changes daily, what changes when the research is redone.',
    columns: [
      { key: 'stream', label: 'Data stream', type: 'text' },
      { key: 'cadence', label: 'Cadence', type: 'text' },
      { key: 'method', label: 'How it is collected', type: 'text' },
    ],
    rows: [
      { stream: 'arXiv paper counts and new preprints', cadence: 'Daily, 06:17 UTC', method: 'arXiv API full-text query for knowledge distillation, counted per year and for the last 30 days.' },
      { stream: 'Hugging Face downloads', cadence: 'Daily, 06:17 UTC', method: 'Hub API, 30-day download totals for a fixed watchlist plus a count of models matching "distill".' },
      { stream: 'Repository stars', cadence: 'Daily, 06:17 UTC', method: 'GitHub API for the training, serving and evaluation repositories used in distillation work.' },
      { stream: 'News and Hacker News items', cadence: 'Daily, 06:17 UTC', method: 'Search of Hacker News and named outlets; items are listed, never summarised into a claim.' },
      { stream: 'Perspective research files', cadence: 'On revision', method: 'Rewritten end to end when a perspective is revisited; each file carries its own compiled date.' },
      { stream: 'Prices and terms of service', cadence: 'On revision, checked against the vendor page', method: 'List prices for the standard tier on the date given in the row; batch and cache discounts excluded.' },
    ],
    notes: 'A figure is never carried forward silently. If a stream fails, the panel says so rather than showing yesterday\'s number.',
    sources: [],
  };

  const paras = (title, body) =>
    '<div class="prose__block"><h2 class="prose__head">' + esc(title) + '</h2>' +
    body.map((p) => '<p>' + p + '</p>').join('') + '</div>';

  el.innerHTML = '<section class="section" data-perspective="methodology">' +
    // The wrapping div is what makes .section__head stack eyebrow -> title ->
    // standfirst on every other route; without it the eyebrow became a column.
    '<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>Methodology · ' + published + ' of ' + files.length +
    ' files published · ' + totalSources + ' catalogued sources</p>' +
    '<h1 class="section__title">How this compendium is built</h1>' +
    '<p class="section__standfirst">Every figure on this site comes from a primary source that you can open in ' +
    'one click. Figures that could not be verified are written as undisclosed rather than estimated.</p>' +
    '<p class="section__lede">This page explains where the numbers come from, what counts as a distilled model, ' +
    'how often each stream is refreshed, and what this method cannot tell you.</p>' +
    '</div></header>' +

    '<div class="prose">' +
    paras('What this is', [
      'Global Distillation is a compendium of one technique: training a small <em>student</em> model on the ' +
      'behaviour of a large <em>teacher</em>. The same technique is a research method, a product line, a pricing ' +
      'strategy, a contract term and, since 2025, an accusation. Each of those readings gets its own section, ' +
      'built from the same catalogue of sources.',
      'The site is static. Perspective research is written into JSON files that follow a published schema; the ' +
      'browser fetches them and renders every table and chart from the same data a reader can download. There is ' +
      'no server-side model, no summarisation step between the source and the figure, and no number that exists ' +
      'only in a chart.',
    ]) +

    paras('Where the numbers come from', [
      'Sources are ranked in this order: the paper or technical report; the vendor\'s own model card, pricing ' +
      'page or terms of service; a filing, statute or official memorandum; then reporting by a named outlet. ' +
      'A claim that exists only in reporting is attributed to whoever made it, in the text, not presented as fact.',
      'Prices are list prices for the standard tier on the date shown, in US dollars per million tokens, ' +
      'excluding batch, cache and volume discounts, because those vary by contract. Benchmark scores are the ' +
      'figures the model\'s own authors published, which is a real limitation: labs choose their comparisons. ' +
      'Where an independent reproduction exists, both are shown.',
      'Download counts, star counts and paper counts are activity measures collected from public APIs. They ' +
      'measure attention, not quality, and they are labelled that way wherever they appear.',
    ]) +

    paras('What "distilled" means here', [
      'The word is used loosely in the market, so this site splits it into three levels of evidence. Only the ' +
      'first two are counted in any total; the third is recorded and excluded.',
      'Distillation itself also covers several distinct procedures — matching a teacher\'s full output ' +
      'distribution (logit or soft-target distillation), training on the teacher\'s generated text ' +
      '(sequence-level or black-box distillation), matching intermediate representations (feature ' +
      'distillation), and on-policy variants where the teacher grades the student\'s own samples. The method ' +
      'library sets out each one with its loss function, its data requirement, and whether it needs white-box ' +
      'access to the teacher.',
    ]) +

    '</div>' +

    '<div class="panel-stack">' + renderTable(classTable) + '</div>' +

    '<div class="prose">' +
    paras('How the live signals are collected', [
      'Four streams refresh daily at 06:17 UTC: arXiv paper counts, Hugging Face download totals, GitHub star ' +
      'counts, and recent coverage. Each is a plain API read written into a single file with a timestamp. ' +
      'When a stream fails, the panel that depends on it says so; nothing is carried forward silently.' +
      (live && live.updated ? ' The current file was written ' + esc(longDate(live.updated)) + '.' : ''),
      'Year-to-date counts are marked as such. The current year\'s bar in the arXiv chart is not comparable ' +
      'with a completed year, and the chart note says so rather than leaving the reader to notice.',
    ]) +
    '</div>' +

    '<div class="panel-stack">' + renderTable(cadence) + renderTable(fileTable) + '</div>' +

    '<div class="prose">' +
    paras('What this method cannot tell you', [
      'Three of the most interesting questions are unanswerable from public evidence, and this site does not ' +
      'pretend otherwise. First, whether a given closed small model was distilled: the labs that would know ' +
      'have not said. Second, what a training run really cost: published figures are usually the marginal cost ' +
      'of the final run, excluding staff, failed runs and the teacher\'s own training. Third, whether a ' +
      'particular model was trained on a competitor\'s outputs: the evidence offered in public disputes is ' +
      'circumstantial — token overlap, self-identification quirks, account patterns — and is reported here as a ' +
      'claim by a named party, with its rebuttal.',
      'Benchmark retention percentages compare a student against its own teacher on one benchmark. They do not ' +
      'transfer across benchmarks, and they say nothing about robustness, long-context behaviour, or how a ' +
      'model degrades outside the distribution it was distilled on.',
    ]) +
    paras('Corrections', [
      'Every figure carries a numbered footnote to its source, so a reader can check it without contacting ' +
      'anyone. Where a source is later corrected or withdrawn, the figure is removed rather than adjusted by ' +
      'inference, and the note records what was removed. Where two credible sources disagree, both are shown ' +
      'with their attribution.',
    ]) +
    '</div>' +
    '</section>';

  wireDelegates();
  enhanceTables(el);
  markScrollers(el);
  wireSectionSpy(el);
  syncRailSourceCount(0, 'sources catalogued');
}

/* ============================================================================
   15. Delegated interaction: sorting, filtering, segmented controls
   ========================================================================== */

let wired = false;

function wireDelegates() {
  if (wired) return;
  wired = true;

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    // A footnote must never reach the router: it scrolls to the source row and
    // only falls through to its href (the source itself) when that row is gone.
    const fnRef = t.closest('[data-footnote]');
    if (fnRef) {
      if (jumpToSource(fnRef.getAttribute('data-footnote'))) e.preventDefault();
      return;
    }

    const sortBtn = t.closest('[data-sort]');
    if (sortBtn) { sortTable(sortBtn); return; }

    const seg = t.closest('[data-seg]');
    if (seg) { switchPane(seg); return; }

    const scale = t.closest('[data-scale]');
    if (scale) { switchScale(scale); return; }

    const chip = t.closest('[data-filter]');
    if (chip) { toggleFilter(chip); return; }

    const reset = t.closest('[data-filter-reset]');
    if (reset) { resetFilter(reset.getAttribute('data-filter-reset')); return; }

    const tlChip = t.closest('[data-tl-filter]');
    if (tlChip) { toggleTlFilter(tlChip); return; }

    const tlReset = t.closest('[data-tl-reset]');
    if (tlReset) {
      const wrap = document.getElementById(tlReset.getAttribute('data-tl-reset'));
      if (wrap) {
        wrap.querySelectorAll('.chip[data-tl-filter]').forEach((c) => {
          c.classList.remove('is-active');
          c.setAttribute('aria-pressed', 'false');
        });
        applyTimelineFilter(wrap, []);
      }
      return;
    }

    const order = t.closest('[data-tl-order]');
    if (order) { redrawTimeline(order.getAttribute('data-tl-order'), order.dataset.order === 'desc'); return; }

    const density = t.closest('[data-tl-density]');
    if (density) { setTimelineDensity(density); return; }

    const csv = t.closest('[data-csv-chart]');
    if (csv) { downloadChartCsv(csv.getAttribute('data-csv-chart')); return; }

    const cmp = t.closest('[data-compare]');
    if (cmp) { toggleCompare(cmp); return; }

    const preset = t.closest('[data-cmp-preset]');
    if (preset) { applyComparePreset(preset.getAttribute('data-cmp-preset')); return; }

    const cmpRole = t.closest('[data-cmp-role]');
    if (cmpRole) {
      COMPARE_STATE.role = cmpRole.getAttribute('data-cmp-role') || '';
      drawPicker();
      return;
    }

    const showAll = t.closest('[data-cmp-showall]');
    if (showAll) {
      COMPARE_STATE.showAll = showAll.getAttribute('data-cmp-showall') === '1';
      drawPicker();
      return;
    }

    const cmpAct = t.closest('[data-cmp-action]');
    if (cmpAct) {
      const act = cmpAct.getAttribute('data-cmp-action');
      if (act === 'csv') downloadCompareCsv();
      if (act === 'copy') copyCompareLink();
      return;
    }

    if (t.closest('[data-scroll-top]')) {
      e.preventDefault();
      try {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      } catch (err) { window.scrollTo(0, 0); }
      const h1 = document.querySelector('.section__title, .view h1');
      if (h1) {
        h1.setAttribute('tabindex', '-1');
        try { h1.focus({ preventScroll: true }); } catch (err) { /* noop */ }
      }
      return;
    }

    // In-page section index. It scrolls; it never writes to the hash, which
    // the router owns and would tear the page down over.
    const jump = t.closest('[data-jump]');
    if (jump) {
      e.preventDefault();
      const target = document.getElementById(jump.getAttribute('data-jump'));
      if (target) {
        try {
          target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        } catch (err) { target.scrollIntoView(); }
        target.setAttribute('tabindex', '-1');
        try { target.focus({ preventScroll: true }); } catch (err) { /* noop */ }
      }
      return;
    }

    // A row whose cells cannot hold their own prose opens the drawer rather
    // than truncating it. A link or button inside the row still wins.
    const detailRow = t.closest('[data-row-detail]');
    if (detailRow && !t.closest('a') && !t.closest('button')) {
      openRowDetail(detailRow.getAttribute('data-row-detail'), detailRow.getAttribute('data-row-i'));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target && e.target.closest ? e.target.closest('[data-row-detail]') : null;
      if (row && e.target === row) {
        e.preventDefault();
        openRowDetail(row.getAttribute('data-row-detail'), row.getAttribute('data-row-i'));
        return;
      }
    }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btn = e.target && e.target.closest ? e.target.closest('[data-seg]') : null;
    if (!btn) return;
    const group = [...document.querySelectorAll('[data-seg="' + btn.getAttribute('data-seg') + '"]')];
    const i = group.indexOf(btn);
    const next = group[(i + (e.key === 'ArrowRight' ? 1 : group.length - 1)) % group.length];
    if (next) { next.focus(); switchPane(next); e.preventDefault(); }
  });
}

function switchPane(btn) {
  const pid = btn.getAttribute('data-seg');
  const idx = btn.getAttribute('data-seg-i');
  document.querySelectorAll('[data-seg="' + pid + '"]').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const panel = document.querySelector('[data-panel="' + pid + '"]');
  if (!panel) return;
  panel.querySelectorAll('.panel__pane').forEach((p, i) => {
    const on = String(i) === String(idx);
    p.hidden = !on;
    p.classList.toggle('is-active', on);
    if (on) {
      mountCharts(p);
      p.querySelectorAll('[data-chart]').forEach((n) => {
        if (n.__gdChart && n.__gdChart.chart) { try { n.__gdChart.chart.resize(); } catch (err) { /* noop */ } }
      });
    }
  });
}

function switchScale(btn) {
  const paneId = btn.getAttribute('data-scale');
  const mode = btn.getAttribute('data-scale-mode');
  document.querySelectorAll('[data-scale="' + paneId + '"]').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const pane = document.getElementById(paneId);
  if (!pane) return;
  const unitEl = document.querySelector('[data-unit-for="' + paneId + '"]');
  if (unitEl) {
    const base = unitEl.getAttribute('data-unit-base') || '';
    unitEl.textContent = mode === 'log' ? (base ? base + ' · log scale' : 'log scale') : base;
  }
  const node = pane.querySelector('[data-chart]');
  if (!node || !node.__gdChart) return;
  const spec = node.__gdChart.spec;
  const label = String(node.getAttribute('aria-label') || '').replace(/, logarithmic scale$/, '');
  node.setAttribute('aria-label', label + (mode === 'log' ? ', logarithmic scale' : ''));
  reChart(node, spec, { ...(spec.opts || {}), log: mode === 'log' });
}

function sortTable(btn) {
  const th = btn.closest('th');
  const table = btn.closest('table');
  if (!th || !table) return;
  const idx = Number(btn.getAttribute('data-sort'));
  const type = btn.getAttribute('data-type');
  const cur = th.getAttribute('aria-sort');
  // Ascending, descending, then back to the order the table was published in.
  // Chronology is a real ordering, and a sort control that cannot give it back
  // takes it away for good.
  const dir = cur === 'ascending' ? 'descending' : (cur === 'descending' ? 'none' : 'ascending');
  table.querySelectorAll('th[aria-sort]').forEach((h) => h.setAttribute('aria-sort', 'none'));
  th.setAttribute('aria-sort', dir);
  const tbody = table.tBodies[0];
  const rows = [...tbody.rows];
  rows.forEach((r, i) => { if (r.dataset.row == null) r.dataset.row = String(i); });
  if (dir === 'none') {
    rows.sort((a, b) => Number(a.dataset.row) - Number(b.dataset.row));
    rows.forEach((r) => tbody.appendChild(r));
    return;
  }
  rows.sort((a, b) => {
    const av = a.cells[idx] ? a.cells[idx].getAttribute('data-v') : '';
    const bv = b.cells[idx] ? b.cells[idx].getAttribute('data-v') : '';
    // An undisclosed figure is not a small one. Unknowns sink in both
    // directions, so "smallest first" starts at the smallest published value
    // rather than at four em-dashes.
    if (type === 'number') {
      const an = Number(av);
      const bn = Number(bv);
      const aNull = !Number.isFinite(an);
      const bNull = !Number.isFinite(bn);
      if (aNull || bNull) return aNull && bNull ? 0 : (aNull ? 1 : -1);
      return dir === 'ascending' ? an - bn : bn - an;
    }
    const as = String(av);
    const bs = String(bv);
    if (!as || !bs) return as === bs ? 0 : (as ? -1 : 1);
    const cmp = as.localeCompare(bs, 'en');
    return dir === 'ascending' ? cmp : -cmp;
  });
  rows.forEach((r) => tbody.appendChild(r));
}

function activeChipValues(tid) {
  return [...document.querySelectorAll('.chip[data-filter="' + tid + '"][aria-pressed="true"]')]
    .map((c) => c.getAttribute('data-value'));
}

function applyTableFilter(tid) {
  const fig = document.getElementById(tid);
  if (!fig) return;
  const vals = new Set(activeChipValues(tid));
  const rows = fig.querySelectorAll('tbody tr');
  let shown = 0;
  rows.forEach((tr) => {
    const on = vals.size === 0 || vals.has(tr.getAttribute('data-fv'));
    tr.hidden = !on;
    if (on) shown += 1;
  });
  const total = rows.length;
  const unfiltered = vals.size === 0;
  // The All chip is the pressed state of "no filter", so it tracks the others.
  document.querySelectorAll('[data-filter-reset="' + tid + '"]').forEach((b) => {
    b.classList.toggle('is-active', unfiltered);
    b.setAttribute('aria-pressed', String(unfiltered));
  });
  const count = document.querySelector('[data-count-for="' + tid + '"]');
  if (count) {
    count.hidden = unfiltered;
    count.textContent = 'Showing ' + shown + ' of ' + total + ' rows.';
  }
  const unit = fig.querySelector('[data-rows-for="' + tid + '"]');
  if (unit) unit.textContent = unfiltered ? total + ' rows' : shown + ' of ' + total + ' rows';
}

function toggleFilter(chip) {
  const on = chip.getAttribute('aria-pressed') === 'true';
  chip.setAttribute('aria-pressed', String(!on));
  chip.classList.toggle('is-active', !on);
  applyTableFilter(chip.getAttribute('data-filter'));
}

function resetFilter(tid) {
  document.querySelectorAll('.chip[data-filter="' + tid + '"]').forEach((c) => {
    c.setAttribute('aria-pressed', 'false');
    c.classList.remove('is-active');
  });
  applyTableFilter(tid);
}

/** Category values of the pressed timeline chips; the All chip carries none. */
function activeTlValues(wrap) {
  return [...wrap.querySelectorAll('.chip[data-tl-filter][aria-pressed="true"]')]
    .map((c) => c.getAttribute('data-value'));
}

function toggleTlFilter(chip) {
  const on = chip.getAttribute('aria-pressed') === 'true';
  chip.setAttribute('aria-pressed', String(!on));
  chip.classList.toggle('is-active', !on);
  const tid = chip.getAttribute('data-tl-filter');
  const wrap = document.getElementById(tid);
  if (!wrap) return;
  applyTimelineFilter(wrap, activeTlValues(wrap));
  keepInView(wrap.querySelector('.tl-tools'));
}

/**
 * Filtering a long list changes the height of the document under the reader.
 * If the control they just used has been carried off the top of the screen,
 * bring it back rather than leaving them somewhere they never scrolled to.
 */
function keepInView(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const top = el.getBoundingClientRect().top;
  const limit = 72;
  if (top >= limit && top < window.innerHeight) return;
  try {
    window.scrollBy({ top: top - limit, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } catch (e) { window.scrollBy(0, top - limit); }
}

/**
 * A chart's own figures, as a file. The page already shows them in a table
 * under every chart; this is the same rows, for a spreadsheet.
 */
function downloadChartCsv(key) {
  const spec = CHART_SPECS.get(key);
  if (!spec) return;
  const series = seriesOf(spec);
  if (!series.length) return;
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const unit = spec.unit || spec.yLabel || '';
  const rows = [[spec.xLabel || 'Category', 'Series', spec.yLabel || 'Value', 'Unit']];
  for (const s of series) {
    for (const pt of s.data) rows.push([String(pt.x), s.name, isNum(pt.y) ? pt.y : '', unit]);
  }
  const name = 'global-distillation-' + (slug(spec.id || spec.title) || 'chart') + '.csv';
  saveCsv(rows.map((r) => r.map(q).join(',')).join('\r\n'), name);
}

function saveCsv(text, filename) {
  try {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { /* a blocked download is not worth an exception */ }
}

function setTimelineDensity(btn) {
  const tid = btn.getAttribute('data-tl-density');
  const wrap = document.getElementById(tid);
  const compact = btn.getAttribute('data-density') === 'compact';
  document.querySelectorAll('[data-tl-density="' + tid + '"]').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (wrap) wrap.classList.toggle('is-compact', compact);
}

/**
 * Toggling a model rebuilds the comparison, never the picker: the button the
 * reader is standing on has to survive the click, or a keyboard user loses
 * their place in a 74-chip grid on every selection.
 */
function toggleCompare(btn) {
  const name = btn.getAttribute('data-compare');
  const sel = COMPARE_STATE.selected.slice();
  const i = sel.indexOf(name);
  if (i >= 0) {
    sel.splice(i, 1);
    announceCompare(name + ' removed, ' + sel.length + ' of 4 selected.');
  } else if (sel.length >= 4) {
    announceCompare('Four models is the maximum. Deselect one before adding ' + name + '.');
    return;
  } else {
    sel.push(name);
    announceCompare(name + ' added, ' + sel.length + ' of 4 selected.');
  }
  setCompareSelection(sel);
}

function setCompareSelection(sel) {
  COMPARE_STATE.selected = sel;
  lsSet(sel);
  writeSelectionHash(sel);
  syncCompareChips();
  disposeCharts();
  drawCompare();
}

function applyComparePreset(csv) {
  const names = String(csv || '').split(',').filter(Boolean).slice(0, 4);
  if (names.length < 2) return;
  setCompareSelection(names);
  announceCompare('Loaded ' + names.join(', ') + '.');
}

/** Patch the chips in place so focus, scroll position and the DOM all survive. */
function syncCompareChips() {
  const sel = COMPARE_STATE.selected;
  const full = sel.length >= 4;
  document.querySelectorAll('[data-compare]').forEach((b) => {
    const on = sel.includes(b.getAttribute('data-compare'));
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
    const blocked = !on && full;
    b.classList.toggle('is-disabled', blocked);
    if (blocked) b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
  });
  const count = document.querySelector('[data-head-count="cmp-count"]');
  if (count) count.textContent = sel.length + ' of 4 selected';
}
