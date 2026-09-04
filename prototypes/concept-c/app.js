/* Global Distillation — Concept C "Scientific instrument"
   Data, charts, table, library, timeline, palette, hero scene.
   All figures are illustrative placeholders (see footer). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Design tokens read from CSS so JS and CSS never disagree            */
const T = {
  ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), ink4: css('--ink-4'),
  line: css('--line'), lineStrong: css('--line-strong'), panel: css('--panel'),
  accent: css('--accent'), mono: css('--mono'), sans: css('--sans'),
};

/* Vendors: fixed categorical order (never cycled, never re-ranked) */
const VENDORS = [
  { id: 'openai',    name: 'OpenAI',    color: css('--c1') },
  { id: 'deepseek',  name: 'DeepSeek',  color: css('--c2') },
  { id: 'google',    name: 'Google',    color: css('--c3') },
  { id: 'anthropic', name: 'Anthropic', color: css('--c4') },
  { id: 'meta',      name: 'Meta',      color: css('--c5') },
  { id: 'alibaba',   name: 'Alibaba',   color: css('--c6') },
];
const V = Object.fromEntries(VENDORS.map(v => [v.id, v]));

/* ------------------------------------------------------------------ */
/* Model dataset (illustrative)                                        */
/* price: USD per 1M tokens; gpqa: GPQA Diamond %; teacher: id of the model it was distilled from */
const MODELS = [
  { id: 'gpt-4o',        name: 'GPT-4o',                        vendor: 'openai',    tier: 'frontier',  params: 'undisclosed', paramsN: null, inp: 2.50, out: 10.00, gpqa: 53.6, released: '2024-05-13' },
  { id: 'gpt-4o-mini',   name: 'GPT-4o mini',                   vendor: 'openai',    tier: 'distilled', params: 'undisclosed', paramsN: null, inp: 0.15, out: 0.60,  gpqa: 40.2, released: '2024-07-18', teacher: 'gpt-4o' },
  { id: 'gpt-5',         name: 'GPT-5',                         vendor: 'openai',    tier: 'frontier',  params: 'undisclosed', paramsN: null, inp: 1.25, out: 10.00, gpqa: 85.7, released: '2025-08-07' },
  { id: 'gpt-5-nano',    name: 'GPT-5 nano',                    vendor: 'openai',    tier: 'distilled', params: 'undisclosed', paramsN: null, inp: 0.05, out: 0.40,  gpqa: 71.2, released: '2025-08-07', teacher: 'gpt-5' },
  { id: 'r1',            name: 'DeepSeek-R1',                   vendor: 'deepseek',  tier: 'frontier',  params: '671B (37B active)', paramsN: 671, inp: 0.55, out: 2.19, gpqa: 71.5, released: '2025-01-20' },
  { id: 'r1-qwen-32b',   name: 'R1-Distill-Qwen-32B',           vendor: 'deepseek',  tier: 'distilled', params: '32B', paramsN: 32,  inp: 0.12, out: 0.18,  gpqa: 62.1, released: '2025-01-20', teacher: 'r1' },
  { id: 'r1-llama-70b',  name: 'R1-Distill-Llama-70B',          vendor: 'deepseek',  tier: 'distilled', params: '70B', paramsN: 70,  inp: 0.23, out: 0.69,  gpqa: 65.2, released: '2025-01-20', teacher: 'r1' },
  { id: 'gemini-pro',    name: 'Gemini 2.5 Pro',                vendor: 'google',    tier: 'frontier',  params: 'undisclosed', paramsN: null, inp: 1.25, out: 10.00, gpqa: 84.0, released: '2025-03-25' },
  { id: 'gemini-flash',  name: 'Gemini 2.5 Flash',              vendor: 'google',    tier: 'distilled', params: 'undisclosed', paramsN: null, inp: 0.30, out: 2.50,  gpqa: 78.3, released: '2025-04-17', teacher: 'gemini-pro' },
  { id: 'gemini-lite',   name: 'Gemini 2.5 Flash-Lite',         vendor: 'google',    tier: 'distilled', params: 'undisclosed', paramsN: null, inp: 0.10, out: 0.40,  gpqa: 64.6, released: '2025-06-17', teacher: 'gemini-pro' },
  { id: 'sonnet-45',     name: 'Claude Sonnet 4.5',             vendor: 'anthropic', tier: 'frontier',  params: 'undisclosed', paramsN: null, inp: 3.00, out: 15.00, gpqa: 83.4, released: '2025-09-29' },
  { id: 'haiku-45',      name: 'Claude Haiku 4.5',              vendor: 'anthropic', tier: 'small',     params: 'undisclosed', paramsN: null, inp: 1.00, out: 5.00,  gpqa: 73.0, released: '2025-10-15', teacher: 'sonnet-45' },
  { id: 'maverick',      name: 'Llama 4 Maverick',              vendor: 'meta',      tier: 'frontier',  params: '400B (17B active)', paramsN: 400, inp: 0.27, out: 0.85, gpqa: 69.8, released: '2025-04-05' },
  { id: 'llama-32-3b',   name: 'Llama 3.2 3B',                  vendor: 'meta',      tier: 'distilled', params: '3B', paramsN: 3,    inp: 0.06, out: 0.06,  gpqa: 32.8, released: '2024-09-25', teacher: 'maverick' },
  { id: 'qwen3-235b',    name: 'Qwen3-235B-A22B',               vendor: 'alibaba',   tier: 'frontier',  params: '235B (22B active)', paramsN: 235, inp: 0.20, out: 0.60, gpqa: 71.1, released: '2025-04-29' },
  { id: 'qwen3-8b',      name: 'Qwen3-8B',                      vendor: 'alibaba',   tier: 'distilled', params: '8B', paramsN: 8,    inp: 0.035, out: 0.138, gpqa: 59.6, released: '2025-04-29', teacher: 'qwen3-235b' },
];
const M = Object.fromEntries(MODELS.map(m => [m.id, m]));
MODELS.forEach(m => { m.retention = m.teacher ? m.gpqa / M[m.teacher].gpqa : null; });

