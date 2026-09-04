// JSON-LD generator for Global Distillation.
//
//   import { jsonLdFor, ROUTES, loadAll, ORIGIN } from './gen-schema.mjs';
//   const graph = jsonLdFor('academic', loadAll());        // -> plain object
//   head += '<script type="application/ld+json">' + JSON.stringify(graph) + '</script>';
//
// As a CLI it writes one file per route for inspection, and (with --inline)
// refreshes the block between the json-ld markers in index.html:
//
//   node scripts/gen-schema.mjs                 # -> assets/schema/<route>.json
//   node scripts/gen-schema.mjs --inline        # ... and rewrites index.html's block
//   node scripts/gen-schema.mjs --origin https://example.com
//
// Every string in the output is copied from data/<perspective>.json, from
// index.html, or from package.json. Nothing here describes the data; the data
// describes itself. Types are only emitted when the page really carries the
// thing they claim: no FAQPage without verbatim question/answer pairs in the
// data, no ratings, no reviews, no invented keywords.
//
// Note: #/methodology is reachable from the hero but is not registered in
// app.js ROUTES, so it has no canonical URL yet and is deliberately absent here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argOrigin = (() => {
  const i = process.argv.indexOf('--origin');
  return i > -1 ? process.argv[i + 1] : null;
})();

export const ORIGIN = (argOrigin || process.env.SITE_ORIGIN || 'https://global-distillation.com').replace(/\/$/, '');

/** MIT, per LICENSE and package.json. */
export const LICENSE = 'https://opensource.org/licenses/MIT';

/** Verbatim from index.html's <meta name="description">. */
export const SITE_DESCRIPTION =
  'How frontier intelligence is compressed, priced and contested. AI model distillation examined ' +
  'from academic, financial, political, company, developer and customer perspectives, with a ' +
  'library of methods.';

/** id/name/sub copied from ROUTES in assets/js/app.js; file names the data file. */
export const ROUTES = [
  { id: '',          file: null,        name: 'Overview',   sub: 'Key figures, one page' },
  { id: 'academic',  file: 'academic',  name: 'Academic',   sub: 'Papers, benchmarks, retention' },
  { id: 'financial', file: 'financial', name: 'Financial',  sub: 'Token prices, training cost' },
  { id: 'political', file: 'political', name: 'Political',  sub: 'Regulation, export controls' },
  { id: 'company',   file: 'company',   name: 'Company',    sub: 'Terms of service, disputes' },
  { id: 'developer', file: 'developer', name: 'Developer',  sub: 'Tooling, recipes, platforms' },
  { id: 'customer',  file: 'customer',  name: 'Customer',   sub: 'What to buy, at what price' },
  { id: 'library',   file: 'library',   name: 'Library',    sub: 'Distillation methods explained' },
  { id: 'timeline',  file: 'timeline',  name: 'Timeline',   sub: '2006 to today' },
  { id: 'compare',   file: null,        name: 'Compare',    sub: 'Build your own comparison' },
];

const DATA_FILES = ROUTES.filter((r) => r.file).map((r) => r.file);

export const urlFor = (id) => ORIGIN + (id ? '/' + id : '/');

/* ----------------------------------------------------------------- helpers */

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/** Read every data/<perspective>.json into one bundle keyed by perspective. */
export function loadAll(dir = path.join(ROOT, 'data')) {
  const bundle = {};
  for (const f of DATA_FILES) {
    const d = readJson(path.join(dir, f + '.json'));
    if (d) bundle[f] = d;
  }
  return bundle;
}

/** Trim to whole sentences under `max` characters without adding words. */
function clamp(text, max) {
  const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (stop > max * 0.4 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '')).trim();
}

