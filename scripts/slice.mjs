import { chromium } from 'playwright';
const url = process.argv[2], prefix = process.argv[3];
const width = Number(process.argv[4] || 1440), height = Number(process.argv[5] || 1100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
console.log('scrollHeight', total);
let i = 0;
for (let y = 0; y < total; y += height) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${prefix}-${String(i).padStart(2,'0')}.png` });
  i++;
  if (i > 30) break;
}
console.log('slices', i);
await browser.close();