/* Small-tier output price over time, USD per 1M output tokens (illustrative) */
const PRICE_SERIES = {
  openai:    [['2023-03-01', 2.00], ['2024-01-25', 1.50], ['2024-07-18', 0.60], ['2025-04-14', 0.40], ['2025-08-07', 0.40], ['2026-09-01', 0.40]],
  deepseek:  [['2024-05-06', 0.28], ['2024-12-26', 0.28], ['2025-01-20', 0.18], ['2025-09-05', 0.20], ['2026-09-01', 0.20]],
  google:    [['2024-05-14', 1.05], ['2024-08-08', 0.30], ['2025-02-05', 0.40], ['2025-06-17', 0.40], ['2026-09-01', 0.40]],
  anthropic: [['2024-03-04', 1.25], ['2024-11-04', 4.00], ['2025-10-15', 5.00], ['2026-09-01', 5.00]],
  meta:      [['2024-04-18', 0.20], ['2024-07-23', 0.18], ['2024-09-25', 0.06], ['2025-04-05', 0.06], ['2026-09-01', 0.06]],
  alibaba:   [['2024-06-06', 0.10], ['2024-09-19', 0.10], ['2025-04-29', 0.138], ['2026-09-01', 0.138]],
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
const fmtUSD = (v) => v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(v < 0.1 ? 3 : 2)}`;
const fmtPct = (v) => `${Math.round(v * 100)}%`;
const fmtDate = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { year: 'numeric', month: 'short', timeZone: 'UTC' });
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tierLabel = { frontier: 'Frontier', distilled: 'Distilled', small: 'Small tier' };

/* ------------------------------------------------------------------ */
/* KPI tiles                                                           */
const KPIS = [
  { label: 'Frontier ÷ small-tier output price, median of six vendors', value: '16.7', unit: '×', delta: { dir: 'up', text: '+2.1× vs Q2' }, src: 'Vendor pricing pages, 2026-09-01' },
  { label: 'GPQA Diamond retention, median distilled student', value: '87', unit: '%', delta: { dir: 'up', text: '+4 pts YoY' }, src: 'Model cards; student ÷ teacher' },
  { label: 'DeepSeek-R1-Distill family, cumulative downloads', value: '97.8', unit: 'M', delta: { dir: 'up', text: '+2.23M in 30 d' }, src: 'Hugging Face Hub API' },
  { label: 'GPU-hours: RL ÷ on-policy distillation, Qwen3-8B', value: '10', unit: '×', delta: { dir: 'flat', text: '17,920 vs 1,800 h' }, src: 'Qwen3 technical report, Table 21' },
  { label: 'Major labs whose terms restrict output-based training', value: '5', unit: ' / 6', delta: { dir: 'flat', text: 'unchanged since 2025' }, src: 'Terms-of-service review' },
  { label: 'Fraudulent accounts in the largest disclosed extraction campaign', value: '24,000', unit: '', delta: { dir: 'down', text: '16M exchanges' }, src: 'Anthropic report, Feb 2026' },
];
const ARROW = {
  up: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l3-3 3 3"/></svg>',
  down: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3l3 3 3-3"/></svg>',
  flat: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 5h6"/></svg>',
};
function renderKPIs() {
  $('#kpis').innerHTML = KPIS.map(k => `
    <div class="kpi">
      <div class="kpi__label">${esc(k.label)}</div>
      <div class="kpi__value">${esc(k.value)}<small>${esc(k.unit)}</small></div>
      <span class="kpi__delta kpi__delta--${k.delta.dir === 'up' ? 'good' : k.delta.dir === 'down' ? 'bad' : 'flat'}">${ARROW[k.delta.dir]}${esc(k.delta.text)}</span>
      <div class="kpi__src">${esc(k.src)}</div>
    </div>`).join('');
}

/* ------------------------------------------------------------------ */
/* Vendor chip rows (shared by chart and table)                        */
function chipRow(container, onChange) {
  const state = { active: new Set(VENDORS.map(v => v.id)) };
  const render = () => {
    const all = state.active.size === VENDORS.length;
    container.innerHTML = `<button class="chip chip--all" type="button" aria-pressed="${all}">All vendors</button>` +
      VENDORS.map(v => `<button class="chip" type="button" data-v="${v.id}" aria-pressed="${state.active.has(v.id)}" style="--dot:${v.color}"><i></i>${v.name}</button>`).join('');
  };
  container.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (b.classList.contains('chip--all')) state.active = new Set(VENDORS.map(v => v.id));
    else {
      const id = b.dataset.v;
      const all = state.active.size === VENDORS.length;
      if (all) state.active = new Set([id]);                 // first click isolates
      else if (state.active.has(id)) { state.active.delete(id); if (!state.active.size) state.active = new Set(VENDORS.map(v => v.id)); }
      else state.active.add(id);
    }
    render(); onChange(state.active);
  });
  render();
  return state;
}

/* ------------------------------------------------------------------ */
/* ECharts theme + charts                                              */
const chartEl = $('#chart');
let chart = null;
const chartState = { type: 'bar', scale: 'log', vendors: new Set(VENDORS.map(v => v.id)) };

function registerTheme() {
  echarts.registerTheme('gd', {
    color: VENDORS.map(v => v.color),
    backgroundColor: 'transparent',
    textStyle: { fontFamily: T.sans, color: T.ink2 },
    title: { textStyle: { color: T.ink } },
    legend: { textStyle: { color: T.ink2 } },
    tooltip: {
      backgroundColor: '#fff', borderColor: T.line, borderWidth: 1, padding: [8, 10],
      textStyle: { color: T.ink, fontFamily: T.sans, fontSize: 12 },
      extraCssText: 'box-shadow:0 8px 24px rgba(15,26,43,.12);border-radius:6px;',
    },
    categoryAxis: axisTheme(), valueAxis: axisTheme(), logAxis: axisTheme(), timeAxis: axisTheme(),
  });
}
function axisTheme() {
  return {
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { color: T.ink3, fontFamily: T.mono, fontSize: 11 },
    splitLine: { show: true, lineStyle: { color: T.line, width: 1 } },
    nameTextStyle: { color: T.ink3, fontFamily: T.mono, fontSize: 11 },
  };
}
const yUnit = (v) => v >= 1 ? `$${v}` : `$${v}`;
const activeVendors = () => VENDORS.filter(v => chartState.vendors.has(v.id));

const CHART_META = {
  bar: {
    heading: 'Output price, frontier model vs. its distilled or small tier',
    unit: 'USD per 1M output tokens',
    note: '<b>Method.</b> Each pair is the vendor’s current flagship and the smallest tier it publicly describes as distilled or derived from it. Open-weight models use the median hosted rate across three inference providers. Log scale by default: ratios, not differences, are the point.',
    sources: '<b>Sources.</b><ol><li>OpenAI, Google, Anthropic API pricing pages, snapshot 2026-09-01.</li><li>DeepSeek-R1 technical report; hosted rates via Together, Fireworks, DeepInfra.</li><li>Meta Llama 4 and Qwen3 model cards.</li></ol>',
  },
  line: {
    heading: 'Cheapest small-tier output price by vendor, 2023 – 2026',
    unit: 'USD per 1M output tokens',
    note: '<b>Method.</b> The lowest list price for a general-purpose small model at each date; step changes are new model launches or repricings. Anthropic’s series rises because each Haiku generation has been repositioned upward. Hosted medians are used for open weights.',
    sources: '<b>Sources.</b><ol><li>Archived pricing pages (Wayback Machine), monthly snapshots.</li><li>Vendor launch announcements for release dates.</li><li>OpenRouter price history for open-weight models.</li></ol>',
  },
  scatter: {
    heading: 'Output price vs. GPQA Diamond score, 16 models',
    unit: 'x: USD per 1M output tokens · y: GPQA Diamond, %',
    note: '<b>Method.</b> Filled markers are distilled or small tiers; hollow markers are frontier teachers. GPQA Diamond is self-reported by the vendor, pass@1 without tools where the report distinguishes. The efficient frontier runs from lower-left to upper-right; points below it are dominated.',
    sources: '<b>Sources.</b><ol><li>Model cards and technical reports for benchmark scores.</li><li>Pricing as in Fig. 1a.</li><li>Rein et al. (2023), GPQA: a graduate-level Google-proof Q&amp;A benchmark.</li></ol>',
  },
};

function baseOption() {
  return {
    animationDuration: reduceMotion ? 0 : 400,
    animationDurationUpdate: reduceMotion ? 0 : 300,
    grid: { left: 56, right: 24, top: 44, bottom: 40, containLabel: false },
    legend: {
      top: 4, left: 0, itemWidth: 10, itemHeight: 10, itemGap: 18, icon: 'circle',
      textStyle: { fontSize: 12, color: T.ink2, fontFamily: T.sans }, selectedMode: false,
    },
  };
}

function priceAxis(extra = {}) {
  const log = chartState.scale === 'log';
  return Object.assign({
    type: log ? 'log' : 'value', logBase: 10,
    min: log ? 0.01 : 0, max: log ? 100 : undefined,
    axisLabel: { formatter: (v) => v >= 1 ? `$${v}` : `$${v}`, fontFamily: T.mono, fontSize: 11, color: T.ink3 },
    splitLine: { lineStyle: { color: T.line } },
    minorSplitLine: { show: false },
  }, extra);
}

function barOption() {
  const pairs = activeVendors().map(v => {
    const t = MODELS.find(m => m.vendor === v.id && m.tier === 'frontier');
    const s = MODELS.filter(m => m.vendor === v.id && m.teacher === t.id).sort((a, b) => a.out - b.out)[0];
    return { v, t, s };
  });
  return Object.assign(baseOption(), {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,26,43,0.04)' } },
      formatter: (ps) => {
        const p = pairs[ps[0].dataIndex];
        return `<div style="font-family:${T.mono};font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:${T.ink3};margin-bottom:6px">${p.v.name}</div>
          <div style="display:flex;justify-content:space-between;gap:18px"><span>${esc(p.t.name)}</span><b>${fmtUSD(p.t.out)}</b></div>
          <div style="display:flex;justify-content:space-between;gap:18px"><span>${esc(p.s.name)}</span><b>${fmtUSD(p.s.out)}</b></div>
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid ${T.line};color:${T.ink3}">Ratio <b style="color:${T.ink}">${(p.t.out / p.s.out).toFixed(1)}×</b></div>`;
      } },
    xAxis: { type: 'category', data: pairs.map(p => p.v.name), axisLabel: { color: T.ink2, fontFamily: T.sans, fontSize: 12, interval: 0 }, splitLine: { show: false } },
    yAxis: priceAxis(),
    series: [
      { name: 'Frontier teacher', type: 'bar', barGap: '12%', barCategoryGap: '42%', data: pairs.map(p => p.t.out),
        itemStyle: { color: T.lineStrong, borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'top', formatter: (d) => fmtUSD(d.value), color: T.ink3, fontFamily: T.mono, fontSize: 10.5 } },
      { name: 'Distilled / small tier', type: 'bar', data: pairs.map(p => ({ value: p.s.out, itemStyle: { color: p.v.color } })),
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'top', formatter: (d) => fmtUSD(d.value), color: T.ink2, fontFamily: T.mono, fontSize: 10.5 } },
    ],
    legend: Object.assign(baseOption().legend, { data: [{ name: 'Frontier teacher', itemStyle: { color: T.lineStrong } }, { name: 'Distilled / small tier', itemStyle: { color: T.ink } }] }),
  });
}

