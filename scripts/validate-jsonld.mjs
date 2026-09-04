// Structured-data validator.
//
//   node scripts/validate-jsonld.mjs
//
// Parses every JSON-LD block this repo emits — the one inlined in index.html,
// any prerendered <route>/index.html, and every assets/schema/<route>.json —
// and checks it against what each schema.org type actually requires. Also
// checks the head metadata (one canonical, absolute og:image, twitter card)
// and that every same-origin URL it references exists on disk.
//
// Exits non-zero if anything fails.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, ORIGIN } from './gen-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const errors = [];
const warnings = [];
let checks = 0;

const ok = (cond, where, msg) => { checks++; if (!cond) errors.push(where + ': ' + msg); };
const warn = (cond, where, msg) => { checks++; if (!cond) warnings.push(where + ': ' + msg); };

const isIsoDate = (s) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(s || ''));
const isUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+$/.test(s);
const typesOf = (n) => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]).filter(Boolean);

/** Same-origin URLs must resolve to a file in the repo. */
function localFileFor(url) {
  if (!url.startsWith(ORIGIN)) return null;
  const p = url.slice(ORIGIN.length).split('#')[0].split('?')[0];
  if (p === '' || p === '/') return 'index.html';
  const rel = p.replace(/^\//, '');
  if (fs.existsSync(path.join(ROOT, rel))) return rel;
  if (fs.existsSync(path.join(ROOT, rel, 'index.html'))) return rel + '/index.html';
  return false;
}

/* ----------------------------------------------------------- graph checking */

const ROUTE_IDS = new Set(ROUTES.map((r) => r.id).filter(Boolean));

const SITE_LEVEL_IDS = new Set([
  ORIGIN + '/#org', ORIGIN + '/#website', ORIGIN + '/data/#catalog',
]);

const REQUIRED = {
  WebSite: ['url', 'name', 'description', 'publisher', 'potentialAction'],
  Organization: ['name', 'url', 'logo'],
  WebPage: ['url', 'name', 'description', 'isPartOf', 'breadcrumb'],
  CollectionPage: ['url', 'name', 'description', 'isPartOf', 'breadcrumb'],
  BreadcrumbList: ['itemListElement'],
  Report: ['headline', 'url', 'datePublished', 'author', 'publisher', 'description'],
  Article: ['headline', 'url', 'datePublished', 'author', 'publisher', 'description'],
  Dataset: ['name', 'description', 'license', 'distribution', 'creator'],
  DataCatalog: ['name', 'description', 'dataset'],
  DefinedTermSet: ['name', 'hasDefinedTerm'],
  FAQPage: ['mainEntity'],
};

const BANNED = ['AggregateRating', 'Rating', 'Review', 'Offer', 'AggregateOffer'];

function checkGraph(where, doc) {
  ok(doc['@context'] === 'https://schema.org', where, 'missing or wrong @context');
  const graph = doc['@graph'];
  ok(Array.isArray(graph) && graph.length > 0, where, '@graph must be a non-empty array');
  if (!Array.isArray(graph)) return;

  const ids = new Set(graph.map((n) => n['@id']).filter(Boolean));
  const seenTypes = new Set();

  // every {'@id': x} reference must resolve inside this graph or be site-level
  const walkRefs = (node, trail) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walkRefs(n, trail + '[' + i + ']'));
    if (!node || typeof node !== 'object') return;
    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === '@id') {
      ok(ids.has(node['@id']) || SITE_LEVEL_IDS.has(node['@id']), where,
        'dangling @id reference at ' + trail + ' -> ' + node['@id']);
      return;
    }
    for (const k of keys) walkRefs(node[k], trail + '.' + k);
  };

  // every absolute same-origin URL must resolve to a file in the repo. Route
  // pages are written by the prerender step, so their absence is a warning
  // ("prerender has not run here yet"), not a broken reference.
  const walkUrls = (node, trail) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walkUrls(n, trail + '[' + i + ']'));
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) walkUrls(node[k], trail + '.' + k);
      return;
    }
    if (typeof node !== 'string' || !node.startsWith(ORIGIN)) return;
    if (localFileFor(node) !== false) return;
    const seg = node.slice(ORIGIN.length).replace(/^\//, '').split(/[/#?]/)[0];
    if (ROUTE_IDS.has(seg)) warnings.push(where + ': links to /' + seg +
      ', whose prerendered ' + seg + '/index.html is not in the repo yet');
    else ok(false, where, 'points at a file that does not exist: ' + node + ' (' + trail + ')');
    checks++;
  };

  for (const node of graph) {
    const types = typesOf(node);
    ok(types.length > 0, where, 'node without @type');
    types.forEach((t) => seenTypes.add(t));
    ok(typeof node['@id'] === 'string' && node['@id'].startsWith('http'), where,
      types.join('+') + ': top-level node needs an absolute @id');

    for (const t of types) {
      ok(!BANNED.includes(t), where, 'banned type ' + t + ' (no ratings, reviews or offers here)');
      for (const field of REQUIRED[t] || []) {
        ok(node[field] != null && node[field] !== '', where, t + ': missing required field "' + field + '"');
      }
    }

    if (types.includes('WebSite')) {
      const a = node.potentialAction || {};
      ok(a['@type'] === 'SearchAction', where, 'WebSite.potentialAction must be a SearchAction');
      ok(a.target && /\{search_term_string\}/.test(a.target.urlTemplate || ''), where,
        'SearchAction target needs a {search_term_string} placeholder');
      ok(a['query-input'] === 'required name=search_term_string', where,
        'SearchAction needs query-input "required name=search_term_string"');
      const tpl = (a.target || {}).urlTemplate || '';
      ok(localFileFor(tpl.split('?')[0]) !== false, where, 'SearchAction target is not a real page: ' + tpl);
    }

    if (types.includes('BreadcrumbList')) {
      const items = node.itemListElement || [];
      items.forEach((it, i) => {
        ok(it['@type'] === 'ListItem', where, 'breadcrumb item ' + i + ' is not a ListItem');
        ok(it.position === i + 1, where, 'breadcrumb positions must run 1..n (item ' + i + ')');
        ok(!!it.name && isUrl(it.item), where, 'breadcrumb item ' + i + ' needs a name and an absolute item URL');
      });
    }

    if (types.includes('Dataset')) {
      const dist = node.distribution || [];
      ok(dist.length > 0, where, 'Dataset needs at least one distribution');
      for (const dd of dist) {
        ok(dd['@type'] === 'DataDownload', where, 'distribution must be a DataDownload');
        ok(dd.encodingFormat === 'application/json', where, 'distribution encodingFormat must be application/json');
        ok(isUrl(dd.contentUrl), where, 'distribution needs an absolute contentUrl');
        ok(localFileFor(dd.contentUrl) !== false, where, 'distribution contentUrl does not exist: ' + dd.contentUrl);
      }
      ok(isUrl(node.license), where, 'Dataset license must be a URL');
      if (node.temporalCoverage) {
        const parts = String(node.temporalCoverage).split('/');
        ok(parts.length === 2 && parts.every(isIsoDate), where,
          'temporalCoverage must be "start/end" ISO dates, got ' + node.temporalCoverage);
        ok(parts[0] <= parts[1], where, 'temporalCoverage start is after its end: ' + node.temporalCoverage);
      }
      for (const v of node.variableMeasured || []) {
        ok(v['@type'] === 'PropertyValue' && !!v.name, where, 'variableMeasured entries need @type PropertyValue and a name');
      }
      ok(isIsoDate(node.dateModified), where, 'Dataset dateModified must be an ISO date');
    }

    if (types.includes('DataCatalog')) {
      for (const dref of node.dataset || []) {
        ok(ids.has(dref['@id']), where, 'DataCatalog lists a dataset that is not in the graph: ' + dref['@id']);
      }
    }

    if (types.includes('Report') || types.includes('Article')) {
      ok(String(node.headline || '').length <= 110, where, 'headline must be 110 characters or fewer');
      ok(isIsoDate(node.datePublished) && isIsoDate(node.dateModified), where, 'Article dates must be ISO');
      for (const c of node.citation || []) {
        ok(c['@type'] === 'CreativeWork' && isUrl(c.url), where, 'each citation needs @type CreativeWork and a URL');
        ok(!c.datePublished || isIsoDate(c.datePublished), where, 'citation datePublished must be ISO: ' + c.datePublished);
      }
    }

    if (types.includes('DefinedTermSet')) {
      const terms = node.hasDefinedTerm || [];
      ok(terms.length > 0, where, 'DefinedTermSet with no terms');
      for (const t of terms) {
        ok(t['@type'] === 'DefinedTerm', where, 'term is not a DefinedTerm');
        ok(!!t.name && !!t.description, where, 'term "' + t.name + '" needs a name and a description');
        ok(t.inDefinedTermSet && t.inDefinedTermSet['@id'] === node['@id'], where,
          'term "' + t.name + '" must point back at its set');
      }
    }

    if (types.includes('FAQPage')) {
      const qs = node.mainEntity || [];
      ok(qs.length >= 2, where, 'FAQPage needs at least two questions');
      for (const q of qs) {
        ok(q['@type'] === 'Question', where, 'FAQ entry is not a Question');
        ok(/\?$/.test(String(q.name || '').trim()), where,
          'FAQ question is not actually a question: "' + q.name + '"');
        const a = q.acceptedAnswer || {};
        ok(a['@type'] === 'Answer' && String(a.text || '').trim().length >= 40, where,
          'FAQ answer for "' + q.name + '" is missing or too thin');
      }
    }
  }

  walkRefs(graph, 'graph');
  walkUrls(graph, 'graph');
  return seenTypes;
}

