// Global Distillation — command palette.
// Exports: initPalette(), buildIndex({ data, routes }).
// Indexes sections, methods, models, companies, tools, glossary terms and timeline
// events from whatever perspectives have loaded. Fuzzy subsequence match, grouped
// results, full keyboard control. Never throws on missing or partial data.

import { closeDrawer, loadPerspective, ROUTES, data as appData } from './app.js';
import { openCompany } from './sections-b.js';

const MAX_RESULTS = 40;
const PER_GROUP_MAX = 10;

/* ---------------------------------------------------------------- helpers */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function niceDate(value) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(value || ''));
  if (!m) return String(value || '');
  const month = m[2] ? MONTHS[Number(m[2]) - 1] : null;
  if (m[3] && month) return Number(m[3]) + ' ' + month + ' ' + m[1];
  if (month) return month + ' ' + m[1];
  return m[1];
}

function clip(text, max) {
  const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/[\s,;:.\-]+$/, '') + '…';
}

/** Long tool and product names carry a parenthetical inventory; drop it in the title. */
function shortTitle(name) {
  const s = String(name || '').trim();
  if (s.length <= 48) return s;
  const cut = s.indexOf(' (');
  if (cut > 12) return s.slice(0, cut);
  return clip(s, 60);
}

function joinParts(parts) {
  return parts.filter((p) => p != null && p !== '' && p !== false).join(' · ');
}

function money(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  return '$' + (n >= 10 ? n.toFixed(0) : n.toFixed(2).replace(/0$/, '')) + '/M';
}

/* --------------------------------------------------------------- matching */

const BOUNDARY = /[\s\-_/.,:;()[\]{}·—–|+]/;

/**
 * Score one lowercase token against a lowercase haystack.
 * Contiguous substrings beat scattered subsequences; prefix and word-boundary
 * starts beat mid-word hits; shorter fields beat longer ones.
 * `fuzzy` allows a scattered subsequence (titles only) — a long body field will
 * contain almost any short letter sequence somewhere, which is only noise.
 * @returns {{score:number, positions:number[]}|null}
 */
function scoreToken(lower, token, fuzzy) {
  const idx = lower.indexOf(token);
  let out = null;

  if (idx >= 0) {
    let score = 58 - Math.min(idx, 24);
    if (idx === 0) score += 46;
    else if (BOUNDARY.test(lower[idx - 1])) score += 30;
    const positions = [];
    for (let i = 0; i < token.length; i++) positions.push(idx + i);
    out = { score, positions };
  } else {
    if (!fuzzy || token.length < 2) return null;
    let pos = 0;
    let prev = -2;
    let score = 0;
    let strong = 0;
    const positions = [];
    for (let i = 0; i < token.length; i++) {
      const at = lower.indexOf(token[i], pos);
      if (at < 0) return null;
      let step = 1;
      if (at === prev + 1) { step += 6; strong++; }
      else if (at === 0 || BOUNDARY.test(lower[at - 1])) { step += 9; strong++; }
      else step -= Math.min((at - pos) * 0.3, 3);
      score += step;
      positions.push(at);
      prev = at;
      pos = at + 1;
    }
    // Reject scattered noise: the run must stay tight and mostly land on
    // word starts or contiguous runs.
    const span = positions[positions.length - 1] - positions[0] + 1;
    if (span > token.length * 4 + 8) return null;
    // The longer the query, the less a scattered match can be a coincidence
    // worth showing: "price" found its letters inside "Code of Practice" and
    // ranked it second. Past four characters a subsequence has to be a near-run
    // — a typo or a dropped letter — not a set of letters that happen to be
    // there in order.
    if (strong / token.length < (token.length >= 5 ? 0.85 : 0.5)) return null;
    out = { score: Math.max(score, 1), positions };
  }

  out.score += 14 * (token.length / Math.max(lower.length, token.length));
  return out;
}