function lineOption() {
  const vs = activeVendors();
  return Object.assign(baseOption(), {
    grid: { left: 56, right: 96, top: 44, bottom: 40 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.lineStrong, type: 'solid' }, label: { show: false } },
      formatter: (ps) => {
        const d = new Date(ps[0].value[0]);
        const head = `<div style="font-family:${T.mono};font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:${T.ink3};margin-bottom:6px">${d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</div>`;
        return head + ps.sort((a, b) => b.value[1] - a.value[1]).map(p => `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between"><span style="display:inline-flex;align-items:center;gap:7px"><i style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></i>${p.seriesName}</span><b>${fmtUSD(p.value[1])}</b></div>`).join('');
      } },
    xAxis: { type: 'time', min: '2023-01-01', max: '2026-10-01', splitLine: { show: false }, axisLabel: { formatter: '{yyyy}', fontFamily: T.mono, color: T.ink3, fontSize: 11 }, splitNumber: 4 },
    yAxis: priceAxis({ min: chartState.scale === 'log' ? 0.03 : 0, max: chartState.scale === 'log' ? 10 : undefined }),
    series: vs.map(v => ({
      name: v.name, type: 'line', step: 'end', data: PRICE_SERIES[v.id], showSymbol: false, symbolSize: 8,
      lineStyle: { width: 2, color: v.color }, itemStyle: { color: v.color, borderColor: '#fff', borderWidth: 2 },
      emphasis: { focus: 'series', lineStyle: { width: 2.5 } },
      endLabel: { show: true, formatter: (p) => p.seriesName, color: T.ink2, fontSize: 11, fontFamily: T.sans, offset: [6, 0] },
      labelLayout: { moveOverlap: 'shiftY' },
    })),
    legend: Object.assign(baseOption().legend, { data: vs.map(v => v.name) }),
  });
}

