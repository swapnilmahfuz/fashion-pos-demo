const {test,assert,fs,session,go}=require('./browser.cjs');
async function openProduct(page,name='Client Polo'){
  await go(page,'products');await page.locator('[data-action="product-form"]').click();
  await page.locator('#p-name').fill(name);
}
async function save(page,action='Save Product'){
  await page.getByRole('button',{name:action,exact:true}).click();
}
async function close(page){
  await page.keyboard.press('Escape');
  if(await page.locator('#discard-changes').count())await page.locator('#discard-changes').click();
}
async function audit(page){return page.evaluate(()=>({stock:products.map(p=>[p.id,p.b1,p.b2,p.cost]),moves:JSON.stringify(stockMovements),purchases:JSON.stringify(state.purchases),ledger:JSON.stringify(ledger)}));}
async function bulk(page,ids,action){
  for(const id of ids)await page.locator('[data-select-variant="'+id+'"]').check();
  await page.locator('[data-catalog="bulk"]').click();await page.locator('#bulk-action').selectOption(action);
}
async function applyBulk(page){
  await page.getByRole('button',{name:'Validate & Preview',exact:true}).click();
  await page.locator('#bulk-apply').click();
}
async function csv(page,records){return page.evaluate(records=>[catalogCsvHeaders,...records.map(record=>catalogCsvHeaders.map(key=>record[key]??''))].map(row=>row.map(csvCell).join(',')).join('\r\n'),records);}
function importRow(overrides={}){return {product_key:'linen',name:'Linen Summer Shirt',category_code:'POL',size:'L',color:'Black',buying_price:'700',selling_price:'1590',branch:'Combined',...overrides};}

test('single catalog save, defaults, inline taxonomy, photos and save-and-add-another',async t=>{
  const page=await session(t);const before=await audit(page);
  await openProduct(page);
  assert.equal(await page.locator('#p-vat').inputValue(),'included');
  assert.equal(await page.locator('[data-variant-field="sku"]').count(),1);
  assert.equal(await page.locator('#p-stock').count(),0);
  await page.locator('#inline-taxonomy-toggle').click();
  await page.locator('#new-category-name').fill('Linen');await page.locator('#new-category-code').fill('LIN');await page.locator('#inline-category-save').click();
  await page.locator('#new-subcategory-name').fill('Summer');await page.locator('#inline-subcategory-save').click();
  await page.locator('#suggest-skus').click();
  assert.match(await page.locator('[data-variant-field="sku"]').inputValue(),/^LIN-0010-BLK-L$/);
  await page.locator('#p-description').fill('Breathable linen');await page.locator('#p-pattern').fill('Solid');await page.locator('#p-design').fill('Relaxed');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=','base64');
  await page.locator('#p-photos').setInputFiles([{name:'front.png',mimeType:'image/png',buffer:png},{name:'back.png',mimeType:'image/png',buffer:png}]);
  await save(page,'Save & Add Another');
  await page.waitForFunction(()=>products.at(-1).name==='Client Polo' && document.querySelector('#p-name')?.value==='');assert.equal(await page.locator('#p-name').inputValue(),'');
  const p=await page.evaluate(()=>products.at(-1));
  assert.equal(p.photos.length,2);assert.equal(p.description,'Breathable linen');assert.equal(p.pattern,'Solid');assert.equal(p.design,'Relaxed');assert.ok(p.subcategoryId);
  assert.equal(p.b1+p.b2,0);assert.equal(p.vat,'included');assert.equal(p.buyingPrice,680);
  assert.deepEqual((await audit(page)).stock.slice(0,22),before.stock);
  for(const key of ['moves','purchases','ledger'])assert.equal((await audit(page))[key],before[key]);
  await close(page);
});