/** @returns {{score:number, positions:number[]}|null} */
function scoreEntry(entry, tokens, query) {
  let total = entry.weight;
  const positions = [];

  for (let i = 0; i < tokens.length; i++) {
    const inTitle = scoreToken(entry.titleLower, tokens[i], true);
    if (inTitle) {
      total += inTitle.score;
      for (let p = 0; p < inTitle.positions.length; p++) positions.push(inTitle.positions[p]);
      continue;
    }
    const inBody = scoreToken(entry.hay, tokens[i], false);
    if (!inBody) return null;
    total += inBody.score * 0.34;
  }

  if (entry.titleLower === query) total += 120;
  else if (entry.titleLower.startsWith(query)) total += 55;
  total -= Math.min(entry.title.length / 14, 6);

  return { score: total, positions };
}

function highlight(title, positions) {
  if (!positions || !positions.length) return esc(title);
  const hit = new Set(positions);
  let html = '';
  let open = false;
  for (let i = 0; i < title.length; i++) {
    const on = hit.has(i);
    if (on && !open) { html += '<mark class="palette__hit">'; open = true; }
    else if (!on && open) { html += '</mark>'; open = false; }
    html += esc(title[i]);
  }
  return open ? html + '</mark>' : html;
}

/* ------------------------------------------------------------------ index */

const GROUPS = [
  ['section', 'Sections'],
  ['method', 'Methods'],
  ['model', 'Models'],
  ['company', 'Companies'],
  ['tool', 'Tools'],
  ['term', 'Glossary'],
  ['event', 'Timeline'],
  ['suggestion', 'Try a search'],
];
const GROUP_LABEL = new Map(GROUPS);
const GROUP_ORDER = new Map(GROUPS.map(([id], i) => [id, i]));

const BADGE = {
  section: 'Section', method: 'Method', model: 'Model', company: 'Company',
  tool: 'Tool', term: 'Term', event: 'Event', suggestion: 'Search',
};

const WEIGHT = {
  section: 16, method: 9, model: 7, company: 5, tool: 5, term: 2, event: 0, suggestion: 0,
};

/** @type {Array<object>} */
let INDEX = [];
let indexStamp = '';

const CANDIDATE_QUERIES = [
  'DeepSeek', 'sequence-level', 'logit', 'OpenAI', 'GPQA', 'Qwen',
  'terms of service', 'on-policy', 'vLLM', 'Gemma', 'export controls', 'token price',
];