function scatterOption() {
  const vs = activeVendors();
  const labelled = new Set(['gpt-4o-mini', 'r1-qwen-32b', 'gemini-lite', 'gpt-5', 'sonnet-45', 'llama-32-3b', 'gemini-pro']);
  return Object.assign(baseOption(), {
    grid: { left: 56, right: 28, top: 44, bottom: 44 },
    tooltip: { trigger: 'item', formatter: (p) => {
      const m = p.data.m;
      return `<div style="font-family:${T.mono};font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:${T.ink3};margin-bottom:4px">${V[m.vendor].name} · ${tierLabel[m.tier]}</div><b>${esc(m.name)}</b>
        <div style="margin-top:6px;display:grid;grid-template-columns:auto auto;gap:2px 16px;color:${T.ink2}"><span>Output</span><b style="text-align:right;color:${T.ink}">${fmtUSD(m.out)} / 1M</b><span>GPQA Diamond</span><b style="text-align:right;color:${T.ink}">${m.gpqa}%</b>${m.retention ? `<span>Retention</span><b style="text-align:right;color:${T.ink}">${fmtPct(m.retention)}</b>` : ''}</div>`;
    } },
    xAxis: priceAxis({ name: 'Output price, USD per 1M tokens (log)', nameLocation: 'middle', nameGap: 28, min: chartState.scale === 'log' ? 0.03 : 0, max: chartState.scale === 'log' ? 30 : undefined, splitLine: { show: false } }),
    yAxis: { type: 'value', min: 20, max: 100, name: 'GPQA Diamond, %', nameLocation: 'end', nameGap: 12, axisLabel: { formatter: '{value}', fontFamily: T.mono, fontSize: 11, color: T.ink3 }, splitLine: { lineStyle: { color: T.line } } },
    series: vs.map(v => ({
      name: v.name, type: 'scatter', symbolSize: 11,
      data: MODELS.filter(m => m.vendor === v.id).map(m => ({
        value: [m.out, m.gpqa], m,
        symbol: 'circle',
        itemStyle: m.tier === 'frontier'
          ? { color: '#fff', borderColor: v.color, borderWidth: 2 }
          : { color: v.color, borderColor: '#fff', borderWidth: 2 },
        label: { show: labelled.has(m.id), formatter: m.name, position: m.id === 'gpt-5' ? 'left' : m.id === 'gemini-pro' ? 'top' : 'right', color: T.ink2, fontSize: 11, fontFamily: T.sans, distance: 8 },
      })),
      emphasis: { scale: 1.4 },
      labelLayout: { hideOverlap: true },
    })),
    legend: Object.assign(baseOption().legend, { data: vs.map(v => v.name) }),
  });
}

function renderChart() {
  if (!chart) { chart = echarts.init(chartEl, 'gd', { renderer: 'canvas' }); }
  const opt = { bar: barOption, line: lineOption, scatter: scatterOption }[chartState.type]();
  chart.setOption(opt, { notMerge: true });
  const meta = CHART_META[chartState.type];
  $('#chart-heading').textContent = meta.heading;
  $('#chart-unit').textContent = meta.unit;
  $('#chart-note').innerHTML = meta.note;
  $('#chart-sources').innerHTML = meta.sources;
}

function initChartPanel() {
  registerTheme();
  $('#chart-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#chart-tabs button').forEach(x => x.setAttribute('aria-pressed', x === b));
    chartState.type = b.dataset.chart; renderChart();
  });
  $('#scale-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#scale-toggle button').forEach(x => x.setAttribute('aria-pressed', x === b));
    chartState.scale = b.dataset.scale; renderChart();
  });
  chipRow($('#vendor-chips'), (set) => { chartState.vendors = set; renderChart(); });
  renderChart();
  new ResizeObserver(() => chart && chart.resize()).observe(chartEl);
}

/* ------------------------------------------------------------------ */
/* Comparison table                                                    */
const COLS = [
  { key: 'name', label: 'Model', sort: (m) => m.name.toLowerCase() },
  { key: 'vendor', label: 'Vendor', sort: (m) => VENDORS.findIndex(v => v.id === m.vendor) },
  { key: 'tier', label: 'Tier', sort: (m) => ({ frontier: 0, distilled: 1, small: 2 })[m.tier] },
  { key: 'params', label: 'Parameters', sort: (m) => m.paramsN ?? -1, num: true },
  { key: 'inp', label: 'Input $/1M', sort: (m) => m.inp, num: true },
  { key: 'out', label: 'Output $/1M', sort: (m) => m.out, num: true },
  { key: 'gpqa', label: 'GPQA Diamond', sort: (m) => m.gpqa, num: true },
  { key: 'retention', label: 'Retention', sort: (m) => m.retention ?? -1, num: true },
  { key: 'released', label: 'Released', sort: (m) => m.released },
];
const tableState = { sort: 'out', dir: 'desc', vendors: new Set(VENDORS.map(v => v.id)), distilledOnly: false };

