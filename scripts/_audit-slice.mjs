import { chromium } from 'playwright';
const url=process.argv[2], prefix=process.argv[3], w=Number(process.argv[4]), sliceH=Number(process.argv[5]||1700);
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:w,height:900},deviceScaleFactor:1});
await page.goto(url,{waitUntil:'load',timeout:60000});
await page.waitForTimeout(3000);
const H=await page.evaluate(()=>document.documentElement.scrollHeight);
console.log('height',H);
let i=0;
for(let y=0;y<H;y+=sliceH){
  const h=Math.min(sliceH,H-y);
  if(h<20) break;
  await page.screenshot({path:`${prefix}-${String(i).padStart(2,'0')}.png`, clip:{x:0,y,width:w,height:h}, fullPage:true, animations:'disabled', timeout:120000});
  i++;
}
console.log('slices',i);
await browser.close();
