import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:4173/#/political', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const h = await p.evaluate(() => document.body.scrollHeight);
console.log('height', h);
const n = Math.ceil(h/1000);
for (let i=0;i<n;i++){
  await p.evaluate(y=>window.scrollTo(0,y), i*1000);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `C:/Users/hales/global-distillation/shots/seg-${String(i).padStart(2,'0')}.png` });
}
// structure dump
const struct = await p.evaluate(() => {
  const out=[];
  document.querySelectorAll('section, h1,h2,h3,h4, table, svg, button, input, [role=tab], .chip, [class*=card]').forEach(el=>{
    const r=el.getBoundingClientRect();
    out.push(`${el.tagName}${el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/).join('.'):''} | ${(el.innerText||'').slice(0,80).replace(/\n/g,' / ')}`);
  });
  return out;
});
console.log(struct.slice(0,400).join('\n'));
await b.close();