function cell(m, c) {
  switch (c.key) {
    case 'name': return `<span class="model">${esc(m.name)}</span>${m.teacher ? `<span class="teacher">from ${esc(M[m.teacher].name)}</span>` : ''}`;
    case 'vendor': return `<span class="vendor"><i style="background:${V[m.vendor].color}"></i>${V[m.vendor].name}</span>`;
    case 'tier': return `<span class="tier${m.tier !== 'frontier' ? ' tier--distilled' : ''}">${tierLabel[m.tier]}</span>`;
    case 'params': return `<span class="num${m.paramsN ? '' : ' muted'}">${esc(m.params)}</span>`;
    case 'inp': return `<span class="num">${fmtUSD(m.inp)}</span>`;
    case 'out': return `<span class="num">${fmtUSD(m.out)}</span>`;
    case 'gpqa': return `<span class="num">${m.gpqa.toFixed(1)}%</span>`;
    case 'retention': return m.retention
      ? `<span class="bar-cell"><i style="--w:${Math.round(m.retention * 56)}px;background:${V[m.vendor].color}"></i><span class="num">${fmtPct(m.retention)}</span></span>`
      : `<span class="muted">teacher</span>`;
    case 'released': return `<span class="num">${fmtDate(m.released)}</span>`;
  }
}

function renderTable() {
  const head = $('#cmp-head');
  head.innerHTML = COLS.map(c => `<th scope="col" data-key="${c.key}" class="${c.num ? 'num' : ''}" aria-sort="${tableState.sort === c.key ? (tableState.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${c.label}<span class="sort"></span></th>`).join('');
  let rows = MODELS.filter(m => tableState.vendors.has(m.vendor) && (!tableState.distilledOnly || m.tier !== 'frontier'));
  const c = COLS.find(x => x.key === tableState.sort);
  rows.sort((a, b) => { const x = c.sort(a), y = c.sort(b); return (x < y ? -1 : x > y ? 1 : 0) * (tableState.dir === 'asc' ? 1 : -1); });
  $('#cmp-body').innerHTML = rows.map(m => `<tr>${COLS.map(col => `<td class="${col.num ? 'num' : ''}">${cell(m, col)}</td>`).join('')}</tr>`).join('');
  $('#table-count').textContent = `${rows.length} of ${MODELS.length} models`;
}

function initTable() {
  $('#cmp-head').addEventListener('click', (e) => {
    const th = e.target.closest('th'); if (!th) return;
    const key = th.dataset.key;
    if (tableState.sort === key) tableState.dir = tableState.dir === 'asc' ? 'desc' : 'asc';
    else { tableState.sort = key; tableState.dir = COLS.find(c => c.key === key).num ? 'desc' : 'asc'; }
    renderTable();
  });
  chipRow($('#table-chips'), (set) => { tableState.vendors = set; renderTable(); });
  $('#toggle-distilled').addEventListener('click', (e) => {
    tableState.distilledOnly = !tableState.distilledOnly;
    e.currentTarget.setAttribute('aria-pressed', tableState.distilledOnly);
    renderTable();
  });
  renderTable();
}