test('multi-variant prices, manual/automatic SKU validation and receiving preparation never post stock',async t=>{
  const page=await session(t);const before=await audit(page);
  await openProduct(page,'Multi Polo');
  await page.locator('#p-sizes').fill('M, L');await page.locator('#p-colors').fill('Black, Navy');await page.locator('#generate-variants').click();
  assert.equal(await page.locator('[data-variant-field="sku"]').count(),4);
  const sku=await page.evaluate(()=>products[0].sku);
  await page.locator('[data-variant-field="sku"]').first().fill(sku.toLowerCase());await save(page);
  assert.match(await page.locator('#form-error').innerText(),/unique across the company/);
  assert.equal(await page.evaluate(()=>products.length),22);
  await page.locator('#suggest-skus').click();
  const inputs=page.locator('[data-variant-field="sku"]');await inputs.nth(1).fill(await inputs.nth(0).inputValue());await save(page);
  assert.match(await page.locator('#form-error').innerText(),/unique/);await page.locator('#suggest-skus').click();
  await inputs.first().fill('CLIENT-MANUAL-001');
  await page.locator('[data-variant-field="price"]').first().fill('1890.50');
  await page.locator('[data-variant-field="buyingPrice"]').first().fill('810.25');
  await save(page,'Save & Receive Stock');
  await page.locator('#receive-form').waitFor();
  const variants=await page.evaluate(()=>products.filter(p=>p.name==='Multi Polo'));
  assert.equal(new Set(variants.map(p=>p.sku)).size,4);assert.equal(new Set(variants.map(p=>p.barcode)).size,4);
  assert.equal(variants[0].price,1890.5);assert.equal(variants[0].buyingPrice,810.25);assert.equal(variants[0].sku,'CLIENT-MANUAL-001');
  await page.getByRole('button',{name:'Save draft'}).click();assert.match(await page.locator('#receive-error').innerText(),/Choose/);
  await page.locator('#receive-branch').selectOption('2');await page.locator('[data-receive-quantity]').first().fill('7');
  await page.getByRole('button',{name:'Save draft'}).click();
  assert.ok(variants.every(p=>p.b1===0&&p.b2===0));
  const draft=await page.evaluate(()=>invoices[0]);assert.equal(draft.branch,2);assert.equal(draft.lines.length,4);assert.equal(draft.lines[0].qty,7);
  const after=await audit(page);for(const key of ['moves','purchases','ledger'])assert.equal(after[key],before[key]);
  assert.deepEqual(after.stock.slice(0,22),before.stock);
});

test('variant editing preserves stable identity, aliases, carrying value and historical report snapshots',async t=>{
  const page=await session(t);await go(page,'products');const before=await audit(page);
  const old=await page.evaluate(()=>({...products[0]}));
  await page.locator('[data-edit-product="'+old.groupId+'"]').first().click();
  await page.locator('#p-name').fill('Renamed heritage Polo');await page.locator('#p-category').selectOption('2');
  await page.locator('[data-variant-field="sku"]').first().fill('RENAMED-POL-001');
  await page.locator('[data-variant-field="buyingPrice"]').first().fill('999');
  await page.locator('[data-variant-field="price"]').first().fill('1999');await save(page);
  const edited=await page.evaluate(id=>products.find(p=>p.id===id),old.id);
  assert.equal(edited.barcode,old.barcode);assert.equal(edited.groupId,old.groupId);assert.equal(edited.cost,old.cost);assert.equal(edited.buyingPrice,999);
  assert.ok(edited.skuAliases.includes(old.sku));assert.deepEqual(await audit(page),before);
  await page.locator('#table-search').fill(old.sku);await page.locator('#table-search').press('Enter');assert.match(await page.locator('#content').innerText(),/Exact variant/);
  await openProduct(page,'Duplicate previous identity');await page.locator('[data-variant-field="sku"]').fill(old.sku);await save(page);
  assert.match(await page.locator('#form-error').innerText(),/previous SKU identities/);await close(page);
  const report=await page.evaluate(id=>({html:itemTable(rowsFor(state.month)),lines:ledger.flatMap(s=>s.lines).filter(l=>l.productId===id)}),old.id);
  assert.ok(report.lines.every(l=>l.productName===old.name&&l.categoryId===old.categoryId));assert.ok(!report.html.includes('Renamed heritage Polo'));
});

