// Global Distillation — method library: filterable grid + method drawer.
// Owns: assets/js/library.js. Exports renderLibrary(el, d, param) and openMethod(id).
// Contract: BUILD-CONTRACT.md. Tokens and class names: DESIGN.md + assets/css/app.css.

import { openDrawer, closeDrawer } from './app.js';
import { sectionBlocks, navBlock, splitParagraphs, resetCharts, mountRendered } from './render.js';

/* ------------------------------------------------------------------ labels */

const DIFFICULTY_LABELS = ['Introductory', 'Approachable', 'Involved', 'Advanced', 'Research-grade'];

const DATA_LABELS = {
  logits: 'Teacher logits',
  outputs: 'Teacher outputs',
  features: 'Internal features',
  none: 'No teacher data',
};

const ACCESS_LABELS = { 'white-box': 'White-box', 'black-box': 'Black-box', none: 'Teacherless' };

/**
 * One hue per family, named literally. The previous regex mapping collapsed
 * eleven families onto five colours — attention-based, feature-based and
 * compression-composed were all the same blue — so the colour key asserted
 * relationships the page's own copy denies. A family that is not in this map
 * takes the first free slot, deterministically, so a colour still never means
 * two things at once.
 */
const FAMILY_HUES = {
  'Response-based': 'fam--1',
  'Feature-based': 'fam--2',
  'Relation-based': 'fam--3',
  'Attention-based': 'fam--4',
  'Sequence-level / data': 'fam--5',
  'Dataset / context': 'fam--6',
  'Rationale / reasoning': 'fam--7',
  'On-policy / divergence-choice': 'fam--8',
  'Preference': 'fam--9',
  'Trajectory / sampler': 'fam--10',
  'Compression-composed': 'fam--11',
};
const FAMILY_SLOTS = ['fam--1', 'fam--2', 'fam--3', 'fam--4', 'fam--5', 'fam--6',
  'fam--7', 'fam--8', 'fam--9', 'fam--10', 'fam--11'];

const SORTS = {
  curated: 'Teaching order',
  year: 'Year, newest first',
  yearAsc: 'Year, oldest first',
  difficulty: 'Difficulty, easiest first',
  family: 'Family',
  az: 'A to Z',
};

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
  sort: 'curated',
  view: 'grid',
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

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : (many || one + 's'));
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

/** Emphasis in a one-line summary: the same transform the drawer uses, so the
    card and the drawer never disagree about whether an asterisk is markup. */
function mdText(src) {
  return mdInline(esc(String(src == null ? '' : src)));
}