function makeEntry(type, title, subtitle, hash, extraHay, methodId, companyId) {
  const displayTitle = shortTitle(title);
  if (!displayTitle) return null;
  return {
    type,
    title: displayTitle,
    titleLower: displayTitle.toLowerCase(),
    subtitle: subtitle || '',
    badge: BADGE[type] || type,
    hash: hash || '#/overview',
    methodId: methodId || null,
    companyId: companyId || null,
    weight: WEIGHT[type] || 0,
    hay: (displayTitle + ' ' + (title !== displayTitle ? title + ' ' : '') +
      (subtitle || '') + ' ' + (extraHay || '') + ' ' + (BADGE[type] || '')).toLowerCase(),
  };
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

export function buildIndex(ctx) {
  const out = [];
  const data = (ctx && ctx.data) || {};
  const routes = arrayOf(ctx && ctx.routes);

  const push = (entry) => { if (entry) out.push(entry); };
  const safely = (fn) => { try { fn(); } catch (err) { /* one bad shape must not kill the index */ } };

  // Sections ------------------------------------------------------------
  safely(() => {
    routes.forEach((r) => {
      if (!r || !r.id) return;
      push(makeEntry('section', r.label || r.id, r.sub || '', '#/' + r.id, r.id + ' ' + (r.group || '')));
    });
  });

  const hashFor = (name) => (routes.some((r) => r && r.file === name) ?
    '#/' + (routes.find((r) => r.file === name).id) : '#/' + name);

  // Methods -------------------------------------------------------------
  safely(() => {
    arrayOf(data.library && data.library.extras && data.library.extras.methods).forEach((m) => {
      if (!m || !m.name) return;
      const sub = joinParts([m.family, m.year, clip(m.description, 96)]);
      push(makeEntry('method', m.name, sub, '#/library/' + (m.id || ''),
        joinParts([m.family, m.teacherAccess, m.dataNeeded, m.paper, m.whenToUse]) + ' ' +
        arrayOf(m.tools).join(' '), m.id || null));
    });
  });

  // Models — customer first, financial fills the gaps -------------------
  const seenModel = new Set();
  safely(() => {
    arrayOf(data.customer && data.customer.extras && data.customer.extras.models).forEach((m) => {
      if (!m || !m.model) return;
      const key = String(m.model).toLowerCase();
      if (seenModel.has(key)) return;
      seenModel.add(key);
      const sub = joinParts([
        m.vendor,
        typeof m.params_b === 'number' ? m.params_b + 'B params' : null,
        money(m.input_per_mtok_usd) ? money(m.input_per_mtok_usd) + ' in' : null,
        m.isDistilled ? (m.teacher ? 'distilled from ' + m.teacher : 'distilled') : null,
      ]);
      push(makeEntry('model', m.model, sub, hashFor('customer'),
        joinParts([m.license, m.teacher, m.releaseDate])));
    });
  });
  safely(() => {
    arrayOf(data.financial && data.financial.extras && data.financial.extras.pricing).forEach((p) => {
      if (!p || !p.model) return;
      const key = String(p.model).toLowerCase();
      if (seenModel.has(key)) return;
      seenModel.add(key);
      const sub = joinParts([
        p.vendor, p.tier,
        money(p.input_per_mtok_usd) ? money(p.input_per_mtok_usd) + ' in' : null,
        money(p.output_per_mtok_usd) ? money(p.output_per_mtok_usd) + ' out' : null,
      ]);
      push(makeEntry('model', p.model, sub, hashFor('financial'), joinParts([p.release, p.params_b])));
    });
  });

  // Companies -----------------------------------------------------------
  safely(() => {
    arrayOf(data.company && data.company.extras && data.company.extras.companies).forEach((c) => {
      if (!c || !c.name) return;
      const models = arrayOf(c.distilledModels);
      const sub = joinParts([
        c.hq, c.stance ? c.stance + ' stance' : null,
        models.length ? models.length + ' distilled model' + (models.length === 1 ? '' : 's') : null,
      ]);
      // A company result opens that company's dossier drawer; without this it
      // navigates to a route the reader is often already on and does nothing.
      push(makeEntry('company', c.name, sub, hashFor('company'),
        models.join(' ') + ' ' + (c.tosClause || ''), null, c.name));
    });
  });

  // Tools ---------------------------------------------------------------
  safely(() => {
    arrayOf(data.developer && data.developer.extras && data.developer.extras.tools).forEach((t) => {
      if (!t || !t.name) return;
      const sub = clip(t.oneLiner || joinParts([t.vendor, t.type]), 110);
      push(makeEntry('tool', t.name, sub, hashFor('developer'),
        joinParts([t.vendor, t.type, t.openSource ? 'open source' : null]) + ' ' +
        arrayOf(t.techniques).join(' ')));
    });
  });

  // Glossary across every loaded perspective ----------------------------
  const seenTerm = new Set();
  safely(() => {
    Object.keys(data).forEach((name) => {
      arrayOf(data[name] && data[name].glossary).forEach((g) => {
        if (!g || !g.term) return;
        const key = String(g.term).toLowerCase();
        if (seenTerm.has(key)) return;
        seenTerm.add(key);
        push(makeEntry('term', g.term, clip(g.definition, 120), hashFor(name), g.definition));
      });
    });
  });

  // Timeline events across every loaded perspective ---------------------
  const seenEvent = new Set();
  safely(() => {
    // The timeline perspective is the canonical home for an event, so let it
    // claim each title before a perspective that merely repeats it.
    const names = ['timeline'].concat(Object.keys(data).filter((n) => n !== 'timeline'));
    names.forEach((name) => {
      arrayOf(data[name] && data[name].timeline).forEach((ev) => {
        if (!ev || !ev.title) return;
        const key = String(ev.title).toLowerCase();
        if (seenEvent.has(key)) return;
        seenEvent.add(key);
        push(makeEntry('event', ev.title, joinParts([niceDate(ev.date), clip(ev.detail, 96)]),
          hashFor(name), joinParts([ev.category, ev.date])));
      });
    });
  });

  INDEX = out;
  const stamp = out.length + ':' + Object.keys(data).sort().join(',');
  if (stamp !== indexStamp) {
    indexStamp = stamp;
    if (isOpen()) scheduleRender();
  }
}

/* ------------------------------------------------------------------ query */

function search(rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    const sections = INDEX.filter((e) => e.type === 'section');
    return suggestionRows(4).map((e) => ({ entry: e, score: 1, positions: [] }))
      .concat(sections.map((e) => ({ entry: e, score: 0, positions: [] })));
  }

  const tokens = query.split(/\s+/).filter(Boolean);
  const hits = [];
  for (let i = 0; i < INDEX.length; i++) {
    const scored = scoreEntry(INDEX[i], tokens, query);
    if (scored) hits.push({ entry: INDEX[i], score: scored.score, positions: scored.positions });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length);

  // One type must not eat all forty slots: a query like "distil" matches dozens
  // of glossary terms and would otherwise bury the sections and methods.
  const perType = new Map();
  const kept = [];
  for (let i = 0; i < hits.length && kept.length < MAX_RESULTS; i++) {
    const type = hits[i].entry.type;
    const n = perType.get(type) || 0;
    if (n >= PER_GROUP_MAX) continue;
    perType.set(type, n + 1);
    kept.push(hits[i]);
  }
  return kept;
}

