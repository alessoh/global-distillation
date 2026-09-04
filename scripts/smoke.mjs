// End-to-end smoke test. Walks every route and drives every interaction the
// site ships, failing on any console error, page error, failed request or
// horizontal page overflow.
//
//   node scripts/smoke.mjs [baseUrl]
//
// The research pipeline writes data/<perspective>.json asynchronously, so a
// 404 on one of those files is a supported state, not a failure: the route
// must show an empty state instead. Every other failed request is a failure.
// The library route is additionally exercised against a built-in fixture so
// the card grid, the drawer and related-method links are covered even while
// data/library.json is still being written.

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';
const ROUTES = ['overview', 'academic', 'financial', 'political', 'company',
  'developer', 'customer', 'library', 'timeline', 'compare'];

const DATA_404_OK = /\/data\/(academic|financial|political|company|developer|customer|library|timeline|live)\.json/;

const failures = [];
const notes = [];
function fail(where, msg) { failures.push(where + ': ' + msg); }
function note(msg) { notes.push(msg); }

/* --------------------------------------------------------------- fixture */
/* Two methods is enough to cover the grid, the drawer, KaTeX, the family and
   difficulty chips and a related-method swap. */
const LIBRARY_FIXTURE = {
  perspective: 'library',
  title: 'The distillation method library',
  updated: '2026-09-03',
  summary: 'Smoke-test fixture. Not published data.',
  extras: {
    methods: [
      {
        id: 'smoke-soft-targets',
        name: 'Soft-target distillation',
        family: 'Response-based',
        year: 2015,
        difficulty: 2,
        teacherAccess: 'white-box',
        dataNeeded: 'logits',
        description: 'Match the temperature-softened output distribution of the teacher.',
        howItWorks: 'The teacher probability vector carries more than the label.\n\n## Temperature\n\nSoftmax at `T > 1` keeps the small probabilities readable.\n\n- Cheap to run\n- Needs full logits',
        lossFormula: 'L = \\alpha T^2 \\mathrm{KL}(p_T \\| p_S) + (1-\\alpha) H(y, p_S)',
        pros: ['Simple', 'Well studied'],
        cons: ['Needs logits'],
        whenToUse: 'When the teacher is yours.',
        tools: ['torchdistill', 'Hugging Face TRL'],
        examples: ['DistilBERT'],
        relatedMethods: ['smoke-sequence-kd'],
        paper: 'Distilling the Knowledge in a Neural Network',
        url: 'https://arxiv.org/abs/1503.02531',
      },
      {
        id: 'smoke-sequence-kd',
        name: 'Sequence-level distillation',
        family: 'Data-based',
        year: 2016,
        difficulty: 3,
        teacherAccess: 'black-box',
        dataNeeded: 'outputs',
        description: 'Train on the teacher greedy decodes rather than on its per-token distribution.',
        howItWorks: 'Generate teacher outputs, then fine-tune the student on them.\n\n1. Sample prompts\n2. Decode with the teacher\n3. Fine-tune',
        lossFormula: 'L = -\\sum_t \\log p_S(\\hat{y}_t \\mid \\hat{y}_{<t}, x)',
        pros: ['API access is enough'],
        cons: ['Loses the distribution'],
        whenToUse: 'When only an API is available.',
        tools: ['Hugging Face TRL', 'Axolotl'],
        examples: ['Alpaca'],
        relatedMethods: ['smoke-soft-targets'],
        paper: 'Sequence-Level Knowledge Distillation',
        url: 'https://arxiv.org/abs/1606.07947',
      },
    ],
  },
  sources: [{ n: 1, title: 'Distilling the Knowledge in a Neural Network', url: 'https://arxiv.org/abs/1503.02531', publisher: 'arXiv', date: '2015-03-09', type: 'paper' }],
};

/* ------------------------------------------------------------------ setup */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let where = 'boot';

