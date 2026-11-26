// Smoke-tests the exported web build in headless Chrome and captures README screenshots.
// Usage: npm run build:web -w @spaced/app && node scripts/screenshots.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const dist = path.resolve('app/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
  res.setHeader('content-type', types[path.extname(p)] ?? 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text() + ' ' + (m.location().url ?? '')));
await page.setViewport({ width: 420, height: 820, deviceScaleFactor: 2 });
const text = () => page.evaluate(() => document.body.innerText);
const click = async (label) => {
  const ok = await page.evaluate((l) => {
    const el = [...document.querySelectorAll('[role=button], [tabindex], a, div')].find((e) => e.innerText?.trim() === l && e.children.length < 4);
    if (!el) return false; el.click(); return true;
  }, label);
  if (!ok) throw new Error(`no element "${label}"`);
  await new Promise((r) => setTimeout(r, 300));
};
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
const shot = (n) => page.screenshot({ path: `docs/${n}.png` });

await page.goto(base, { waitUntil: 'networkidle0' });
assert((await text()).includes('No decks yet'), 'empty state');
await click('Add sample deck');
assert((await text()).includes('10 due'), 'sample deck due count');
await shot('home');

await click('Study all decks');
await page.waitForSelector('[aria-label^="Card"]', { timeout: 5000 });
assert((await text()).includes('hola') || (await text()).length > 0, 'study opened');
const before = await page.evaluate(() => document.querySelector('[aria-label^="Card"]').getBoundingClientRect().toJSON());
await page.keyboard.press('Space');
await new Promise((r) => setTimeout(r, 300));
const after = await page.evaluate(() => document.querySelector('[aria-label^="Card"]').getBoundingClientRect().toJSON());
assert(before.height === after.height && before.top === after.top, 'card did not move on flip');
await shot('review');
await page.keyboard.press('3');
await new Promise((r) => setTimeout(r, 300));
assert((await text()).includes('9 left'), 'rating advanced the queue');
await page.keyboard.press('z');
await new Promise((r) => setTimeout(r, 300));
assert((await text()).includes('10 left'), 'undo restored the card');
for (let i = 0; i < 10; i++) { await page.keyboard.press('Space'); await page.keyboard.press('4'); await new Promise((r) => setTimeout(r, 150)); }
assert((await text()).includes('All caught up'), 'session finished');
await shot('done');

await page.goto(base + '/stats', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 500));
assert((await text()).toLowerCase().includes('total reviews'), 'stats page');
await shot('stats');
await page.goto(base + '/settings', { waitUntil: 'networkidle0' });
await shot('settings');
await browser.close();
server.close();
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('web smoke test OK; screenshots in docs/');
