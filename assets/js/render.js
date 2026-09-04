// Global Distillation — rendering module.
// Owns: perspective sections, the overview front page, the comparison builder,
// the methodology page, tables and every ECharts instance on the site.
// Contract: BUILD-CONTRACT.md. Design tokens and component classes: DESIGN.md.

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
    axisLabel: { color: '#837C71', fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#837C71', fontSize: 11 },
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
const INK = '#1A1814', INK2 = '#4C4740', INK3 = '#837C71', RULE = '#E4DED2', RULE_S = '#CEC6B6';

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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** ISO (or partial ISO) date -> "3 September 2026" (DESIGN.md section 7). */
function longDate(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s);
  if (!m) return s;
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

let uid = 0;
const nid = (p) => (p || 'gd') + '-' + (uid += 1);

/* ============================================================================
   3. Footnote registry — every figure resolves to a numbered source
   ========================================================================== */

function makeFootnotes(d, ns) {
  const list = [];
  const index = new Map();
  const prefix = 'src-' + (ns || 'x');
  for (const s of (d && d.sources) || []) {
    if (!s || !s.url || index.has(s.url)) continue;
    index.set(s.url, list.length + 1);
    list.push({ ...s, n: list.length + 1, catalogued: true });
  }
  return {
    prefix,
    /** number for a url, adding it to the list when it was not catalogued */
    n(url) {
      if (!url) return 0;
      if (index.has(url)) return index.get(url);
      const n = list.length + 1;
      index.set(url, n);
      list.push({ url, title: host(url), publisher: host(url), n, catalogued: false });
      return n;
    },
    refs(urls) {
      const ns2 = (urls || []).filter(Boolean).map((u) => this.n(u));
      return ns2.length ? refHtml(ns2, prefix) : '';
    },
    all() { return list; },
  };
}

function refHtml(nums, prefix) {
  return '<sup class="footnote">' + nums.map((n) =>
    '<a href="#' + prefix + '-' + n + '" aria-label="Source ' + n + '">' + n + '</a>').join('<span class="footnote__sep">,</span>') + '</sup>';
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

function xIsDate(series) {
  return series.every((s) => s.data.every((p) => typeof p.x === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(p.x)));
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

function allValues(series) {
  const out = [];
  for (const s of series) for (const p of s.data) if (isNum(p.y)) out.push(p.y);
  return out;
}

/** true when a value axis spans more than two orders of magnitude */
function wantsLog(series) {
  const v = allValues(series).filter((n) => n > 0);
  if (v.length < 4) return false;
  return Math.max(...v) / Math.min(...v) > 100;
}

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

  const yearX = xIsYear(series);
  const numericX = !yearX && xIsNumeric(series);
  const dateX = !numericX && xIsDate(series);
  const cats = numericX || dateX ? null : categories(series);
  const horizontal = o.orient === 'h' || (!!cats && type === 'bar' && series.length === 1 &&
    (cats.length > 7 || cats.some((c) => c.length > 16)));
  const log = !!o.log;
  const valueAxis = {
    type: log ? 'log' : 'value',
    axisLabel: { color: INK3, fontSize: 11, formatter: (v) => fmtShort(v), hideOverlap: true },
    splitLine: { lineStyle: { color: RULE, type: 'solid' } },
    axisLine: { show: false },
    axisTick: { show: false },
  };
  if (log) valueAxis.minorSplitLine = { show: false };

  const catAxis = {
    type: cats ? 'category' : (dateX ? 'time' : 'value'),
    ...(cats ? { data: cats } : {}),
    ...(horizontal ? { inverse: true } : {}),
    ...axisNameStyle(cats ? '' : spec.xLabel),
    axisLabel: {
      color: INK3, fontSize: 11,
      formatter: cats ? ((v) => (String(v).length > 22 ? String(v).slice(0, 21) + '…' : v))
        : (dateX ? undefined : (v) => fmtShort(v)),
      ...(cats && !horizontal && cats.length > 6 ? { interval: 0, rotate: cats.some((c) => c.length > 9) ? 32 : 0 } : {}),
      hideOverlap: true,
    },
    axisLine: { lineStyle: { color: RULE_S } },
    axisTick: { show: false },
    splitLine: { show: false },
  };

  const showBarLabels = series.length === 1 || (cats && series.length * cats.length <= 14);
  const isArea = type === 'area';
  const stacked = type === 'stackedBar';

  const ecSeries = series.map((s, i) => {
    const color = hue(s.name, i);
    const data = s.data.map((p) => ({
      value: cats ? p.y : [dateX ? p.x : p.x, p.y],
      name: String(p.x),
      _raw: p,
      ...(p.color ? { itemStyle: { color: p.color } } : {}),
    }));
    if (type === 'line' || isArea) {
      return {
        name: s.name, type: 'line', data,
        smooth: false, symbolSize: 6, showSymbol: s.data.length <= 24,
        lineStyle: { width: 2, color },
        itemStyle: { color },
        ...(isArea ? { areaStyle: { color, opacity: 0.12 } } : {}),
        ...(series.length <= 4 && !o.compact ? {
          endLabel: {
            show: true, color: INK, fontSize: 11, fontWeight: 500,
            distance: 6, formatter: () => s.name,
          },
        } : {}),
        markPoint: markMax(s, cats, unit, series.length === 1 && !o.compact),
      };
    }
    // bar family
    const perCatColour = series.length === 1 && cats && cats.length > 1;
    return {
      name: s.name, type: 'bar', data: perCatColour
        ? s.data.map((p, j) => ({ value: p.y, name: String(p.x), _raw: p, itemStyle: { color: hueForCat(p, j, cats) } }))
        : data,
      ...(stacked ? { stack: 'total' } : {}),
      barMaxWidth: horizontal ? 18 : 46,
      itemStyle: {
        color, borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
      },
      label: showBarLabels && !stacked ? {
        show: true, position: horizontal ? 'right' : 'top',
        color: INK2, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace',
        formatter: (p) => fmtShort(Array.isArray(p.value) ? p.value[1] : p.value),
      } : { show: false },
    };
  });

  function hueForCat(p, j) {
    return baseHue(p.x);
  }

  const longest = Math.max(...series.map((s) => String(s.name || '').length));
  const endLabelled = (type === 'line' || isArea) && series.length <= 4 && !o.compact;
  const grid = horizontal
    ? { left: 8, right: 62, top: 12, bottom: 6, containLabel: true }
    : {
      left: 8, right: endLabelled ? Math.min(150, Math.max(74, longest * 6.6)) : 22,
      top: 22, bottom: spec.xLabel && !cats ? 32 : 6, containLabel: true,
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

function markMax(s, cats, unit, on) {
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
    data: [{ coord: cats ? [String(best.x), best.y] : [best.x, best.y] }],
  };
}

function scatterOption(spec, series, hue, unit, o) {
  const dateX = xIsDate(series);
  const log = !!o.log;
  const labelled = series.reduce((n, s) => n + s.data.filter((p) => p.label).length, 0);
  return {
    animationDuration: 320,
    grid: { left: 8, right: labelled ? 96 : 24, top: 18, bottom: spec.xLabel ? 34 : 8, containLabel: true },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p) => {
        const raw = p.data && p.data._raw ? p.data._raw : {};
        const x = dateX ? longDate(raw.x) : fmt(raw.x);
        return '<strong>' + esc(raw.label || p.seriesName) + '</strong><br>' +
          esc(spec.xLabel || 'x') + ': ' + esc(x) + '<br>' +
          esc(spec.yLabel || 'y') + ': ' + esc(fmt(raw.y)) + (unit ? ' ' + esc(unit) : '');
      },
    },
    xAxis: {
      type: dateX ? 'time' : 'value',
      ...axisNameStyle(spec.xLabel),
      axisLabel: { color: INK3, fontSize: 11, ...(dateX ? {} : { formatter: (v) => fmtShort(v) }) },
      axisLine: { lineStyle: { color: RULE_S } }, axisTick: { show: false },
      splitLine: { show: false }, scale: !dateX,
    },
    yAxis: {
      type: log ? 'log' : 'value',
      axisLabel: { color: INK3, fontSize: 11, formatter: (v) => fmtShort(v), hideOverlap: true },
      splitLine: { lineStyle: { color: RULE, type: 'solid' } },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: series.map((s, i) => {
      const color = hue(s.name, i);
      return {
        name: s.name, type: 'scatter', symbolSize: 11,
        itemStyle: { color, opacity: 0.9, borderColor: '#FFFFFF', borderWidth: 1 },
        data: s.data.map((p) => ({ value: [dateX ? p.x : p.x, p.y], name: p.label || s.name, _raw: p })),
        label: {
          show: !!s.data.some((p) => p.label), position: 'right', distance: 7,
          color: INK2, fontSize: 11, formatter: (p) => (p.data._raw.label || ''),
        },
        labelLayout: { hideOverlap: true },
      };
    }),
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
        formatter: (p) => '{a|' + shortLabel(p.name) + '}\n{b|' + fmt(p.value) + ' ' + (unit || '') + '}',
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
  const series = seriesOf(spec);
  const cats = categories(series);
  const horizontal = spec.type === 'bar' && series.length === 1 &&
    (cats.length > 7 || cats.some((c) => c.length > 16));
  if (horizontal) return { cls: 'chart', px: Math.max(260, Math.min(720, 64 + cats.length * 27)) };
  if (hint === 'short') return { cls: 'chart chart--short', px: null };
  if (hint === 'tall') return { cls: 'chart chart--tall', px: null };
  return { cls: 'chart', px: null };
}

/** Register a spec and return the HTML for its chart surface. */
function chartSurface(spec, hint, opts) {
  const key = nid('chart');
  CHART_SPECS.set(key, { ...spec, opts: { ...(spec.opts || {}), ...(opts || {}) } });
  const size = chartSizing(spec, hint);
  return '<div class="' + size.cls + '" data-chart="' + key + '"' +
    (size.px ? ' style="height:' + size.px + 'px"' : '') +
    ' role="img" aria-label="' + attr(spec.title || 'Chart') + '"></div>';
}

function reChart(node, spec, opts) {
  const rec = node.__gdChart;
  const option = buildOption(spec, opts);
  if (rec && rec.chart && option) rec.chart.setOption(option, true);
}

/* ============================================================================
   7. Small HTML components
   ========================================================================== */

function kpiHtml(stat, fn) {
  if (!stat) return '';
  const unit = stat.unit && String(stat.unit).length <= 18 ? stat.unit : '';
  const delta = stat.delta ? String(stat.delta) : '';
  const dir = /^-|↓|down|fell|drop|fewer/i.test(delta) ? 'down'
    : (/^\+|↑|up|rose|grew|more|×|\bx\b/i.test(delta) ? 'up' : 'flat');
  // Step the figure down a size when the value plus its unit is long, so a
  // number is never clipped. Thresholds are in rendered characters.
  const figLen = String(fmt(stat.value)).length + (unit ? unit.length + 1 : 0);
  const len = figLen > 15 ? ' data-len="xlong"' : (figLen > 9 ? ' data-len="long"' : '');
  return '<div class="kpi"' + len + '>' +
    '<p class="kpi__label">' + esc(stat.label) + '</p>' +
    '<p class="kpi__figure kpi__value">' + esc(fmt(stat.value)) +
      (unit ? '<span class="kpi__unit">' + esc(unit) + '</span>' : '') + '</p>' +
    (delta ? '<p class="kpi__delta kpi__delta--' + dir + '">' + esc(delta) + '</p>' : '') +
    (stat.note ? '<p class="kpi__note">' + esc(stat.note) + '</p>' : '') +
    (stat.source ? '<p class="kpi__source"><a href="' + attr(stat.source) + '" target="_blank" rel="noopener">' +
      esc(host(stat.source)) + '</a>' + (fn ? fn.refs([stat.source]) : '') + '</p>' : '') +
    (stat.from ? '<p class="kpi__source"><a href="#/' + esc(stat.from) + '">' +
      esc(stat.from.charAt(0).toUpperCase() + stat.from.slice(1)) + ' section</a></p>' : '') +
    '</div>';
}

function kpiRow(stats, fn) {
  if (!stats || !stats.length) return '';
  return '<div class="kpi-row">' + stats.map((s) => kpiHtml(s, fn)).join('') + '</div>';
}

/** Block label above a group of panels. `.subhead` is a mono rule-under label. */
function blockHead(title, count, note) {
  return '<p class="subhead" role="heading" aria-level="3">' + esc(title) +
    (count != null ? '<span class="dim"> · ' + esc(count) + '</span>' : '') + '</p>' +
    (note ? '<p class="note note--lede">' + esc(note) + '</p>' : '');
}

function findingsHtml(findings, fn) {
  if (!findings || !findings.length) return '';
  return blockHead('Key findings', findings.length + ' findings') +
    '<ol class="findings">' + findings.map((f) =>
      '<li class="finding">' +
      '<h4 class="finding__title">' + esc(f.title) + (fn ? fn.refs(f.sources) : '') + '</h4>' +
      '<p class="finding__detail">' + esc(f.detail) + '</p>' +
      ((f.audience && f.audience.length)
        ? '<p class="finding__meta"><span>Matters most to</span>' +
          f.audience.map((a) => '<span class="badge badge--neutral">' + esc(a) + '</span>').join('') + '</p>'
        : '') +
      '</li>').join('') + '</ol>';
}

function glossaryHtml(items) {
  if (!items || !items.length) return '';
  return blockHead('Glossary', items.length + ' terms') +
    '<dl class="glossary">' + items.map((g) =>
      '<div><dt>' + esc(g.term) + '</dt><dd>' + esc(g.definition) + '</dd></div>').join('') + '</dl>';
}

function sourcesHtml(fn, updated) {
  const list = fn.all();
  if (!list.length) return '';
  return blockHead('Sources', list.length + ' sources',
    'Every figure on this page carries a numbered footnote to an entry below.' +
    (updated ? ' Compiled ' + longDate(updated) + '.' : '')) +
    '<ol class="sources">' + list.map((s) =>
      '<li class="source" id="' + fn.prefix + '-' + s.n + '">' +
      '<span class="source__body">' +
      '<span class="source__title"><a href="' + attr(s.url) + '" target="_blank" rel="noopener">' +
      esc(s.title || host(s.url)) + '</a></span>' +
      '<span class="source__meta">' + esc(s.publisher || host(s.url)) +
      (s.date ? ' · ' + esc(longDate(s.date)) : '') +
      (s.type ? ' · ' + esc(s.type) : '') + '</span></span></li>').join('') + '</ol>';
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

  // filter chips: first text column with 3-12 distinct values
  let filterCol = -1;
  let filterVals = [];
  for (let i = 0; i < cols.length; i += 1) {
    if (cols[i].type && cols[i].type !== 'text') continue;
    const vals = [...new Set(rows.map((r) => String(r[cols[i].key] == null ? '' : r[cols[i].key]).trim()).filter(Boolean))];
    if (vals.length >= 3 && vals.length <= 12 && vals.every((v) => v.length <= 34)) {
      filterCol = i; filterVals = vals; break;
    }
  }

  const units = cols.filter((c) => c.unit).map((c) => c.label + ' in ' + c.unit);
  const caption = o.caption || [
    spec.description || '',
    units.length ? 'Units: ' + units.join('; ') + '.' : '',
    spec.updated ? 'As of ' + longDate(spec.updated) + '.' : '',
  ].filter(Boolean).join(' ');

  const head = '<tr>' + cols.map((c, i) => {
    const numeric = c.type === 'number';
    return '<th scope="col"' + (numeric ? ' class="num" data-type="number"' : '') + ' aria-sort="none">' +
      '<button type="button" class="table__sort" data-sort="' + i + '" data-type="' + (numeric ? 'number' : 'text') + '">' +
      esc(c.label) + (c.unit ? ' <small>' + esc(c.unit) + '</small>' : '') + '</button></th>';
  }).join('') + '</tr>';

  const body = rows.map((r) => {
    const key = filterCol >= 0 ? String(r[cols[filterCol].key] == null ? '' : r[cols[filterCol].key]).trim() : '';
    return '<tr' + (filterCol >= 0 ? ' data-fv="' + attr(key) + '"' : '') + '>' + cols.map((c, i) => {
      const v = r[c.key];
      const numeric = c.type === 'number';
      const sortV = numeric ? (isNum(v) ? v : Number.NEGATIVE_INFINITY) : String(v == null ? '' : v).toLowerCase();
      const shown = numeric ? fmt(v) : (v == null || v === '' ? '—' : String(v));
      const ref = i === cols.length - 1 && fn && r._source ? fn.refs([r._source]) : '';
      const dim = !numeric && (v == null || v === '') ? ' dim' : '';
      return '<td class="' + (numeric ? 'num' : 'txt') + dim + '"' + (numeric ? ' data-type="number"' : '') +
        ' data-v="' + attr(sortV) + '">' + esc(shown) + ref + '</td>';
    }).join('') + '</tr>';
  }).join('');

  const chips = filterCol >= 0
    ? '<div class="chips" role="group" aria-label="Filter by ' + attr(cols[filterCol].label) + '">' +
      filterVals.map((v) => '<button type="button" class="chip" data-filter="' + tid + '" data-value="' + attr(v) +
        '" aria-pressed="false">' + esc(v) + '</button>').join('') +
      '<button type="button" class="chip" data-filter-reset="' + tid + '">All<span class="chip__count">' +
      rows.length + '</span></button></div>'
    : '';

  const srcLine = spec.sources && spec.sources.length
    ? '<p class="panel__sources">Sources: ' + spec.sources.map((u) =>
      '<a href="' + attr(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a>' +
      (fn ? fn.refs([u]) : '')).join(' · ') + '</p>'
    : '';

  return '<figure class="panel" id="' + tid + '" data-table="' + tid + '">' +
    '<div class="panel__head">' +
    '<p class="panel__title" role="heading" aria-level="4">' + esc(spec.title || 'Table') + '</p>' +
    '<span class="panel__unit">' + esc(rows.length + ' rows') + '</span>' +
    (chips ? '<div class="panel__tools">' + chips + '</div>' : '') +
    '</div>' +
    // The caption sits outside the scroll container: inside it, it would take
    // the table's width and the reader would have to scroll sideways to read
    // the units. It stays the table's accessible name via aria-labelledby.
    (caption ? '<p class="table__caption" id="' + tid + '-cap">' + esc(caption) +
      '<span class="table__count" data-count-for="' + tid + '" hidden></span></p>' : '') +
    '<div class="table-wrap"><table class="table' + (rows.length > 12 ? ' table--zebra' : '') + '"' +
    (caption ? ' aria-labelledby="' + tid + '-cap"' : '') + '>' +
    '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
    (spec.notes ? '<figcaption class="panel__note">' + esc(spec.notes) + '</figcaption>' : '') +
    srcLine + '</figure>';
}

/* ============================================================================
   9. Chart panels (with segmented control when several share a subject)
   ========================================================================== */

function panelHtml(charts, fn, opts) {
  const o = opts || {};
  const group = charts.filter(Boolean);
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
    // A log toggle only makes sense where the mark is not a length from zero.
    const log = wantsLog(seriesOf(c)) && ['line', 'area', 'scatter'].includes(c.type);
    const legend = legendHtml(c);
    const scale = log
      ? '<div class="seg" role="group" aria-label="Value scale">' +
        '<button type="button" class="seg__btn is-active" data-scale="' + pid + '-p' + i + '" data-scale-mode="linear" aria-pressed="true">Linear</button>' +
        '<button type="button" class="seg__btn" data-scale="' + pid + '-p' + i + '" data-scale-mode="log" aria-pressed="false">Log</button>' +
        '</div>'
      : '';
    return '<div class="panel__pane" id="' + pid + '-p' + i + '"' +
      (multi ? ' role="tabpanel"' : '') + (i === 0 ? '' : ' hidden') + '>' +
      '<div class="panel__head">' +
      '<p class="panel__title" role="heading" aria-level="4">' + esc(c.title) + '</p>' +
      '<span class="panel__unit">' + esc(c.unit || c.yLabel || '') + '</span>' +
      (tabs(i) || legend || scale
        ? '<div class="panel__tools">' + tabs(i) + legend + scale + '</div>' : '') +
      '</div>' +
      '<div class="panel__body">' + chartSurface(c, height) + '</div>' +
      (c.notes ? '<p class="panel__note">' + esc(c.notes) + '</p>' : '') +
      (c.sources && c.sources.length
        ? '<p class="panel__sources">Sources: ' + c.sources.map((u) =>
          '<a href="' + attr(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a>' +
          (fn ? fn.refs([u]) : '')).join(' · ') + '</p>'
        : '') +
      '</div>';
  }).join('');

  return '<figure class="panel" data-panel="' + pid + '">' + bodies + '</figure>';
}

function segLabel(c, group) {
  const words = String(c.title || '').split(/\s+/);
  const others = group.filter((g) => g !== c).map((g) => String(g.title || '').toLowerCase());
  const distinct = words.filter((w) => w.length > 3 && !others.every((t) => t.includes(w.toLowerCase())));
  const pick = (distinct.length ? distinct : words).slice(0, 3).join(' ');
  return pick.replace(/[:,]$/, '') || 'View';
}

function legendHtml(spec) {
  const series = seriesOf(spec);
  const type = spec.type;
  if (type === 'donut') return '';
  const directLabelled = (type === 'line' || type === 'area') && series.length <= 4;
  if (directLabelled || series.length < 2) return '';
  const hue = hueFactory();
  return '<ul class="legend">' + series.map((s, i) =>
    '<li class="legend__item"><span class="legend__dot" style="background:' + hue(s.name, i) + '"></span>' +
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

function timelineHtml(events, opts) {
  const o = opts || {};
  const list = (events || []).filter((e) => e && e.date);
  if (!list.length) return '';
  const tid = nid('tl');
  const cats = [...new Set(list.map((e) => e.category || 'other'))];
  const sorted = list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const ordered = o.newestFirst ? sorted.slice().reverse() : sorted;

  const items = [];
  let lastYear = null;
  for (const e of ordered) {
    const year = String(e.date).slice(0, 4);
    const showYear = year !== lastYear;
    lastYear = year;
    const cat = e.category || 'other';
    items.push('<li class="timeline__item cat--' + esc(cat) + '" data-cat="' + esc(cat) + '">' +
      '<span class="timeline__year">' + (showYear ? esc(year) : '') + '</span>' +
      '<span class="timeline__dot" aria-hidden="true"></span>' +
      '<div class="timeline__body">' +
      '<time class="timeline__date" datetime="' + attr(shortDate(e.date)) + '">' + esc(longDate(e.date)) + '</time>' +
      '<span class="timeline__cat">' + esc(cat) + '</span>' +
      '<h4 class="timeline__title">' + esc(e.title) + '</h4>' +
      (e.detail ? '<p class="timeline__detail">' + esc(e.detail) + '</p>' : '') +
      (e.source ? '<a class="timeline__source" href="' + attr(e.source) + '" target="_blank" rel="noopener">' +
        esc(host(e.source)) + '</a>' : '') +
      '</div></li>');
  }

  if (o.register === false) return '<ol class="timeline">' + items.join('') + '</ol>';

  const chips = '<div class="chips" role="group" aria-label="Filter events by category">' +
    cats.map((c) => '<button type="button" class="chip cat--' + esc(c) + '" data-tl-filter="' + tid +
      '" data-value="' + esc(c) + '" aria-pressed="false">' +
      '<span class="chip__dot" style="background:' + (CAT_HUE[c] || CAT_HUE.other) + '"></span>' + esc(c) +
      '<span class="chip__count">' + list.filter((e) => (e.category || 'other') === c).length + '</span></button>').join('') +
    '<button type="button" class="chip" data-tl-reset="' + tid + '">All<span class="chip__count">' +
    list.length + '</span></button></div>';

  const order = '<div class="seg" role="group" aria-label="Event order">' +
    '<button type="button" class="seg__btn' + (o.newestFirst ? '' : ' is-active') + '" data-tl-order="' + tid +
    '" data-order="asc" aria-pressed="' + (!o.newestFirst) + '">Oldest first</button>' +
    '<button type="button" class="seg__btn' + (o.newestFirst ? ' is-active' : '') + '" data-tl-order="' + tid +
    '" data-order="desc" aria-pressed="' + (!!o.newestFirst) + '">Newest first</button></div>';

  TIMELINE_DATA.set(tid, list);
  return blockHead(o.title || 'Timeline', list.length + ' events',
    o.note || 'Every event carries a date and a primary source.') +
    '<div id="' + tid + '"><div class="split tl-tools">' + chips + order + '</div>' +
    '<ol class="timeline">' + items.join('') + '</ol></div>';
}

const TIMELINE_DATA = new Map();

/** Rebuild a timeline list in place (order toggle). */
function redrawTimeline(tid, newestFirst) {
  const wrap = document.getElementById(tid);
  if (!wrap) return;
  const events = TIMELINE_DATA.get(tid);
  if (!events) return;
  const active = [...wrap.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.dataset.value);
  const html = timelineHtml(events, { newestFirst, register: false });
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const fresh = tmp.querySelector('.timeline');
  const list = wrap.querySelector('.timeline');
  if (fresh && list) list.innerHTML = fresh.innerHTML;
  wrap.querySelectorAll('[data-tl-order]').forEach((b) => {
    const on = (b.dataset.order === 'desc') === !!newestFirst;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (active.length) applyTimelineFilter(wrap, active);
}

function applyTimelineFilter(wrap, values) {
  const set = new Set(values);
  let lastYear = null;
  wrap.querySelectorAll('.timeline__item').forEach((li) => {
    const on = set.size === 0 || set.has(li.dataset.cat);
    li.hidden = !on;
    const y = li.querySelector('.timeline__year');
    const t = li.querySelector('.timeline__date');
    const year = t ? String(t.getAttribute('datetime')).slice(0, 4) : '';
    if (!y) return;
    if (!on) { y.textContent = ''; return; }
    y.textContent = year === lastYear ? '' : year;
    lastYear = year;
  });
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
      '<h2 class="section__title">' + esc(label) + '</h2>' +
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

  const fn = makeFootnotes(d, d.perspective || r.id);
  const { head, rest } = firstSentences(d.summary, 260);
  const counts = [
    (d.stats || []).length ? (d.stats || []).length + ' figures' : '',
    (d.charts || []).length ? (d.charts || []).length + ' charts' : '',
    (d.tables || []).length ? (d.tables || []).length + ' tables' : '',
    (d.timeline || []).length ? (d.timeline || []).length + ' events' : '',
    (d.sources || []).length ? (d.sources || []).length + ' sources' : '',
  ].filter(Boolean);

  const parts = [];
  parts.push('<section class="section" data-perspective="' + esc(d.perspective || r.id) + '">');
  parts.push('<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>' + esc(label) + ' ' + kind + '</p>' +
    '<h2 class="section__title">' + esc(d.title || label) + '</h2>' +
    (head ? '<p class="section__standfirst">' + esc(head) + '</p>' : '') +
    (rest ? '<p class="section__standfirst section__standfirst--rest">' + esc(rest) + '</p>' : '') +
    '</div>' +
    '<p class="section__meta">Updated ' + esc(longDate(d.updated)) +
    counts.map((c) => '<br>' + esc(c)).join('') + '</p>' +
    '</header>');

  if ((d.stats || []).length) parts.push(kpiRow(d.stats, fn));

  parts.push(findingsHtml(d.keyFindings, fn));

  const charts = (d.charts || []).filter((c) => seriesOf(c).length);
  if (charts.length) {
    parts.push(blockHead('Charts', charts.length + ' charts',
      'Colour encodes vendor or category consistently across the site. Units are in each panel header.'));
    parts.push('<div class="panel-stack">' + groupCharts(charts).map((g) => panelHtml(g, fn)).join('') + '</div>');
  }

  const tables = (d.tables || []).filter((t) => t && (t.rows || []).length);
  if (tables.length) {
    parts.push(blockHead('Evidence tables', tables.length + ' tables',
      'Sortable by any column. Numeric columns are right-aligned; every row links to its source.'));
    parts.push('<div class="panel-stack">' + tables.map((t) =>
      renderTable({ ...t, updated: t.updated || d.updated }, { footnotes: fn })).join('') + '</div>');
  }

  const events = (d.timeline || []).filter((e) => e && e.date);
  if (events.length) {
    if (!charts.length && events.length >= 12) {
      parts.push('<div class="panel-stack">' + panelHtml([timelineChartSpec(events)], fn, { height: 'short' }) + '</div>');
    }
    parts.push(timelineHtml(events, {
      title: r.id === 'timeline' ? 'The record' : 'What happened, when',
      note: 'Filter by category; every entry links to its primary source.',
    }));
  }

  parts.push(glossaryHtml(d.glossary));
  parts.push(sourcesHtml(fn, d.updated));
  parts.push('</section>');

  el.innerHTML = parts.join('');
  mountCharts(el);
  wireDelegates();
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

/** Price-gap chart: synthesised from financial pricing when available. */
function priceGapChart(data) {
  const pricing = data.financial && data.financial.extras && data.financial.extras.pricing;
  if (Array.isArray(pricing) && pricing.length) {
    const tiers = ['frontier', 'distilled', 'open'];
    const byTier = new Map(tiers.map((t) => [t, []]));
    pricing.forEach((p) => { if (byTier.has(p.tier) && isNum(p.output_per_mtok_usd)) byTier.get(p.tier).push(p); });
    const series = tiers.filter((t) => byTier.get(t).length).map((t) => ({
      name: t.charAt(0).toUpperCase() + t.slice(1),
      data: byTier.get(t).sort((a, b) => b.output_per_mtok_usd - a.output_per_mtok_usd).slice(0, 8)
        .map((p) => ({ x: p.model, y: p.output_per_mtok_usd })),
    }));
    if (series.length) {
      return {
        chart: {
          id: 'overview-price-gap',
          title: 'Output price by tier',
          type: 'bar', xLabel: 'Model', yLabel: 'USD per 1M output tokens', unit: 'USD / 1M output tokens',
          series,
          notes: 'List prices for the standard tier, excluding batch and cache discounts.',
          sources: [...new Set(pricing.map((p) => p.source).filter(Boolean))].slice(0, 3),
        }, from: 'financial',
      };
    }
  }
  return findChart(data, ['flagship-vs-small-output-price', 'price-per-mtok'],
    ['output price', 'price', 'usd per']);
}

/** Retention chart: synthesised from academic benchmarks when available. */
function retentionChart(data) {
  const b = data.academic && data.academic.extras && data.academic.extras.benchmarks;
  if (Array.isArray(b) && b.length) {
    const pts = b.filter((x) => isNum(x.retention_pct) && isNum(x.params_student_b));
    if (pts.length >= 3) {
      return {
        chart: {
          id: 'overview-retention',
          title: 'Benchmark retention against student size',
          type: 'scatter', xLabel: 'Student parameters (B)', yLabel: 'Teacher score retained (%)', unit: '%',
          series: [{
            name: 'Student', data: pts.map((p) => ({
              x: p.params_student_b, y: p.retention_pct,
              label: p.student + (p.benchmark ? ' · ' + p.benchmark : ''),
            })),
          }],
          notes: 'Retention is the student score divided by its own teacher\'s score on the same benchmark, as reported by the model\'s authors.',
          sources: [...new Set(pts.map((p) => p.source).filter(Boolean))].slice(0, 3),
        }, from: 'academic',
      };
    }
  }
  return findChart(data, ['r1-distill-aime-vs-size', 'qwen3-distill-vs-rl'],
    ['retention', 'aime', 'benchmark', 'score']);
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
    const cur = new Date(live.updated || Date.now()).getUTCFullYear();
    specs.push({
      id: 'live-arxiv', title: 'arXiv papers matching "knowledge distillation", per year',
      type: 'area', xLabel: 'Year', yLabel: 'Papers', unit: 'papers',
      series: [{ name: 'Papers', data: ax.perYear.map((p) => ({ x: p.year, y: p.count })) }],
      notes: 'Full-text search of the arXiv API. ' + cur + ' is year-to-date as of ' + longDate(live.updated) +
        ', so its bar is not comparable with a complete year. ' + fmt(ax.totalKD) + ' papers in total, ' +
        fmt(ax.last30d) + ' in the last 30 days.',
      sources: ['https://arxiv.org/'],
    });
  }
  if ((live.huggingface && live.huggingface.tracked || []).length) {
    specs.push({
      id: 'live-hf', title: 'Downloads of tracked distilled models, last 30 days',
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
    specs.push({
      id: 'live-gh', title: 'Stars on distillation tooling repositories',
      type: 'bar', xLabel: 'Repository', yLabel: 'Stars', unit: 'stars',
      series: [{
        name: 'Stars', data: live.github.repos.slice().sort((a, b) => b.stars - a.stars)
          .map((r) => ({ x: r.repo.split('/').pop(), y: r.stars })),
      }],
      notes: 'GitHub star counts for the training, serving and evaluation repositories a distillation run typically uses.',
      sources: ['https://github.com/'],
    });
  }

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
      '<small class="dim"> ' + esc(n.source || host(n.url)) +
      (isNum(n.points) ? ' · ' + esc(fmt(n.points)) + ' points' : '') + '</small></span></li>').join('') + '</ol>'
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
    (specs.length ? panelHtml(specs, null, { height: 'short' }) : '') +
    '<div class="panel">' +
    '<div class="panel__head"><p class="panel__title" role="heading" aria-level="4">Recent coverage and papers</p>' +
    '<span class="panel__unit">' + esc(news.length + papers.length) + ' items</span></div>' +
    '<div class="panel__body grid--2">' +
    '<div><p class="subhead">In the press and on Hacker News</p>' + newsHtml + '</div>' +
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

  const parts = [];

  // --- KPI row: strongest figure from each published perspective ------------
  const kpis = [];
  for (const p of PERSPECTIVES) {
    const s = strongestStat(data[p]);
    if (s) kpis.push({ ...s, from: p });
  }
  const loaded = PERSPECTIVES.filter((p) => data[p]);
  parts.push('<section class="section" data-perspective="overview">');
  parts.push('<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>Overview</p>' +
    '<h2 class="section__title">The state of distillation, on one page</h2>' +
    '<p class="section__standfirst">Distillation trains a small student model on the behaviour of a large ' +
    'teacher. It is how nearly every cheap model on the market is built, and it is now argued over in ' +
    'filings, export-control memoranda and terms of service.</p>' +
    '<p class="section__standfirst section__standfirst--rest">Below: the strongest figure from each ' +
    'perspective, the two charts that carry the argument, and the signals that move daily. Every figure is ' +
    'repeated in its own section with full method notes and a numbered source.</p>' +
    '</div>' +
    '<p class="section__meta">' + loaded.length + ' of ' + PERSPECTIVES.length + ' perspectives<br>' +
    (live && live.updated ? 'Live signals ' + esc(longDate(live.updated)) : 'Live signals unavailable') + '</p>' +
    '</header>');

  if (kpis.length) {
    parts.push(kpiRow(kpis, null));
  } else {
    parts.push(emptyState('No published figures yet',
      'Perspective files are still being compiled. Figures appear here once each has a primary source.'));
  }

  // --- six angles ----------------------------------------------------------
  parts.push(blockHead('Six angles on the same technique', PERSPECTIVES.length + ' perspectives',
    'The same events look different depending on whether you are training a model, buying one, or regulating one.'));
  parts.push('<div class="card-grid">' + PERSPECTIVES.map((p, i) => {
    const d = data[p];
    const n = d ? [
      (d.stats || []).length + ' figures',
      (d.charts || []).length + ' charts',
      (d.sources || []).length + ' sources',
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
  const latest = allEvents
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .filter((e) => { const k = e.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);
  if (latest.length) {
    parts.push(blockHead('Latest events', '6 most recent',
      'Drawn from every perspective timeline. The full record runs from 2006.'));
    parts.push('<ol class="timeline">' + latest.map((e) => {
      const cat = e.category || 'other';
      return '<li class="timeline__item cat--' + esc(cat) + '">' +
        '<span class="timeline__year">' + esc(String(e.date).slice(0, 4)) + '</span>' +
        '<span class="timeline__dot" aria-hidden="true"></span>' +
        '<div class="timeline__body">' +
        '<time class="timeline__date" datetime="' + attr(shortDate(e.date)) + '">' + esc(longDate(e.date)) + '</time>' +
        '<span class="timeline__cat">' + esc(cat) + '</span>' +
        '<h4 class="timeline__title">' + esc(e.title) + '</h4>' +
        (e.detail ? '<p class="timeline__detail">' + esc(firstSentences(e.detail, 200).head) + '</p>' : '') +
        (e.source ? '<a class="timeline__source" href="' + attr(e.source) + '" target="_blank" rel="noopener">' +
          esc(host(e.source)) + '</a>' : '') +
        '</div></li>';
    }).join('') + '</ol>' +
      '<p class="cluster"><a class="btn btn--ghost" href="#/timeline">See the full timeline, 2006 to today</a></p>');
  }

  parts.push('</section>');
  el.innerHTML = parts.join('');
  mountCharts(el);
  wireDelegates();
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

const FIELD_LABELS = {
  params_b: ['Parameters', 'B', 'higher'],
  input_per_mtok_usd: ['Input price', 'USD / 1M tokens', 'lower'],
  output_per_mtok_usd: ['Output price', 'USD / 1M tokens', 'lower'],
  mmlu: ['MMLU', '%', 'higher'],
  gpqa: ['GPQA Diamond', '%', 'higher'],
  humaneval_or_swe: ['HumanEval / SWE-bench', '%', 'higher'],
  latency_ttft_ms: ['Time to first token', 'ms', 'lower'],
  contextK: ['Context window', 'K tokens', 'higher'],
};

/** Normalise every available source of model rows into one shape. */
function collectModels(data) {
  const out = [];
  const cust = data.customer && data.customer.extras && data.customer.extras.models;
  if (Array.isArray(cust) && cust.length) {
    cust.forEach((m) => out.push({
      name: m.model, vendor: m.vendor || '', source: m.source,
      badges: [m.isDistilled ? 'distilled' : 'not distilled', m.license].filter(Boolean),
      text: [
        ['Vendor', m.vendor], ['Distilled', m.isDistilled == null ? 'undisclosed' : (m.isDistilled ? 'yes' : 'no')],
        ['Teacher', m.teacher || 'undisclosed'], ['License', m.license], ['Released', longDate(m.releaseDate)],
      ].filter((p) => p[1]),
      nums: Object.keys(FIELD_LABELS).filter((k) => isNum(m[k])).map((k) => ({
        key: k, label: FIELD_LABELS[k][0], unit: FIELD_LABELS[k][1], better: FIELD_LABELS[k][2], value: m[k],
      })),
    }));
    return { models: out, origin: 'customer.extras.models' };
  }
  const price = data.financial && data.financial.extras && data.financial.extras.pricing;
  if (Array.isArray(price) && price.length) {
    price.forEach((m) => out.push({
      name: m.model, vendor: m.vendor || '', source: m.source,
      badges: [m.tier].filter(Boolean),
      text: [['Vendor', m.vendor], ['Tier', m.tier], ['Released', longDate(m.release)]].filter((p) => p[1]),
      nums: [
        isNum(m.input_per_mtok_usd) ? { key: 'input_per_mtok_usd', label: 'Input price', unit: 'USD / 1M tokens', better: 'lower', value: m.input_per_mtok_usd } : null,
        isNum(m.output_per_mtok_usd) ? { key: 'output_per_mtok_usd', label: 'Output price', unit: 'USD / 1M tokens', better: 'lower', value: m.output_per_mtok_usd } : null,
        isNum(m.params_b) ? { key: 'params_b', label: 'Parameters', unit: 'B', better: 'higher', value: m.params_b } : null,
      ].filter(Boolean),
    }));
    return { models: out, origin: 'financial.extras.pricing' };
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
      name: String(r[best.nameCol.key]), vendor: '', source: r._source,
      badges: [],
      text: (best.table.columns || []).filter((c) => (c.type || 'text') === 'text' && c.key !== best.nameCol.key)
        .map((c) => [c.label, r[c.key]]).filter((p) => p[1]),
      nums: best.numCols.filter((c) => isNum(r[c.key])).map((c) => ({
        key: c.key, label: c.label, unit: c.unit || '', better: /price|cost|latency|vram|hours/i.test(c.key + c.label) ? 'lower' : 'higher',
        value: r[c.key],
      })),
    }));
    return { models: out, origin: best.from + ' · ' + (best.table.title || best.table.id) };
  }
  return { models: [], origin: null };
}

let COMPARE_STATE = { models: [], selected: [], origin: null };

export function renderCompare(el, ctx) {
  disposeCharts();
  CHART_SPECS.clear();
  const data = (ctx && ctx.data) || {};
  const { models, origin } = collectModels(data);

  if (!models.length) {
    el.innerHTML = '<section class="section"><header class="section__head"><div>' +
      '<p class="eyebrow"><span class="eyebrow__dot"></span>Compare</p>' +
      '<h2 class="section__title">Build your own comparison</h2>' +
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

  const saved = lsGet().filter((n) => models.some((m) => m.name === n));
  const selected = saved.length >= 2 ? saved.slice(0, 4) : models.slice(0, Math.min(3, models.length)).map((m) => m.name);
  COMPARE_STATE = { models, selected, origin };

  el.innerHTML = '<section class="section" data-perspective="compare">' +
    '<header class="section__head"><div>' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>Compare</p>' +
    '<h2 class="section__title">Build your own comparison</h2>' +
    '<p class="section__standfirst">Select two to four models. The table shows every attribute on file, ' +
    'the chart compares the measures where higher is better, and price is charted separately because ' +
    'there lower is better.</p>' +
    '<p class="section__standfirst section__standfirst--rest">Figures come from ' + esc(origin) +
    '. Your selection is kept in this browser only.</p>' +
    '</div>' +
    '<p class="section__meta">' + models.length + ' models on file<br>2 to 4 at a time</p>' +
    '</header>' +
    '<div id="compare-pick"></div>' +
    '<div id="compare-out"></div>' +
    '</section>';

  drawCompare();
  wireDelegates();
}

function drawCompare() {
  const pick = document.getElementById('compare-pick');
  const out = document.getElementById('compare-out');
  if (!pick || !out) return;
  CHART_SPECS.clear();
  const { models, selected } = COMPARE_STATE;

  pick.innerHTML = blockHead('Choose models', selected.length + ' of 4 selected') +
    '<div class="chips" role="group" aria-label="Models to compare">' +
    models.map((m) => {
      const on = selected.includes(m.name);
      const full = !on && selected.length >= 4;
      return '<button type="button" class="chip' + (on ? ' is-active' : '') + '" data-compare="' + attr(m.name) + '"' +
        ' aria-pressed="' + on + '"' + (full ? ' disabled' : '') + '>' +
        '<span class="chip__dot" style="background:' + baseHue(m.vendor || m.name) + '"></span>' + esc(m.name) + '</button>';
    }).join('') + '</div>';

  const chosen = models.filter((m) => selected.includes(m.name));
  if (chosen.length < 2) {
    out.innerHTML = emptyState('Pick at least two models',
      'Select two to four models above to build the comparison.');
    return;
  }

  // union of numeric fields, in the order of the first chosen model
  const fields = [];
  const seenF = new Set();
  for (const m of chosen) for (const f of m.nums) {
    if (!seenF.has(f.key)) { seenF.add(f.key); fields.push(f); }
  }
  const textKeys = [];
  const seenT = new Set();
  for (const m of chosen) for (const [k] of m.text) {
    if (!seenT.has(k)) { seenT.add(k); textKeys.push(k); }
  }

  const cell = (m, f) => {
    const v = (m.nums.find((x) => x.key === f.key) || {}).value;
    return isNum(v) ? fmt(v) : '—';
  };
  const bestOf = (f) => {
    const vals = chosen.map((m) => (m.nums.find((x) => x.key === f.key) || {}).value).filter(isNum);
    if (vals.length < 2) return null;
    return f.better === 'lower' ? Math.min(...vals) : Math.max(...vals);
  };

  const rowsHtml = [
    ...textKeys.map((k) => '<tr><td class="txt">' + esc(k) + '</td>' +
      chosen.map((m) => {
        const p = m.text.find((x) => x[0] === k);
        return '<td class="txt' + (p ? '' : ' dim') + '">' + esc(p ? p[1] : '—') + '</td>';
      }).join('') + '</tr>'),
    ...fields.map((f) => {
      const best = bestOf(f);
      return '<tr><td class="txt">' + esc(f.label) +
        (f.unit ? ' <small>' + esc(f.unit) + '</small>' : '') +
        '<small class="cell__sub">' + (f.better === 'lower' ? 'lower is better' : 'higher is better') + '</small></td>' +
        chosen.map((m) => {
          const v = (m.nums.find((x) => x.key === f.key) || {}).value;
          const win = isNum(v) && best != null && v === best;
          return '<td class="num' + (win ? ' is-best' : '') + '" data-type="number">' + esc(cell(m, f)) + '</td>';
        }).join('') + '</tr>';
    }),
    '<tr><td class="txt">Source</td>' + chosen.map((m) => '<td class="txt">' +
      (m.source ? '<a href="' + attr(m.source) + '" target="_blank" rel="noopener">' + esc(host(m.source)) + '</a>' : '—') +
      '</td>').join('') + '</tr>',
  ].join('');

  const table = '<figure class="panel">' +
    '<div class="panel__head"><p class="panel__title" role="heading" aria-level="4">Side by side</p>' +
    '<span class="panel__unit">' + chosen.length + ' models</span></div>' +
    '<p class="table__caption" id="cmp-cap">Every attribute on file for the selected models. ' +
    'Units are given in each row label; the best value in each measured row is marked.</p>' +
    '<div class="table-wrap"><table class="table table--compare" aria-labelledby="cmp-cap">' +
    '<thead><tr><th scope="col">Attribute</th>' +
    chosen.map((m) => '<th scope="col">' +
      '<span class="legend__dot" style="background:' + baseHue(m.vendor || m.name) + '"></span> ' +
      esc(m.name) + (m.badges && m.badges.length
        ? ' <small>' + esc(m.badges.join(' · ')) + '</small>' : '') +
      '</th>').join('') + '</tr></thead>' +
    '<tbody>' + rowsHtml + '</tbody></table></div>' +
    '<figcaption class="panel__note">Blank cells mean the figure is not published for that model; ' +
    'they are never filled with an estimate.</figcaption></figure>';

  // charts
  const higher = fields.filter((f) => f.better === 'higher' &&
    chosen.filter((m) => isNum((m.nums.find((x) => x.key === f.key) || {}).value)).length >= 2);
  const lower = fields.filter((f) => f.better === 'lower' &&
    chosen.filter((m) => isNum((m.nums.find((x) => x.key === f.key) || {}).value)).length >= 2);

  const charts = [];
  if (higher.length >= 3) {
    charts.push({
      id: 'compare-radar', title: 'Measures where higher is better', type: 'radar',
      unit: '', xLabel: '', yLabel: '',
      series: chosen.map((m) => ({
        name: m.name,
        data: higher.map((f) => ({
          x: f.label + (f.unit ? ' (' + f.unit + ')' : ''),
          y: (m.nums.find((x) => x.key === f.key) || {}).value || 0,
        })),
      })),
      notes: 'Each axis is scaled to the largest selected value for that measure, so the shape compares the ' +
        'selected models with each other and not with the wider market. Raw values are in the table above.',
      sources: [...new Set(chosen.map((m) => m.source).filter(Boolean))].slice(0, 4),
    });
  } else if (higher.length) {
    charts.push({
      id: 'compare-bars', title: 'Measures where higher is better', type: 'bar',
      unit: higher.length === 1 ? higher[0].unit : '', xLabel: '', yLabel: '',
      series: chosen.map((m) => ({
        name: m.name,
        data: higher.map((f) => ({ x: f.label, y: (m.nums.find((x) => x.key === f.key) || {}).value })),
      })),
      notes: 'Raw published values.',
      sources: [...new Set(chosen.map((m) => m.source).filter(Boolean))].slice(0, 4),
    });
  }
  if (lower.length) {
    charts.push({
      id: 'compare-price', title: 'Measures where lower is better', type: 'bar',
      unit: lower.length === 1 ? lower[0].unit : '', xLabel: '', yLabel: '',
      series: chosen.map((m) => ({
        name: m.name,
        data: lower.map((f) => ({ x: f.label, y: (m.nums.find((x) => x.key === f.key) || {}).value })),
      })),
      notes: 'Prices and latencies as published; batch, cache and volume discounts are excluded.',
      sources: [...new Set(chosen.map((m) => m.source).filter(Boolean))].slice(0, 4),
    });
  }

  out.innerHTML = '<div class="panel-stack">' + table +
    (charts.length ? panelHtml(charts, null, {}) : '') + '</div>';
  mountCharts(out);
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
  const totalSources = Object.values(data).reduce((n, d) => n + ((d && d.sources || []).length), 0);
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
      sources: data[k] ? (data[k].sources || []).length : 0,
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
    '<div class="prose__block"><h3 class="prose__head">' + esc(title) + '</h3>' +
    body.map((p) => '<p>' + p + '</p>').join('') + '</div>';

  el.innerHTML = '<section class="section" data-perspective="methodology">' +
    '<header class="section__head">' +
    '<p class="eyebrow"><span class="eyebrow__dot"></span>Methodology · ' + published + ' of ' + files.length +
    ' files published · ' + totalSources + ' catalogued sources</p>' +
    '<h2 class="section__title">How this compendium is built</h2>' +
    '<p class="section__standfirst">Every figure on this site comes from a primary source that you can open in ' +
    'one click. Figures that could not be verified are written as undisclosed rather than estimated.</p>' +
    '<p class="section__lede">This page explains where the numbers come from, what counts as a distilled model, ' +
    'how often each stream is refreshed, and what this method cannot tell you.</p>' +
    '</header>' +

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
        wrap.querySelectorAll('.chip[data-tl-filter]').forEach((c) => { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
        applyTimelineFilter(wrap, []);
      }
      return;
    }

    const order = t.closest('[data-tl-order]');
    if (order) { redrawTimeline(order.getAttribute('data-tl-order'), order.dataset.order === 'desc'); return; }

    const cmp = t.closest('[data-compare]');
    if (cmp) { toggleCompare(cmp.getAttribute('data-compare')); return; }
  });

  document.addEventListener('keydown', (e) => {
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
  const node = pane.querySelector('[data-chart]');
  if (!node || !node.__gdChart) return;
  const spec = node.__gdChart.spec;
  reChart(node, spec, { ...(spec.opts || {}), log: mode === 'log' });
}

function sortTable(btn) {
  const th = btn.closest('th');
  const table = btn.closest('table');
  if (!th || !table) return;
  const idx = Number(btn.getAttribute('data-sort'));
  const type = btn.getAttribute('data-type');
  const cur = th.getAttribute('aria-sort');
  const dir = cur === 'ascending' ? 'descending' : 'ascending';
  table.querySelectorAll('th[aria-sort]').forEach((h) => h.setAttribute('aria-sort', 'none'));
  th.setAttribute('aria-sort', dir);
  const tbody = table.tBodies[0];
  const rows = [...tbody.rows];
  rows.sort((a, b) => {
    const av = a.cells[idx] ? a.cells[idx].getAttribute('data-v') : '';
    const bv = b.cells[idx] ? b.cells[idx].getAttribute('data-v') : '';
    let cmp;
    if (type === 'number') cmp = (Number(av) || Number.NEGATIVE_INFINITY) - (Number(bv) || Number.NEGATIVE_INFINITY);
    else cmp = String(av).localeCompare(String(bv), 'en');
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
  let shown = 0;
  fig.querySelectorAll('tbody tr').forEach((tr) => {
    const on = vals.size === 0 || vals.has(tr.getAttribute('data-fv'));
    tr.hidden = !on;
    if (on) shown += 1;
  });
  const count = document.querySelector('[data-count-for="' + tid + '"]');
  if (count) {
    const total = fig.querySelectorAll('tbody tr').length;
    count.hidden = vals.size === 0;
    count.textContent = 'Showing ' + shown + ' of ' + total + ' rows.';
  }
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

function toggleTlFilter(chip) {
  const on = chip.getAttribute('aria-pressed') === 'true';
  chip.setAttribute('aria-pressed', String(!on));
  chip.classList.toggle('is-active', !on);
  const tid = chip.getAttribute('data-tl-filter');
  const wrap = document.getElementById(tid);
  if (wrap) applyTimelineFilter(wrap, [...wrap.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.getAttribute('data-value')));
}

function toggleCompare(name) {
  const sel = COMPARE_STATE.selected.slice();
  const i = sel.indexOf(name);
  if (i >= 0) sel.splice(i, 1);
  else if (sel.length < 4) sel.push(name);
  COMPARE_STATE.selected = sel;
  lsSet(sel);
  disposeCharts();
  drawCompare();
}