test('bulk validation preview, category integrity, price updates and history-safe deletion',async t=>{
  const page=await session(t);await go(page,'products');const before=await audit(page);
  const ids=await page.evaluate(()=>products.filter(p=>p.groupId===products[0].groupId).map(p=>p.id));
  await bulk(page,[ids[0]],'category');await page.locator('#bulk-category').selectOption('2');
  await page.getByRole('button',{name:'Validate & Preview',exact:true}).click();assert.match(await page.locator('#bulk-error').innerText(),/every variant/);await close(page);
  await page.evaluate(()=>catalogSelection.clear());await go(page,'products');
  await bulk(page,ids,'category');await page.locator('#bulk-category').selectOption('2');await applyBulk(page);
  assert.ok(await page.evaluate(ids=>ids.every(id=>products.find(p=>p.id===id).categoryId===2),ids));
  await bulk(page,ids,'price');await page.locator('#bulk-buying').fill('750');await page.locator('#bulk-selling').fill('-1');
  await page.getByRole('button',{name:'Validate & Preview',exact:true}).click();assert.match(await page.locator('#bulk-error').innerText(),/valid/);
  await page.locator('#bulk-selling').fill('1690');await page.getByRole('button',{name:'Validate & Preview',exact:true}).click();
  assert.equal(await page.locator('#bulk-apply').isEnabled(),true);assert.match(await page.locator('#bulk-preview').innerText(),/1,690/);
  await page.locator('#bulk-selling').fill('1790');assert.equal(await page.locator('#bulk-apply').isDisabled(),true);await applyBulk(page);
  assert.ok(await page.evaluate(ids=>ids.every(id=>{const p=products.find(p=>p.id===id);return p.price===1790&&p.buyingPrice===750;}),ids));
  assert.deepEqual(await audit(page),before);
  await page.locator('[data-product-delete="'+ids[0]+'"]').click();await page.locator('#confirm-delete').click();assert.match(await page.locator('#delete-error').innerText(),/stock or history/);await close(page);
  await openProduct(page,'Unused catalog');await save(page);const unused=await page.evaluate(()=>({...products.at(-1)}));
  await page.locator('[data-product-delete="'+unused.id+'"]').click();await page.locator('#confirm-delete').click();
  assert.equal(await page.locator('[data-product-delete="'+unused.id+'"]').count(),0);
  assert.equal(await page.evaluate(id=>products.find(p=>p.id===id).deleted,unused.id),true);
  await openProduct(page,'Reserved SKU');await page.locator('[data-variant-field="sku"]').fill(unused.sku);await save(page);assert.match(await page.locator('#form-error').innerText(),/unique/);await close(page);
});

test('branch availability, Manager creation and edits isolate stock and availability scope',async t=>{
  const page=await session(t);const before=await audit(page);
  await page.locator('#role').selectOption('manager');await openProduct(page,'Manager branch Polo');
  assert.equal(await page.locator('[data-form-availability]').count(),1);assert.equal(await page.locator('[data-form-availability="2"]').count(),0);
  await save(page);const created=await page.evaluate(()=>({...products.at(-1)}));assert.deepEqual(created.availability,{'1':true,'2':false});assert.equal(created.b1+created.b2,0);
  await bulk(page,[created.id],'availability');assert.equal(await page.locator('#bulk-action option').count(),1);assert.equal(await page.locator('#bulk-branch').inputValue(),'1');assert.equal(await page.locator('#bulk-branch').isDisabled(),true);
  await page.locator('#bulk-available').uncheck();await applyBulk(page);
  assert.deepEqual(await page.evaluate(id=>products.find(p=>p.id===id).availability,created.id),{'1':false,'2':false});
  await page.locator('[data-edit-product="'+created.groupId+'"]').click();await page.locator('[data-form-availability="1"]').check();await save(page);
  await page.locator('[data-edit-product="1"]').first().click();await page.locator('#p-sizes').fill('XXL');await page.locator('#p-colors').fill('Cocoa');await page.locator('#generate-variants').click();await save(page);
  assert.deepEqual(await page.evaluate(()=>products.at(-1).availability),{'1':true,'2':false});
  await page.locator('#role').selectOption('owner');await page.locator('#branch').selectOption('2');
  await go(page,'inventory');assert.equal(await page.locator('[data-detail="'+created.id+'"]').count(),0);
  await go(page,'products');await bulk(page,[created.id],'availability');await applyBulk(page);
  assert.deepEqual(await page.evaluate(id=>products.find(p=>p.id===id).availability,created.id),{'1':true,'2':true});
  await page.locator('#branch').selectOption('1');await go(page,'products');await bulk(page,[1],'availability');await page.locator('#bulk-available').uncheck();
  await page.getByRole('button',{name:'Validate & Preview',exact:true}).click();assert.match(await page.locator('#bulk-error').innerText(),/holds stock/);await close(page);
  assert.deepEqual((await audit(page)).stock.slice(0,22),before.stock);
});