function plainText(src) {
  return String(src == null ? '' : src).replace(/[*_`]/g, '');
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
      // The drawer runs h2 (method) -> h3 (section) -> h4/h5 (prose), so the
      // heading outline never skips a level.
      flush();
      const tag = heading[1].length <= 2 ? 'h4' : 'h5';
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

/* ------------------------------------------------------------- normalising */

function hashOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Literal map first; anything unlisted takes the first free slot from a
    deterministic starting point, so two families never share a hue. */
function assignFamilyHues(families) {
  const used = new Set();
  const out = new Map();
  families.forEach((f) => {
    const named = FAMILY_HUES[f];
    if (named && !used.has(named)) { used.add(named); out.set(f, named); }
  });
  families.forEach((f) => {
    if (out.has(f)) return;
    const start = hashOf(f) % FAMILY_SLOTS.length;
    let slot = null;
    for (let i = 0; i < FAMILY_SLOTS.length; i += 1) {
      const cand = FAMILY_SLOTS[(start + i) % FAMILY_SLOTS.length];
      if (!used.has(cand)) { slot = cand; break; }
    }
    slot = slot || FAMILY_SLOTS[start];
    used.add(slot);
    out.set(f, slot);
  });
  return out;
}

function normalise(m, i) {
  const name = String(m && m.name ? m.name : 'Untitled method');
  const id = String((m && m.id) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'method-' + i);
  const access = String((m && m.teacherAccess) || '').toLowerCase();
  const needs = String((m && m.dataNeeded) || '').toLowerCase();
  const method = {
    id,
    order: i,
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
    teacherAccess: ACCESS_LABELS[access] ? access : '',
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
  const hues = assignFamilyHues(seen);
  state.methods.forEach((m) => { m.hue = hues.get(m.family) || 'fam--11'; });

  state.families = seen
    .map((f) => ({ name: f, n: state.methods.filter((m) => m.family === f).length, hue: hues.get(f) }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  state.difficulties = [1, 2, 3, 4, 5]
    .map((lv) => ({ lv, n: state.methods.filter((m) => m.difficulty === lv).length }))
    .filter((x) => x.n > 0);
  state.accesses = ['white-box', 'black-box', 'none']
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

function sortMethods(list) {
  const byYear = (a, b) => Number(a.year || 0) - Number(b.year || 0);
  const copy = list.slice();
  switch (state.sort) {
    case 'year': copy.sort((a, b) => byYear(b, a) || a.name.localeCompare(b.name)); break;
    case 'yearAsc': copy.sort((a, b) => byYear(a, b) || a.name.localeCompare(b.name)); break;
    case 'difficulty': copy.sort((a, b) => (a.difficulty || 9) - (b.difficulty || 9) || a.name.localeCompare(b.name)); break;
    case 'family': copy.sort((a, b) => a.family.localeCompare(b.family) || byYear(a, b)); break;
    case 'az': copy.sort((a, b) => a.name.localeCompare(b.name)); break;
    default: copy.sort((a, b) => a.order - b.order);
  }
  return copy;
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

// Teacher access is a constraint, not a grade: the black-box methods are the
// ones most practitioners actually run. Both badges take the same neutral
// treatment, differing only in tint, so neither reads as the better answer.
function accessBadge(m) {
  return '<span class="badge badge--attr attr--' + esc(m.teacherAccess === 'none' ? 'teacherless' : m.teacherAccess) + '">' +
    esc(ACCESS_LABELS[m.teacherAccess]) + '</span>';
}

function cardHtml(m) {
  const badges =
    (m.dataNeeded ? '<span class="badge badge--attr">' + esc(DATA_LABELS[m.dataNeeded] || m.dataNeeded) + '</span>' : '') +
    (m.teacherAccess ? accessBadge(m) : '');
  const diff = m.difficulty
    ? dotsHtml(m.difficulty) + '<span class="method-card__difficulty">' +
      esc(DIFFICULTY_LABELS[m.difficulty - 1]) + '</span>'
    : '';
  const label = m.name + '. ' + m.family + (m.year ? ', ' + m.year : '') +
    (m.difficulty ? '. Difficulty ' + m.difficulty + ' of 5, ' + DIFFICULTY_LABELS[m.difficulty - 1] : '') +
    (m.teacherAccess === 'none' ? '. No teacher model' : m.teacherAccess ? '. ' + ACCESS_LABELS[m.teacherAccess] + ' teacher access' : '') + '.';
  return '<article class="method-card" data-method="' + esc(m.id) + '">' +
    '<p class="method-card__top">' +
      '<span class="method-card__family ' + m.hue + '"><i aria-hidden="true"></i>' + esc(m.family) + '</span>' +
      (m.year ? '<span class="method-card__year">' + esc(m.year) + '</span>' : '') +
    '</p>' +
    '<h3 class="method-card__name"><button class="method-card__open" type="button" data-method="' + esc(m.id) +
      '" aria-label="' + esc(label) + '">' + esc(m.name) + '</button></h3>' +
    '<p class="method-card__desc">' + mdText(m.description) + '</p>' +
    '<p class="method-card__foot">' + diff +
      (badges ? '<span class="method-card__badges">' + badges + '</span>' : '') +
    '</p>' +
  '</article>';
}

/** List view: the same records as a scannable table, sorted and filtered. */
function tableHtml(list) {
  if (!list.length) return gridHtml(list);
  return '<div class="table-wrap table-wrap--auto" tabindex="0" role="region" aria-label="Methods, scrolls sideways">' +
    '<table class="table table--lib">' +
    '<thead><tr><th scope="col">Method</th><th scope="col">Family</th>' +
    '<th scope="col" class="num" data-type="number">Year</th>' +
    '<th scope="col">Teacher access</th><th scope="col">Data needed</th>' +
    '<th scope="col">Difficulty</th></tr></thead><tbody>' +
    list.map((m) => '<tr data-method="' + esc(m.id) + '">' +
      '<th scope="row" class="txt"><button class="lib-row" type="button" data-method="' + esc(m.id) + '">' +
      esc(m.name) + '</button></th>' +
      '<td class="txt"><span class="method-card__family ' + m.hue + '"><i aria-hidden="true"></i>' +
      esc(m.family) + '</span></td>' +
      '<td class="num" data-type="number">' + esc(m.year || '—') + '</td>' +
      '<td class="txt">' + esc(m.teacherAccess ? ACCESS_LABELS[m.teacherAccess] : '—') + '</td>' +
      '<td class="txt">' + esc(DATA_LABELS[m.dataNeeded] || m.dataNeeded || '—') + '</td>' +
      '<td class="txt">' + (m.difficulty
        ? dotsHtml(m.difficulty, 'Difficulty ' + m.difficulty + ' of 5') +
          '<span class="method-card__difficulty"> ' + esc(DIFFICULTY_LABELS[m.difficulty - 1]) + '</span>'
        : '—') + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>';
}

function chipHtml(kind, value, label, n, pressed, hue) {
  return '<button class="chip" type="button" data-lib-filter="' + esc(kind) + '" data-value="' + esc(value) + '"' +
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
    '<div class="lib-controls__top">' +
      '<div class="field">' +
        '<label class="field__label" for="lib-q">Filter methods</label>' +
        '<input class="field__input" id="lib-q" type="search" autocomplete="off" spellcheck="false"' +
        ' placeholder="Name, tool, example or objective" value="' + esc(state.q) + '">' +
      '</div>' +
      '<div class="field field--sm">' +
        '<label class="field__label" for="lib-sort">Sort</label>' +
        '<select class="field__input" id="lib-sort">' +
          Object.keys(SORTS).map((k) => '<option value="' + k + '"' +
            (state.sort === k ? ' selected' : '') + '>' + esc(SORTS[k]) + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="seg" role="group" aria-label="Layout">' +
        '<button type="button" class="seg__btn' + (state.view === 'grid' ? ' is-active' : '') +
        '" data-lib-view="grid" aria-pressed="' + (state.view === 'grid') + '">Cards</button>' +
        '<button type="button" class="seg__btn' + (state.view === 'table' ? ' is-active' : '') +
        '" data-lib-view="table" aria-pressed="' + (state.view === 'table') + '">Table</button>' +
      '</div>' +
    '</div>' +
    '<div class="lib-filters">' + rows.join('') + '</div>' +
  '</div>' +
  // Outside .lib-controls: a sticky element is clipped by its own parent, and
  // the count has to stay reachable while the grid scrolls past it.
  '<div class="lib-bar">' +
    '<p class="lib-count" id="lib-count" aria-live="polite"></p>' +
    '<button type="button" class="btn--link" data-lib-csv>Download this data (CSV)</button>' +
  '</div>';
}

function countHtml(shown, total) {
  return '<strong>' + shown + '</strong> of ' + total + ' ' + (total === 1 ? 'method' : 'methods') +
    '<span class="lib-count__sep" aria-hidden="true">·</span>' +
    '<span class="lib-count__filters">' + esc(SORTS[state.sort]) + '</span>' +
    (anyFilter()
      ? '<span class="lib-count__sep" aria-hidden="true">·</span>' +
        '<span class="lib-count__filters">' + esc(filterSummary()) + '</span>' +
        '<span class="lib-count__sep" aria-hidden="true">·</span>' +
        '<button class="lib-reset" type="button" data-reset>Clear filters</button>'
      : '');
}

function gridHtml(list) {
  if (list.length) return '<div class="method-grid">' + list.map(cardHtml).join('') + '</div>';
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
  return '<h3 class="drawer__section">' + esc(title) + '</h3>' + body;
}

function methodHtml(m) {
  const badges = []
    .concat(m.difficulty
      ? ['<span class="badge badge--attr">' + esc(DIFFICULTY_LABELS[m.difficulty - 1]) + '</span>' +
         dotsHtml(m.difficulty, 'Difficulty ' + m.difficulty + ' of 5')]
      : [])
    .concat(m.dataNeeded ? ['<span class="badge badge--attr">' + esc(DATA_LABELS[m.dataNeeded] || m.dataNeeded) + '</span>'] : [])
    .concat(m.teacherAccess ? [accessBadge(m)] : []);

  const formula = m.lossFormula
    ? '<div class="mth__formula-wrap" id="mth-formula-wrap">' +
      '<div class="formula" id="mth-formula" data-tex="' + esc(m.lossFormula) + '">' +
      '<p class="mth__formula-fallback">' + esc(m.lossFormula) + '</p></div>' +
      '<p class="mth__formula-hint" id="mth-formula-hint" hidden>The objective is wider than this panel: ' +
      'drag it sideways, or use the arrow keys once it has focus.</p></div>'
    : '';

  const cols = (m.pros.length || m.cons.length)
    ? '<div class="proscons">' +
      '<div class="proscons__col proscons__col--pro"><h4>Strengths</h4><ul>' +
        (m.pros.length ? m.pros.map((p) => '<li>' + esc(p) + '</li>').join('') : '<li>Not documented</li>') +
      '</ul></div>' +
      '<div class="proscons__col proscons__col--con"><h4>Limits</h4><ul>' +
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
    '<p class="drawer__eyebrow"><span class="method-card__family ' + (m.hue || '') + '">' +
      '<i aria-hidden="true"></i>' + esc(m.family) + '</span>' +
      (m.year ? '<span>' + esc(m.year) + '</span>' : '') + '</p>' +
    '<h2 id="drawer-title" tabindex="-1">' + esc(m.name) + '</h2>' +
    (m.description ? '<p class="drawer__lede">' + mdText(m.description) + '</p>' : '') +
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
  // A long objective has to scroll sideways on a narrow drawer; say so, and
  // make the scroller reachable from the keyboard.
  const wrap = document.getElementById('mth-formula-wrap');
  if (!wrap) return;
  const overflowing = node.scrollWidth - node.clientWidth > 2;
  wrap.classList.toggle('is-scrollable', overflowing);
  node.setAttribute('tabindex', overflowing ? '0' : '-1');
  node.setAttribute('role', overflowing ? 'region' : 'presentation');
  if (overflowing) node.setAttribute('aria-label', 'Loss function, scrolls horizontally');
  else node.removeAttribute('aria-label');
  const hint = document.getElementById('mth-formula-hint');
  if (hint) hint.hidden = !overflowing;
}

/* -------------------------------------------------------------- hash + open */

function filterQuery() {
  const p = [];
  if (state.q.trim()) p.push('q=' + encodeURIComponent(state.q.trim()));
  state.fFamily.forEach((f) => p.push('family=' + encodeURIComponent(f)));
  state.fDifficulty.forEach((d) => p.push('difficulty=' + d));
  state.fAccess.forEach((a) => p.push('access=' + encodeURIComponent(a)));
  if (state.sort !== 'curated') p.push('sort=' + state.sort);
  if (state.view !== 'grid') p.push('view=' + state.view);
  return p.length ? '?' + p.join('&') : '';
}

/**
 * A filtered shortlist is the thing this page is for, so it has to be
 * shareable. The site is hash-routed, so the filters ride behind the route's
 * own path segment: `#/library/_?access=black-box`. The method id keeps the
 * first segment when a drawer is open.
 */
function writeHash() {
  const q = filterQuery();
  const id = state.openId || (q ? '_' : '');
  const path = '/library' + (id ? '/' + id : '') + q;
  setHash(path);
}

function clearFilterState() {
  state.q = '';
  state.fFamily.clear();
  state.fDifficulty.clear();
  state.fAccess.clear();
  state.sort = 'curated';
  state.view = 'grid';
}

function readParam(param) {
  const raw = String(param == null ? '' : param);
  const cut = raw.indexOf('?');
  const id = (cut < 0 ? raw : raw.slice(0, cut)).trim();
  const query = cut < 0 ? '' : raw.slice(cut + 1);
  if (query) clearFilterState();
  query.split('&').filter(Boolean).forEach((pair) => {
    const i = pair.indexOf('=');
    const k = i < 0 ? pair : pair.slice(0, i);
    let v = i < 0 ? '' : pair.slice(i + 1);
    try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (_) { /* keep raw */ }
    if (k === 'q') state.q = v;
    else if (k === 'family') state.fFamily.add(v);
    else if (k === 'difficulty' && Number(v)) state.fDifficulty.add(Number(v));
    else if (k === 'access') state.fAccess.add(v);
    else if (k === 'sort' && SORTS[v]) state.sort = v;
    else if (k === 'view' && (v === 'grid' || v === 'table')) state.view = v;
  });
  return (id && id !== '_') ? id : '';
}

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
  writeHash();
}

export function openMethod(id) {
  openById(readParam(id));
}

function openById(key) {
  if (!key) return;
  const m = state.byId.get(key);
  if (!m) {
    // Not rendered here yet — a palette hit from another route, or a cold link.
    // Hand it to the router, which renders the library and calls back.
    if (!state.methods.length) {
      if (location.hash !== '#/library/' + key) location.hash = '#/library/' + key;
    } else {
      state.openId = null;
      writeHash();
    }
    return;
  }
  if (state.openId === m.id && drawerIsOpen()) { writeHash(); return; }
  showMethod(m, drawerIsOpen());
}

/* ------------------------------------------------------------------ wiring */

let wired = false;

function forgetOpen() {
  if (!state.openId) return;
  state.openId = null;
  if (/^#\/library\//.test(location.hash)) writeHash();
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
    if (/^#\/library(\/|$)/.test(location.hash) || !state.openId) return;
    state.openId = null;
    if (drawerIsOpen()) closeDrawer();
  });
}

function paint() {
  const grid = state.root && state.root.querySelector('#lib-grid');
  const count = state.root && state.root.querySelector('#lib-count');
  if (!grid || !count) return;
  const list = sortMethods(state.methods.filter(matches));
  grid.innerHTML = state.view === 'table' ? tableHtml(list) : gridHtml(list);
  count.innerHTML = countHtml(list.length, state.methods.length);
  writeHash();
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

function csvOf(list) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Method', 'Family', 'Year', 'Teacher access', 'Data needed', 'Difficulty', 'Description', 'Paper']];
  list.forEach((m) => rows.push([
    m.name, m.family, m.year, ACCESS_LABELS[m.teacherAccess] || '',
    DATA_LABELS[m.dataNeeded] || m.dataNeeded || '',
    m.difficulty ? m.difficulty + ' of 5 (' + DIFFICULTY_LABELS[m.difficulty - 1] + ')' : '',
    plainText(m.description), m.url || m.paper,
  ]));
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}

function downloadCsv() {
  const list = sortMethods(state.methods.filter(matches));
  try {
    const blob = new Blob([csvOf(list)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'global-distillation-methods.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (_) { /* a blocked download is not worth an exception */ }
}

function wireView(el) {
  const input = el.querySelector('#lib-q');
  if (input) {
    input.addEventListener('input', () => { state.q = input.value; paint(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; state.q = ''; paint(); }
    });
  }
  const sort = el.querySelector('#lib-sort');
  if (sort) sort.addEventListener('change', () => { state.sort = sort.value; paint(); });

  el.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-lib-filter]');
    if (chip) {
      const kind = chip.getAttribute('data-lib-filter');
      const raw = chip.getAttribute('data-value');
      const set = kind === 'family' ? state.fFamily : kind === 'difficulty' ? state.fDifficulty : state.fAccess;
      const value = kind === 'difficulty' ? Number(raw) : raw;
      if (set.has(value)) { set.delete(value); chip.setAttribute('aria-pressed', 'false'); }
      else { set.add(value); chip.setAttribute('aria-pressed', 'true'); }
      paint();
      return;
    }
    const view = e.target.closest('[data-lib-view]');
    if (view) {
      state.view = view.getAttribute('data-lib-view');
      el.querySelectorAll('[data-lib-view]').forEach((b) => {
        const on = b === view;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      paint();
      return;
    }
    if (e.target.closest('[data-lib-csv]')) { downloadCsv(); return; }
    if (e.target.closest('[data-reset]')) { resetFilters(); return; }
    const card = e.target.closest('[data-method]');
    if (card) {
      const m = state.byId.get(card.getAttribute('data-method'));
      if (m) showMethod(m, false);
    }
  });
}

/* ------------------------------------------------------------------ render */

export function renderLibrary(el, d, param) {
  if (!el) return;
  resetCharts();
  wireGlobal();
  state.root = el;
  state.openId = null;
  ingest(d);
  clearFilterState();
  const openId = readParam(param);

  const title = (d && d.title) || 'The distillation method library';
  const standfirst = (d && d.summary) ||
    'Every technique that moves capability from a large teacher model into a smaller student, with the ' +
    'objective it optimises, the teacher access it requires, and the tools that implement it.';
  const updated = (d && d.updated) ? String(d.updated).slice(0, 10) : '';

  if (!state.methods.length) {
    const head = '<header class="section__head"><div>' +
      '<p class="eyebrow"><span class="eyebrow__dot"></span>Reference · Library</p>' +
      '<h1 class="section__title">' + esc(title) + '</h1>' +
      '<p class="section__standfirst">' + esc(standfirst) + '</p>' +
      '</div></header>';
    el.innerHTML = '<section class="section lib">' + head + emptyStateHtml(d) + '</section>';
    return;
  }

  // The library is a perspective file like any other: it carries statistics,
  // findings, charts, tables, a glossary and a source list, and every one of
  // them is rendered with the same components the other routes use.
  const blocks = sectionBlocks(d, 'library');
  const paras = splitParagraphs(standfirst, 300);
  const meta = '<p class="section__meta">' +
    plural(state.methods.length, 'method') + '<br>' + plural(state.families.length, 'family', 'families') +
    ((d && d.stats || []).length ? '<br>' + plural(d.stats.length, 'figure') : '') +
    (blocks.nCharts ? '<br>' + plural(blocks.nCharts, 'chart') : '') +
    (blocks.nTables ? '<br>' + plural(blocks.nTables, 'table') : '') +
    (blocks.nSources ? '<br>' + plural(blocks.nSources, 'source') : '') +
    (updated ? '<br>Revised ' + esc(updated) : '') + '</p>';

  const head = '<header class="section__head">' +
    '<div>' +
      '<p class="eyebrow"><span class="eyebrow__dot"></span>Reference · Library</p>' +
      '<h1 class="section__title">' + esc(title) + '</h1>' +
      paras.map((p, i) => '<p class="section__standfirst' + (i ? ' section__standfirst--rest' : '') + '">' +
        esc(p) + '</p>').join('') +
    '</div>' + meta +
  '</header>';

  const nav = navBlock([
    (d.stats || []).length ? { id: 'sec-figures', label: 'Figures', count: d.stats.length } : null,
    (d.keyFindings || []).length ? { id: 'sec-findings', label: 'Findings', count: d.keyFindings.length } : null,
    { id: 'sec-methods', label: 'Methods', count: state.methods.length },
    blocks.nCharts ? { id: 'sec-charts', label: 'Charts', count: blocks.nCharts } : null,
    blocks.nTables ? { id: 'sec-tables', label: 'Tables', count: blocks.nTables } : null,
    (d.glossary || []).length ? { id: 'sec-glossary', label: 'Glossary', count: d.glossary.length } : null,
    { id: 'sec-sources', label: 'Sources', count: blocks.nSources },
  ]);

  el.innerHTML = '<section class="section lib" data-perspective="library">' + head + nav +
    (blocks.stats ? '<div id="sec-figures">' + blocks.stats + '</div>' : '') +
    blocks.findings +
    '<h2 class="subhead" id="sec-methods">The methods<span class="dim"> · ' +
      esc(plural(state.methods.length, 'method')) + '</span></h2>' +
    '<p class="note note--lede">Every entry links the paper it comes from, and its loss function is ' +
    'reproduced from that paper. Walk the three constraints — what the teacher exposes, what data you have, ' +
    'how much implementation effort you can spend — to a shortlist, then open a card for the objective itself.</p>' +
    controlsHtml() +
    '<div id="lib-grid"></div>' +
    '<p class="lib-note">Difficulty is a judgement about implementation effort, not about how well the method ' +
    'works. Colour names the family and nothing else; the same eleven hues are used wherever families appear.</p>' +
    blocks.charts + blocks.tables + blocks.glossary + blocks.sources +
    '</section>';

  paint();
  wireView(el);
  mountRendered(el);

  if (openId) openById(openId);
}