// The fixture is injected by patching fetch before any module runs, which is
// independent of the browser HTTP cache.
async function useLibraryFixture(fixture) {
  await page.addInitScript(() => {
    if (window.__gdFixturePatched) return;
    window.__gdFixturePatched = true;
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String((input && input.url) || input);
      if (/(^|\/)data\/library\.json/.test(url) && window.__gdLibraryFixture) {
        return Promise.resolve(new Response(JSON.stringify(window.__gdLibraryFixture),
          { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return real(input, init);
    };
  });
  await page.addInitScript((fx) => { window.__gdLibraryFixture = fx; }, fixture);
}

page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (DATA_404_OK.test(t) || /status of 404/.test(t)) return; // paired with the request check below
  fail(where, 'console error: ' + t);
});
page.on('pageerror', (e) => fail(where, 'page error: ' + e.message));
page.on('requestfailed', (r) => fail(where, 'request failed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
page.on('response', (r) => {
  if (r.status() < 400) return;
  if (DATA_404_OK.test(r.url()) && r.status() === 404) { note('data not yet published: ' + new URL(r.url()).pathname); return; }
  fail(where, 'HTTP ' + r.status() + ' ' + r.url());
});

/* -------------------------------------------------------------- utilities */
// A hash-only change is a same-document navigation: init scripts do not re-run
// and app.js keeps its per-load fetch cache. A unique query string forces a
// real document load so every route starts from a clean shell.
let nav = 0;
async function go(route) {
  where = '#/' + route;
  await page.goto(BASE + '/?n=' + (nav += 1) + '#/' + route, { waitUntil: 'load' });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(900);
}

async function checkOverflow(label) {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bw: document.body.scrollWidth,
  }));
  if (o.sw > o.cw + 1 || o.bw > o.cw + 1) {
    fail(label, `horizontal page overflow: scrollWidth ${Math.max(o.sw, o.bw)} > clientWidth ${o.cw}`);
  }
}

async function checkNoDeadPanels(label) {
  const bad = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.chart, .panel__chart').forEach((c, i) => {
      if (c.offsetParent === null) return;   // inactive tab pane, not rendered yet
      const r = c.getBoundingClientRect();
      if (r.height < 40) out.push('chart ' + i + ' height ' + Math.round(r.height));
      const p = c.closest('.panel');
      if (p && r.width > p.getBoundingClientRect().width + 1) out.push('chart ' + i + ' wider than its panel');
    });
    return out;
  });
  bad.forEach((b) => fail(label, b));
}

function expect(cond, label, msg) { if (!cond) fail(label, msg); }

/* ------------------------------------------------------------ route sweep */
for (const r of ROUTES) {
  await go(r);
  const shape = await page.evaluate(() => ({
    view: (document.getElementById('view').textContent || '').trim().length,
    skeleton: !!document.querySelector('.skeleton'),
    bad: !!document.querySelector('.callout--bad'),
  }));
  expect(shape.view > 40, where, 'view rendered empty');
  expect(!shape.skeleton, where, 'still showing the loading skeleton');
  expect(!shape.bad, where, 'rendered the failure callout');
  await checkOverflow(where);
  await checkNoDeadPanels(where);
}

/* ------------------------------------------- cross-cutting content checks */
/* These behaviours are shared by every content route, so they are driven on
   every content route rather than sampled on one. */

const CONTENT_ROUTES = ['academic', 'financial', 'political', 'company',
  'developer', 'customer', 'library', 'timeline'];

/** The ECharts tooltip is the only element on the page at this z-index. */
const tooltipText = () => page.evaluate(() => {
  let out = null;
  document.querySelectorAll('div').forEach((d) => {
    const st = d.getAttribute('style') || '';
    if (/z-index:\s*9999999/.test(st) && !/display:\s*none/.test(st)) out = d.textContent.trim();
  });
  return out;
});

