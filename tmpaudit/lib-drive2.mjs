import { chromium } from 'playwright';
const OUT = 'C:/Users/hales/global-distillation/shots/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.goto('http://localhost:4173/#/library', { waitUntil: 'networkidle' });
await p.waitForTimeout(1000);

const shot = async (n, opts = {}) => p.screenshot({ path: OUT + 'lib-' + n + '.png', ...opts });

// 1. filter chip
await p.click('button.chip:has-text("Black-box")');
await p.waitForTimeout(400);
console.log('after chip, count text:', await p.locator('.lib__count, [class*=count]').first().textContent().catch(e=>'n/a'));
await shot('chip');
const cardsAfter = await p.locator('button.method-card').count();
console.log('cards after black-box chip:', cardsAfter);
// aria-pressed?
console.log('chip aria:', await p.locator('button.chip:has-text("Black-box")').first().evaluate(e => e.outerHTML.slice(0,300)));

// 2. combine with an incompatible chip
await p.click('button.chip:has-text("White-box")');
await p.waitForTimeout(400);
console.log('cards after black+white:', await p.locator('button.method-card').count());
await shot('chip2');

// reset
await p.click('button.chip:has-text("Black-box")');
await p.click('button.chip:has-text("White-box")');
await p.waitForTimeout(300);

// 3. search box
const inp = p.locator('input').first();
await inp.fill('attention');
await p.waitForTimeout(500);
console.log('cards after search attention:', await p.locator('button.method-card').count());
await shot('search');
await inp.fill('zzzzz');
await p.waitForTimeout(400);
console.log('empty state html:', (await p.locator('.section.lib').innerHTML()).slice(-800));
await shot('empty');
await inp.fill('');
await p.waitForTimeout(300);

// 4. open drawer
await p.locator('button.method-card').first().click();
await p.waitForTimeout(700);
await shot('drawer');
const drawer = await p.evaluate(() => {
  const d = document.querySelector('[class*=drawer],[role=dialog],dialog');
  if (!d) return null;
  return { cls: d.className, tag: d.tagName, role: d.getAttribute('role'), aria: d.getAttribute('aria-modal'), label: d.getAttribute('aria-label'), h: d.getBoundingClientRect().height, text: d.innerText.slice(0, 2500), scrollH: d.scrollHeight, headings: Array.from(d.querySelectorAll('h1,h2,h3,h4')).map(x=>x.tagName+':'+x.textContent.trim()), links: Array.from(d.querySelectorAll('a')).map(a=>a.textContent.trim()+' -> '+a.href) };
});
console.log('DRAWER', JSON.stringify(drawer, null, 1));
console.log('focus after open:', await p.evaluate(() => document.activeElement.tagName + '.' + document.activeElement.className));
// full drawer shot
await p.screenshot({ path: OUT + 'lib-drawer-full.png', fullPage: true });
// escape
await p.keyboard.press('Escape');
await p.waitForTimeout(400);
console.log('drawer after Esc:', await p.evaluate(() => !!document.querySelector('[class*=drawer].is-open, [role=dialog]')));
console.log('focus after esc:', await p.evaluate(() => document.activeElement.tagName + '.' + document.activeElement.className));

// 5. command palette
await p.keyboard.press('Control+K');
await p.waitForTimeout(600);
await shot('palette');
console.log('palette:', await p.evaluate(() => { const el = document.querySelector('[class*=palette],[class*=cmd],[class*=search]'); return el ? el.className + ' :: ' + el.innerText.slice(0,600) : 'NONE'; }));
await p.keyboard.press('Escape');

// 6. scroll offsets / sticky header check
await p.evaluate(() => window.scrollTo(0, 1500));
await p.waitForTimeout(300);
await shot('scrolled');

// 7. keyboard tab order from top
await p.evaluate(() => window.scrollTo(0,0));
await p.keyboard.press('Tab');
const tabs = [];
for (let i = 0; i < 12; i++) { tabs.push(await p.evaluate(() => { const a = document.activeElement; return a.tagName + '.' + (a.className||'') + ' [' + (a.innerText||'').slice(0,30).replace(/\n/g,' ') + ']'; })); await p.keyboard.press('Tab'); }
console.log('TAB ORDER', tabs);

// contrast probes
const probes = await p.evaluate(() => {
  const out = {};
  const g = (sel, k) => { const e = document.querySelector(sel); if (!e) return; const cs = getComputedStyle(e); out[k] = { color: cs.color, bg: cs.backgroundColor, fs: cs.fontSize, lh: cs.lineHeight, ff: cs.fontFamily.split(',')[0], w: e.getBoundingClientRect().width }; };
  g('.section.lib .hero p, .hero p', 'heroP');
  g('button.method-card', 'card');
  g('button.method-card p', 'cardP');
  g('button.chip', 'chip');
  g('input', 'input');
  return out;
});
console.log('PROBES', JSON.stringify(probes, null, 1));
await b.close();
console.log('ERRORS', errs);