test('CSV preview validates all rows atomically, imports multiple variants and enforces Manager scope',async t=>{
  const page=await session(t);await go(page,'products');const before=await audit(page);
  const valid=await csv(page,[importRow({description:'Linen, breathable\n"Summer"'}),importRow({size:'M',color:'Navy',description:'Linen, breathable\n"Summer"'})]);
  await page.locator('[data-catalog="import"]').click();await page.locator('#import-text').fill(valid);await page.locator('#import-preview').click();
  assert.equal(await page.evaluate(()=>products.length),22);assert.equal(await page.locator('#import-confirm').isEnabled(),true);assert.match(await page.locator('#import-preview-table').innerText(),/Ready/);
  await page.locator('#import-confirm').click();const variants=await page.evaluate(()=>products.filter(p=>p.name==='Linen Summer Shirt'));
  assert.equal(variants.length,2);assert.equal(variants[0].description,'Linen, breathable\n"Summer"');assert.equal(variants[0].groupId,variants[1].groupId);assert.ok(variants.every(p=>p.b1+p.b2===0));
  assert.equal(new Set(variants.map(p=>p.barcode)).size,2);
  const invalid=await csv(page,[importRow({sku:variants[0].sku}),importRow({product_key:'other',barcode:variants[0].barcode,category_code:'UNKNOWN',selling_price:'-1'})]);
  await page.locator('[data-catalog="import"]').click();await page.locator('#import-text').fill(invalid);await page.locator('#import-preview').click();
  assert.equal(await page.locator('#import-confirm').isDisabled(),true);assert.match(await page.locator('#import-preview-table').innerText(),/duplicate company-wide SKU/);assert.match(await page.locator('#import-preview-table').innerText(),/Barcode must be unique/);assert.equal(await page.evaluate(()=>products.length),24);
  await page.locator('#import-text').fill('name,stock\nInjected,10');await page.locator('#import-preview').click();assert.match(await page.locator('#import-error').innerText(),/opening stock importer/);await close(page);
  await page.locator('#role').selectOption('manager');await page.locator('[data-catalog="import"]').click();await page.locator('#import-text').fill(await csv(page,[importRow({branch:'Dakbangla'})]));await page.locator('#import-preview').click();assert.match(await page.locator('#import-preview-table').innerText(),/assigned scope/);
  await page.locator('#import-text').fill(await csv(page,[importRow({branch:'New Market'})]));await page.locator('#import-preview').click();assert.equal(await page.locator('#import-confirm').isEnabled(),true);await page.locator('#import-confirm').click();
  assert.deepEqual(await page.evaluate(()=>products.at(-1).availability),{'1':true,'2':false});
  for(const key of ['moves','purchases','ledger'])assert.equal((await audit(page))[key],before[key]);
});

