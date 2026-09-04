// Screenshot helper for visual QA: node scripts/screenshot.mjs <url> <out.png> [--width 1440] [--height 900] [--full] [--wait 1500] [--click "selector"] [--hash "#/route"]
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const url = argv[0]; const out = argv[1];
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
if (!url || !out) { console.error('usage: node scripts/screenshot.mjs <url> <out.png> [--width N] [--height N] [--full] [--wait ms] [--click sel] [--console]'); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(opt('--width', 1440)), height: Number(opt('--height', 900)) }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => logs.push(`[goto] ${e.message}`));
const clicks = argv.flatMap((a, i) => (a === '--click' ? [argv[i + 1]] : []));
for (const sel of clicks) { await page.click(sel, { timeout: 10000 }).catch((e) => logs.push(`[click ${sel}] ${e.message}`)); await page.waitForTimeout(600); }
await page.waitForTimeout(Number(opt('--wait', 1500)));
await page.screenshot({ path: out, fullPage: has('--full') });
console.log(`saved ${out}`);
if (logs.length) console.log(logs.join('\n')); else console.log('no console errors');
await browser.close();