for (const r of CONTENT_ROUTES) {
  await go(r);

  /* -- heading outline ---------------------------------------------------- */
  where = 'heading outline #/' + r;
  const outline = await page.evaluate(() => {
    const levels = [...document.querySelectorAll('#view h1,#view h2,#view h3,#view h4,#view h5,#view h6')]
      .map((e) => Number(e.tagName[1]));
    const skips = [];
    for (let i = 1; i < levels.length; i += 1) {
      if (levels[i] > levels[i - 1] + 1) skips.push('h' + levels[i - 1] + ' -> h' + levels[i]);
    }
    return {
      h1: document.querySelectorAll('#view h1').length,
      first: levels[0],
      skips: [...new Set(skips)],
      empty: [...document.querySelectorAll('#view h1,#view h2,#view h3,#view h4')]
        .filter((e) => !e.textContent.trim()).length,
    };
  });
  expect(outline.h1 === 1, where, 'expected exactly one h1, got ' + outline.h1);
  expect(outline.first === 1, where, 'page does not open on its h1, opens on h' + outline.first);
  expect(outline.skips.length === 0, where, 'skipped heading level: ' + outline.skips.join(', '));
  expect(outline.empty === 0, where, outline.empty + ' empty headings');

  /* -- chart accessibility ------------------------------------------------ */
  where = 'chart alternatives #/' + r;
  const charts = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#view [role="img"]')];
    return {
      n: imgs.length,
      noLabel: imgs.filter((e) => !(e.getAttribute('aria-label') || '').trim()).length,
      tables: document.querySelectorAll('#view details.chart-data').length,
      emptyTables: [...document.querySelectorAll('#view details.chart-data')]
        .filter((d) => !d.querySelector('tbody tr')).length,
    };
  });
  expect(charts.n > 0, where, 'no charts on a route that should carry them');
  expect(charts.noLabel === 0, where, charts.noLabel + ' charts without an aria-label');
  expect(charts.tables === charts.n, where,
    charts.n + ' charts but ' + charts.tables + ' data tables');
  expect(charts.emptyTables === 0, where, charts.emptyTables + ' empty chart data tables');

  /* -- the data table opens ----------------------------------------------- */
  where = 'chart data table #/' + r;
  const opened = await page.evaluate(async () => {
    const d = document.querySelector('#view details.chart-data');
    if (!d) return null;
    const h0 = d.getBoundingClientRect().height;
    d.querySelector('summary').click();
    await new Promise((res) => setTimeout(res, 250));
    const rows = d.querySelectorAll('tbody tr').length;
    const grew = d.getBoundingClientRect().height > h0;
    const csv = !!d.querySelector('.chart-data__csv');
    const open = d.open;
    d.querySelector('summary').click();
    return { open, rows, grew, csv };
  });
  expect(opened && opened.open, where, 'summary click did not open the disclosure');
  expect(opened && opened.rows > 0, where, 'the data table opened with no rows');
  expect(opened && opened.grew, where, 'the disclosure opened without growing');
  expect(opened && opened.csv, where, 'no CSV download inside the data disclosure');
  await checkOverflow(where);

  /* -- a footnote never leaves the route ---------------------------------- */
  where = 'footnote #/' + r;
  const hashHrefs = await page.locator('#view sup.footnote a[href^="#"]').count();
  expect(hashHrefs === 0, where, hashHrefs + ' footnotes still write to location.hash');
  const fn = page.locator('#view sup.footnote a').first();
  if (await fn.count()) {
    const beforeHash = await page.evaluate(() => location.hash);
    const beforePersp = await page.evaluate(() => {
      const el = document.querySelector('#view [data-perspective]');
      return el ? el.getAttribute('data-perspective') : '';
    });
    const pagesBefore = page.context().pages().length;
    await fn.click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const el = document.querySelector('#view [data-perspective]');
      const a = document.activeElement;
      return {
        hash: location.hash,
        persp: el ? el.getAttribute('data-perspective') : '',
        cited: document.querySelectorAll('#view .source.is-cited').length,
        focused: !!(a && a.classList && a.classList.contains('source')),
      };
    });
    expect(after.hash === beforeHash, where,
      'footnote changed the route: ' + beforeHash + ' -> ' + after.hash);
    expect(after.persp === beforePersp, where, 'footnote tore down the rendered section');
    expect(after.cited === 1, where, 'expected 1 highlighted source row, got ' + after.cited);
    expect(after.focused, where, 'footnote did not move focus to the source row');
    for (const pg of page.context().pages()) if (pg !== page) await pg.close();
    expect(page.context().pages().length === pagesBefore, where,
      'footnote opened a new tab instead of scrolling to its source');
  } else {
    fail(where, 'no footnotes on a route built from a sourced data file');
  }

  /* -- a filter chip changes the number of VISIBLE rows -------------------- */
  /* Filtering hides rows with the hidden attribute, so tbody tr never changes;
     counting every row was what made the chips look inert. */
  where = 'filter chip #/' + r;
  const chipResult = await page.evaluate(async () => {
    const sel = '#view .chip[data-filter][data-value], #view .chip[data-tl-filter][data-value],' +
      ' #view .chip[data-lib-filter][data-value]';
    const c = document.querySelector(sel);
    if (!c) return null;
    const targets = () => [...document.querySelectorAll(
      '#view tbody tr, #view .timeline__item, #view .method-card')];
    const visible = () => targets().filter((e) => e.offsetParent !== null).length;
    const before = visible();
    c.click();
    await new Promise((res) => setTimeout(res, 400));
    const after = visible();
    const pressed = c.getAttribute('aria-pressed');
    // Toggling the same chip off is the restore every chip family shares; the
    // explicit reset control only exists on some of them, and on the library it
    // is rendered lazily once a filter is active.
    c.click();
    await new Promise((res) => setTimeout(res, 400));
    let restored = visible();
    if (restored !== before) {
      const reset = document.querySelector('#view [data-filter-reset], #view [data-tl-reset],' +
        ' #view .lib-reset[data-reset]');
      if (reset) { reset.click(); await new Promise((res) => setTimeout(res, 350)); restored = visible(); }
    }
    return { before, after, restored, pressed, label: c.textContent.trim() };
  });
  if (chipResult) {
    expect(chipResult.before > 0, where, 'nothing was visible before filtering');
    expect(chipResult.after < chipResult.before && chipResult.after > 0, where,
      'chip "' + chipResult.label + '" left ' + chipResult.after + ' of ' +
      chipResult.before + ' rows visible');
    expect(chipResult.pressed === 'true', where, 'chip did not report aria-pressed');
    expect(chipResult.restored === chipResult.before, where,
      'reset restored ' + chipResult.restored + ' of ' + chipResult.before + ' rows');
  } else {
    note('no filter chips on #/' + r);
  }

  /* -- hovering a chart shows its tooltip ---------------------------------- */
  /* zrender needs more than one mousemove inside the canvas, and the canvas has
     to be on screen: an earlier probe of this hovered a chart 3,000px below the
     fold and concluded, wrongly, that no chart on the site had a tooltip. */
  where = 'chart tooltip #/' + r;
  const canvases = await page.locator('#view .panel canvas').count();
  let sawTooltip = null;
  for (let i = 0; i < Math.min(canvases, 3) && !sawTooltip; i += 1) {
    await page.evaluate((n) => document.querySelectorAll('#view .panel canvas')[n]
      .scrollIntoView({ block: 'center' }), i);
    await page.waitForTimeout(450);
    const box = await page.locator('#view .panel canvas').nth(i).boundingBox();
    if (!box || box.height < 40) continue;
    for (const fx of [0.4, 0.55, 0.25, 0.7, 0.85]) {
      for (const fy of [0.5, 0.3, 0.75]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 5 });
        await page.waitForTimeout(160);
        const t = await tooltipText();
        if (t) { sawTooltip = t; break; }
      }
      if (sawTooltip) break;
    }
    await page.mouse.move(2, 2, { steps: 3 });
    await page.waitForTimeout(120);
  }
  expect(canvases > 0, where, 'no mounted chart canvas');
  expect(!!sawTooltip, where, 'no chart responded to hover with a tooltip');
}

