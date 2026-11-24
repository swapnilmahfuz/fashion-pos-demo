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
  await page.goto(baseUrl);
  return page;
}
async function go(page, route) {
  const mobile = page.viewportSize().width <= 850;
  if (mobile) await page.locator('#nav-toggle').click();
  const parent = ['inventory','products','categories'].includes(route) ? 'inventory' : route;
  await page.locator('#nav [data-page="'+parent+'"]').click();
  if (route !== parent) await page.locator('[data-tab="'+route+'"]').click();
}
async function csvDownload(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="report"]').click()
  ]);
  return fs.readFileSync(await download.path(), 'utf8');
}
async function saveProduct(page, name, { sizes='M, L', colors='Black, Navy', qty='3', branch='2', action='Save' } = {}) {
  await page.getByRole('button',{ name:'Add New Product' }).click();
  await page.locator('#p-name').fill(name);
  await page.locator('#p-sizes').fill(sizes);
  await page.locator('#p-colors').fill(colors);
  if (await page.locator('#p-branch').isEnabled()) await page.locator('#p-branch').selectOption(branch);
  await page.locator('#p-stock').fill(qty);
  await page.getByRole('button',{ name:action, exact:true }).click();
}
async function discardDialog(page) {
  await page.keyboard.press('Escape');
  if(await page.locator('#discard-changes').count()) await page.locator('#discard-changes').click();
}

