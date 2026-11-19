/* فحص شامل: يمر على كل الشاشات والمزايا ويجمع أي خطأ */
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765/';
const issues = [];
function note(where, msg) { issues.push(where + ' :: ' + msg); }
async function run(name, ctxOpts) {
  const b = await chromium.launch(); const ctx = await b.newContext(ctxOpts); const p = await ctx.newPage();
  p.on('pageerror', e => note(name, 'JS error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|fonts\.g|net::ERR/.test(m.text())) note(name, 'console: ' + m.text()); });
  const step = async (label, fn) => { try { await fn(); } catch (e) { note(name, label + ' FAILED: ' + e.message.split('\n')[0]); } };
  await p.goto(BASE); await p.waitForTimeout(1200);
  await step('sign-in visible', async () => { if (!(await p.isVisible('#signin'))) throw new Error('signin hidden'); });
  await step('intro runs', async () => { await p.waitForTimeout(2500); });
  await step('demo opens', async () => { await p.evaluate(() => document.getElementById('btnDemo').click()); await p.waitForTimeout(1500); if (!(await p.isVisible('#library'))) throw new Error('library hidden'); });
  await step('home has cards', async () => { const n = await p.$$eval('.card', a => a.length); if (n < 3) throw new Error('cards=' + n); });
  await step('header fits', async () => { const h = await p.$eval('header.top', e => e.getBoundingClientRect().height); const vh = await p.evaluate(() => innerHeight); if (h > vh * 0.4) throw new Error('header ' + h + 'px of ' + vh); });
  await step('no horizontal scroll', async () => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 2) throw new Error('overflow ' + o + 'px'); });
  for (const f of ['series', 'movie', 'fav', 'all']) await step('chip ' + f, async () => { await p.evaluate(f => { filter = f; render(); }, f); await p.waitForTimeout(200); });
  await step('channel page', async () => { await p.evaluate(() => { const c = kids(rootKey).find(n => n.folder && !isTitle(n)); open(c); }); await p.waitForTimeout(300); });
  await step('title page', async () => { await p.evaluate(() => { const t = Object.values(nodes).find(n => n.folder && isTitle(n) && groups(n).length > 1); open(t); }); await p.waitForTimeout(300); if (!(await p.$('.thero'))) throw new Error('no hero'); });
  await step('season tabs', async () => { const t = await p.$$('.seasons .fchip'); if (t.length > 1) { await t[1].click(); await p.waitForTimeout(200); } });
  await step('favourite toggle', async () => { await p.click('.favbtn'); await p.waitForTimeout(200); await p.click('.favbtn'); });
  await step('play episode', async () => { await p.click('.list .video'); await p.waitForTimeout(900); if (await p.isHidden('#player')) throw new Error('player hidden'); });
  await step('next/prev', async () => { await p.click('#btnNext').catch(() => {}); await p.waitForTimeout(400); await p.click('#btnPrev').catch(() => {}); await p.waitForTimeout(400); });
  await step('back to series btn', async () => { const b = await p.$('#pBack'); if (b && await b.isVisible()) { await b.click(); await p.waitForTimeout(500); if (!(await p.isHidden('#player'))) throw new Error('player still open'); } });
  await step('replay + back gesture', async () => { await p.click('.list .video'); await p.waitForTimeout(600); await p.goBack(); await p.waitForTimeout(500); if (!(await p.isHidden('#player'))) throw new Error('back did not close player'); });
  await step('download', async () => { const d = await p.$('.epdl'); if (d) { await d.click(); await p.waitForTimeout(2500); } });
  await step('downloads tab', async () => { await p.evaluate(() => { goHome(); filter = IS_TV ? 'all' : 'dl'; render(); }); await p.waitForTimeout(500); });
  await step('search', async () => { await p.fill('#q', 'الحلقة'); await p.waitForTimeout(500); await p.fill('#q', ''); await p.waitForTimeout(300); });
  await step('snow menu', async () => { await p.click('#btnWx'); await p.click('[data-wx="snow"]'); await p.waitForTimeout(500); await p.click('#btnWx'); await p.click('[data-wx="rain"]'); await p.waitForTimeout(400); await p.click('#btnWx'); await p.click('[data-wx="off"]'); });
  await step('settings', async () => { await p.click('#btnSettings'); await p.waitForTimeout(400); await p.click('.setbg:nth-child(2)'); await p.click('.setacc:nth-child(2)'); await p.click('.switch'); await p.waitForTimeout(3200); await p.selectOption('#citySel', 'jeddah'); await p.click('.setacc:nth-child(1)'); await p.click('.setbg:nth-child(1)'); await p.click('.setdone'); await p.waitForTimeout(300); });
  await step('lists + hide', async () => { await p.evaluate(() => { const t = Object.values(nodes).find(n => n.folder && isTitle(n)); open(t); }); await p.waitForTimeout(300); await p.click('text=أضف لقائمة'); await p.fill('.lnew input', 'قائمة'); await p.click('.lnew button'); await p.click('.sheet .setdone'); await p.click('text=إخفاء'); await p.waitForTimeout(300); await p.click('#btnSettings'); await p.click('.setsec >> text=إظهار'); await p.click('.setdone'); });
  await step('signout', async () => { await p.click('#btnSignout'); await p.waitForTimeout(500); if (!(await p.isVisible('#signin'))) throw new Error('signin not shown'); });
  await b.close();
}
(async () => {
  await run('phone', { ...devices['Pixel 7'], timezoneId: 'Asia/Riyadh' });
  await run('desktop', { viewport: { width: 1440, height: 900 } });
  await run('tv', { viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K) AppleWebKit/537.36 Chrome/120 Safari/537.36 SmartTV' });
  console.log(issues.length ? issues.join('\n') : 'ALL CLEAN');
})();
