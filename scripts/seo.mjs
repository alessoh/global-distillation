// SEO / GEO generator.
//
//   node scripts/seo.mjs [baseUrl] [--origin https://example.com]
//
// Drives the live app with Playwright, one route at a time, and writes a static
// prerendered page per route (<route>/index.html) carrying the fully rendered
// content plus per-page metadata and JSON-LD. Vercel serves that file directly,
// then the app boots on the same URL and takes over — one canonical address per
// perspective, real content for crawlers, no cloaking.
//
// Also writes sitemap.xml and llms.txt from the same data.
//
// Run it after the data refresh and before deploying; the daily workflow does.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4173';
const oi = process.argv.indexOf('--origin');
const ORIGIN = (oi > -1 ? process.argv[oi + 1] : 'https://global-distillation.vercel.app').replace(/\/$/, '');

/** Routes to prerender. `file` names the data file backing the page, if any. */
const ROUTES = [
  { id: '', file: null, name: 'Overview',
    title: 'Global Distillation — how AI model distillation is compressed, priced and contested',
    desc: 'A public compendium of AI model distillation: the research, the token economics, the policy fights, what each company does, and which distilled models to buy. Every figure carries a primary source.' },
  { id: 'academic', file: 'academic', name: 'Academic',
    desc: 'The research record of knowledge distillation, from Hinton soft targets in 2015 to reasoning-trace distillation in 2026, with student-versus-teacher benchmark retention and the papers behind each claim.' },
  { id: 'financial', file: 'financial', name: 'Financial',
    desc: 'The economics of AI distillation: frontier versus small-tier token prices, documented training costs of distilled models, the January 2025 market shock, and a total-cost-of-ownership model for self-hosting.' },
  { id: 'political', file: 'political', name: 'Political',
    desc: 'Policy and geopolitics of AI distillation: the OpenAI and Anthropic extraction accusations, US export controls, the EU AI Act, congressional bills, and the legal theories that decide whether distillation is theft.' },
  { id: 'company', file: 'company', name: 'Company',
    desc: 'Which AI companies distil, which sell distillation as a product, and which forbid it in their terms of service, with the teacher-to-student lineage of every publicly documented distilled model.' },
  { id: 'developer', file: 'developer', name: 'Developer',
    desc: 'Tooling and recipes for distilling a model in 2026: libraries, managed platforms, open reasoning datasets, GPU requirements, and costed step-by-step recipes with sources.' },
  { id: 'customer', file: 'customer', name: 'Customer',
    desc: 'Which distilled models to buy: quality, latency, price, context and licence compared against their frontier teachers, with a use-case decision guide for buyers.' },
  { id: 'library', file: 'library', name: 'Library',
    desc: 'A reference library of distillation methods, each with its loss function, data and teacher-access requirements, tooling, worked intuition and honest trade-offs.' },
  { id: 'timeline', file: 'timeline', name: 'Timeline',
    desc: 'A dated timeline of AI model distillation from 2006 to today, spanning research milestones, product launches, market shocks and policy actions, each with a primary source.' },
  { id: 'compare', file: null, name: 'Compare',
    desc: 'Build a side-by-side comparison of frontier teacher models and their distilled students on quality, price, latency, context and licence.' },
];

const readData = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name + '.json'), 'utf8')); }
  catch { return null; }
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const urlFor = (id) => ORIGIN + (id ? '/' + id : '/');

/* --------------------------------------------------------------- JSON-LD */

const publisher = {
  '@type': 'Organization',
  name: 'Global Distillation',
  url: ORIGIN,
  logo: { '@type': 'ImageObject', url: ORIGIN + '/assets/favicon.svg' },
};