for (const [width,height] of [[1440,1000],[1024,768],[390,844],[360,800]]) {
  test('responsive navigation, context and drawer at ' + width + 'px', async t => {
    const page = await session(t,{ width,height });
    assert.match(await page.title(),/QAHAF/);
    assert.deepEqual(await page.locator('#branch option').allTextContents(),['Combined','New Market','Dakbangla']);
    await page.locator('#branch').selectOption('2');
    for (const route of ['overview','monthly','pos','inventory','products','categories','purchases','transfers','expenses','customers','finance','marketing','settings']) {
      await go(page,route);
      assert.ok(await page.locator('h1').isVisible(),route);
      assert.equal(await page.locator('[data-scope]').innerText(),'Dakbangla',route);
      assert.equal(await page.locator('#branch').inputValue(),'2',route);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route);
      assert.ok(!/THREAD|Retail OS|Gulshan|Dhanmondi/.test(await page.locator('body').innerText()),route);
    }
    assert.equal(await page.locator('#nav button').filter({ hasText:'Damage & Dead Stock' }).count(),0);
    assert.equal(await page.locator('#nav button').filter({ hasText:'Funds & Accounts' }).count(),0);
    assert.match(await page.locator('#nav').textContent(),/Planned · Phase 5/);
    await go(page,'inventory');
    await page.getByRole('tab',{name:'Inventory',exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[role=tab][aria-selected=true]').innerText(),'Products');
    assert.equal(await page.locator('#tab-products').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('End');
    assert.equal(await page.locator('[role=tab][aria-selected=true]').innerText(),'Categories');
    await page.evaluate(()=>window.scrollTo(0,600));
    assert.ok(await page.locator('.topbar').evaluate(el=>Math.abs(el.getBoundingClientRect().top)<2));
    if (width<851) {
      await page.locator('#nav-toggle').click();
      assert.equal(await page.locator('.main-wrap').evaluate(el=>el.inert),true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('#nav-toggle').evaluate(el=>el===document.activeElement),true);
    }
    await go(page,'pos');
    if(width<851){
      await page.locator('#nav-toggle').click();
      await page.keyboard.type('100001001',{delay:10});
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.cart-line').count(),0);
      await page.keyboard.press('Escape');
    }
    await page.reload();
    assert.equal(await page.locator('#branch').inputValue(),'2');
  });
}

test('Owner reports, branch/date filters, CSV and preserved sample reconciliation', async t => {
  const page=await session(t);
  const baseline=await page.evaluate(()=>({
    variants:products.length, stock:products.reduce((sum,p)=>sum+p.b1+p.b2,0),
    expenses:['all','1','2'].map(branch=>expenseAmount(state.month,branch)),
    totals:['all','1','2'].map(branch=>figures(rowsFor(state.month,branch)))
  }));
  assert.equal(baseline.variants,22);
  assert.equal(baseline.stock,334);
  for(const metric of ['revenue','profit','invoices','discounts','refunds','items']) {
    assert.ok(Math.abs(baseline.totals[0][metric]-baseline.totals[1][metric]-baseline.totals[2][metric])<.011,metric);
  }
  assert.equal(baseline.expenses[0],baseline.expenses[1]+baseline.expenses[2]);
  for(const branch of ['all','1','2']) {
    await page.locator('#branch').selectOption(branch);
    await go(page,'finance');
    const expected=await page.evaluate(()=>figures(rowsFor(state.month)).revenue);
    const csv=await csvDownload(page);
    assert.ok(csv.includes('"revenue","'+expected+'"'));
    assert.match(csv,/QAHAF/);
    assert.ok(csv.includes(await page.locator('[data-scope]').innerText()));
    await go(page,'expenses');
    const expenseCsv=await csvDownload(page);
    assert.match(expenseCsv,/"Date","Description","Category","Branch","Amount"/);
    assert.match(expenseCsv,/Store rent/);
    if(branch==='2')assert.ok(!expenseCsv.includes('New Market campaign'));
    await go(page,'customers');
    const customerCsv=await csvDownload(page);
    assert.match(customerCsv,/"Customer","Mobile","Branch","Invoices","Net spending","Consent"/);
    if(branch==='1')assert.ok(!customerCsv.includes('Demo Customer B'));
  }
  await go(page,'overview');
  await page.locator('#report-period').fill('2000-01-01');
  assert.match(await page.locator('#content').innerText(),/No sample records/);
  await go(page,'inventory');
  await page.getByRole('button',{name:'Add New Product'}).click();
  assert.equal(await page.locator('#p-branch').inputValue(),'2');
  assert.equal(await page.locator('#p-branch').isDisabled(),true);
  await page.keyboard.press('Escape');
});

test('Manager operational scope and guarded financial routes and exports', async t => {
  const page=await session(t);
  await page.locator('#branch').selectOption('2');
  await go(page,'finance');
  await page.locator('#role').selectOption('manager');
  assert.equal(await page.locator('h1').innerText(),'Dashboard');
  assert.equal(await page.locator('#branch').inputValue(),'1');
  assert.equal(await page.locator('#branch').isDisabled(),true);
  assert.equal(await page.locator('#nav [data-page="finance"],#nav [data-page="monthly"]').count(),0);
  assert.ok(!(await page.locator('#content').innerText()).includes('GROSS PROFIT'));
  for(const route of ['overview','inventory','products','categories','purchases','transfers','expenses','customers','marketing','settings']) {
    await go(page,route);
    assert.equal(await page.locator('[data-scope]').innerText(),'New Market');
    assert.equal(await page.locator('[data-action="report"]').count(),0);
  }
  const downloads=[];
  page.on('download',item=>downloads.push(item));
  await page.evaluate(()=>{state.page='monthly';state.branch='2';render();exportReport();});
  assert.equal(await page.locator('h1').innerText(),'Dashboard');
  assert.equal(await page.locator('#branch').inputValue(),'1');
  assert.match(await page.locator('#toast').innerText(),/Owner/);
  assert.equal(downloads.length,0);
  await go(page,'expenses');
  assert.ok(!await page.locator('tbody').innerText().then(text=>text.includes('Dakbangla')));
  await go(page,'settings');
  assert.ok(!(await page.locator('#content').innerText()).includes('Financial administration'));
  await go(page,'marketing');
  await page.locator('[data-action="offer"]').click();
  assert.match(await page.locator('#offer-text').inputValue(),/QAHAF/);
  await page.locator('#offer-text').fill('Edited sample offer');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Keep editing'}).click();
  assert.equal(await page.locator('#offer-text').inputValue(),'Edited sample offer');
  await discardDialog(page);
  await page.locator('#role').selectOption('owner');
  assert.equal(await page.locator('#branch').inputValue(),'2');
});

test('modal focus, dirty drafts, navigation guard and keyboard dismissal', async t => {
  const page=await session(t);
  await go(page,'products');
  await page.getByRole('button',{name:'Add New Product'}).click();
  assert.equal(await page.locator('[role=dialog]').getAttribute('aria-modal'),'true');
  assert.equal(await page.locator('#app').evaluate(el=>el.inert),true);
  assert.equal(await page.locator('#p-name').evaluate(el=>el===document.activeElement),true);
  await page.locator('#p-name').fill('Unsaved product');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[role=alertdialog]').count(),1);
  assert.equal(await page.locator('#keep-editing').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#discard-changes').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#p-name').inputValue(),'Unsaved product');
  await page.locator('#product-form button[type=submit]').last().focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#p-name').evaluate(el=>el===document.activeElement),true);
  await page.evaluate(()=>navigate('purchases'));
  assert.equal(await page.locator('[role=alertdialog]').count(),1);
  await page.getByRole('button',{name:'Keep editing'}).click();
  assert.equal(await page.locator('#p-name').inputValue(),'Unsaved product');
  await page.locator('#overlay').click({position:{x:2,y:2}});
  await page.getByRole('button',{name:'Discard changes'}).click();
  assert.equal(await page.locator('#overlay').count(),0);
  assert.equal(await page.locator('#app').evaluate(el=>el.inert),false);
  assert.equal(await page.getByRole('button',{name:'Add New Product'}).evaluate(el=>el===document.activeElement),true);
});

test('barcode/cart limits, typing safety, scope confirmation and checkout printing', async t => {
  const page=await session(t);
  await go(page,'pos');
  await page.locator('#branch').selectOption('1');
  const stock=await page.evaluate(()=>products[0].b1);
  for(let index=0;index<stock+1;index++){
    await page.locator('#pos-search').fill('100001001');
    await page.locator('#pos-search').press('Enter');
  }
  assert.equal(Number(await page.locator('.qty span').innerText()),stock);
  assert.match(await page.locator('#toast').innerText(),/Not enough sample stock/);
  await page.locator('#customer').fill('100001001');await page.locator('#customer').press('Enter');
  assert.equal(Number(await page.locator('.qty span').innerText()),stock);
  await page.locator('#discount').fill('10');
  await page.locator('#branch').selectOption('2');
  assert.equal(await page.locator('#branch').inputValue(),'1');
  await page.getByRole('button',{name:'Keep current scope'}).click();
  assert.equal(Number(await page.locator('.qty span').innerText()),stock);
  await page.locator('#branch').selectOption('2');
  await page.getByRole('button',{name:'Change scope',exact:true}).click();
  assert.equal(await page.locator('#branch').inputValue(),'2');
  assert.equal(await page.locator('.cart-line').count(),0);
  assert.equal(await page.locator('#discount').inputValue(),'0');
  assert.equal(await page.locator('#customer').inputValue(),'');
  await page.locator('#pos-search').fill('unknown');
  await page.locator('#pos-search').press('Enter');
  assert.match(await page.locator('#toast').innerText(),/Unknown barcode/);
  await page.locator('#pos-search').fill('100001001');await page.locator('#pos-search').press('Enter');
  await page.locator('#discount').fill('10');
  await page.locator('[data-action="checkout"]').click();
  await page.locator('[data-save="checkout"]').click();
  assert.match(await page.locator('#demo-receipt').innerText(),/QAHAF[\s\S]*Dakbangla[\s\S]*1,341/);
  const history=await page.evaluate(()=>ledger.at(-1));
  assert.equal(history.branch,2);
  assert.equal(history.lines[0].revenue,1341);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('#app').isVisible(),false);
  assert.equal(await page.locator('#demo-receipt').isVisible(),true);
  await page.emulateMedia({media:'screen'});
  await page.keyboard.press('Escape');
});

test('product variants and SKUs, Manager creation, receiving and label print media', async t => {
  const page=await session(t);
  await go(page,'products');
  await saveProduct(page,'Owner sample',{action:'Save & Print Barcode'});
  await page.locator('[data-print-variant]').first().waitFor();
  assert.equal(await page.locator('[data-print-variant]').count(),4);
  const created=await page.evaluate(()=>products.filter(p=>p.name==='Owner sample'));
  assert.equal(new Set(created.map(p=>p.sku)).size,4);
  assert.equal(new Set(created.map(p=>p.barcode)).size,4);
  assert.ok(created.every(p=>p.b1===0&&p.b2===3));
  await page.evaluate(()=>window.print=()=>{});
  await page.locator('#print-labels').click();
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('#print-root .barcode-label').count(),4);
  assert.equal(await page.locator('#print-root').isVisible(),true);
  assert.equal(await page.locator('#app').isVisible(),false);
  assert.match(await page.locator('#print-root').innerText(),/Dakbangla/);
  await page.pdf({path:path.join(os.tmpdir(),'qahaf-phase1-labels.pdf')});
  await page.emulateMedia({media:'screen'});
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  await page.keyboard.press('Escape');
  await page.locator('#role').selectOption('manager');
  await saveProduct(page,'Manager sample',{sizes:'L',colors:'Black',qty:'2',action:'Save'});
  const manager=await page.evaluate(()=>products.find(p=>p.name==='Manager sample'));
  assert.equal(manager.b1,2);assert.equal(manager.b2,0);
  await page.getByRole('button',{name:'Add New Product'}).click();
  await page.locator('#p-name').fill('Duplicate');
  await page.locator('#p-sizes').fill('M');await page.locator('#p-colors').fill('Navy');await page.locator('#p-colors').press('Tab');
  await page.locator('#p-sku-mode').selectOption('manual');
  await page.locator('[data-draft-sku]').fill(created[0].sku);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.match(await page.locator('#form-error').innerText(),/already assigned/);
  await discardDialog(page);
  await go(page,'inventory');
  await page.locator('[data-v11="receive"]').click();
  await page.locator('#receive-variant').selectOption(String(created[0].id));
  await page.locator('#receive-qty').fill('5');
  await page.getByRole('button',{name:'Receive units'}).click();
  const received=await page.evaluate(id=>products.find(p=>p.id===id),created[0].id);
  assert.equal(received.b1,5);assert.equal(received.b2,3);
  await page.locator('#table-search').fill(created[0].sku);await page.locator('#table-search').press('Enter');
  assert.match(await page.locator('#content').innerText(),/Exact match/);
  await page.locator('[data-label="'+created[0].id+'"]').first().click();
  assert.equal(await page.locator('#barcode-preview').textContent(),created[0].barcode);
  await page.keyboard.press('Escape');
});

test('existing transfers and branch expenses stay isolated and reconcile', async t => {
  const page=await session(t);
  await page.locator('#branch').selectOption('1');
  const stock=await page.evaluate(()=>[products[0].b1,products[0].b2]);
  await go(page,'transfers');
  await page.locator('[data-action="transfer"]').click();
  await page.locator('[data-save="transfer"]').click();
  assert.equal(await page.evaluate(()=>products[0].b1),stock[0]-2);
  await page.locator('#branch').selectOption('2');
  await page.locator('[data-receive-transfer]').click();
  assert.equal(await page.evaluate(()=>products[0].b2),stock[1]+2);
  await go(page,'expenses');
  await page.locator('[data-action="expense"]').click();
  await page.locator('#ex-title').fill('Branch 2 audit expense');
  await page.locator('#ex-amount').fill('123.45');
  await page.locator('[data-save="expense"]').click();
  assert.match(await page.locator('#content').innerText(),/Branch 2 audit expense/);
  await page.locator('#branch').selectOption('1');
  assert.ok(!(await page.locator('#content').innerText()).includes('Branch 2 audit expense'));
  const reconciled=await page.evaluate(()=>{
    for(const product of products)for(const branch of [1,2]){
      const movements=stockMovements.filter(m=>m.productId===product.id&&m.branch===branch).reduce((sum,m)=>sum+m.qty,0);
      const sold=ledger.filter(s=>s.branch===branch).flatMap(s=>s.lines).filter(l=>l.productId===product.id).reduce((sum,l)=>sum+l.qty*(l.refund?-1:1),0);
      if(movements-sold!==product['b'+branch])return false;
    }
    return true;
  });
  assert.equal(reconciled,true);
});

test('shared configuration and palette contrast', async t => {
  const page=await session(t);
  for(const filename of ['app.js','v11.js','shell.js','index.html']) {
    const source=fs.readFileSync(path.join(root,filename),'utf8');
    assert.ok(!/New Market|Dakbangla/.test(source),filename);
    assert.ok(!/THREAD|Retail OS|Gulshan|Dhanmondi/.test(source),filename);
  }
  const colors=await page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement);
    return ['--ink','--muted','--panel','--white','--accent','--sidebar','--soft'].map(name=>style.getPropertyValue(name).trim());
  });
  function luminance(hex) {
    return hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).reduce((sum,n,i)=>
      sum+[.2126,.7152,.0722][i]*(n<=.04045?n/12.92:((n+.055)/1.055)**2.4),0);
  }
  for(const [foreground,background] of [[colors[0],colors[2]],[colors[1],colors[2]],[colors[3],colors[4]],[colors[6],colors[5]]]){
    const [a,b]=[luminance(foreground),luminance(background)].sort((a,b)=>a-b);
    assert.ok((b+.05)/(a+.05)>=4.5);
  }
});
