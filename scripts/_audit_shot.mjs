import { chromium } from 'playwright';
const [url, out, w, h, full] = [process.argv[2], process.argv[3], Number(process.argv[4]||1440), Number(process.argv[5]||900), process.argv[6]==='full'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
const logs=[];
page.on('console', m=>{ if(['error','warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0,300)}`); });
page.on('pageerror', e=>logs.push(`[pageerror] ${e.message.slice(0,300)}`));
page.on('requestfailed', r=>logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(url,{waitUntil:'load',timeout:60000}).catch(e=>logs.push('[goto] '+e.message));
await page.waitForTimeout(3000);
// report font status
const fonts = await page.evaluate(()=>({status:document.fonts.status, size:document.fonts.size}));
logs.push('[fonts] '+JSON.stringify(fonts));
await page.screenshot({path:out, fullPage:full, animations:'disabled', timeout:120000});
console.log('saved '+out);
console.log(logs.join('\n')||'no console errors');
await browser.close();