/* ------------------------------------------------------------ head checking */

function checkHead(where, html) {
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const all = (re) => [...head.matchAll(re)];
  const attr = (re) => { const m = head.match(re); return m ? m[1] : null; };

  const canonicals = all(/<link[^>]+rel="canonical"[^>]*>/g);
  ok(canonicals.length === 1, where, 'expected exactly one canonical link, found ' + canonicals.length);
  const canonical = attr(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
  ok(isUrl(canonical), where, 'canonical must be an absolute URL, got ' + canonical);
  ok(localFileFor(canonical) !== false, where, 'canonical points at a page that does not exist: ' + canonical);

  const need = {
    'og:url': /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/,
    'og:site_name': /<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/,
    'og:locale': /<meta[^>]+property="og:locale"[^>]+content="([^"]+)"/,
    'og:title': /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/,
    'og:description': /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/,
    'og:type': /<meta[^>]+property="og:type"[^>]+content="([^"]+)"/,
    'og:image': /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/,
    'og:image:width': /<meta[^>]+property="og:image:width"[^>]+content="([^"]+)"/,
    'og:image:height': /<meta[^>]+property="og:image:height"[^>]+content="([^"]+)"/,
    'og:image:alt': /<meta[^>]+property="og:image:alt"[^>]+content="([^"]+)"/,
    'twitter:card': /<meta[^>]+name="twitter:card"[^>]+content="([^"]+)"/,
    'twitter:title': /<meta[^>]+name="twitter:title"[^>]+content="([^"]+)"/,
    'twitter:description': /<meta[^>]+name="twitter:description"[^>]+content="([^"]+)"/,
    'twitter:image': /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/,
    'theme-color': /<meta[^>]+name="theme-color"[^>]+content="([^"]+)"/,
    description: /<meta[^>]+name="description"[^>]+content="([^"]+)"/,
  };
  const got = {};
  for (const [k, re] of Object.entries(need)) {
    got[k] = attr(re);
    ok(!!got[k], where, 'missing <meta> ' + k);
  }
  ok(got['twitter:card'] === 'summary_large_image', where, 'twitter:card must be summary_large_image');
  ok(got['og:url'] === canonical, where, 'og:url and canonical disagree');
  ok(isUrl(got['og:image']) && localFileFor(got['og:image']) !== false, where,
    'og:image must be an absolute URL to a file that exists: ' + got['og:image']);
  ok(isUrl(got['twitter:image']), where, 'twitter:image must be absolute');
  ok(/^#[0-9A-Fa-f]{6}$/.test(got['theme-color'] || ''), where, 'theme-color must be a hex colour');
  ok(String(got.description || '').length >= 70 && String(got.description).length <= 320, where,
    'description should be 70-320 characters, is ' + String(got.description || '').length);
  // Length here is a search-snippet guideline, not a correctness rule.
  const titleLen = ((head.match(/<title>([^<]*)<\/title>/) || [])[1] || '').length;
  ok(titleLen >= 10, where, 'title is missing or too short');
  warn(titleLen <= 70, where, 'title is ' + titleLen + ' characters; search results truncate near 70');

  const og = got['og:image'];
  if (og) {
    const file = localFileFor(og);
    if (file && fs.existsSync(path.join(ROOT, file))) {
      const buf = fs.readFileSync(path.join(ROOT, file));
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      ok(w === Number(got['og:image:width']) && h === Number(got['og:image:height']), where,
        'og:image is ' + w + 'x' + h + ' but declares ' + got['og:image:width'] + 'x' + got['og:image:height']);
      ok(w === 1200 && h === 630, where, 'og:image should be 1200x630, is ' + w + 'x' + h);
      ok(buf.length < 5 * 1024 * 1024, where, 'og:image is over 5MB');
    }
  }

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  ok(blocks.length >= 1, where, 'no JSON-LD block found');
  const types = new Set();
  blocks.forEach((m, i) => {
    let doc = null;
    try { doc = JSON.parse(m[1]); } catch (e) { errors.push(where + ': JSON-LD block ' + i + ' is not valid JSON — ' + e.message); }
    if (doc) (checkGraph(where + ' [ld+json ' + i + ']', doc) || new Set()).forEach((t) => types.add(t));
  });
  return types;
}