/** Suggested queries, filtered to the ones that actually return something. */
function suggestionRows(limit) {
  const live = [];
  for (let i = 0; i < CANDIDATE_QUERIES.length && live.length < (limit || 5); i++) {
    const q = CANDIDATE_QUERIES[i].toLowerCase();
    const tokens = q.split(/\s+/);
    if (INDEX.some((e) => scoreEntry(e, tokens, q))) live.push(CANDIDATE_QUERIES[i]);
  }
  const use = live.length ? live : ['overview', 'library'];
  return use.map((q) => {
    const entry = makeEntry('suggestion', q, '', '#/overview', '');
    entry.query = q;
    return entry;
  });
}

/* ------------------------------------------------------------------- view */

let el = { root: null, input: null, list: null, trigger: null, count: null };
let rendered = [];
let selected = 0;
let rafId = 0;
let returnFocus = null;

const isOpen = () => !!(el.root && !el.root.hidden);

function scheduleRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = 0; render(); });
}

function render() {
  if (!el.list) return;
  const query = el.input ? el.input.value : '';
  const hits = search(query);
  rendered = hits.map((h) => h.entry);

  // Group, keeping the strongest group first and score order inside each group.
  const buckets = new Map();
  hits.forEach((h, i) => {
    const key = h.entry.type;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ hit: h, i });
  });
  const order = Array.from(buckets.keys()).sort((a, b) => {
    const sa = buckets.get(a)[0].hit.score;
    const sb = buckets.get(b)[0].hit.score;
    if (sb !== sa) return sb - sa;
    return (GROUP_ORDER.get(a) || 0) - (GROUP_ORDER.get(b) || 0);
  });

  let html = '';
  if (!hits.length) {
    html += '<li class="palette__empty" role="presentation">No matches for &ldquo;' +
      esc(clip(query, 48)) + '&rdquo;. Search covers sections, distillation methods, models, ' +
      'companies, tooling, glossary terms and timeline events across every loaded perspective.</li>';
    const rows = suggestionRows(5);
    rendered = rows;
    html += '<li class="palette__group" role="presentation">Try a search</li>';
    rows.forEach((entry, i) => { html += optionHtml(entry, [], i); });
  } else {
    order.forEach((type) => {
      html += '<li class="palette__group" role="presentation">' +
        esc(GROUP_LABEL.get(type) || type) + '</li>';
      buckets.get(type).forEach(({ hit, i }) => { html += optionHtml(hit.entry, hit.positions, i); });
    });
  }

  el.list.innerHTML = html;
  el.list.scrollTop = 0;
  if (el.count) {
    el.count.textContent = rendered.length ?
      rendered.length + (rendered.length === MAX_RESULTS ? '+ results' : ' result' + (rendered.length === 1 ? '' : 's')) :
      'No results';
  }
  setSelected(0, false);
}

