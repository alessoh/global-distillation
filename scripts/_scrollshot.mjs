import { chromium } from 'playwright';
const [,, url, outPrefix, wStr, hStr, ...ys] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:Number(wStr), height:Number(hStr)}, deviceScaleFactor:1 });
await p.goto(url,{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
await p.waitForTimeout(4000);
for(const y of ys){ await p.evaluate(v=>window.scrollTo(0,v), Number(y)); await p.waitForTimeout(800);
  await p.screenshot({path:`${outPrefix}-y${y}.png`}); console.log(`${outPrefix}-y${y}.png`); }
await b.close();
