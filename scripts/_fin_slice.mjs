import { chromium } from 'playwright';
const argv = process.argv.slice(2);
const url = argv[0], prefix = argv[1];
const W = Number(argv[2]||1440), H = Number(argv[3]||1400);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(2500);
const total = await page.evaluate(()=>document.documentElement.scrollHeight);
const n = Math.ceil(total/H);
for(let i=0;i<n;i++){
  await page.evaluate(y=>window.scrollTo(0,y), i*H);
  await page.waitForTimeout(500);
  await page.screenshot({path:`${prefix}-${String(i).padStart(2,'0')}.png`, timeout:60000, animations:'disabled'});
}
console.log('slices',n,'total',total);
await browser.close();