function normaliseRoute(route) {
  if (route && typeof route === 'object') {
    const known = ROUTES.find((r) => r.id === (route.id || ''));
    return { ...(known || { id: route.id || '', file: null, name: route.name || 'Overview' }), ...route };
  }
  const id = String(route == null ? '' : route).replace(/^#?\/?/, '');
  return ROUTES.find((r) => r.id === (id === 'overview' ? '' : id)) || ROUTES[0];
}

/** Accepts a single perspective object, a bundle keyed by perspective, or null. */
function pick(route, data) {
  if (!data) return null;
  if (data.perspective && data.stats) return route.file && data.perspective !== route.file ? null : data;
  return route.file ? data[route.file] || null : null;
}

/** ISO span covering the dated events in a file, e.g. "2006-08-20/2026-09-03". */
function temporalCoverage(d) {
  const dates = (d.timeline || []).map((e) => e && e.date).filter((x) => /^\d{4}/.test(String(x || '')));
  if (!dates.length) return null;
  const sorted = dates.map(String).sort();
  return sorted[0] + '/' + (d.updated && d.updated > sorted[sorted.length - 1] ? d.updated : sorted[sorted.length - 1]);
}

/** One PropertyValue per distinct table column across the file. */
function variableMeasured(d, cap = 40) {
  const seen = new Map();
  for (const t of d.tables || []) {
    for (const c of t.columns || []) {
      if (!c || !c.label) continue;
      const key = c.label + '|' + (c.unit || '');
      if (seen.has(key)) continue;
      seen.set(key, {
        '@type': 'PropertyValue',
        name: c.label,
        ...(c.unit ? { unitText: c.unit } : {}),
        ...(c.type === 'number' ? { measurementTechnique: 'Reported figure with a primary source' } : {}),
      });
    }
  }
  return [...seen.values()].slice(0, cap);
}

function citations(d, cap = 25) {
  return (d.sources || []).slice(0, cap).map((s) => ({
    '@type': 'CreativeWork',
    name: s.title || s.url,
    url: s.url,
    ...(s.publisher ? { publisher: { '@type': 'Organization', name: s.publisher } } : {}),
    ...(s.date ? { datePublished: s.date } : {}),
  }));
}

/**
 * Genuine question/answer pairs only: a table cell whose text is literally a
 * question, paired with the longest other prose cell in the same row. Nothing
 * is rephrased, and no question mark is ever appended to a statement.
 */
function faqPairs(d) {
  const out = [];
  for (const t of d.tables || []) {
    for (const row of t.rows || []) {
      const cells = Object.entries(row).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string');
      const q = cells.find(([, v]) => v.trim().endsWith('?') && v.trim().length > 12);
      if (!q) continue;
      const a = cells
        .filter(([k]) => k !== q[0])
        .map(([, v]) => v.trim())
        .filter((v) => v.length >= 60)
        .sort((x, y) => y.length - x.length)[0];
      if (a) out.push({ question: q[1].trim(), answer: a, table: t.title });
    }
  }
  return out;
}

/* ------------------------------------------------------------------- nodes */

const orgRef = () => ({ '@id': ORIGIN + '/#org' });
const siteRef = () => ({ '@id': ORIGIN + '/#website' });

function organizationNode(pkg) {
  return {
    '@type': ['Organization', 'Project'],
    '@id': ORIGIN + '/#org',
    name: 'Global Distillation',
    url: ORIGIN + '/',
    description: SITE_DESCRIPTION,
    logo: { '@type': 'ImageObject', url: ORIGIN + '/assets/favicon.svg' },
    ...(pkg && pkg.repository && pkg.repository.url
      ? { sameAs: [String(pkg.repository.url).replace(/^git\+/, '').replace(/\.git$/, '')] }
      : {}),
  };
}

function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': ORIGIN + '/#website',
    url: ORIGIN + '/',
    name: 'Global Distillation',
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
    license: LICENSE,
    publisher: orgRef(),
    // The site search is the command palette; ?q= opens it pre-filled (assets/js/meta.js).
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: ORIGIN + '/?q={search_term_string}' },
      'query-input': 'required name=search_term_string',
    },
  };
}

function datasetNode(route, d, { full }) {
  const url = urlFor(route.id);
  const coverage = temporalCoverage(d);
  return {
    '@type': 'Dataset',
    '@id': ORIGIN + '/data/' + route.file + '.json#dataset',
    name: d.title,
    description: clamp(d.summary, full ? 1200 : 400),
    url,
    inLanguage: 'en',
    license: LICENSE,
    isAccessibleForFree: true,
    creator: orgRef(),
    publisher: orgRef(),
    dateModified: d.updated,
    ...(coverage ? { temporalCoverage: coverage } : {}),
    includedInDataCatalog: { '@id': ORIGIN + '/data/#catalog' },
    distribution: [{
      '@type': 'DataDownload',
      name: route.file + '.json',
      encodingFormat: 'application/json',
      contentUrl: ORIGIN + '/data/' + route.file + '.json',
    }],
    ...(full ? { variableMeasured: variableMeasured(d) } : {}),
  };
}