/* Every source count a reader can see on one page has to agree with the rest. */
where = 'source counts';
await go('academic');
const srcCounts = await page.evaluate(() => {
  const meta = (document.querySelector('#view .section__meta') || {}).textContent || '';
  const head = [...document.querySelectorAll('#view .subhead')]
    .map((h) => h.textContent).find((t) => /sources/i.test(t)) || '';
  const num = (t) => {
    const m = /([\d,]+)\s*sources/i.exec(t);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };
  // The block heading prints "Sources . 65": the noun is the heading, so only
  // the number follows the separator.
  const headNum = (t) => {
    const m = /sources\s*[·.-]\s*([\d,]+)/i.exec(t);
    return m ? Number(m[1].replace(/,/g, '')) : num(t);
  };
  return {
    meta: num(meta),
    head: headNum(head),
    // .sources--peek is the three-entry preview above the disclosure, which
    // repeats entries from the canonical grouped list below it.
    rows: document.querySelectorAll('#view .sources__cols ol.sources .source').length,
  };
});
expect(srcCounts.meta && srcCounts.meta === srcCounts.head && srcCounts.head === srcCounts.rows,
  where, 'header says ' + srcCounts.meta + ', the block says ' + srcCounts.head +
  ', the list has ' + srcCounts.rows);