test('CSV parser catches malformed rows and duplicates, scoped exports preserve branch values',async t=>{
  const page=await session(t);await go(page,'products');
  const results=await page.evaluate(()=>{
    const inputs=['name,name\na,b','product_key,name,category_code,size,color,buying_price,selling_price\na,b,POL,L,Black,3','"unclosed'];
    return inputs.map(text=>{try{previewCatalogImport(text);return '';}catch(e){return e.message;}});
  });assert.ok(results.every(Boolean));
  const duplicate=await csv(page,[importRow(),importRow()]);assert.ok(await page.evaluate(text=>previewCatalogImport(text).some(row=>row.errors.some(e=>e.includes('Duplicate size/color'))),duplicate));
  for(const branch of ['all','1','2']){
    await page.locator('#branch').selectOption(branch);await go(page,'inventory');
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-catalog="export"]').click()]);
    const text=fs.readFileSync(await download.path(),'utf8');assert.match(text,/Buying value at branch carrying cost/);assert.ok(text.includes(await page.locator('[data-scope]').innerText()));
    const total=await page.evaluate(()=>catalogRows().reduce((s,p)=>s+stock(p),0));assert.equal(total,branch==='all'?334:branch==='1'?201:133);
  }
  await page.locator('#role').selectOption('manager');const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-catalog="export"]').click()]);
  const text=fs.readFileSync(await download.path(),'utf8');assert.ok(!text.includes('Buying value at branch carrying cost'));assert.ok(!text.includes('Dakbangla'));
});

test('individual/reprint and bulk barcode labels retain identity and respect quantities/dimensions',async t=>{
  const page=await session(t);await go(page,'inventory');const original=await page.evaluate(()=>products.slice(0,2).map(p=>({id:p.id,barcode:p.barcode,sku:p.sku})));
  await page.locator('[data-label="1"]').first().click();assert.equal(await page.locator('#label-preview svg text').textContent(),original[0].barcode);await close(page);
  await page.locator('[data-label="1"]').last().click();assert.equal(await page.locator('#label-preview svg text').textContent(),original[0].barcode);await close(page);
  await page.locator('[data-select-variant="1"]').check();await page.locator('[data-select-variant="2"]').check();await page.locator('[data-catalog="print"]').click();
  await page.locator('#label-count').fill('2');await page.locator('#label-width').fill('70');await page.locator('#label-height').fill('45');await page.locator('#label-price').uncheck();
  assert.equal(await page.locator('#label-preview .barcode-label').count(),2);assert.equal(await page.locator('#label-preview .barcode-label').first().evaluate(e=>e.style.width),'70mm');
  assert.ok(!(await page.locator('#label-preview').innerText()).includes('৳'));
  await page.evaluate(()=>window.print=()=>{});await page.locator('#print-labels').click();assert.equal(await page.locator('#print-root .barcode-label').count(),4);
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('#app').isVisible(),false);assert.equal(await page.locator('#print-root').isVisible(),true);await page.emulateMedia({media:'screen'});await page.evaluate(()=>dispatchEvent(new Event('afterprint')));
  await page.locator('#label-count').fill('101');assert.match(await page.locator('#label-error').innerText(),/1–100/);await close(page);
  assert.deepEqual(await page.evaluate(()=>products.slice(0,2).map(p=>({id:p.id,barcode:p.barcode,sku:p.sku}))),original);
});

test('product status and availability integrate with POS scans without losing historic stock',async t=>{
  const page=await session(t);await page.locator('#branch').selectOption('1');await go(page,'products');const before=await audit(page);
  await page.locator('[data-product-status="1"]').click();await go(page,'pos');await page.locator('#pos-search').fill('100001001');await page.locator('#pos-search').press('Enter');
  assert.equal(await page.locator('.cart-line').count(),0);assert.match(await page.locator('#toast').innerText(),/inactive|unavailable/);
  await go(page,'products');await page.locator('[data-product-status="1"]').click();await go(page,'pos');
  await page.locator('#pos-search').fill('100001001');await page.locator('#pos-search').press('Enter');assert.equal(await page.locator('.cart-line').count(),1);
  await go(page,'products');await page.locator('[data-product-status="1"]').click();assert.match(await page.locator('#toast').innerText(),/clear the cart/);
  assert.deepEqual(await audit(page),before);
});

