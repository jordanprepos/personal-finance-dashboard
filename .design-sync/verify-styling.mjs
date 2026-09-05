// Guards the one failure this sync can't see: an empty CSS closure.
//
// If the closure loses a stylesheet, the storybook reference and the generated
// previews BOTH render unstyled — so the compare harness matches them against
// each other and every grade passes. A byte-count check on _ds_bundle.css is a
// brittle proxy (any legitimate CSS edit moves it). This asserts the thing that
// actually matters: a breach banner resolves --cf-ink to real ink.
//
// Run after any CSS/config change, from the repo root:
//   node .design-sync/verify-styling.mjs
// Requires the staged converter deps (.ds-sync/node_modules) and a built
// reference storybook (.design-sync/sb-reference).

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const INK = 'rgb(24, 35, 56)';
const require = createRequire(new URL('../.ds-sync/', import.meta.url));
const { chromium } = require('playwright');

const root = resolve('.design-sync/sb-reference');
if (!existsSync(resolve(root, 'iframe.html'))) {
  console.error('no reference storybook — build it first (see NOTES.md)');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = createServer((req, res) => {
  const p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root + sep) || !existsSync(p) || !statSync(p).isFile()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[extname(p)] ?? 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
let failed = 0;

for (const [id, sel] of [
  ['alerts-desktopalertbanners--breach', '.dash__alert--breach'],
  ['alerts-mobilealertbanners--breach', '.phone__alert--breach'],
]) {
  await page.goto(`http://127.0.0.1:${port}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const bg = await page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el).backgroundColor : null;
  }, sel);
  const ok = bg === INK;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${sel} background=${bg ?? '(element missing)'} expected=${INK}`);
}

await browser.close();
srv.close();
if (failed) {
  console.error('\nThe style closure is broken — previews would render unstyled and still grade as matching.');
  process.exit(1);
}
console.log('\nstyle closure intact');