function jsonLdFor(route, d) {
  const url = urlFor(route.id);
  const graph = [];

  graph.push({
    '@type': 'WebSite',
    '@id': ORIGIN + '/#website',
    url: ORIGIN + '/',
    name: 'Global Distillation',
    description: ROUTES[0].desc,
    publisher: { '@id': ORIGIN + '/#org' },
    inLanguage: 'en',
  });
  graph.push({ ...publisher, '@id': ORIGIN + '/#org' });

  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Global Distillation', item: ORIGIN + '/' },
      ...(route.id ? [{ '@type': 'ListItem', position: 2, name: route.name, item: url }] : []),
    ],
  });

  if (d) {
    // The page is a research article about a published dataset.
    graph.push({
      '@type': 'TechArticle',
      '@id': url + '#article',
      headline: (d.title || route.name).slice(0, 110),
      description: route.desc,
      articleSection: route.name,
      url,
      datePublished: d.updated,
      dateModified: d.updated,
      inLanguage: 'en',
      isPartOf: { '@id': ORIGIN + '/#website' },
      publisher: { '@id': ORIGIN + '/#org' },
      author: { '@id': ORIGIN + '/#org' },
      about: { '@type': 'Thing', name: 'Knowledge distillation', sameAs: 'https://en.wikipedia.org/wiki/Knowledge_distillation' },
      citation: (d.sources || []).slice(0, 40).map((s) => ({
        '@type': 'CreativeWork',
        name: s.title || s.url,
        url: s.url,
        ...(s.publisher ? { publisher: { '@type': 'Organization', name: s.publisher } } : {}),
        ...(s.date ? { datePublished: s.date } : {}),
      })),
    });

    graph.push({
      '@type': 'Dataset',
      '@id': url + '#dataset',
      name: (d.title || route.name) + ' — source data',
      description: (d.summary || route.desc).slice(0, 900),
      url,
      dateModified: d.updated,
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      creator: { '@id': ORIGIN + '/#org' },
      keywords: ['knowledge distillation', 'AI models', route.name.toLowerCase(),
        'model compression', 'teacher student models'],
      distribution: [{
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: ORIGIN + '/data/' + route.file + '.json',
      }],
      variableMeasured: (d.stats || []).slice(0, 12).map((s) => ({
        '@type': 'PropertyValue',
        name: s.label,
        value: String(s.value),
        ...(s.unit ? { unitText: s.unit } : {}),
        ...(s.source ? { url: s.source } : {}),
      })),
    });

    if (d.glossary && d.glossary.length) {
      graph.push({
        '@type': 'DefinedTermSet',
        '@id': url + '#glossary',
        name: route.name + ' glossary of distillation terms',
        url: url + '#glossary',
        hasDefinedTerm: d.glossary.slice(0, 40).map((g) => ({
          '@type': 'DefinedTerm', name: g.term, description: g.definition,
          inDefinedTermSet: { '@id': url + '#glossary' },
        })),
      });
    }

    // Key findings read as questions a generative engine can answer directly.
    if (d.keyFindings && d.keyFindings.length) {
      graph.push({
        '@type': 'FAQPage',
        '@id': url + '#faq',
        mainEntity: d.keyFindings.slice(0, 12).map((f) => ({
          '@type': 'Question',
          name: /[?]$/.test(f.title) ? f.title : f.title + '?',
          acceptedAnswer: { '@type': 'Answer', text: String(f.detail || '').slice(0, 1200) },
        })),
      });
    }

    const methods = d.extras && d.extras.methods;
    if (methods && methods.length) {
      graph.push({
        '@type': 'ItemList',
        '@id': url + '#methods',
        name: 'Distillation methods',
        numberOfItems: methods.length,
        itemListElement: methods.map((m, i) => ({
          '@type': 'ListItem', position: i + 1,
          item: {
            '@type': 'TechArticle',
            name: m.name,
            description: m.description,
            url: url + '/' + m.id,
            ...(m.url ? { citation: { '@type': 'CreativeWork', url: m.url, name: m.paper || m.url } } : {}),
          },
        })),
      });
    }
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

/* ------------------------------------------------------------- page head */

function headFor(route, d, shellHead) {
  const url = urlFor(route.id);
  const title = route.title || ((d && d.title) ? d.title + ' — Global Distillation'
    : route.name + ' — Global Distillation');
  const desc = route.desc;

  // Reuse the shell head, then replace the parts that vary per page.
  let head = shellHead
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>')
    .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="' + esc(desc) + '">')
    .replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="' + esc(title) + '">')
    .replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="' + esc(desc) + '">');

  const extra = [
    '<link rel="canonical" href="' + url + '">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:site_name" content="Global Distillation">',
    '<meta property="og:image" content="' + ORIGIN + '/assets/og.png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:locale" content="en">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(title) + '">',
    '<meta name="twitter:description" content="' + esc(desc) + '">',
    '<meta name="twitter:image" content="' + ORIGIN + '/assets/og.png">',
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">',
    d && d.updated ? '<meta name="last-modified" content="' + esc(d.updated) + '">' : '',
    '<script type="application/ld+json">' + jsonLdFor(route, d) + '</script>',
  ].filter(Boolean).join('\n');

  return head + '\n' + extra;
}

/* ------------------------------------------------------------------ main */

async function main() {
  const shell = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const shellHead = shell.match(/<head>([\s\S]*?)<\/head>/)[1];
  const shellTail = shell.slice(shell.indexOf('</main>') > -1 ? 0 : 0); // unused, kept explicit

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));

  const written = [];

  for (const route of ROUTES) {
    const d = route.file ? readData(route.file) : null;
    const target = BASE + '/' + (route.id ? route.id : '');
    await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 });
    // Charts mount asynchronously; wait for the view to settle.
    await page.waitForTimeout(2500);

    const body = await page.evaluate(() => {
      const strip = (root) => {
        // Canvas has no text for a crawler, and the prerendered copy is a
        // document, not an app: drop live-only nodes and keep the prose,
        // tables, figures and sources.
        root.querySelectorAll('canvas, script').forEach((n) => n.remove());
        return root;
      };
      const clone = document.querySelector('.shell').cloneNode(true);
      strip(clone);
      return clone.outerHTML;
    });

    const head = headFor(route, d, shellHead);
    const html = '<!doctype html>\n<html lang="en">\n<head>\n' + head + '\n</head>\n<body>\n' +
      '<a class="skip-link" href="#main">Skip to content</a>\n' +
      shell.slice(shell.indexOf('<header class="nav"'), shell.indexOf('<div class="shell">')) +
      body + '\n' +
      shell.slice(shell.indexOf('<!-- ============================ DRAWER'));

    const dir = route.id ? path.join(ROOT, route.id) : ROOT;
    if (route.id) fs.mkdirSync(dir, { recursive: true });
    const file = route.id ? path.join(dir, 'index.html') : path.join(ROOT, 'index.html');
    // The root index.html is the app shell and is never overwritten here.
    if (route.id) { fs.writeFileSync(file, html, 'utf8'); written.push(path.relative(ROOT, file)); }
    else { written.push('index.html (shell, not rewritten)'); }
  }

  await browser.close();

  /* ----------------------------------------------------------- sitemap */
  const today = (readData('live') || {}).updated || new Date().toISOString();
  const stamp = String(today).slice(0, 10);
  const urls = ROUTES.map((r) => {
    const d = r.file ? readData(r.file) : null;
    const lastmod = (d && d.updated) || stamp;
    const priority = r.id === '' ? '1.0' : (['library', 'customer', 'financial'].includes(r.id) ? '0.9' : '0.8');
    return '  <url>\n    <loc>' + urlFor(r.id) + '</loc>\n    <lastmod>' + lastmod +
      '</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>' + priority + '</priority>\n  </url>';
  });
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n', 'utf8');

  /* ------------------------------------------------------------ llms.txt */
  const lines = [];
  lines.push('# Global Distillation');
  lines.push('');
  lines.push('> A public compendium of AI model distillation, examined from academic, financial, political, company, developer and customer perspectives, with a reference library of distillation methods. Every figure carries a primary source URL. Updated daily.');
  lines.push('');
  lines.push('Licence: MIT. Free to quote and cite with attribution to Global Distillation (' + ORIGIN + ').');
  lines.push('Last updated: ' + stamp + '.');
  lines.push('');
  lines.push('## Pages');
  lines.push('');
  for (const r of ROUTES) {
    lines.push('- [' + (r.id ? r.name : 'Overview') + '](' + urlFor(r.id) + '): ' + r.desc);
  }
  lines.push('');
  lines.push('## Machine-readable data');
  lines.push('');
  lines.push('Every page is generated from a JSON file with a documented schema. Figures, tables, charts, timelines, glossaries and sources are all addressable.');
  lines.push('');
  lines.push('- [Schema](' + ORIGIN + '/data/SCHEMA.md): the shape of every data file.');
  for (const r of ROUTES.filter((x) => x.file)) {
    const d = readData(r.file);
    if (!d) continue;
    const bits = [];
    if (d.stats) bits.push(d.stats.length + ' figures');
    if (d.tables) bits.push(d.tables.length + ' tables');
    if (d.charts) bits.push(d.charts.length + ' charts');
    if (d.timeline) bits.push(d.timeline.length + ' dated events');
    if (d.sources) bits.push(d.sources.length + ' sources');
    lines.push('- [' + r.file + '.json](' + ORIGIN + '/data/' + r.file + '.json): ' + bits.join(', ') + '.');
  }
  lines.push('- [live.json](' + ORIGIN + '/data/live.json): daily signals — arXiv counts, Hugging Face downloads, repository stars, news.');
  lines.push('');
  lines.push('## Key facts');
  lines.push('');
  for (const r of ROUTES.filter((x) => x.file)) {
    const d = readData(r.file);
    if (!d || !d.stats) continue;
    for (const s of d.stats.slice(0, 3)) {
      const v = s.value + (s.unit ? ' ' + s.unit : '');
      lines.push('- ' + s.label + ': ' + v + (s.source ? ' (source: ' + s.source + ')' : ''));
    }
  }
  lines.push('');
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), lines.join('\n'), 'utf8');

  console.log('prerendered:', written.length, 'pages');
  written.forEach((w) => console.log('  ' + w));
  console.log('sitemap.xml:', ROUTES.length, 'urls');
  console.log('llms.txt:', lines.length, 'lines');
  if (problems.length) { console.log('page errors:'); problems.forEach((p) => console.log('  ' + p)); process.exitCode = 1; }
}

main();