/* -------------------------------------------------------------------- run */

const report = [];

for (const r of ROUTES) {
  const file = path.join(ROOT, 'assets', 'schema', (r.id || 'overview') + '.json');
  if (!fs.existsSync(file)) { errors.push('assets/schema/' + (r.id || 'overview') + '.json: missing'); continue; }
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const where = 'schema/' + (r.id || 'overview') + '.json';
  const types = checkGraph(where, doc);
  report.push(['assets/schema/' + (r.id || 'overview') + '.json', doc['@graph'].length + ' nodes', [...types].join(' ')]);

  // the page that owns a data file must describe it in full
  if (r.file) {
    const ds = doc['@graph'].find((n) => typesOf(n).includes('Dataset') &&
      n['@id'] === ORIGIN + '/data/' + r.file + '.json#dataset');
    ok(!!ds, where, 'no Dataset for data/' + r.file + '.json');
    if (ds) {
      ok((ds.variableMeasured || []).length > 0, where, 'Dataset for ' + r.file + ' has no variableMeasured');
      ok(!!ds.temporalCoverage, where, 'Dataset for ' + r.file + ' has no temporalCoverage');
    }
    const report_ = doc['@graph'].find((n) => typesOf(n).includes('Report'));
    ok(!!report_ && (report_.citation || []).length > 0, where, 'perspective page has no cited sources');
  }
}