for(const [width,height] of [[1440,1000],[1024,768],[390,844],[360,800]]){
  test('Phase 2 catalog tabs, form and barcode preview fit '+width+'px',async t=>{
    const page=await session(t,{width,height});
    for(const route of ['products','inventory','lowstock','deadstock','defective','categories']){
      await go(page,route);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route);
      if(['deadstock','defective'].includes(route))assert.match(await page.locator('#content').innerText(),/Last sale|Quarantine/i);
    }
    await openProduct(page);assert.ok(await page.locator('#p-name').isVisible());await page.locator('[data-variant-field="sku"]').fill('MOBILE-DRAFT');await page.keyboard.press('Escape');assert.equal(await page.locator('[role=alertdialog]').count(),1);await page.locator('#keep-editing').click();assert.equal(await page.locator('[data-variant-field="sku"]').inputValue(),'MOBILE-DRAFT');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await close(page);
    await go(page,'inventory');await page.locator('[data-label="1"]').first().click();assert.ok(await page.locator('#label-preview svg').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await close(page);
  });
}

test('category/subcategory management and adding variants preserve shared identity and mixed branch availability',async t=>{
  const page=await session(t);await openProduct(page,'Mixed availability style');
  await page.locator('#p-sizes').fill('M, L');await page.locator('#generate-variants').click();await save(page);
  const variants=await page.evaluate(()=>products.filter(p=>p.name==='Mixed availability style'));
  await bulk(page,[variants[0].id],'availability');await page.locator('#bulk-branch').selectOption('2');await page.locator('#bulk-available').uncheck();await applyBulk(page);
  await page.locator('[data-edit-product="'+variants[0].groupId+'"]').first().click();assert.equal(await page.locator('[data-form-availability="2"]').evaluate(el=>el.indeterminate),true);
  await page.locator('#p-description').fill('Preserve individual branch flags');await page.locator('#p-sizes').fill('XL');await page.locator('#p-colors').fill('Cocoa');await page.locator('#generate-variants').click();await save(page);
  const edited=await page.evaluate(ids=>ids.map(id=>products.find(p=>p.id===id)),variants.map(p=>p.id));
  assert.equal(edited[0].availability['2'],false);assert.equal(edited[1].availability['2'],true);assert.equal(edited[0].barcode,variants[0].barcode);
  const added=await page.evaluate(()=>products.at(-1));assert.equal(added.size,'XL');assert.equal(added.color,'Cocoa');assert.equal(added.b1+added.b2,0);
  await go(page,'categories');await page.locator('[data-taxonomy="subcategory"]').click();await page.locator('#taxonomy-name').fill('Premium essentials');await page.getByRole('button',{name:'Save subcategory',exact:true}).click();
  const subcategory=await page.evaluate(()=>subcategories.at(-1));await page.locator('[data-edit-subcategory="'+subcategory.id+'"]').click();await page.locator('#taxonomy-name').fill('Essential collection');await page.getByRole('button',{name:'Save subcategory',exact:true}).click();await page.locator('[data-archive-subcategory="'+subcategory.id+'"]').click();assert.equal(await page.evaluate(()=>subcategories.at(-1).archived),true);
  const original=await page.evaluate(()=>({code:categories[0].code,sku:products[0].sku,line:ledger[0].lines[0].categoryLabel}));await page.locator('[data-edit-category="1"]').click();await page.locator('#taxonomy-name').fill('Premium Polo');assert.equal(await page.locator('#taxonomy-code').getAttribute('readonly'),'');await page.getByRole('button',{name:'Save category',exact:true}).click();
  await page.locator('[data-archive-category="1"]').click();await page.locator('[data-move-category="1:1"]').click();
  assert.deepEqual(await page.evaluate(()=>({code:categories.find(c=>c.id===1).code,sku:products[0].sku,line:ledger[0].lines[0].categoryLabel})),original);
  await openProduct(page,'Active category defaults');assert.notEqual(await page.locator('#p-category').inputValue(),'1');await close(page);
});