function optionHtml(entry, positions, i) {
  return '<li class="palette__item" role="option" id="palette-opt-' + i + '" aria-selected="false" data-i="' + i + '">' +
    '<span class="palette__label">' + highlight(entry.title, positions) +
    (entry.subtitle ? '<small>' + esc(entry.subtitle) + '</small>' : '') + '</span>' +
    '<span class="palette__type">' + esc(entry.badge) + '</span>' +
    '</li>';
}

function setSelected(index, scroll) {
  if (!el.list) return;
  const options = el.list.querySelectorAll('.palette__item');
  if (!options.length) {
    selected = 0;
    el.list.removeAttribute('aria-activedescendant');
    if (el.input) el.input.removeAttribute('aria-activedescendant');
    return;
  }
  selected = ((index % options.length) + options.length) % options.length;
  for (let i = 0; i < options.length; i++) {
    const on = Number(options[i].dataset.i) === selected;
    options[i].setAttribute('aria-selected', on ? 'true' : 'false');
    options[i].classList.toggle('is-active', on);
    if (on) {
      const id = options[i].id;
      el.list.setAttribute('aria-activedescendant', id);
      if (el.input) el.input.setAttribute('aria-activedescendant', id);
      if (scroll) options[i].scrollIntoView({ block: 'nearest' });
    }
  }
}

function move(delta) {
  if (!rendered.length) return;
  setSelected(selected + delta, true);
}

/* ---------------------------------------------------------------- actions */

async function openMethodById(id) {
  try {
    const lib = await import('./library.js');
    if (lib && typeof lib.openMethod === 'function') lib.openMethod(id);
  } catch (err) {
    /* library module unavailable — the hash change already moved the reader */
  }
}

function activate(entry) {
  if (!entry) return;

  if (entry.type === 'suggestion') {
    if (el.input) {
      el.input.value = entry.query;
      el.input.focus();
      el.input.setSelectionRange(entry.query.length, entry.query.length);
    }
    render();
    return;
  }

  close({ restore: false });

  const target = entry.hash;
  const same = location.hash === target || (!location.hash && target === '#/overview');
  if (!same) location.hash = target;
  if (entry.methodId && same) openMethodById(entry.methodId);
  // The dossiers register when the company section renders, so a result opened
  // from another route waits for that render before it can show one.
  if (entry.companyId) {
    const tryOpen = (left) => {
      if (openCompany(entry.companyId)) return;
      if (left > 0) setTimeout(() => tryOpen(left - 1), 120);
    };
    tryOpen(same ? 0 : 14);
  }

  const main = document.getElementById('main');
  if (main && typeof main.focus === 'function') main.focus({ preventScroll: true });
}