// index.html plus every prerendered <route>/index.html actually in the repo,
// including routes this generator does not know about.
const pages = ['index.html', ...fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !['node_modules', '.git', '.github', '.vercel', 'vendor',
    'prototypes', 'shots', 'assets', 'data', 'scripts'].includes(e.name))
  .map((e) => e.name + '/index.html')]
  .filter((p) => fs.existsSync(path.join(ROOT, p)));

for (const p of pages) {
  const types = checkHead(p, fs.readFileSync(path.join(ROOT, p), 'utf8'));
  report.push([p, 'head + ' + (types.size ? 'ld+json' : 'no ld+json'), [...types].join(' ')]);
}

const w0 = Math.max(...report.map((r) => r[0].length));
const w1 = Math.max(...report.map((r) => r[1].length));
console.log('\nStructured data\n');
for (const row of report) console.log('  ' + row[0].padEnd(w0) + '  ' + row[1].padEnd(w1) + '  ' + row[2]);

const uniqueWarnings = [...new Set(warnings)];
if (uniqueWarnings.length) {
  console.log('\nWarnings (' + uniqueWarnings.length + ')');
  uniqueWarnings.forEach((w) => console.log('  ! ' + w));
}
console.log('\n' + checks + ' assertions, ' + errors.length + ' failed');
if (errors.length) {
  errors.forEach((e) => console.log('  x ' + e));
  process.exit(1);
}
console.log('All structured data valid.\n');
