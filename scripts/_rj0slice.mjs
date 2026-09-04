import { chromium } from 'playwright';
const [url, prefix, wStr, hStr, maxStr] = process.argv.slice(2);
const w = Number(wStr||1440), h = Number(hStr||900), max = Number(maxStr||8);
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
await p.goto(url,{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
await p.waitForTimeout(4000);
const total = await p.evaluate(()=>document.documentElement.scrollHeight);
const n = Math.min(max, Math.ceil(total/h));
for(let i=0;i<n;i++){
  await p.evaluate(y=>window.scrollTo(0,y), i*h);
  await p.waitForTimeout(900);
  await p.screenshot({path:`${prefix}-${String(i).padStart(2,'0')}.png`});
}
console.log(`total=${total} slices=${n}`);
await b.close();