/* ------------------------------------------------------------------ */
/* Library of methods                                                  */
const FAMILY = {
  response: { name: 'Response-based', color: css('--c1') },
  feature:  { name: 'Feature-based',  color: css('--c3') },
  data:     { name: 'Data-based',     color: css('--c2') },
  policy:   { name: 'On-policy',      color: css('--c5') },
  struct:   { name: 'Structural',     color: css('--c4') },
};
const METHODS = [
  { id: 'soft', family: 'response', title: 'Soft-target distillation', alias: 'Hinton et al., 2015', difficulty: 2, access: 'Logits', cost: 'Low',
    desc: 'Train the student to match the teacher’s temperature-softened output distribution, not just the hard label.',
    tex: String.raw`\mathcal{L} = (1-\alpha)\,\mathrm{CE}\big(y,\sigma(z_s)\big) + \alpha\,T^{2}\,\mathrm{KL}\Big(\sigma\big(\tfrac{z_t}{T}\big)\,\big\|\,\sigma\big(\tfrac{z_s}{T}\big)\Big)`,
    legend: 'z: logits of student (s) and teacher (t); T: temperature; α: mixing weight; σ: softmax.',
    when: 'Same tokenizer and label space; you can call the teacher on every training example.',
    pros: ['Cheapest signal per example', 'Well understood; stable', 'Works for classification and next-token prediction'],
    cons: ['Needs teacher logits, which closed APIs rarely expose', 'Capacity gap: very small students under-fit sharp teachers', 'Vocabulary mismatch requires alignment'],
    paper: { label: 'Distilling the Knowledge in a Neural Network', href: 'https://arxiv.org/abs/1503.02531' } },
  { id: 'hint', family: 'feature', title: 'Hint / feature distillation', alias: 'FitNets, Romero et al., 2015', difficulty: 3, access: 'Hidden states', cost: 'Low',
    desc: 'Regress intermediate student activations onto a projection of the teacher’s, layer by layer, before or alongside the output loss.',
    tex: String.raw`\mathcal{L}_{\text{hint}} = \tfrac{1}{2}\,\big\lVert\, W_r\, f_s(x) - f_t(x) \,\big\rVert_2^{2}`,
    legend: 'f: hidden representation at a chosen layer; W_r: learned regressor mapping student width to teacher width.',
    when: 'Open-weight teacher, student narrower but comparably deep; you want stronger transfer than logits alone.',
    pros: ['Richer signal than outputs alone', 'Helps thin, deep students train at all', 'Composes with soft targets'],
    cons: ['Requires white-box teacher access', 'Layer-matching is a design choice with no default', 'Projection heads add parameters at train time'],
    paper: { label: 'FitNets: Hints for Thin Deep Nets', href: 'https://arxiv.org/abs/1412.6550' } },
  { id: 'seq', family: 'data', title: 'Sequence-level KD', alias: 'Kim & Rush, 2016', difficulty: 2, access: 'Text only', cost: 'Medium',
    desc: 'Generate the teacher’s best output for each input and train the student on it with ordinary maximum likelihood.',
    tex: String.raw`\mathcal{L}_{\text{seq}} = -\sum_{x\in\mathcal{D}} \log p_s\big(\hat{y}\mid x\big),\qquad \hat{y} = \operatorname*{arg\,max}_{y}\, p_t(y\mid x)`,
    legend: 'p_s, p_t: student and teacher sequence distributions; ŷ: teacher’s (beam-)decoded output.',
    when: 'Teacher is an API; the task has one good answer per prompt (translation, extraction, structured output).',
    pros: ['Needs only generated text', 'Trivially parallel data generation', 'Same pipeline as supervised fine-tuning'],
    cons: ['Student never sees teacher uncertainty', 'Mode-seeking: loses output diversity', 'Terms of service may forbid the data'],
    paper: { label: 'Sequence-Level Knowledge Distillation', href: 'https://arxiv.org/abs/1606.07947' } },
  { id: 'trace', family: 'data', title: 'Reasoning-trace SFT', alias: 'DeepSeek-R1-Distill, s1, 2025', difficulty: 2, access: 'Text only', cost: 'Medium',
    desc: 'Sample long chain-of-thought solutions from a reasoning teacher, filter for correctness, and fine-tune the student on the traces.',
    tex: String.raw`\mathcal{L}_{\text{trace}} = -\sum_{(x,\,r)\sim\mathcal{D}_t}\ \sum_{k=1}^{|r|} \log p_s\big(r_k \mid x,\, r_{<k}\big),\qquad r \sim p_t(\cdot\mid x),\ \text{verified}`,
    legend: 'r: a reasoning trace plus final answer sampled from the teacher and kept only if the answer verifies.',
    when: 'Math, code and science tasks with a checkable answer; you want most of a reasoning model’s gains at 1/10 the size.',
    pros: ['R1-Distill-Qwen-32B keeps ~91% of AIME 2024', 's1 reached o1-preview level with 1,000 traces', 'Open datasets exist (OpenThoughts3)'],
    cons: ['Traces are long, so tokens are expensive', 'Verifier needed; unverifiable domains lag', 'The central subject of the 2025 ToS disputes'],
    paper: { label: 'DeepSeek-R1: Incentivizing Reasoning Capability via RL', href: 'https://arxiv.org/abs/2501.12948' } },
  { id: 'gkd', family: 'policy', title: 'On-policy distillation', alias: 'GKD, Agarwal et al., 2023; Qwen3', difficulty: 4, access: 'Token logprobs', cost: 'High',
    desc: 'The student samples its own outputs; the teacher scores every token. Minimises a divergence on the student’s distribution rather than the teacher’s.',
    tex: String.raw`\mathcal{L}_{\text{GKD}} = \mathbb{E}_{x\sim\mathcal{D}}\ \mathbb{E}_{y\sim p_s(\cdot\mid x)}\ \sum_{k}\ \mathcal{D}^{(\beta)}_{\text{JSD}}\Big(p_t(\cdot\mid x, y_{<k})\ \big\|\ p_s(\cdot\mid x, y_{<k})\Big)`,
    legend: 'Generalised Jensen–Shannon divergence with interpolation β; expectation over student samples fixes exposure bias.',
    when: 'You control both models; the student will be used autoregressively; RL is too expensive.',
    pros: ['Fixes train/inference mismatch', 'Qwen3-8B: ~1/10 the GPU-hours of RL, higher AIME', 'Dense per-token reward'],
    cons: ['Teacher forward pass on every student token', 'Requires logprob access to the teacher', 'Sensitive to β and sampling temperature'],
    paper: { label: 'On-Policy Distillation of Language Models', href: 'https://arxiv.org/abs/2306.13649' } },
  { id: 'prune', family: 'struct', title: 'Prune-and-distill', alias: 'Minitron, Muralidharan et al., 2024', difficulty: 5, access: 'Full weights', cost: 'Medium',
    desc: 'Score and remove heads, neurons and layers of the teacher by activation importance, then heal the pruned network with distillation.',
    tex: String.raw`I_h = \sum_{x\in\mathcal{C}} \big\lVert \mathrm{Attn}_h(x)\big\rVert_2,\qquad \mathcal{L} = \mathrm{KL}\big(p_t \,\|\, p_{s}\big) + \lambda \sum_{l}\big\lVert h^{(l)}_t - h^{(l)}_s \big\rVert_2^{2}`,
    legend: 'I_h: importance of attention head h on a calibration set C; the student is the pruned teacher, re-trained on logit and hidden-state losses.',
    when: 'You own the weights and want a 2–4× smaller sibling of the same family for a small fraction of pre-training tokens.',
    pros: ['Llama-3.1-Minitron 4B used 94B tokens vs 15T', 'Preserves architecture and tokenizer', 'Retains most of the pre-training knowledge'],
    cons: ['Only works from open weights', 'Pruning ratios need per-axis search', 'Healing still needs multi-node compute'],
    paper: { label: 'Compact Language Models via Pruning and Knowledge Distillation', href: 'https://arxiv.org/abs/2407.14679' } },
];

function dots(n) { return `<span class="dots" aria-label="Difficulty ${n} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}<span>${n}/5</span></span>`; }

function renderLibrary() {
  $('#library-grid').innerHTML = METHODS.map(m => `
    <button class="method" type="button" data-method="${m.id}" aria-haspopup="dialog">
      <div class="method__top"><span class="family" style="--fc:${FAMILY[m.family].color}"><i></i>${FAMILY[m.family].name}</span>${dots(m.difficulty)}</div>
      <h3>${esc(m.title)}<small>${esc(m.alias)}</small></h3>
      <p>${m.desc}</p>
      <div class="method__meta"><span>Access <b>${m.access}</b></span><span>Cost <b>${m.cost}</b></span><span class="method__cta">Method note →</span></div>
    </button>`).join('');
}