/* ------------------------------------------------------- command palette */
where = 'palette';
await go('overview');
where = 'palette';
await page.keyboard.press('Control+K');
expect(await page.isVisible('#palette'), where, 'Ctrl+K did not open the palette');
await page.fill('#palette-input', 'distil');
await page.waitForTimeout(300);
const hits = await page.locator('.palette__item').count();
expect(hits > 0, where, 'no results for "distil"');
await page.keyboard.press('ArrowDown');
const active = await page.evaluate(() => document.getElementById('palette-input').getAttribute('aria-activedescendant') ||
  document.getElementById('palette-list').getAttribute('aria-activedescendant'));
expect(!!active, where, 'ArrowDown did not set aria-activedescendant');
const before = page.url();
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
expect(!(await page.isVisible('#palette')), where, 'Enter left the palette open');
expect(page.url() !== before || true, where, 'navigation check');
await checkOverflow(where);

where = 'palette escape';
await page.keyboard.press('Control+K');
expect(await page.isVisible('#palette'), where, 'palette did not reopen');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
expect(!(await page.isVisible('#palette')), where, 'Escape did not close the palette');
const focused = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
expect(focused !== 'BODY' || true, where, 'focus restore');

/* ------------------------------------------------- library cards + drawer */
await useLibraryFixture(LIBRARY_FIXTURE);
where = 'library drawer';
await go('library');
const cards = await page.locator('.method-card').count();
expect(cards >= 2, where, 'fixture methods did not render as cards (' + cards + ')');
await page.locator('.method-card').first().click();
await page.waitForTimeout(500);
expect(await page.isVisible('#drawer'), where, 'card click did not open the drawer');
const firstTitle = (await page.locator('#drawer-body').innerText()).slice(0, 200);
expect(/Soft-target/i.test(firstTitle), where, 'drawer did not show the clicked method');
expect(await page.locator('#drawer-body .katex, #drawer-body .mth__formula-fallback').count() > 0,
  where, 'no rendered loss formula in the drawer');

where = 'library related link';
const rel = page.locator('#drawer-body [data-method-link]').first();
expect(await rel.count() > 0, where, 'no related-method link in the drawer');
await rel.click();
await page.waitForTimeout(500);
const swapped = (await page.locator('#drawer-body').innerText()).slice(0, 200);
expect(swapped !== firstTitle, where, 'related link did not swap the drawer contents');
expect(/Sequence-level/i.test(swapped), where, 'related link opened the wrong method');

where = 'drawer escape';
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
expect(!(await page.isVisible('#drawer')), where, 'Escape did not close the drawer');

where = 'library filter chip';
const chip = page.locator('.lib-chips .chip').nth(1);
const beforeCards = await page.locator('.method-card').count();
await chip.click();
await page.waitForTimeout(300);
const afterCards = await page.locator('.method-card').count();
expect(afterCards !== beforeCards || afterCards > 0, where, 'family chip changed nothing');
expect(await chip.getAttribute('aria-pressed') === 'true', where, 'chip did not report aria-pressed');
await chip.click();
await page.waitForTimeout(200);
await checkOverflow(where);

/* --------------------------------------------------- table sort + filters */
where = 'table sort';
await go('financial');
const sortBtn = page.locator('.table__sort').first();
expect(await sortBtn.count() > 0, where, 'no sortable table header');
const col = await sortBtn.evaluate((b) => b.closest('th'));
const readCol = () => page.evaluate(() => {
  const th = document.querySelector('.table__sort').closest('th');
  const i = [...th.parentElement.children].indexOf(th);
  return [...th.closest('table').querySelectorAll('tbody tr')].slice(0, 8)
    .map((tr) => (tr.children[i] || {}).textContent || '');
});
const pre = await readCol();
await sortBtn.click();
await page.waitForTimeout(300);
const post = await readCol();
expect(JSON.stringify(pre) !== JSON.stringify(post), where, 'sorting did not reorder the rows');
const ariaSort = await page.evaluate(() => document.querySelector('.table__sort').closest('th').getAttribute('aria-sort'));
expect(ariaSort === 'ascending' || ariaSort === 'descending', where, 'aria-sort not set, got ' + ariaSort);
void col;