// A reader who deep-links straight to one section has only that perspective in
// `data`. Searching should not depend on where you happen to be standing, so the
// first open pulls the rest in (already-fetched files are served from app.js's
// cache) and rebuilds the index when they arrive.
let warmed = false;

function warmIndex() {
  if (warmed) return;
  warmed = true;
  const files = ROUTES.map((r) => r.file).filter(Boolean);
  Promise.all(files.map((f) => loadPerspective(f)))
    .then(() => buildIndex({ data: appData, routes: ROUTES }))
    .catch(() => { /* a missing perspective just stays out of the index */ });
}

function open() {
  if (!el.root || isOpen()) return;
  warmIndex();
  returnFocus = (document.activeElement && document.activeElement !== document.body) ?
    document.activeElement : el.trigger;

  const drawer = document.getElementById('drawer');
  if (drawer && !drawer.hidden) { try { closeDrawer(); } catch (err) { /* noop */ } }

  el.root.hidden = false;
  void el.root.offsetWidth;
  el.root.classList.add('is-open');
  document.body.classList.add('is-locked');
  if (el.trigger) el.trigger.setAttribute('aria-expanded', 'true');

  render();
  if (el.input) { el.input.focus(); el.input.select(); }
}

function close(opts) {
  if (!el.root || !isOpen()) return;
  el.root.classList.remove('is-open');
  el.root.hidden = true;
  document.body.classList.remove('is-locked');
  if (el.trigger) el.trigger.setAttribute('aria-expanded', 'false');
  el.list.removeAttribute('aria-activedescendant');
  if (el.input) el.input.removeAttribute('aria-activedescendant');

  const restore = !opts || opts.restore !== false;
  // The remembered element can have been removed or hidden meanwhile (a drawer
  // closed on the way in, a re-rendered view); fall back to the search button.
  const usable = returnFocus && returnFocus.isConnected && returnFocus.offsetParent !== null;
  const node = usable ? returnFocus : el.trigger;
  if (restore && node && typeof node.focus === 'function') {
    try { node.focus(); } catch (err) { /* noop */ }
  }
  returnFocus = null;
}

/* ------------------------------------------------------------------- init */

let started = false;

export function initPalette() {
  if (started) return;
  const root = document.getElementById('palette');
  const input = document.getElementById('palette-input');
  const list = document.getElementById('palette-list');
  if (!root || !input || !list) return;
  started = true;


  el = { root, input, list, trigger: document.getElementById('open-palette'), count: null };

  const hint = root.querySelector('.palette__hint');
  if (hint) {
    const count = document.createElement('span');
    count.className = 'palette__count';
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    hint.appendChild(count);
    el.count = count;
  }

  input.addEventListener('input', scheduleRender);

  input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'PageDown': e.preventDefault(); move(8); break;
      case 'PageUp': e.preventDefault(); move(-8); break;
      case 'Home': if (rendered.length) { e.preventDefault(); setSelected(0, true); } break;
      case 'End': if (rendered.length) { e.preventDefault(); setSelected(rendered.length - 1, true); } break;
      case 'Enter': e.preventDefault(); activate(rendered[selected]); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': e.preventDefault(); break;
      default: break;
    }
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest && e.target.closest('.palette__item');
    if (!li) return;
    activate(rendered[Number(li.dataset.i)]);
  });

  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest && e.target.closest('.palette__item');
    if (!li) return;
    const i = Number(li.dataset.i);
    if (i !== selected) setSelected(i, false);
  });

  root.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-close-palette]') || e.target === root) { e.preventDefault(); close(); }
  });

  if (el.trigger) {
    el.trigger.setAttribute('aria-haspopup', 'dialog');
    el.trigger.setAttribute('aria-expanded', 'false');
    el.trigger.addEventListener('click', () => (isOpen() ? close() : open()));
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (isOpen()) close(); else open();
      return;
    }
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(); }
  });

  window.addEventListener('hashchange', () => { if (isOpen()) close({ restore: false }); });
}
