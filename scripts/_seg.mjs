import { chromium } from 'playwright';
const [,, url, outPrefix, wStr, hStr, startStr, countStr] = process.argv;
const w=Number(wStr||1440), h=Number(hStr||1400), start=Number(startStr||0), count=Number(countStr||8);
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:w, height:900}, deviceScaleFactor:1 });
await p.goto(url,{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
await p.waitForTimeout(4000);
const total = await p.evaluate(()=>document.documentElement.scrollHeight);
console.log('scrollHeight', total);
for(let i=0;i<count;i++){
  const top = start + i*h; if(top>=total) break;
  await p.screenshot({path:`${outPrefix}-${String(i).padStart(2,'0')}.png`, fullPage:true, clip:{x:0,y:top,width:w,height:Math.min(h,total-top)}});
  console.log(`${outPrefix}-${String(i).padStart(2,'0')}.png y=${top}`);
}
await b.close();
