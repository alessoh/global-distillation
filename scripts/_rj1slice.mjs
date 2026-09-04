import { chromium } from 'playwright';
const [url, out, ...rest] = process.argv.slice(2);
const ys = rest.map(Number);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
await p.waitForTimeout(5000);
let i = 0;
for (const y of ys) {
  await p.evaluate((yy) => window.scrollTo(0, yy), y);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}-${i}.png` });
  console.log(`${out}-${i}.png @${y}`);
  i++;
}
await b.close();
