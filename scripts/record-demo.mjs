// Records a ~60 second scripted walkthrough of the web build to docs/demo.mp4 (needs ffmpeg).
// Usage: npm run build:web && node scripts/record-demo.mjs
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 820 });
const click = async (label) => {
  await page.evaluate((l) => [...document.querySelectorAll('[role=button], [tabindex], a, div')].find((e) => e.innerText?.trim() === l && e.children.length < 4)?.click(), label);
  await sleep(600);
};

await page.goto(base, { waitUntil: 'networkidle0' });
const rec = await page.screencast({ path: 'docs/demo.mp4' });
await sleep(2500);
await click('Add sample deck'); await sleep(3500);
await click('Study all decks'); await sleep(2500);
const ratings = ['3', '4', '3', '1', '3', '2', '4', '3'];
for (const [i, r] of ratings.entries()) {
  await sleep(2200);                       // read the front
  await page.keyboard.press('Space'); await sleep(2600); // see the answer
  if (i === 3) { await page.keyboard.press('z'); await sleep(2200); await page.keyboard.press('Space'); await sleep(1800); }
  await page.keyboard.press(r); await sleep(700);
}
await sleep(1500);
await page.goto(base + '/stats', { waitUntil: 'networkidle0' }); await sleep(5000);
await page.goto(base + '/settings', { waitUntil: 'networkidle0' }); await sleep(5000);
await page.goto(base, { waitUntil: 'networkidle0' }); await sleep(4000);
await rec.stop();
await browser.close();
server.close();
console.log('saved docs/demo.mp4');
