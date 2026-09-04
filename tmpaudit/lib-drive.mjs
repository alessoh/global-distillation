import { chromium } from 'playwright';
const OUT = 'C:/Users/hales/global-distillation/shots/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.goto('http://localhost:4173/#/library', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);

// inventory
const inv = await p.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const sel = s => Array.from(main.querySelectorAll(s));
  return {
    h2: sel('h2').map(e => e.textContent.trim()).slice(0, 40),
    h3: sel('h3').map(e => e.textContent.trim()).slice(0, 40),
    tables: sel('table').length,
    svgs: sel('svg').length,
    canvas: sel('canvas').length,
    buttons: sel('button').map(e => (e.textContent || '').trim() + '|' + (e.className || '')).slice(0, 60),
    sections: sel('section').map(e => e.className).slice(0, 30),
    cards: sel('article').length,
    links: sel('a[href^="http"]').length,
    landmarks: Array.from(document.querySelectorAll('main,nav,header,footer,aside')).map(e => e.tagName + '.' + e.className),
    focusables: sel('[tabindex]').map(e => e.tagName + ':' + e.getAttribute('tabindex')).slice(0, 20),
  };
});
console.log('INVENTORY', JSON.stringify(inv, null, 1));
await b.close();
console.log('ERRORS', errs);
