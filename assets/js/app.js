// Global Distillation — application shell: routing, data loading, module wiring.
// Module contract lives in BUILD-CONTRACT.md. Do not change exports without updating it.

import { mountHero } from './hero.js';
import { renderSection, renderOverview, renderCompare, renderMethodology } from './render.js';
import { renderLibrary, openMethod } from './library.js';
import { initPalette, buildIndex } from './palette.js';

export const ROUTES = [
  { id: 'overview',    label: 'Overview',   sub: 'Key figures, one page',         group: 'perspective', file: null },
  { id: 'academic',    label: 'Academic',   sub: 'Papers, benchmarks, retention', group: 'perspective', file: 'academic' },
  { id: 'financial',   label: 'Financial',  sub: 'Token prices, training cost',   group: 'perspective', file: 'financial' },
  { id: 'political',   label: 'Political',  sub: 'Regulation, export controls',   group: 'perspective', file: 'political' },
  { id: 'company',     label: 'Company',    sub: 'Terms of service, disputes',    group: 'perspective', file: 'company' },
  { id: 'developer',   label: 'Developer',  sub: 'Tooling, recipes, platforms',   group: 'perspective', file: 'developer' },
  { id: 'customer',    label: 'Customer',   sub: 'What to buy, at what price',    group: 'perspective', file: 'customer' },
  { id: 'library',     label: 'Library',    sub: 'Distillation methods explained', group: 'reference',  file: 'library' },
  { id: 'timeline',    label: 'Timeline',   sub: '2006 to today',                  group: 'reference',  file: 'timeline' },
  { id: 'compare',     label: 'Compare',    sub: 'Build your own comparison',      group: 'reference',  file: null },
];

const NAV_IDS = ['overview','academic','financial','political','company','developer','customer','library','timeline'];

/** @type {Record<string, any>} */
export const data = {};
export let live = null;

const cache = new Map();

export async function loadPerspective(name) {
  if (!name) return null;
  if (cache.has(name)) return cache.get(name);
  const p = fetch('data/' + name + '.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((json) => { if (json) data[name] = json; return json; });
  cache.set(name, p);
  return p;
}

export function currentRoute() {
  const raw = (location.hash || '#/overview').replace(/^#\/?/, '');
  const parts = raw.split('/');
  const route = ROUTES.find((r) => r.id === parts[0]);
  return { route: route || ROUTES[0], param: parts.slice(1).join('/') || null };
}

function buildNav() {
  const nav = document.getElementById('nav-links');
  nav.innerHTML = NAV_IDS.map((id) => {
    const r = ROUTES.find((x) => x.id === id);
    return '<a class="nav__link" href="#/' + r.id + '" data-route="' + r.id + '">' + r.label + '</a>';
  }).join('');

  const fill = (el, group, offset) => {
    el.innerHTML = ROUTES.filter((r) => r.group === group).map((r, i) => {
      const n = String(i + offset).padStart(2, '0');
      return '<li><a class="rail__item" href="#/' + r.id + '" data-route="' + r.id + '">' +
        '<span class="rail__num">' + n + '</span>' +
        '<span class="rail__text"><span class="rail__name">' + r.label + '</span>' +
        '<span class="rail__sub">' + r.sub + '</span></span></a></li>';
    }).join('');
  };
  fill(document.getElementById('rail-list'), 'perspective', 0);
  fill(document.getElementById('rail-list-ref'), 'reference', 7);
}

function markActive(id) {
  document.querySelectorAll('a[data-route]').forEach((el) => {
    const on = el.dataset.route === id;
    el.classList.toggle('is-active', on);
    if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
}

function setRailFoot() {
  const el = document.getElementById('rail-foot');
  const stamp = live && live.updated ? String(live.updated).slice(0, 10) : '—';
  const sources = Object.values(data).reduce((n, d) => n + ((d && d.sources && d.sources.length) || 0), 0);
  el.innerHTML = '<span class="rail__pulse" aria-hidden="true"></span><span>Live data refreshed ' + stamp +
    '<br>' + (sources ? sources + ' primary sources' : 'Loading sources') + '</span>';
  const foot = document.getElementById('foot-updated');
  if (foot) foot.textContent = 'A public compendium of AI model distillation. Live signals refreshed ' + stamp +
    '. Figures link to their primary sources.';
}

let heroMounted = false;

async function route() {
  const { route: r, param } = currentRoute();
  markActive(r.id);
  const hero = document.getElementById('hero');
  const isOverview = r.id === 'overview';
  hero.hidden = !isOverview;
  const view = document.getElementById('view');
  view.innerHTML = '<div class="skeleton skeleton--page" aria-label="Loading"></div>';

  if (isOverview && !heroMounted) { heroMounted = true; mountHero(document.getElementById('hero-canvas')); }

  try {
    if (isOverview) {
      await Promise.all(ROUTES.filter((x) => x.file).map((x) => loadPerspective(x.file)));
      renderOverview(view, { data, live });
    } else if (r.id === 'compare') {
      await Promise.all(['customer', 'financial'].map(loadPerspective));
      renderCompare(view, { data, live });
    } else if (r.id === 'library') {
      const d = await loadPerspective('library');
      renderLibrary(view, d, param);
    } else {
      const d = await loadPerspective(r.file);
      renderSection(view, d, r);
    }
  } catch (err) {
    view.innerHTML = '<div class="callout callout--bad"><p>This section failed to load. ' +
      String((err && err.message) || err) + '</p></div>';
    console.error(err);
  }

  setRailFoot();
  buildIndex({ data, routes: ROUTES });
  document.getElementById('rail').classList.remove('is-open');
  document.getElementById('rail-scrim').hidden = true;
  if (param && r.id === 'library') openMethod(param);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---- drawer -------------------------------------------------------------
let lastFocus = null;

export function openDrawer(html, title) {
  const d = document.getElementById('drawer');
  lastFocus = document.activeElement;
  document.getElementById('drawer-body').innerHTML = html;
  d.hidden = false;
  document.body.classList.add('is-locked');
  requestAnimationFrame(() => d.classList.add('is-open'));
  d.querySelector('.drawer__close').focus();
  if (title) document.getElementById('drawer-body').setAttribute('aria-label', title);
}

export function closeDrawer() {
  const d = document.getElementById('drawer');
  if (d.hidden) return;
  d.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  setTimeout(() => { d.hidden = true; }, 200);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function trapFocus(container, e) {
  const nodes = Array.from(container.querySelectorAll(
    'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
  )).filter((n) => n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function wireChrome() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-drawer]')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    const drawer = document.getElementById('drawer');
    if (drawer.hidden) return;
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key === 'Tab') trapFocus(drawer, e);
  });
  const rail = document.getElementById('rail');
  const scrim = document.getElementById('rail-scrim');
  document.getElementById('open-rail').addEventListener('click', (e) => {
    const open = rail.classList.toggle('is-open');
    scrim.hidden = !open;
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  scrim.addEventListener('click', () => { rail.classList.remove('is-open'); scrim.hidden = true; });
  if (!/Mac|iPhone|iPad/.test(navigator.platform || '')) {
    const k = document.getElementById('kbd-hint');
    if (k) k.textContent = 'Ctrl K';
  }
}

async function boot() {
  buildNav();
  wireChrome();
  initPalette();
  live = await fetch('data/live.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  window.addEventListener('hashchange', route);
  await route();
}

boot();
