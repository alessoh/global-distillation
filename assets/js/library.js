// Global Distillation — method library: filterable grid + method drawer.
// Owns: assets/js/library.js. Exports renderLibrary(el, d, param) and openMethod(id).
// Contract: BUILD-CONTRACT.md. Tokens and class names: DESIGN.md + assets/css/app.css.

import { openDrawer, closeDrawer } from './app.js';

/* ------------------------------------------------------------------ labels */

const DIFFICULTY_LABELS = ['Introductory', 'Approachable', 'Involved', 'Advanced', 'Research-grade'];

const DATA_LABELS = {
  logits: 'Teacher logits',
  outputs: 'Teacher outputs',
  features: 'Internal features',
  none: 'No teacher data',
};

const ACCESS_LABELS = { 'white-box': 'White-box', 'black-box': 'Black-box' };

// Family hue classes are defined in app.css (.fam--logit … .fam--other) and are
// shared with the timeline, so a family keeps one colour across the whole site.
const FAMILY_HUES = [
  [/logit|response|soft.?target|output.?match/i, 'fam--logit'],
  [/feature|hint|attention|intermediate|representation/i, 'fam--feature'],
  [/relation|graph|similarity/i, 'fam--relation'],
  [/self|online|mutual|born.?again/i, 'fam--self'],
  [/data|sequence|synthetic|rationale|trace|instruction/i, 'fam--data'],
];
const FAMILY_CYCLE = ['fam--logit', 'fam--feature', 'fam--data', 'fam--relation', 'fam--self', 'fam--other'];

const state = {
  methods: [],
  byId: new Map(),
  families: [],
  difficulties: [],
  accesses: [],
  q: '',
  fFamily: new Set(),
  fDifficulty: new Set(),
  fAccess: new Set(),
  root: null,
  openId: null,
};

/* ------------------------------------------------------------------ utils */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isHttp(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }
function arr(v) { return Array.isArray(v) ? v.filter((x) => x != null && x !== '') : []; }