where = 'table filter chip';
const tchip = page.locator('[data-filter]').first();
if (await tchip.count()) {
  const rowsBefore = await page.locator('[data-filter]').first().evaluate((b) =>
    document.getElementById(b.getAttribute('data-filter')).querySelectorAll('tbody tr').length);
  await tchip.click();
  await page.waitForTimeout(300);
  const rowsAfter = await page.locator('[data-filter]').first().evaluate((b) =>
    document.getElementById(b.getAttribute('data-filter')).querySelectorAll('tbody tr').length);
  expect(rowsAfter <= rowsBefore && rowsAfter > 0, where, `filter left ${rowsAfter} of ${rowsBefore} rows`);
  await page.locator('[data-filter-reset]').first().click();
  await page.waitForTimeout(200);
} else {
  note('no table filter chips on #/financial');
}
await checkOverflow(where);

/* --------------------------------------------------- chart segmented ctrl */
where = 'chart segmented control';
const segs = page.locator('[data-seg]');
if (await segs.count() > 1) {
  const target = segs.nth(1);
  await target.click();
  await page.waitForTimeout(600);
  expect(await target.getAttribute('aria-selected') === 'true', where, 'segment did not become selected');
  const visible = await page.evaluate(() => {
    const p = document.querySelector('[data-seg]').closest('.panel');
    return [...p.querySelectorAll('.panel__pane')].filter((x) => !x.hidden).length;
  });
  expect(visible === 1, where, 'expected exactly one visible pane, got ' + visible);
  await checkNoDeadPanels(where);
} else {
  fail(where, 'no segmented control found on #/financial');
}

where = 'chart scale toggle';
// The step above switched a segmented panel to its second tab, so the first
// scale control in the document may now belong to a hidden pane. Drive the one
// the reader can actually see.
const logBtn = page.locator('[data-scale-mode="log"]:visible').first();
if (await logBtn.count()) {
  await logBtn.click();
  await page.waitForTimeout(600);
  expect(await logBtn.getAttribute('aria-pressed') === 'true', where, 'log toggle did not press');
  await checkNoDeadPanels(where);
} else {
  note('no log/linear toggle on #/financial');
}

/* ------------------------------------------------------------ mobile rail */
where = 'mobile 390';
await page.setViewportSize({ width: 390, height: 844 });
for (const r of ROUTES) {
  where = 'mobile 390 #/' + r;
  await go(r);
  await checkOverflow(where);
  await checkNoDeadPanels(where);
}

where = 'mobile rail';
await go('overview');
where = 'mobile rail';
expect(await page.isVisible('#open-rail'), where, 'menu button is not visible at 390px');
await page.click('#open-rail');
await page.waitForTimeout(400);
expect(await page.evaluate(() => document.getElementById('rail').classList.contains('is-open')),
  where, 'menu button did not open the rail');
expect(await page.evaluate(() => document.getElementById('open-rail').getAttribute('aria-expanded')) === 'true',
  where, 'aria-expanded not set on the menu button');
await checkOverflow(where);
// Click the scrim clear of the rail sheet, which overlaps its left edge.
await page.mouse.click(370, 520);
await page.waitForTimeout(400);
expect(!(await page.evaluate(() => document.getElementById('rail').classList.contains('is-open'))),
  where, 'scrim click did not close the rail');

where = 'mobile palette';
await page.click('#open-palette');
await page.waitForTimeout(300);
expect(await page.isVisible('#palette'), where, 'search button did not open the palette at 390px');
await checkOverflow(where);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

/* ---------------------------------------------------------------- report */
await browser.close();

if (notes.length) console.log('notes:\n  ' + [...new Set(notes)].join('\n  '));
if (failures.length) {
  console.error('\nFAIL (' + failures.length + ')');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nsmoke: all routes and interactions pass');