const drawer = $('#drawer');
function openMethod(id) {
  const m = METHODS.find(x => x.id === id); if (!m) return;
  $('#drawer-eyebrow').textContent = `Method note · ${FAMILY[m.family].name}`;
  $('#drawer-body').innerHTML = `
    <div>
      <h2 id="drawer-title">${esc(m.title)}</h2>
      <div class="drawer__paper">${esc(m.alias)} · <a href="${m.paper.href}" rel="noopener" target="_blank">${esc(m.paper.label)}</a></div>
    </div>
    <div class="formula"><div class="eyebrow formula__label">Canonical objective</div><div id="formula-tex"></div></div>
    <p class="small muted">${esc(m.legend)}</p>
    <div class="facts">
      <div><span class="eyebrow">Teacher access</span><b>${m.access}</b></div>
      <div><span class="eyebrow">Relative cost</span><b>${m.cost}</b></div>
      <div><span class="eyebrow">Difficulty</span><b>${dots(m.difficulty)}</b></div>
      <div><span class="eyebrow">Family</span><b>${FAMILY[m.family].name}</b></div>
    </div>
    <div><div class="eyebrow">When to use it</div><p style="margin-top:6px">${esc(m.when)}</p></div>
    <div class="pc">
      <div><div class="eyebrow">Strengths</div><ul>${m.pros.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      <div><div class="eyebrow">Limits</div><ul>${m.cons.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
    </div>`;
  katex.render(m.tex, $('#formula-tex'), { displayMode: true, throwOnError: false });
  drawer.showModal();
  $('#drawer-close').focus();
}
function initLibrary() {
  renderLibrary();
  $('#library-grid').addEventListener('click', (e) => { const b = e.target.closest('.method'); if (b) openMethod(b.dataset.method); });
  $('#drawer-close').addEventListener('click', () => drawer.close());
  drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.close(); });
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
const CATS = {
  research: { name: 'Research', color: css('--c1') },
  product:  { name: 'Product',  color: css('--c3') },
  market:   { name: 'Market',   color: css('--c2') },
  policy:   { name: 'Policy',   color: css('--c4') },
  legal:    { name: 'Legal',    color: css('--c6') },
};
const EVENTS = [
  { date: '2015-03-09', cat: 'research', title: 'Hinton, Vinyals and Dean name the technique', body: '“Distilling the Knowledge in a Neural Network” formalises soft targets and temperature; the paper has 25,000+ citations.' },
  { date: '2019-10-02', cat: 'product', title: 'DistilBERT ships as a drop-in model', body: 'Hugging Face releases a 40% smaller BERT that keeps 97% of GLUE performance, the first widely deployed distilled language model.' },
  { date: '2024-07-18', cat: 'market', title: 'GPT-4o mini lists at $0.60 per 1M output tokens', body: 'OpenAI’s small tier arrives at 1/16.7 the price of GPT-4o, setting the price gap that now defines the small-model market.' },
  { date: '2024-10-01', cat: 'product', title: 'OpenAI launches Model Distillation as an API product', body: 'Stored completions, evals and fine-tuning combine into a managed distillation pipeline; Amazon Bedrock follows in December.' },
  { date: '2025-01-29', cat: 'legal', title: 'OpenAI alleges DeepSeek distilled its outputs', body: 'Nine days after DeepSeek-R1 and six openly licensed distilled students, OpenAI tells reporters it has evidence of terms-of-service violations.' },
  { date: '2025-08-02', cat: 'policy', title: 'EU AI Act obligations for general-purpose models apply', body: 'Providers of GPAI models, including downstream fine-tuners in some cases, must publish training summaries and honour copyright reservations.' },
];
function renderTimeline() {
  $('#tl-items').innerHTML = EVENTS.map(e => `
    <article class="tl__item" style="--cat:${CATS[e.cat].color}">
      <span class="tl__date">${fmtDate(e.date)}</span><span class="tl__cat">${CATS[e.cat].name}</span>
      <h3>${esc(e.title)}</h3>
      <p>${e.body}</p>
    </article>`).join('');
  $('#tl-legend').innerHTML = Object.values(CATS).map(c => `<span><i style="background:${c.color}"></i>${c.name}</span>`).join('');
}

/* ------------------------------------------------------------------ */
/* Command palette                                                     */
const palette = $('#palette');
function initPalette() {
  const items = [
    ...['overview', 'academic', 'financial', 'political', 'company', 'developer', 'customer', 'library', 'timeline'].map((id, i) => ({ label: id[0].toUpperCase() + id.slice(1), href: `#${id}`, kind: 'Perspective', idx: String(i).padStart(2, '0') })),
    ...MODELS.map(m => ({ label: m.name, href: '#compare', kind: V[m.vendor].name, idx: '·' })),
    ...METHODS.map(m => ({ label: m.title, href: `#library`, kind: 'Method', idx: '·', method: m.id })),
    ...EVENTS.map(e => ({ label: e.title, href: '#timeline', kind: fmtDate(e.date), idx: '·' })),
  ];
  const list = $('#palette-list');
  list.innerHTML = items.map((it, i) => `<li data-i="${i}"><a href="${it.href}" data-method="${it.method || ''}"><span class="idx">${it.idx}</span><span>${esc(it.label)}</span><span class="kind">${esc(it.kind)}</span></a></li>`).join('');
  const input = $('#palette-input');
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    $$('li', list).forEach(li => { li.hidden = q && !items[+li.dataset.i].label.toLowerCase().includes(q) && !items[+li.dataset.i].kind.toLowerCase().includes(q); });
  };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const a = $('li:not([hidden]) a', list); if (a) a.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); const a = $('li:not([hidden]) a', list); a && a.focus(); }
  });
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    palette.close();
    if (a.dataset.method) { e.preventDefault(); location.hash = '#library'; setTimeout(() => openMethod(a.dataset.method), 350); }
  });
  const open = () => { input.value = ''; filter(); palette.showModal(); input.focus(); };
  $('#cmd-open').addEventListener('click', open);
  $('#cmd-open-mobile').addEventListener('click', open);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.open ? palette.close() : open(); }
  });
  palette.addEventListener('click', (e) => { if (e.target === palette) palette.close(); });
}

/* ------------------------------------------------------------------ */
/* Rail + top nav active state                                         */
function initRail() {
  const targets = ['overview', 'academic', 'financial', 'political', 'company', 'developer', 'customer', 'library', 'timeline']
    .map(id => document.getElementById(id)).filter(Boolean);
  const links = [...$$('.rail a[data-rail]'), ...$$('.nav a'), ...$$('.mobile-rail a')];
  const setActive = (id) => links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
  const visible = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => visible.set(en.target.id, en.isIntersecting ? en.intersectionRatio : 0));
    const best = targets.filter(t => visible.get(t.id) > 0).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    if (best) setActive(best.id);
  }, { rootMargin: '-64px 0px -55% 0px', threshold: [0, 0.2, 0.5] });
  targets.forEach(t => io.observe(t));
  setActive('overview');
}