test('keyboard HID scans, out-of-stock catalog variants and receiving validation remain safe',async t=>{
  const page=await session(t);await page.locator('#branch').selectOption('1');await openProduct(page,'Zero stock scan');await save(page);const variant=await page.evaluate(()=>products.at(-1));
  await go(page,'pos');await page.locator('#pos-search').fill(variant.barcode);await page.locator('#pos-search').press('Enter');assert.match(await page.locator('#toast').innerText(),/Out of stock/);assert.equal(await page.locator('.cart-line').count(),0);
  await page.locator('h1').click();await page.keyboard.type('100001001',{delay:10});await page.keyboard.press('Enter');await page.locator('h1').click();await page.keyboard.type('100001001',{delay:10});await page.keyboard.press('Enter');assert.equal(await page.locator('.qty span').innerText(),'2');
  await page.locator('#customer').fill('100001001');await page.locator('#customer').press('Enter');assert.equal(await page.locator('.qty span').innerText(),'2');await page.keyboard.press('F2');assert.equal(await page.locator('#pos-search').evaluate(el=>el===document.activeElement),true);
  await go(page,'purchases');await page.locator('[data-action="purchase"]').click();await page.locator('#receive-variant').selectOption(String(variant.id));await page.locator('[data-receive-quantity]').fill('-2');await page.getByRole('button',{name:'Save draft'}).click();assert.match(await page.locator('#receive-error').innerText(),/whole quantities/);
  await page.locator('[data-receive-quantity]').fill('5');await page.getByRole('button',{name:'Save draft'}).click();assert.match(await page.locator('#content').innerText(),/PO-1/);assert.equal(await page.evaluate(id=>products.find(p=>p.id===id).b1,variant.id),0);
});

test('new-variant SKU suggestions follow category/attributes, resolve abbreviations and preserve manual/historical entries',async t=>{
  const page=await session(t);await openProduct(page,'Automatic suggestions');
  await page.locator('#p-category').selectOption('2');assert.match(await page.locator('[data-variant-field="sku"]').inputValue(),/^HSH-/);
  await page.locator('[data-variant-field="color"]').fill('Cocoa');await page.locator('[data-variant-field="size"]').fill('XL');assert.match(await page.locator('[data-variant-field="sku"]').inputValue(),/-COCOA-XL$/);
  await page.locator('[data-variant-field="sku"]').fill('MANUAL-KEEP-001');await page.locator('#p-category').selectOption('3');await page.locator('[data-variant-field="color"]').fill('Sand');assert.equal(await page.locator('[data-variant-field="sku"]').inputValue(),'MANUAL-KEEP-001');
  await page.locator('#p-sizes').fill('M');await page.locator('#p-colors').fill('Deep Brown, Deep Bronze');await page.locator('#generate-variants').click();
  const suggested=await page.locator('[data-variant-field="sku"]').evaluateAll(elements=>elements.map(element=>element.value));assert.equal(new Set(suggested).size,3);assert.ok(suggested.some(sku=>sku.endsWith('-2')));await save(page);
  const product=await page.evaluate(()=>products.find(p=>p.name==='Automatic suggestions'));await page.locator('[data-edit-product="'+product.groupId+'"]').first().click();await page.locator('#p-category').selectOption('4');assert.equal(await page.locator('[data-variant-field="sku"]').first().inputValue(),'MANUAL-KEEP-001');await close(page);
  const text=await csv(page,[importRow({color:'Deep Brown'}),importRow({color:'Deep Bronze'})]);
  const imported=await page.evaluate(text=>previewCatalogImport(text),text);assert.ok(imported.every(row=>row.errors.length===0));assert.equal(new Set(imported.map(row=>row.product.sku)).size,2);
});
