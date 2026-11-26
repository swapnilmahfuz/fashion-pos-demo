const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const prefix = '/fashion-pos-demo/';
const contentTypes = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png' };
let server;
let browser;
let baseUrl;

before(async () => {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const relative = pathname.slice(prefix.length) || 'index.html';
    const file = path.resolve(root, relative);
    if (!pathname.startsWith(prefix) || !file.startsWith(root + path.sep)) {
      response.writeHead(404).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) response.writeHead(404).end();
      else response.writeHead(200, { 'Content-Type':contentTypes[path.extname(file)] || 'text/plain' }).end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = process.env.QAHAF_BASE_URL || 'http://127.0.0.1:' + server.address().port + prefix;
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args:['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  if(server) await new Promise(resolve=>server.close(resolve));
});

async function session(t, viewport = { width:1440, height:1000 }) {
  const context = await browser.newContext({ viewport, isMobile:viewport.width<600, hasTouch:viewport.width<600, acceptDownloads:true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'browser page errors');
  });
  page.setDefaultTimeout(7000);
  await page.goto(baseUrl);
  return page;
}
async function go(page, route) {
  const mobile = page.viewportSize().width <= 850;
  if (mobile) await page.locator('#nav-toggle').click();
  const parent = ['inventory','products','lowstock','deadstock','defective','adjustments','categories'].includes(route) ? 'inventory' : route;
  await page.locator('#nav [data-page="'+parent+'"]').click();
  if(route==='categories')await page.locator('[data-go="categories"]').click();
  else if (route !== parent) await page.locator('[data-tab="'+route+'"]').click();
}
module.exports={test,assert,path,fs,os,root,session,go};