function catalogNode(bundle) {
  return {
    '@type': 'DataCatalog',
    '@id': ORIGIN + '/data/#catalog',
    name: 'Global Distillation data files',
    description: 'One JSON file per perspective, published under a documented schema at ' +
      ORIGIN + '/data/SCHEMA.md.',
    url: ORIGIN + '/data/SCHEMA.md',
    license: LICENSE,
    isAccessibleForFree: true,
    publisher: orgRef(),
    dataset: DATA_FILES.filter((f) => bundle[f]).map((f) => ({ '@id': ORIGIN + '/data/' + f + '.json#dataset' })),
  };
}

/* ---------------------------------------------------------------- assembly */

/**
 * Build the JSON-LD graph for one route.
 * @param {string|{id:string,file?:string,name?:string}} route  route id ('' or 'academic'), or a route object
 * @param {object} data  one perspective object, or a bundle keyed by perspective
 * @returns {object} a schema.org @graph document, ready to JSON.stringify
 */
export function jsonLdFor(route, data) {
  const r = normaliseRoute(route);
  const url = urlFor(r.id);
  const d = pick(r, data);
  const bundle = data && !data.perspective ? data : null;
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const graph = [websiteNode(), organizationNode(pkg)];

  const stamps = Object.values(bundle || {}).map((x) => x && x.updated).filter(Boolean).sort();
  const modified = (d && d.updated) || stamps[stamps.length - 1] || null;
  const name = d ? d.title : (r.id ? r.name : 'Global Distillation');
  const description = d ? clamp(d.summary, 400) : (r.id ? r.sub : SITE_DESCRIPTION);

  graph.push({
    '@type': r.file || !r.id ? 'WebPage' : 'CollectionPage',
    '@id': url + '#webpage',
    url,
    name,
    description,
    inLanguage: 'en',
    license: LICENSE,
    isPartOf: siteRef(),
    about: {
      '@type': 'Thing',
      name: 'Knowledge distillation',
      sameAs: 'https://en.wikipedia.org/wiki/Knowledge_distillation',
    },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: ORIGIN + '/assets/og.png',
      width: 1200,
      height: 630,
    },
    breadcrumb: { '@id': url + '#breadcrumb' },
    ...(modified ? { dateModified: modified } : {}),
  });

  graph.push({
    '@type': 'BreadcrumbList',
    '@id': url + '#breadcrumb',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Global Distillation', item: ORIGIN + '/' },
      ...(r.id ? [{ '@type': 'ListItem', position: 2, name: r.name, item: url }] : []),
    ],
  });

  // The front page is the catalogue of everything published underneath it.
  if (!r.id && bundle) {
    graph.push(catalogNode(bundle));
    for (const f of DATA_FILES) {
      const dd = bundle[f];
      if (dd) graph.push(datasetNode(ROUTES.find((x) => x.file === f), dd, { full: false }));
    }
  }

  if (!d) return { '@context': 'https://schema.org', '@graph': graph };

  graph.push({
    '@type': 'Report',
    '@id': url + '#article',
    headline: clamp(d.title, 110),
    name: d.title,
    description: clamp(d.summary, 400),
    articleBody: clamp(d.summary, 1500),
    articleSection: r.name,
    url,
    mainEntityOfPage: { '@id': url + '#webpage' },
    inLanguage: 'en',
    license: LICENSE,
    datePublished: d.updated,
    dateModified: d.updated,
    isPartOf: siteRef(),
    author: orgRef(),
    publisher: orgRef(),
    image: ORIGIN + '/assets/og.png',
    about: { '@type': 'Thing', name: 'Knowledge distillation' },
    citation: citations(d),
  });

  graph.push(datasetNode(r, d, { full: true }));

  if ((d.glossary || []).length) {
    graph.push({
      '@type': 'DefinedTermSet',
      '@id': url + '#glossary',
      name: d.title + ' — glossary',
      url: url + '#glossary',
      inLanguage: 'en',
      license: LICENSE,
      hasDefinedTerm: d.glossary.map((g) => ({
        '@type': 'DefinedTerm',
        name: g.term,
        description: g.definition,
        inDefinedTermSet: { '@id': url + '#glossary' },
      })),
    });
  }

  // The library page is itself a set of defined methods, each with its paper.
  const methods = d.extras && d.extras.methods;
  if (methods && methods.length) {
    graph.push({
      '@type': 'DefinedTermSet',
      '@id': url + '#methods',
      name: 'Distillation methods',
      url,
      inLanguage: 'en',
      license: LICENSE,
      hasDefinedTerm: methods.map((m) => ({
        '@type': 'DefinedTerm',
        '@id': url + '#method-' + m.id,
        name: m.name,
        description: clamp(m.description, 600),
        url: url + '#/library/' + m.id,
        inDefinedTermSet: { '@id': url + '#methods' },
        ...(m.family ? { termCode: m.family } : {}),
        ...(m.url ? {
          subjectOf: {
            '@type': 'ScholarlyArticle',
            name: m.paper || m.url,
            url: m.url,
            ...(m.year ? { datePublished: String(m.year) } : {}),
          },
        } : {}),
      })),
    });
  }

  const faq = faqPairs(d);
  if (faq.length >= 2) {
    graph.push({
      '@type': 'FAQPage',
      '@id': url + '#faq',
      name: d.title + ' — questions answered on this page',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

/* ------------------------------------------------------- per-page head tags */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** JSON for embedding in HTML: "<" can never start a tag inside the block. */
export const serialise = (obj) => JSON.stringify(obj).replace(/</g, '\\u003C');

/** Describes assets/og.png as rendered from assets/og.html. */
export const OG_IMAGE_ALT =
  'Global Distillation: how frontier intelligence is compressed, priced and contested — ' +
  'with the headline figure from the customer data and the date it was last updated.';

/**
 * The head tags that differ per page, as HTML. A prerenderer should replace
 * everything between the per-page-meta markers in index.html with this, rather
 * than appending its own — two canonicals with different hrefs cancel out.
 * `title` and `description` are the page's own; pass them in when the
 * prerenderer has better copy than the data summary.
 */
export function headMetaFor(route, data, opts = {}) {
  const r = normaliseRoute(route);
  const url = urlFor(r.id);
  const d = pick(r, data);
  const title = opts.title || (d ? d.title + ' — Global Distillation'
    : r.id ? r.name + ' — Global Distillation'
      : 'Global Distillation — a compendium of AI model distillation');
  const description = opts.description || (d ? clamp(d.summary, 300) : SITE_DESCRIPTION);
  const img = ORIGIN + '/assets/og.png';

  return [
    '<link rel="canonical" href="' + url + '">',
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:site_name" content="Global Distillation">',
    '<meta property="og:locale" content="en_US">',
    '<meta property="og:image" content="' + img + '">',
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="' + esc(OG_IMAGE_ALT) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(title) + '">',
    '<meta name="twitter:description" content="' + esc(description) + '">',
    '<meta name="twitter:image" content="' + img + '">',
    '<meta name="twitter:image:alt" content="' + esc(OG_IMAGE_ALT) + '">',
    '<script type="application/ld+json">' + serialise(jsonLdFor(r, data)) + '</script>',
  ].join('\n');
}

/* --------------------------------------------------------------------- CLI */

const MARK_START = '<!-- json-ld:start (generated by scripts/gen-schema.mjs; edit that, not this) -->';
const MARK_END = '<!-- json-ld:end -->';

function main() {
  const outDir = path.join(ROOT, 'assets', 'schema');
  fs.mkdirSync(outDir, { recursive: true });
  const bundle = loadAll();

  for (const r of ROUTES) {
    const graph = jsonLdFor(r, bundle);
    const file = path.join(outDir, (r.id || 'overview') + '.json');
    fs.writeFileSync(file, JSON.stringify(graph, null, 2) + '\n', 'utf8');
    console.log('  ' + path.relative(ROOT, file).replace(/\\/g, '/') +
      '  ' + graph['@graph'].length + ' nodes, ' + JSON.stringify(graph).length + ' bytes');
  }

  if (process.argv.includes('--inline')) {
    const file = path.join(ROOT, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const a = html.indexOf(MARK_START);
    const b = html.indexOf(MARK_END);
    if (a < 0 || b < 0) { console.error('index.html: json-ld markers not found'); process.exitCode = 1; return; }
    const block = MARK_START + '\n<script type="application/ld+json">' +
      serialise(jsonLdFor('', bundle)) + '</script>\n';
    fs.writeFileSync(file, html.slice(0, a) + block + html.slice(b), 'utf8');
    console.log('  index.html: inlined overview graph');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