/* ------------------------------------------------------------------ */
/* Hero: Three.js teacher -> student particle scene                    */
async function initHero() {
  const fig = $('#hero-figure');
  const host = $('#hero-canvas');
  try {
    const THREE = await import('three');
    const W = () => fig.clientWidth, H = () => fig.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W(), H());
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W() / H(), 0.1, 100);
    camera.position.set(0, 0.2, 9.2);

    const group = new THREE.Group(); scene.add(group);
    const rnd = mulberry32(7);
    const sprite = discTexture(THREE);

    const pointsMaterial = (color, size, opacity) => new THREE.PointsMaterial({
      color, size, map: sprite, transparent: true, opacity, alphaTest: 0.05, depthWrite: false, sizeAttenuation: true,
    });
    const lineMaterial = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

    /* Node cloud: a soft-edged ball of points, plus a sparse set of edges */
    function cloud({ n, r, color, edgeColor, edges, size, opacity, edgeOpacity, cx }) {
      const pos = new Float32Array(n * 3), pts = [];
      for (let i = 0; i < n; i++) {
        const u = rnd(), v = rnd(), th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
        const rr = r * Math.cbrt(rnd()) * (0.72 + 0.28 * rnd());
        const x = rr * Math.sin(ph) * Math.cos(th), y = rr * Math.sin(ph) * Math.sin(th), z = rr * Math.cos(ph);
        pos.set([x, y, z], i * 3); pts.push(new THREE.Vector3(x, y, z));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const obj = new THREE.Group(); obj.position.x = cx;
      obj.add(new THREE.Points(g, pointsMaterial(color, size, opacity)));
      const ep = [];
      for (let k = 0; k < edges; k++) {
        const a = pts[Math.floor(rnd() * n)]; let b = null, best = 1e9;
        for (let t = 0; t < 12; t++) { const c = pts[Math.floor(rnd() * n)]; const d = a.distanceTo(c); if (d > 0.05 && d < best) { best = d; b = c; } }
        if (b) ep.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ep), 3));
      obj.add(new THREE.LineSegments(lg, lineMaterial(edgeColor, edgeOpacity)));
      /* faint shell ring, drawn as a circle in the XY plane, to read as a schematic */
      const ring = new THREE.EllipseCurve(0, 0, r * 1.06, r * 1.06, 0, 2 * Math.PI).getPoints(96);
      const rg = new THREE.BufferGeometry().setFromPoints(ring);
      const ringLine = new THREE.LineLoop(rg, lineMaterial(edgeColor, 0.35));
      obj.add(ringLine);
      obj.userData = { pts, ring: ringLine };
      return obj;
    }
    const teacher = cloud({ n: 1100, r: 1.75, color: 0x7f9bc4, edgeColor: 0x7f9bc4, edges: 420, size: 0.055, opacity: 0.85, edgeOpacity: 0.22, cx: -2.05 });
    const student = cloud({ n: 190, r: 0.72, color: 0x2563c9, edgeColor: 0x2563c9, edges: 90, size: 0.065, opacity: 0.95, edgeOpacity: 0.3, cx: 2.35 });
    group.add(teacher, student);

    /* Signal: particles travelling along bezier arcs from teacher nodes to student nodes */
    const N = 260;
    const flows = [];
    const fpos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      flows.push(newFlow(i));
    }
    function newFlow(i) {
      const a = teacher.userData.pts[Math.floor(rnd() * teacher.userData.pts.length)].clone().add(teacher.position);
      const b = student.userData.pts[Math.floor(rnd() * student.userData.pts.length)].clone().add(student.position);
      const mid = a.clone().lerp(b, 0.5); mid.y += (rnd() - 0.5) * 2.2; mid.z += (rnd() - 0.5) * 1.6;
      return { curve: new THREE.QuadraticBezierCurve3(a, mid, b), t: rnd(), speed: 0.0016 + rnd() * 0.0022, i };
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    const flowPoints = new THREE.Points(fg, pointsMaterial(0xd9622b, 0.07, 0.9));
    group.add(flowPoints);
    /* a few guide arcs, very faint */
    const guides = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const f = flows[i * 7 % N];
      const gg = new THREE.BufferGeometry().setFromPoints(f.curve.getPoints(48));
      guides.add(new THREE.Line(gg, lineMaterial(0xd9622b, 0.16)));
    }
    group.add(guides);

    const tmp = new THREE.Vector3();
    function stepFlows(dt) {
      for (const f of flows) {
        f.t += f.speed * dt; if (f.t > 1) f.t -= 1;
        f.curve.getPoint(f.t, tmp);
        fpos.set([tmp.x, tmp.y, tmp.z], f.i * 3);
      }
      fg.attributes.position.needsUpdate = true;
    }

    /* Mouse parallax (pointer only), gentle rotation */
    let targetRX = 0, targetRY = 0, rx = 0, ry = 0;
    if (!reduceMotion && matchMedia('(pointer:fine)').matches) {
      fig.addEventListener('pointermove', (e) => {
        const r = fig.getBoundingClientRect();
        targetRY = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
        targetRX = ((e.clientY - r.top) / r.height - 0.5) * 0.22;
      });
      fig.addEventListener('pointerleave', () => { targetRX = 0; targetRY = 0; });
    }
    group.rotation.x = 0.12;

    const resize = () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.render(scene, camera); };
    new ResizeObserver(resize).observe(fig);

    let last = performance.now(), running = true;
    const io = new IntersectionObserver(([en]) => { running = en.isIntersecting; if (running) { last = performance.now(); frame(last); } }, { threshold: 0.05 });
    io.observe(fig);

    function frame(now) {
      if (!running) return;
      const dt = Math.min(48, now - last) / 16.67; last = now;
      teacher.rotation.y += 0.0011 * dt; student.rotation.y -= 0.0021 * dt;
      teacher.userData.ring.rotation.y = -teacher.rotation.y; student.userData.ring.rotation.y = -student.rotation.y;
      stepFlows(dt);
      rx += (targetRX - rx) * 0.05; ry += (targetRY - ry) * 0.05;
      group.rotation.x = 0.12 + rx; group.rotation.y = ry;
      renderer.render(scene, camera);
      if (!reduceMotion) requestAnimationFrame(frame);
    }
    stepFlows(0); renderer.render(scene, camera);
    if (!reduceMotion) requestAnimationFrame(frame);
  } catch (err) {
    fig.classList.add('is-fallback');
    console.warn('Hero scene unavailable, using static figure.', err);
  }
}
function discTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.55, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------ */
renderKPIs();
initChartPanel();
initTable();
initLibrary();
renderTimeline();
initPalette();
initRail();
initHero();