function clampDifficulty(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 0;
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

/* --------------------------------------------------------------- markdown */
/* Deliberately small: paragraphs, headings, bullet and ordered lists, inline
   code, bold and italic. The source is escaped before parsing, so no markup
   from the data file can reach the DOM. */

function mdInline(escaped) {
  return escaped
    .split(/(`[^`\n]+`)/g)
    .map((part) => {
      if (part.length > 1 && part.charAt(0) === '`' && part.charAt(part.length - 1) === '`') {
        return '<code class="mth-code">' + part.slice(1, -1) + '</code>';
      }
      return part
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(\[])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/(^|[\s(\[])_([^_\n]+)_/g, '$1<em>$2</em>');
    })
    .join('');
}

function renderMarkdown(src) {
  if (!src || typeof src !== 'string') return '';
  const lines = esc(src.replace(/\r\n?/g, '\n')).split('\n');
  const out = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; }
  };
  const flushList = () => {
    if (list) {
      out.push('<' + list.tag + ' class="mth-list">' +
        list.items.map((i) => '<li>' + mdInline(i) + '</li>').join('') +
        '</' + list.tag + '>');
      list = null;
    }
  };
  const flush = () => { flushPara(); flushList(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flush(); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      // h2 is the drawer title and h4 the section label, so prose headings sit
      // at h5/h6 and the outline stays in order.
      flush();
      const tag = heading[1].length <= 2 ? 'h5' : 'h6';
      out.push('<' + tag + ' class="mth-h">' + mdInline(heading[2].trim()) + '</' + tag + '>');
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(bullet[1].trim());
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      flushPara();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(ordered[1].trim());
      continue;
    }

    if (list) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    para.push(line.trim());
  }
  flush();
  return out.join('');
}

/* ------------------------------------------------------------------ styles */
/* Two parts. The layered block is a fallback for the shared components in
   app.css: cascade layers always lose to unlayered rules, so app.css wins
   wherever the two meet, and this only shows through if the stylesheet has not
   loaded. The unlayered block below styles the .lib-* / .mth-* classes this
   module owns; nothing else on the site uses those names. */

const STYLES = `
@layer gd-library {
  .method-card {
    display: flex; flex-direction: column; gap: 12px; text-align: left; width: 100%;
    background: var(--surface, #fff); border: 0; border-radius: var(--r-lg, 10px);
    box-shadow: var(--shadow-card, 0 1px 2px rgba(26,24,20,.05), 0 0 0 1px #E4DED2);
    padding: var(--s-5, 24px); cursor: pointer; font-family: var(--sans, system-ui);
  }
  .method-card__top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .method-card__family {
    display: inline-flex; align-items: center; gap: 7px;
    font: 500 var(--fs-micro, 11px)/1.3 var(--mono, monospace);
    letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3, #837C71);
  }
  .method-card__family i { width: 7px; height: 7px; border-radius: 50%; background: var(--cat-8, #7A6A57); }
  .method-card__name { font: 400 var(--fs-h3, 20px)/1.2 var(--serif, Georgia, serif); color: var(--ink, #1A1814); }
  .method-card__desc { font: 400 var(--fs-small, 13px)/1.5 var(--sans, system-ui); color: var(--ink-2, #4C4740); flex: 1; }
  .method-card__foot {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2, 8px);
    padding-top: var(--s-3, 12px); border-top: 1px solid var(--rule, #E4DED2);
  }
  .method-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4, 16px); }
  .dots { display: inline-flex; gap: 3px; flex: none; }
  .dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--surface-3, #EBE6DC); display: block; }
  .dots i.is-on { background: var(--ink-2, #4C4740); }
  .chip {
    display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px;
    border: 1px solid var(--rule-strong, #CEC6B6); border-radius: var(--r-pill, 999px);
    background: var(--surface, #fff); color: var(--ink-2, #4C4740); font-size: 12.5px;
    line-height: 1; cursor: pointer;
  }
  .chip[aria-pressed="true"] {
    background: var(--accent-soft, #F6E5DC); border-color: var(--accent, #B5451B);
    color: var(--accent-ink, #8E3412); font-weight: 500;
  }
  .chip__count { font-family: var(--mono, monospace); font-size: 10.5px; color: var(--ink-3, #837C71); }
  .badge {
    display: inline-flex; align-items: center; padding: 3px 7px; border-radius: var(--r-sm, 4px);
    font: 500 var(--fs-micro, 11px)/1.3 var(--sans, system-ui); letter-spacing: .07em;
    text-transform: uppercase; background: var(--surface-2, #F3F0EA); color: var(--ink-2, #4C4740);
    white-space: nowrap;
  }
  .badge--good { background: var(--good-soft, #E4F0E8); color: var(--good, #2E7D53); }
  .badge--warn { background: var(--warn-soft, #F7EDD8); color: var(--warn, #9A6C10); }
  .badge--info { background: var(--info-soft, #E4EEF4); color: var(--info, #1F6A99); }
  .field__input {
    height: 34px; padding: 0 10px; border: 1px solid var(--rule-strong, #CEC6B6);
    border-radius: var(--r-md, 6px); background: var(--surface, #fff); color: var(--ink, #1A1814);
    font-size: var(--fs-small, 13px);
  }
  .field__label {
    font: 400 var(--fs-micro, 11px)/1.3 var(--mono, monospace); letter-spacing: .08em;
    text-transform: uppercase; color: var(--ink-3, #837C71);
  }
  .empty {
    display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-2, 8px);
    padding: var(--s-7, 48px) var(--s-6, 32px); background: var(--surface, #fff);
    border-radius: var(--r-lg, 10px); box-shadow: 0 0 0 1px var(--rule, #E4DED2);
    border-left: 2px solid var(--rule-strong, #CEC6B6);
  }
  .empty__title { font: 400 var(--fs-h3, 20px)/1.25 var(--serif, Georgia, serif); color: var(--ink, #1A1814); }
  .empty__text { font: 400 var(--fs-small, 13px)/1.55 var(--sans, system-ui); color: var(--ink-3, #837C71); max-width: 62ch; }
  .formula {
    background: var(--surface, #fff); box-shadow: 0 0 0 1px var(--rule, #E4DED2);
    border-radius: var(--r-md, 6px); padding: var(--s-5, 24px) var(--s-4, 16px);
    margin-top: var(--s-3, 12px); overflow-x: auto;
  }
  .formula .katex-display { margin: 0; }
  .proscons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-5, 24px); }
  .related { display: flex; flex-wrap: wrap; gap: var(--s-2, 8px); margin-top: var(--s-3, 12px); }
  .related button {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px;
    border: 0; border-radius: var(--r-pill, 999px); background: var(--surface, #fff);
    box-shadow: 0 0 0 1px var(--rule, #E4DED2); font-size: 12.5px; color: var(--ink-2, #4C4740); cursor: pointer;
  }
  .drawer__section {
    font: 500 var(--fs-micro, 11px)/1.3 var(--mono, monospace); letter-spacing: .1em;
    text-transform: uppercase; color: var(--ink-3, #837C71);
    margin: var(--s-6, 32px) 0 var(--s-3, 12px); padding-top: var(--s-4, 16px);
    border-top: 1px solid var(--rule, #E4DED2);
  }
  .drawer__eyebrow {
    display: flex; align-items: center; gap: var(--s-3, 12px);
    font: 400 var(--fs-micro, 11px)/1.3 var(--mono, monospace); letter-spacing: .1em;
    text-transform: uppercase; color: var(--ink-3, #837C71);
  }
  .drawer__lede { font-size: 15.5px; line-height: 1.6; color: var(--ink-2, #4C4740); margin-top: var(--s-4, 16px); }
  .sr-only {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
  }
}

/* --- owned by this module (unlayered) --- */
.lib-controls {
  position: sticky; top: var(--nav-h, 60px); z-index: 4;
  background: var(--paper, #FAF8F4);
  padding: var(--s-4, 16px) 0 var(--s-3, 12px);
  border-bottom: 1px solid var(--rule, #E4DED2);
  margin: 0 0 var(--s-4, 16px);
}
.lib-controls .field { max-width: 420px; }
.lib-filters { display: grid; gap: var(--s-2, 8px); margin-top: var(--s-4, 16px); }
.lib-filter { display: flex; gap: var(--s-4, 16px); align-items: baseline; flex-wrap: wrap; }
.lib-filter__label {
  flex: 0 0 104px; padding-top: 7px;
  font-family: var(--mono, monospace); font-size: var(--fs-micro, 11px); line-height: 1.3;
  letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3, #837C71);
}
.lib-chips { display: flex; gap: var(--s-2, 8px); flex-wrap: wrap; flex: 1 1 auto; margin: 0; }
.lib-chips .chip__dot { background: var(--fam, var(--ink-4, #B2AA9D)); }
.lib-count {
  font-size: var(--fs-small, 13px); line-height: 1.5; color: var(--ink-3, #837C71);
  margin: var(--s-4, 16px) 0 0;
}
.lib-count strong { font-weight: 600; color: var(--ink, #1A1814); font-variant-numeric: tabular-nums; }
.lib-count__sep { color: var(--ink-4, #B2AA9D); padding: 0 7px; }
.lib-reset {
  font: 500 var(--fs-small, 13px)/1.5 var(--sans, system-ui); color: var(--accent-ink, #8E3412);
  background: none; border: 0; padding: 0; cursor: pointer;
  border-bottom: 1px solid var(--accent-soft, #F6E5DC);
}
.lib-reset:hover { border-bottom-color: var(--accent, #B5451B); }
.method-card__year {
  font-family: var(--mono, monospace); font-size: var(--fs-micro, 11px);
  color: var(--ink-3, #837C71); font-variant-numeric: tabular-nums; flex: none;
}
.method-card__difficulty { font-size: var(--fs-micro, 11px); color: var(--ink-3, #837C71); }
.method-card__badges { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.lib-note { margin-top: var(--s-6, 32px); font-size: var(--fs-micro, 11px); line-height: 1.5; color: var(--ink-3, #837C71); }
.lib-empty-actions { margin-top: var(--s-3, 12px); }

.mth__badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: var(--s-4, 16px); }
.mth__prose > .mth-h:first-child { margin-top: 0; }
.mth__prose .mth-h {
  font-family: var(--sans, system-ui); font-size: var(--fs-body, 15px); line-height: 1.35;
  font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--ink, #1A1814);
  margin: var(--s-5, 24px) 0 var(--s-2, 8px); padding: 0; border: 0;
}
.mth__prose .mth-list { margin: var(--s-2, 8px) 0 var(--s-3, 12px); }
.mth__prose ol.mth-list > li { list-style: decimal; }
.mth__prose p + .mth-h { margin-top: var(--s-5, 24px); }
.mth-code {
  font-family: var(--mono, monospace); font-size: .88em;
  background: var(--surface-2, #F3F0EA); border-radius: var(--r-sm, 4px);
  padding: 1px 4px; color: var(--ink, #1A1814);
}
.mth__pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: var(--s-3, 12px); }
.mth__pill {
  font-size: 12.5px; line-height: 1.3; color: var(--ink-2, #4C4740);
  background: var(--surface-2, #F3F0EA); border-radius: var(--r-pill, 999px); padding: 6px 11px;
}
.mth__host {
  font-family: var(--mono, monospace); font-size: var(--fs-micro, 11px);
  color: var(--ink-3, #837C71); white-space: nowrap;
}
.mth__missing {
  font-size: 12.5px; color: var(--ink-3, #837C71); padding: 6px 11px;
  border: 1px dashed var(--rule-strong, #CEC6B6); border-radius: var(--r-pill, 999px);
}
.mth__formula-wrap { position: relative; }
.mth__formula-wrap.is-scrollable::after {
  content: ""; position: absolute; top: 1px; right: 1px; bottom: 1px; width: 32px;
  border-radius: 0 var(--r-md, 6px) var(--r-md, 6px) 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(255,255,255,0), var(--surface, #fff) 78%);
}
.mth__formula-wrap .formula:focus-visible { outline: 2px solid var(--accent, #B5451B); outline-offset: 2px; }
@media (max-width: 767px) { .drawer__body .formula .katex { font-size: 1.05em; } }
.mth__formula-fallback {
  font-family: var(--mono, monospace); font-size: var(--fs-small, 13px); line-height: 1.5;
  color: var(--ink-2, #4C4740); white-space: pre-wrap; word-break: break-word; margin: 0;
}

@media (max-width: 767px) {
  .lib-controls { position: static; }
  .lib-filter__label { flex-basis: 100%; padding-top: 0; }
  .lib-controls .field { max-width: none; }
}
`;

function ensureStyles() {
  if (document.getElementById('gd-library-styles')) return;
  const s = document.createElement('style');
  s.id = 'gd-library-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------- normalising */

function famClass(family, index) {
  for (const [re, cls] of FAMILY_HUES) if (re.test(family)) return cls;
  return FAMILY_CYCLE[index % FAMILY_CYCLE.length];
}

function normalise(m, i) {
  const name = String(m && m.name ? m.name : 'Untitled method');
  const id = String((m && m.id) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'method-' + i);
  const access = String((m && m.teacherAccess) || '').toLowerCase();
  const needs = String((m && m.dataNeeded) || '').toLowerCase();
  const method = {
    id,
    name,
    family: (m && m.family) ? String(m.family) : 'Unclassified',
    year: m && m.year ? String(m.year) : '',
    paper: m && m.paper ? String(m.paper) : '',
    url: m && isHttp(m.url) ? m.url : '',
    description: m && m.description ? String(m.description) : '',
    howItWorks: m && m.howItWorks ? String(m.howItWorks) : '',
    lossFormula: m && m.lossFormula ? String(m.lossFormula) : '',
    pros: arr(m && m.pros).map(String),
    cons: arr(m && m.cons).map(String),
    whenToUse: m && m.whenToUse ? String(m.whenToUse) : '',
    tools: arr(m && m.tools).map(String),
    examples: arr(m && m.examples).map(String),
    relatedMethods: arr(m && m.relatedMethods).map(String),
    difficulty: clampDifficulty(m && m.difficulty),
    dataNeeded: needs,
    teacherAccess: access === 'white-box' || access === 'black-box' ? access : '',
  };
  method._hay = [
    method.name, method.family, method.description, method.whenToUse, method.howItWorks,
    method.paper, method.tools.join(' '), method.examples.join(' '), method.dataNeeded,
    method.teacherAccess, method.year,
  ].join(' ').toLowerCase();
  return method;
}

function ingest(d) {
  const raw = (d && d.extras && Array.isArray(d.extras.methods)) ? d.extras.methods : [];
  state.methods = raw.map(normalise);
  state.byId = new Map(state.methods.map((m) => [m.id, m]));

  const seen = [];
  state.methods.forEach((m) => { if (seen.indexOf(m.family) < 0) seen.push(m.family); });
  const hues = new Map(seen.map((f, i) => [f, famClass(f, i)]));
  state.methods.forEach((m) => { m.hue = hues.get(m.family) || 'fam--other'; });

  state.families = seen
    .map((f) => ({ name: f, n: state.methods.filter((m) => m.family === f).length, hue: hues.get(f) }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  state.difficulties = [1, 2, 3, 4, 5]
    .map((lv) => ({ lv, n: state.methods.filter((m) => m.difficulty === lv).length }))
    .filter((x) => x.n > 0);
  state.accesses = ['white-box', 'black-box']
    .map((a) => ({ a, n: state.methods.filter((m) => m.teacherAccess === a).length }))
    .filter((x) => x.n > 0);
}

/* ---------------------------------------------------------------- filtering */

function matches(m) {
  if (state.fFamily.size && !state.fFamily.has(m.family)) return false;
  if (state.fDifficulty.size && !state.fDifficulty.has(m.difficulty)) return false;
  if (state.fAccess.size && !state.fAccess.has(m.teacherAccess)) return false;
  const q = state.q.trim().toLowerCase();
  if (q && !q.split(/\s+/).every((t) => m._hay.indexOf(t) >= 0)) return false;
  return true;
}

function anyFilter() {
  return !!(state.q.trim() || state.fFamily.size || state.fDifficulty.size || state.fAccess.size);
}

function filterSummary() {
  const bits = [];
  if (state.fFamily.size) bits.push(Array.from(state.fFamily).join(', '));
  if (state.fDifficulty.size) {
    bits.push(Array.from(state.fDifficulty).sort().map((lv) => DIFFICULTY_LABELS[lv - 1]).join(', '));
  }
  if (state.fAccess.size) bits.push(Array.from(state.fAccess).map((a) => ACCESS_LABELS[a].toLowerCase()).join(', '));
  if (state.q.trim()) bits.push('“' + state.q.trim() + '”');
  return bits.join(' · ');
}

/* ------------------------------------------------------------------ markup */

function dotsHtml(level, label) {
  let h = '<span class="dots"' + (label ? ' role="img" aria-label="' + esc(label) + '"' : ' aria-hidden="true"') + '>';
  for (let i = 1; i <= 5; i += 1) h += '<i' + (i <= level ? ' class="is-on"' : '') + '></i>';
  return h + '</span>';
}

function accessBadge(m) {
  return '<span class="badge ' + (m.teacherAccess === 'white-box' ? 'badge--good' : 'badge--warn') + '">' +
    esc(ACCESS_LABELS[m.teacherAccess]) + '</span>';
}

function cardHtml(m) {
  const badges =
    (m.dataNeeded ? '<span class="badge badge--info">' + esc(DATA_LABELS[m.dataNeeded] || m.dataNeeded) + '</span>' : '') +
    (m.teacherAccess ? accessBadge(m) : '');
  const diff = m.difficulty
    ? dotsHtml(m.difficulty) + '<span class="method-card__difficulty">' +
      esc(DIFFICULTY_LABELS[m.difficulty - 1]) + '</span>'
    : '';
  const label = m.name + '. ' + m.family + (m.year ? ', ' + m.year : '') +
    (m.difficulty ? '. Difficulty ' + m.difficulty + ' of 5, ' + DIFFICULTY_LABELS[m.difficulty - 1] : '') +
    (m.teacherAccess ? '. ' + ACCESS_LABELS[m.teacherAccess] + ' teacher access' : '') + '.';
  return '<button class="method-card" type="button" data-method="' + esc(m.id) + '" aria-label="' + esc(label) + '">' +
    '<span class="method-card__top">' +
      '<span class="method-card__family ' + m.hue + '"><i aria-hidden="true"></i>' + esc(m.family) + '</span>' +
      (m.year ? '<span class="method-card__year">' + esc(m.year) + '</span>' : '') +
    '</span>' +
    '<span class="method-card__name">' + esc(m.name) + '</span>' +
    '<span class="method-card__desc">' + esc(m.description) + '</span>' +
    '<span class="method-card__foot">' + diff +
      (badges ? '<span class="method-card__badges">' + badges + '</span>' : '') +
    '</span>' +
  '</button>';
}

function chipHtml(kind, value, label, n, pressed, hue) {
  return '<button class="chip" type="button" data-filter="' + esc(kind) + '" data-value="' + esc(value) + '"' +
    ' aria-pressed="' + (pressed ? 'true' : 'false') + '">' +
    (hue ? '<span class="chip__dot ' + hue + '" aria-hidden="true"></span>' : '') +
    esc(label) + (n != null ? '<span class="chip__count">' + n + '</span>' : '') + '</button>';
}

function filterRow(id, label, chips) {
  return '<div class="lib-filter"><span class="lib-filter__label" id="' + id + '">' + esc(label) + '</span>' +
    '<div class="lib-chips" role="group" aria-labelledby="' + id + '">' + chips + '</div></div>';
}

function controlsHtml() {
  const rows = [];
  if (state.families.length > 1) {
    rows.push(filterRow('lib-lab-family', 'Family', state.families
      .map((f) => chipHtml('family', f.name, f.name, f.n, state.fFamily.has(f.name), f.hue)).join('')));
  }
  if (state.difficulties.length > 1) {
    rows.push(filterRow('lib-lab-diff', 'Difficulty', state.difficulties
      .map((d) => chipHtml('difficulty', String(d.lv), d.lv + ' · ' + DIFFICULTY_LABELS[d.lv - 1], d.n,
        state.fDifficulty.has(d.lv))).join('')));
  }
  if (state.accesses.length) {
    rows.push(filterRow('lib-lab-access', 'Teacher access', state.accesses
      .map((x) => chipHtml('access', x.a, ACCESS_LABELS[x.a], x.n, state.fAccess.has(x.a))).join('')));
  }
  return '<div class="lib-controls">' +
    '<div class="field">' +
      '<label class="field__label" for="lib-q">Filter methods</label>' +
      '<input class="field__input" id="lib-q" type="search" autocomplete="off" spellcheck="false"' +
      ' placeholder="Name, tool, example or objective" value="' + esc(state.q) + '">' +
    '</div>' +
    '<div class="lib-filters">' + rows.join('') + '</div>' +
    '<p class="lib-count" id="lib-count" aria-live="polite"></p>' +
  '</div>';
}

function countHtml(shown, total) {
  return '<strong>' + shown + '</strong> of ' + total + ' ' + (total === 1 ? 'method' : 'methods') +
    (anyFilter()
      ? '<span class="lib-count__sep" aria-hidden="true">·</span>' +
        '<span class="lib-count__filters">' + esc(filterSummary()) + '</span>' +
        '<span class="lib-count__sep" aria-hidden="true">·</span>' +
        '<button class="lib-reset" type="button" data-reset>Clear filters</button>'
      : '');
}

function gridHtml(list) {
  if (list.length) return list.map(cardHtml).join('');
  return '<div class="empty" role="status">' +
    '<p class="empty__title">No method matches those filters</p>' +
    '<p class="empty__text">Nothing in the library satisfies ' + esc(filterSummary() || 'the current filters') +
    '. Widen the family or difficulty selection, or clear the text filter.</p>' +
    '<p class="lib-empty-actions"><button class="lib-reset" type="button" data-reset>Clear filters</button></p>' +
  '</div>';
}

function emptyStateHtml(d) {
  const missing = !d;
  return '<div class="empty" role="status">' +
    '<p class="empty__title">' +
      (missing ? 'The method library has not been published yet' : 'This library file carries no methods yet') +
    '</p>' +
    '<p class="empty__text">' + (missing
      ? 'The research pipeline that writes <code class="mth-code">data/library.json</code> has not delivered the file. Nothing is being hidden here and no entries are being invented in its place.'
      : 'The published file parsed correctly but its <code class="mth-code">extras.methods</code> list is empty, so there is nothing to show.') +
    '</p>' +
    '<p class="empty__text">When it lands, this page lists every distillation method with the objective it optimises, ' +
    'the teacher access it needs, the tools that implement it and the paper it comes from. Until then the ' +
    'perspectives in the left rail carry the figures that are published.</p>' +
    '<p class="lib-empty-actions"><a class="btn btn--link" href="#/developer">Developer tooling and recipes</a></p>' +
  '</div>';
}

/* ------------------------------------------------------------------ drawer */

function drawerSection(title, body) {
  if (!body) return '';
  return '<h4 class="drawer__section">' + esc(title) + '</h4>' + body;
}

function methodHtml(m) {
  const badges = []
    .concat(m.difficulty
      ? ['<span class="badge">' + esc(DIFFICULTY_LABELS[m.difficulty - 1]) + '</span>' +
         dotsHtml(m.difficulty, 'Difficulty ' + m.difficulty + ' of 5')]
      : [])
    .concat(m.dataNeeded ? ['<span class="badge badge--info">' + esc(DATA_LABELS[m.dataNeeded] || m.dataNeeded) + '</span>'] : [])
    .concat(m.teacherAccess ? [accessBadge(m)] : []);

  const formula = m.lossFormula
    ? '<div class="mth__formula-wrap" id="mth-formula-wrap">' +
      '<div class="formula" id="mth-formula" data-tex="' + esc(m.lossFormula) + '">' +
      '<p class="mth__formula-fallback">' + esc(m.lossFormula) + '</p></div></div>'
    : '';

  const cols = (m.pros.length || m.cons.length)
    ? '<div class="proscons">' +
      '<div class="proscons__col proscons__col--pro"><h5>Strengths</h5><ul>' +
        (m.pros.length ? m.pros.map((p) => '<li>' + esc(p) + '</li>').join('') : '<li>Not documented</li>') +
      '</ul></div>' +
      '<div class="proscons__col proscons__col--con"><h5>Limits</h5><ul>' +
        (m.cons.length ? m.cons.map((c) => '<li>' + esc(c) + '</li>').join('') : '<li>Not documented</li>') +
      '</ul></div>' +
    '</div>'
    : '';

  const related = m.relatedMethods.length
    ? '<div class="related">' + m.relatedMethods.map((rid) => {
        const r = state.byId.get(rid);
        if (!r) return '<span class="mth__missing">' + esc(rid) + ' — not in this library</span>';
        return '<button type="button" data-method-link="' + esc(r.id) + '">' + esc(r.name) +
          ' <span aria-hidden="true">&rarr;</span></button>';
      }).join('') + '</div>'
    : '';

  const host = m.url ? hostOf(m.url) : '';
  const paper = m.url
    ? '<p><a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer">' + esc(m.paper || m.url) + '</a>' +
      (host ? ' <span class="mth__host">' + esc(host) + '</span>' : '') + '</p>'
    : (m.paper ? '<p>' + esc(m.paper) + '</p>' : '');

  return '<article class="mth">' +
    '<p class="drawer__eyebrow"><span>' + esc(m.family) + '</span>' +
      (m.year ? '<span>' + esc(m.year) + '</span>' : '') + '</p>' +
    '<h2 id="drawer-title" tabindex="-1">' + esc(m.name) + '</h2>' +
    (m.description ? '<p class="drawer__lede">' + esc(m.description) + '</p>' : '') +
    (badges.length ? '<p class="mth__badges">' + badges.join('') + '</p>' : '') +
    drawerSection('Objective', formula) +
    drawerSection('How it works', m.howItWorks ? '<div class="mth__prose">' + renderMarkdown(m.howItWorks) + '</div>' : '') +
    drawerSection('Strengths and limits', cols) +
    drawerSection('When to use it', m.whenToUse ? '<p>' + esc(m.whenToUse) + '</p>' : '') +
    drawerSection('Tools', m.tools.length
      ? '<div class="mth__pills">' + m.tools.map((t) => '<span class="mth__pill">' + esc(t) + '</span>').join('') + '</div>'
      : '') +
    drawerSection('Seen in', m.examples.length
      ? '<ul>' + m.examples.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '') +
    drawerSection('Paper', paper) +
    drawerSection('Related methods', related) +
  '</article>';
}

function typesetFormula() {
  const node = document.getElementById('mth-formula');
  if (!node) return;
  const tex = node.getAttribute('data-tex');
  if (tex && window.katex && typeof window.katex.render === 'function') {
    const target = document.createElement('div');
    try {
      window.katex.render(tex, target, { displayMode: true, throwOnError: false });
      node.innerHTML = '';
      node.appendChild(target);
    } catch (_) {
      /* the plain-text fallback already in the node stands */
    }
  }
  // A long objective has to scroll sideways on a narrow drawer; say so.
  const wrap = document.getElementById('mth-formula-wrap');
  if (!wrap) return;
  const overflowing = node.scrollWidth - node.clientWidth > 2;
  wrap.classList.toggle('is-scrollable', overflowing);
  node.setAttribute('tabindex', overflowing ? '0' : '-1');
  node.setAttribute('role', overflowing ? 'region' : 'presentation');
  if (overflowing) node.setAttribute('aria-label', 'Loss function, scrolls horizontally');
  else node.removeAttribute('aria-label');
}

/* -------------------------------------------------------------- hash + open */

function setHash(value) {
  const target = '#' + String(value).replace(/^#/, '');
  if (target === location.hash) return;
  try { history.replaceState(history.state, '', location.pathname + location.search + target); }
  catch (_) { location.hash = target; }
}

function drawerIsOpen() {
  const d = document.getElementById('drawer');
  return !!(d && !d.hidden);
}

function showMethod(m, swap) {
  const html = methodHtml(m);
  if (swap && drawerIsOpen()) {
    const body = document.getElementById('drawer-body');
    if (body) {
      body.innerHTML = html;
      body.setAttribute('aria-label', m.name);
      body.scrollTop = 0;
      const panel = body.closest('.drawer__panel');
      if (panel) panel.scrollTop = 0;
      const title = document.getElementById('drawer-title');
      if (title && title.focus) title.focus();
    }
  } else {
    openDrawer(html, m.name);
  }
  typesetFormula();
  state.openId = m.id;
  setHash('/library/' + m.id);
}

export function openMethod(id) {
  const key = String(id || '').trim();
  if (!key) return;
  const m = state.byId.get(key);
  if (!m) {
    // Not rendered here yet — a palette hit from another route, or a cold link.
    // Hand it to the router, which renders the library and calls back.
    if (!state.methods.length) {
      if (location.hash !== '#/library/' + key) location.hash = '#/library/' + key;
    } else {
      setHash('/library');
    }
    return;
  }
  if (state.openId === m.id && drawerIsOpen()) { setHash('/library/' + m.id); return; }
  showMethod(m, drawerIsOpen());
}

/* ------------------------------------------------------------------ wiring */

let wired = false;

function forgetOpen() {
  if (!state.openId) return;
  state.openId = null;
  if (/^#\/library\//.test(location.hash)) setHash('/library');
}

function wireGlobal() {
  if (wired) return;
  wired = true;

  document.addEventListener('click', (e) => {
    if (!e.target || !e.target.closest) return;
    const rel = e.target.closest('[data-method-link]');
    if (rel) {
      e.preventDefault();
      const m = state.byId.get(rel.getAttribute('data-method-link'));
      if (m) showMethod(m, true);
      return;
    }
    // app.js closes the drawer on these; keep the hash honest.
    if (e.target.closest('[data-close-drawer]')) forgetOpen();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerIsOpen()) forgetOpen();
  });

  // Routing away from a linked method would otherwise leave the drawer
  // stranded over the next view; the router does not know about it.
  window.addEventListener('hashchange', () => {
    if (/^#\/library\//.test(location.hash) || !state.openId) return;
    state.openId = null;
    if (drawerIsOpen()) closeDrawer();
  });
}

function paint() {
  const grid = state.root && state.root.querySelector('#lib-grid');
  const count = state.root && state.root.querySelector('#lib-count');
  if (!grid || !count) return;
  const list = state.methods.filter(matches);
  grid.innerHTML = gridHtml(list);
  count.innerHTML = countHtml(list.length, state.methods.length);
}

function resetFilters() {
  state.q = '';
  state.fFamily.clear();
  state.fDifficulty.clear();
  state.fAccess.clear();
  if (state.root) {
    const input = state.root.querySelector('#lib-q');
    if (input) input.value = '';
    state.root.querySelectorAll('.lib-chips .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  }
  paint();
}

function wireView(el) {
  const input = el.querySelector('#lib-q');
  if (input) {
    input.addEventListener('input', () => { state.q = input.value; paint(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; state.q = ''; paint(); }
    });
  }

  el.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-filter]');
    if (chip) {
      const kind = chip.getAttribute('data-filter');
      const raw = chip.getAttribute('data-value');
      const set = kind === 'family' ? state.fFamily : kind === 'difficulty' ? state.fDifficulty : state.fAccess;
      const value = kind === 'difficulty' ? Number(raw) : raw;
      if (set.has(value)) { set.delete(value); chip.setAttribute('aria-pressed', 'false'); }
      else { set.add(value); chip.setAttribute('aria-pressed', 'true'); }
      paint();
      return;
    }
    if (e.target.closest('[data-reset]')) { resetFilters(); return; }
    const card = e.target.closest('.method-card[data-method]');
    if (card) {
      const m = state.byId.get(card.getAttribute('data-method'));
      if (m) showMethod(m, false);
    }
  });
}

/* ------------------------------------------------------------------ render */

export function renderLibrary(el, d, param) {
  if (!el) return;
  ensureStyles();
  wireGlobal();
  state.root = el;
  state.openId = null;
  ingest(d);

  const title = (d && d.title) || 'The distillation method library';
  const standfirst = (d && d.summary) ||
    'Every technique that moves capability from a large teacher model into a smaller student, with the ' +
    'objective it optimises, the teacher access it requires, and the tools that implement it.';
  const updated = (d && d.updated) ? String(d.updated).slice(0, 10) : '';
  const meta = state.methods.length
    ? '<p class="section__meta">' + state.methods.length + ' methods · ' + state.families.length + ' families' +
      (updated ? '<br>Revised ' + esc(updated) : '') + '</p>'
    : '';

  const head = '<header class="section__head">' +
    '<div>' +
      '<p class="eyebrow"><span class="eyebrow__dot"></span>Reference · Library</p>' +
      '<h2 class="section__title">' + esc(title) + '</h2>' +
      '<p class="section__standfirst">' + esc(standfirst) + '</p>' +
    '</div>' + meta +
  '</header>';

  if (!state.methods.length) {
    el.innerHTML = '<section class="section lib">' + head + emptyStateHtml(d) + '</section>';
    return;
  }

  el.innerHTML = '<section class="section lib">' + head + controlsHtml() +
    '<div class="method-grid" id="lib-grid"></div>' +
    '<p class="lib-note">Every entry links the paper it comes from; loss functions are reproduced from those papers. ' +
    'Difficulty is a judgement about implementation effort, not about how well the method works.</p>' +
    '</section>';

  paint();
  wireView(el);

  if (param) openMethod(param);
}
