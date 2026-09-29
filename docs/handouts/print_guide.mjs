// Prints IgniSense-Guide.html to IgniSense-Guide.pdf with page numbers, using headless Edge or Chrome.
//   node docs/handouts/print_guide.mjs
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const html = pathToFileURL(resolve(here, 'IgniSense-Guide.html')).href;
const pdf = resolve(here, 'IgniSense-Guide.pdf');
const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const exe = candidates.find(existsSync);
if (!exe) throw new Error('Edge or Chrome not found');

const port = 9344;
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ig-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 60 && !page; i++) {
  try {
    page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  } catch {}
  await sleep(500);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
};
const call = (method, params = {}) => new Promise((res) => {
  const i = ++id;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});

await call('Page.enable');
await call('Page.navigate', { url: html });
await sleep(2500);
await call('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
const footer = `<div style="width:100%;font-family:Arial,sans-serif;font-size:7.5pt;color:#7f8fa3;padding:0 17mm;display:flex;justify-content:space-between">
  <span>IgniSense · Team Revora · The complete guide</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
const r = await call('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: footer,
});
writeFileSync(pdf, Buffer.from(r.result.data, 'base64'));
console.log('saved', pdf);
ws.close();
proc.kill();
process.exit(0);
