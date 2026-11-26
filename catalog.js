// Phase 2 catalog. Stock posting and supplier accounting are reserved for Phase 3.
const subcategories = [];
const catalogSelection = new Set();
const catalogViews = ['products','inventory','lowstock','adjustments','deadstock','defective'];
let catalogScope = '';
Object.assign(state,{catalogCategory:'',receivingDrafts:[]});
products.forEach(product=>{
  Object.assign(product,{
    buyingPrice:product.cost,active:true,deleted:false,
    availability:{'1':true,'2':true},photos:product.image?[product.image]:[],
    subcategoryId:null,pattern:'',design:''
  });
});
function snapshotProduct(product) {
  return {
    productName:product.name,categoryId:product.categoryId,categoryLabel:categoryName(product.categoryId),
    color:product.color,size:product.size,groupId:product.groupId,vat:product.vat
  };
}
ledger.forEach(sale=>sale.lines.forEach(line=>{
  const product=products.find(item=>item.id===line.productId);
  Object.assign(line,snapshotProduct(product));
}));
function availableAt(product, branch=curBranch()) {
  return branch==='all' ? APP_CONFIG.branches.some(item=>product.availability[item.id]) : Boolean(product.availability[String(branch)]);
}
function sellableVariant(product) {
  return product&&!product.deleted&&product.active&&availableAt(product);
}
function catalogProducts() { return products.filter(product=>!product.deleted); }
function scopedQuantity(product) { return stock(product); }
function subcategoryName(id) { return subcategories.find(item=>item.id===id)?.name||''; }
function nextGroupId() { return Math.max(0,...products.map(product=>product.groupId))+1; }
function nextVariantId() { return Math.max(0,...products.map(product=>product.id))+1; }
function barcodeAllocator(extra=[]) {
  const used=new Set([...products.map(product=>product.barcode),...extra]);
  let number=products.reduce((max,product)=>BigInt(product.barcode)>max?BigInt(product.barcode):max,100001000n);
  return ()=>{
    do{number++;}while(used.has(String(number)));
    const value=String(number);used.add(value);return value;
  };
}
function uniqueCatalogSku(base,reserved=new Set(),excludeId) {
  let value=base,sequence=2;
  while(skuInUse(value,excludeId)||reserved.has(value))value=base+'-'+sequence++;
  return value;
}
function categoryOptions(selected) {
  return categories.filter(item=>!item.archived||item.id===Number(selected)).map(item=>
    '<option value="'+item.id+'" '+(item.id===Number(selected)?'selected':'')+'>'+slug(item.name)+(item.archived?' (archived)':'')+'</option>').join('');
}
function scopedBranches() {
  return curBranch()==='all'?APP_CONFIG.branches:APP_CONFIG.branches.filter(branch=>branch.id===curBranch());
}
function variantReferenced(product) {
  return stockOps.transfers.some(t=>t.lines.some(l=>l.id===product.id))||invoices.some(invoice=>invoice.lines.some(line=>line.productId===product.id))||ledger.some(sale=>sale.lines.some(line=>line.productId===product.id))||
    stockMovements.some(movement=>movement.productId===product.id&&movement.qty!==0)||
    state.transfers.some(transfer=>transfer.productId===product.id||transfer.style===product.style)||
    state.cart.some(line=>line.id===product.id);
}
function availabilityError(product,branch,enabled) {
  if(enabled||product.availability[branch]===enabled)return '';
  if(retail.defects.some(d=>d.productId===product.id&&d.branch===Number(branch)&&defectState(d).qty))return 'Resolve the branch quarantine balance first.';
  if(product['b'+branch]>0)return branchLabel(branch)+' holds stock. Availability can be removed after its stock is resolved.';
  if(stockOps.transfers.some(t=>[t.from,t.to].includes(Number(branch))&&t.lines.some(l=>l.id===product.id&&outstanding(t,l)>0))||state.transfers.some(transfer=>transfer.productId===product.id&&transfer.status==='In transit'&&(String(transfer.from)===branch||String(transfer.to)===branch)))
    return 'Resolve the in-transit transfer before removing availability.';
  if(curBranch()===branch&&state.cart.some(line=>line.id===product.id))return 'Finish or clear the current cart before removing availability.';
  return '';
}
function csvCell(value) {
  let text=String(value??'');
  if(typeof value==='string'&&/^[=+@-]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
function downloadCatalogCsv(name,rows) {
  const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=APP_CONFIG.brand.toLowerCase()+'-'+name+'.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function catalogRows(includeUnavailable=false) {
  const term=state.search.trim().toLowerCase();
  return catalogProducts().filter(product=>{
    const match=[product.name,product.sku,product.barcode,product.style,product.color,product.size,categoryName(product.categoryId),...(product.skuAliases||[])].join(' ').toLowerCase().includes(term);
    if(!match||state.catalogCategory&&String(product.categoryId)!==state.catalogCategory)return false;
    if(includeUnavailable||state.page==='products')return true;
    if(!availableAt(product))return false;
    if(state.page==='lowstock')return product.active&&scopedBranches().some(branch=>product.availability[branch.id]&&product['b'+branch.id]<=APP_CONFIG.lowStockThreshold);
    return true;
  });
}
function variantButtons(product) {
  return '<div class="actions catalog-row-actions"><button class="btn small" data-detail="'+product.id+'">Details</button><button class="btn small" data-edit-product="'+product.groupId+'">Edit</button>'+
    '<button class="btn small" data-label="'+product.id+'">Print Barcode</button><button class="btn small" data-label="'+product.id+'">Reprint Barcode</button>'+
    (state.role==='owner'?'<button class="btn small" data-product-status="'+product.id+'">'+(product.active?'Deactivate':'Activate')+'</button><button class="btn small" data-product-delete="'+product.id+'">Delete safely</button>':'')+'</div>';
}
function matrix(product) {
  const variants=catalogProducts().filter(item=>item.groupId===product.groupId);
  const sizes=[...new Set(variants.map(item=>item.size))],colors=[...new Set(variants.map(item=>item.color))];
  return table(['Color / size',...sizes],colors.map(color=>[slug(color),...sizes.map(size=>{
    const variant=variants.find(item=>item.color===color&&item.size===size);
    return variant?scopedQuantity(variant):'—';
  })]));
}
function catalogPage() {
  if(catalogScope!==state.role+'|'+curBranch()){
    catalogSelection.clear();catalogScope=state.role+'|'+curBranch();
  }
  const headings={products:'All Products',inventory:'Stock Report',lowstock:'Low Stock',deadstock:'Dead Stock',defective:'Defective Stock'};
  const actions='<div class="actions"><button class="btn primary" data-action="product-form">＋ Add Product</button><button class="btn" data-go="categories">Categories</button></div>';
  const rows=catalogRows();
  const quantity=rows.reduce((sum,product)=>sum+scopedQuantity(product),0);
  const buying=rows.reduce((sum,product)=>sum+stockValue(product),0);
  const selling=rows.reduce((sum,product)=>sum+scopedQuantity(product)*product.price,0);
  const exact=rows.find(product=>matchesVariant(product,state.search.trim()));
  return title(headings[state.page],state.page==='lowstock'?'Available variants at or below '+APP_CONFIG.lowStockThreshold+' units in a scoped branch.':'Company catalog with independent branch stock and availability.',actions)+
    '<div class="toolbar"><input id="table-search" class="search" aria-label="Product name, SKU or barcode" placeholder="Search name, SKU or barcode" value="'+slug(state.search)+'">'+
    '<select id="catalog-category" class="field" aria-label="Filter category"><option value="">All categories</option>'+categories.map(item=>'<option value="'+item.id+'" '+(state.catalogCategory===String(item.id)?'selected':'')+'>'+slug(item.name)+'</option>').join('')+'</select>'+
    '<button class="btn" data-catalog="import">Import CSV</button><button class="btn" data-catalog="export">Export '+(state.page==='products'?'catalog':'stock')+'</button></div>'+
    '<div class="grid metrics">'+metric('VARIANTS',rows.length,'Matching filters')+metric('AVAILABLE UNITS',quantity,'Selected branch scope')+
    (state.role==='owner'?metric('SELLABLE BUYING VALUE',money(buying),'Sellable carrying cost')+metric('SELLING VALUE',money(selling),'Current marked prices'):'')+'</div>'+
    '<p class="note catalog-note">Catalog buying prices suggest future receipt costs. Buying stock value uses the branch carrying cost. Selling value uses marked prices with the stored VAT mode. Average cost updates when a receipt posts.</p>'+
    (exact?section('Exact variant', '<strong>'+slug(exact.name+' · '+exact.color+' / '+exact.size)+'</strong><p>'+slug(exact.sku)+' · '+exact.barcode+' · '+scopedQuantity(exact)+' units</p>'+matrix(exact)):'')+
    '<div class="toolbar bulk-toolbar"><span id="catalog-selection-count">'+catalogSelection.size+' selected</span><button class="btn" data-catalog="bulk" '+(!catalogSelection.size?'disabled':'')+'>Bulk actions</button><button class="btn" data-catalog="print" '+(!catalogSelection.size?'disabled':'')+'>Print selected barcodes</button><button class="btn" data-catalog="receive" '+(!catalogSelection.size?'disabled':'')+'>Receive stock</button></div>'+
    section('Product variants',table([
      '<input type="checkbox" id="catalog-select-all" aria-label="Select all matching variants">','Product / category','Size / color','SKU / barcode','Buying price','Selling price / VAT',
      ...(curBranch()==='all'?APP_CONFIG.branches.map(branch=>slug(branch.name)):[]),'Stock qty',
      ...(state.role==='owner'?['Buying value','Selling value']:[]),'Status / availability','Actions'
    ],rows.map(product=>[
      '<input type="checkbox" data-select-variant="'+product.id+'" aria-label="Select '+slug(product.sku)+'" '+(catalogSelection.has(product.id)?'checked':'')+'>',
      (product.image?'<img class="variant-image" src="'+slug(product.image)+'" alt="">':'')+'<strong>'+slug(product.name)+'</strong><small class="cell-note">'+slug(categoryName(product.categoryId)+(product.subcategoryId?' / '+subcategoryName(product.subcategoryId):''))+'</small>',
      slug(product.size+' / '+product.color),'<code>'+slug(product.sku)+'</code><small class="cell-note">'+product.barcode+'</small>',
      money(product.buyingPrice),money(product.price)+'<small class="cell-note">'+slug(product.vat)+'</small>',
      ...(curBranch()==='all'?APP_CONFIG.branches.map(branch=>product['b'+branch.id]):[]),scopedQuantity(product),
      ...(state.role==='owner'?[money(stockValue(product)),money(scopedQuantity(product)*product.price)]:[]),
      '<span class="tag '+(!product.active?'gray':'')+'">'+(product.active?'Active':'Inactive')+'</span><small class="cell-note">'+
        scopedBranches().map(branch=>slug(branch.name)+': '+(product.availability[branch.id]?'Available':'Unavailable')).join('<br>')+'</small>',
      variantButtons(product)
    ])))+noReal;
}
productsPage=catalogPage;
inventory=catalogPage;

function productForm(groupId) {
  const existing=catalogProducts().filter(product=>product.groupId===Number(groupId));
  const first=existing[0];
  const group=first?.groupId||nextGroupId();
  const draft=existing.map(product=>({...product}));
  const availabilityChanges=new Map();
  const allocateBarcode=barcodeAllocator();
  const photos=[...(first?.photos||[])];
  const input=(id)=>document.getElementById(id).value.trim();
  const currentCategory=first?.categoryId||categories.find(item=>!item.archived)?.id;
  const rowsHtml=()=>table(['Color','Size','SKU','Barcode','Buying price','Selling price','Active','Draft action'],draft.map((variant,index)=>[
    '<input class="input" data-variant-field="color" data-index="'+index+'" aria-label="Color variant '+(index+1)+'" value="'+slug(variant.color)+'">',
    '<input class="input" data-variant-field="size" data-index="'+index+'" aria-label="Size variant '+(index+1)+'" value="'+slug(variant.size)+'">',
    '<input class="input sku-input" data-variant-field="sku" data-index="'+index+'" aria-label="SKU variant '+(index+1)+'" value="'+slug(variant.sku)+'">',
    '<code>'+variant.barcode+'</code>',
    '<input class="input price-input" type="number" step=".01" data-variant-field="buyingPrice" data-index="'+index+'" aria-label="Buying price variant '+(index+1)+'" value="'+variant.buyingPrice+'">',
    '<input class="input price-input" type="number" step=".01" data-variant-field="price" data-index="'+index+'" aria-label="Selling price variant '+(index+1)+'" value="'+variant.price+'">',
    '<input type="checkbox" data-variant-field="active" data-index="'+index+'" aria-label="Active variant '+(index+1)+'" '+(variant.active?'checked':'')+' '+(state.role!=='owner'?'disabled':'')+'>',
    variant.id?'Existing identity retained':'<button type="button" class="btn small" data-remove-draft="'+index+'">Remove</button>'
  ]));
  openModal('<h2>'+(first?'Edit Product':'Add Product')+'</h2><p>Product definitions and SKUs are company-wide. Saving updates the catalog; choose Save &amp; Receive Stock to enter a supplier invoice.</p>'+
    '<form id="product-form" novalidate><div class="form-row">'+field('Product name *','p-name','text',first?.name||'')+
    '<div class="form-group"><label for="p-category">Category *</label><select id="p-category" class="field">'+categoryOptions(currentCategory)+'</select><button type="button" class="btn small" id="inline-taxonomy-toggle">＋ Category / subcategory</button></div>'+
    '<div class="form-group"><label for="p-subcategory">Subcategory</label><select id="p-subcategory" class="field"></select></div></div>'+
    '<div id="inline-taxonomy" hidden>'+field('New category name','new-category-name')+field('New category code','new-category-code')+
    '<button type="button" class="btn small" id="inline-category-save">Add category</button>'+field('New subcategory in selected category','new-subcategory-name')+
    '<button type="button" class="btn small" id="inline-subcategory-save">Add subcategory</button><p id="taxonomy-error" role="alert"></p></div>'+
    '<div class="form-group"><label for="p-description">Description</label><textarea id="p-description" class="input" rows="2">'+slug(first?.description||'')+'</textarea></div>'+
    '<div class="form-row">'+field('Pattern (optional)','p-pattern','text',first?.pattern||'')+field('Design (optional)','p-design','text',first?.design||'')+'</div>'+
    '<div class="form-row">'+field('Default buying price per unit','p-cost','number',first?.buyingPrice??680)+field('Default selling price per unit','p-price','number',first?.price??1490)+
    '<div class="form-group"><label for="p-vat">VAT mode</label><select id="p-vat" class="field"><option value="included">Inclusive</option><option value="excluded">Exclusive</option><option value="exempt">Exempt</option></select></div></div>'+
    '<div class="form-group"><label for="p-photos">Photos (up to 6 PNG, JPEG or WebP files, 2 MB each)</label><input id="p-photos" type="file" multiple accept="image/png,image/jpeg,image/webp"></div>'+
    '<div class="photo-grid">'+photos.map((photo,index)=>'<label><img src="'+slug(photo)+'" alt="Existing product photo '+(index+1)+'"><span><input type="checkbox" data-remove-photo="'+index+'"> Remove photo</span></label>').join('')+'</div>'+
    '<fieldset class="availability-fields"><legend>Branch availability</legend>'+scopedBranches().map(branch=>
      '<label><input type="checkbox" data-form-availability="'+branch.id+'" '+(!first||first.availability[branch.id]?'checked':'')+'> '+slug(branch.name)+'</label>').join('')+'</fieldset>'+
    '<div class="variant-builder"><div class="form-row">'+field('Sizes (comma separated)','p-sizes','text',first?'':'L')+field('Colors (comma separated)','p-colors','text',first?'':'Black')+'</div>'+
    '<div class="actions"><button class="btn" type="button" id="generate-variants">'+(first?'Add combinations':'Generate variants')+'</button><button class="btn" type="button" id="suggest-skus">Auto Generate SKUs</button><button class="btn" type="button" id="apply-prices">Apply default prices</button></div></div>'+
    '<p class="form-help">Each size/color combination has its own editable SKU and prices. Existing barcodes remain fixed. Default price changes apply when you choose Apply default prices.</p>'+
    '<div id="variant-draft"></div><p id="form-error" role="alert" aria-live="polite"></p>'+
    '<div class="modal-foot product-save-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn" type="submit" value="another">Save &amp; Add Another</button><button class="btn" type="submit" value="receive">Save &amp; Receive Stock</button><button class="btn primary" type="submit" value="save">Save Product</button></div></form>');
  const form=$('#product-form');form.closest('.modal').classList.add('product-entry-modal','advanced-product-modal');
  $('#p-vat').value=first?.vat||'included';
  const error=(message)=>{$('#form-error').textContent=message;};
  const readRows=()=>form.querySelectorAll('[data-variant-field]').forEach(element=>{
    const row=draft[Number(element.dataset.index)];
    row[element.dataset.variantField]=element.type==='checkbox'?element.checked:element.value;
  });
  const suggestVariant=(variant)=>{
    const category=categories.find(item=>item.id===Number(input('p-category')));
    if(!category)return;
    const reserved=new Set(draft.filter(item=>item!==variant).map(item=>(item.sku||'').trim().toUpperCase()));
    variant.sku=uniqueCatalogSku(variantSku(category.code,group,variant.color,variant.size),reserved,variant.id);
    variant.suggestedSku=variant.sku;
  };
  const showRows=()=>{
    $('#variant-draft').innerHTML=rowsHtml();
    form.querySelectorAll('[data-remove-draft]').forEach(button=>button.onclick=()=>{readRows();draft.splice(Number(button.dataset.removeDraft),1);showRows();});
    form.querySelectorAll('[data-variant-field]').forEach(element=>element.oninput=()=>{
      const variant=draft[Number(element.dataset.index)],field=element.dataset.variantField;
      variant[field]=element.type==='checkbox'?element.checked:element.value;
      if(!variant.id&&['color','size'].includes(field)&&variant.sku===variant.suggestedSku){
        suggestVariant(variant);
        form.querySelector('[data-variant-field=sku][data-index="'+element.dataset.index+'"]').value=variant.sku;
      }
    });
  };
  const subOptions=(selected)=>{
    $('#p-subcategory').innerHTML='<option value="">None</option>'+subcategories.filter(item=>item.categoryId===Number(input('p-category'))&&(!item.archived||item.id===selected)).map(item=>'<option value="'+item.id+'" '+(item.id===selected?'selected':'')+'>'+slug(item.name)+(item.archived?' (archived)':'')+'</option>').join('');
  };
  subOptions(first?.subcategoryId);
  form.querySelectorAll('[data-form-availability]').forEach(element=>{
    const branch=element.dataset.formAvailability;
    if(first){
      const enabled=existing.filter(product=>product.availability[branch]).length;
      element.checked=enabled===existing.length;
      element.indeterminate=enabled>0&&enabled<existing.length;
    }else availabilityChanges.set(branch,true);
    element.onchange=()=>{element.indeterminate=false;availabilityChanges.set(branch,element.checked);};
  });
  const refreshCategory=()=>{
    readRows();subOptions(null);
    draft.filter(variant=>!variant.id&&variant.sku===variant.suggestedSku).forEach(suggestVariant);
    showRows();
  };
  $('#p-category').onchange=refreshCategory;
  const generate=()=>{
    readRows();
    const category=categories.find(item=>item.id===Number(input('p-category')));
    const sizes=[...new Set(input('p-sizes').split(',').map(value=>value.trim().toUpperCase()).filter(Boolean))];
    const colors=[...new Set(input('p-colors').split(',').map(value=>value.trim()).filter(Boolean))];
    const additions=colors.flatMap(color=>sizes.map(size=>({color,size}))).filter(({color,size})=>!draft.some(variant=>variant.color.toLowerCase()===color.toLowerCase()&&variant.size.toLowerCase()===size.toLowerCase()));
    if(!category||!sizes.length||!colors.length||draft.length+additions.length>50){error('Choose a category, sizes and colors, with up to 50 total variants.');return;}
    for(const {color,size} of additions){
      if(draft.some(variant=>variant.color.toLowerCase()===color.toLowerCase()&&variant.size.toLowerCase()===size.toLowerCase()))continue;
      const variant={id:null,color,size,barcode:allocateBarcode(),buyingPrice:input('p-cost'),price:input('p-price'),active:true};
      suggestVariant(variant);draft.push(variant);
    }
    showRows();error('');
  };
  $('#generate-variants').onclick=generate;
  $('#suggest-skus').onclick=()=>{
    readRows();const category=categories.find(item=>item.id===Number(input('p-category')));
    if(!category)return error('Choose a category first.');
    draft.forEach(suggestVariant);
    showRows();
  };
  $('#apply-prices').onclick=()=>{
    readRows();draft.forEach(variant=>{variant.buyingPrice=input('p-cost');variant.price=input('p-price');});showRows();
  };
  $('#inline-taxonomy-toggle').onclick=()=>{$('#inline-taxonomy').hidden=!$('#inline-taxonomy').hidden;};
  $('#new-category-name').oninput=()=>{$('#new-category-code').value=skuPart(input('new-category-name')).slice(0,3);};
  $('#inline-category-save').onclick=()=>{
    const name=input('new-category-name'),code=skuPart(input('new-category-code'));
    if(!name||!code||code.length>6||categories.some(item=>item.name.toLowerCase()===name.toLowerCase()||item.code===code)){
      $('#taxonomy-error').textContent='Use a unique category name and code of 1–6 letters or digits.';return;
    }
    const category={id:Math.max(...categories.map(item=>item.id))+1,name,code,archived:false};
    categories.push(category);$('#p-category').innerHTML=categoryOptions(category.id);refreshCategory();$('#taxonomy-error').textContent='Category added.';
  };
  $('#inline-subcategory-save').onclick=()=>{
    const name=input('new-subcategory-name'),categoryId=Number(input('p-category'));
    if(!categories.some(item=>item.id===categoryId&&!item.archived)||!name||subcategories.some(item=>item.categoryId===categoryId&&item.name.toLowerCase()===name.toLowerCase())){
      $('#taxonomy-error').textContent='Use a unique subcategory name within this category.';return;
    }
    const item={id:Math.max(0,...subcategories.map(item=>item.id))+1,categoryId,name,archived:false};
    subcategories.push(item);subOptions(item.id);$('#taxonomy-error').textContent='Subcategory added.';
  };
  if(first)showRows();else generate();
  let saving=false;
  form.onsubmit=async event=>{
    event.preventDefault();if(saving)return;
    readRows();
    const name=input('p-name'),category=categories.find(item=>item.id===Number(input('p-category')));
    const subcategoryId=Number(input('p-subcategory'))||null;
    if(!name||!category||category.archived&&category.id!==first?.categoryId)return error('Enter a product name and choose an active category.');
    if(subcategoryId&&!subcategories.some(item=>item.id===subcategoryId&&item.categoryId===category.id&&(!item.archived||item.id===first?.subcategoryId)))return error('Choose a valid subcategory.');
    if(!draft.length||draft.length>50)return error('Generate 1–50 size/color variants.');
    const skus=new Set(),combinations=new Set();
    for(const variant of draft){
      variant.color=variant.color.trim();variant.size=variant.size.trim();variant.sku=variant.sku.trim().toUpperCase();
      const combination=variant.color.toLowerCase()+'|'+variant.size.toLowerCase();
      if(!variant.color||!variant.size||combinations.has(combination))return error('Each variant needs a distinct size/color combination.');
      if(!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(variant.sku)||skus.has(variant.sku)||skuInUse(variant.sku,variant.id))return error('Every SKU must be valid and unique across the company, including previous SKU identities.');
      if(String(variant.buyingPrice).trim()===''||!Number.isFinite(Number(variant.buyingPrice))||Number(variant.buyingPrice)<0||!Number.isFinite(Number(variant.price))||round(Number(variant.price))<=0)return error('Enter nonnegative buying prices and selling prices of at least 0.01.');
      const old=products.find(item=>item.id===variant.id);
      if(old&&state.cart.some(line=>line.id===old.id)&&(Number(variant.price)!==old.price||!variant.active))return error('Finish or clear the cart before changing a cart variant’s selling price or active status.');
      skus.add(variant.sku);combinations.add(combination);
    }
    const availability=Object.fromEntries(APP_CONFIG.branches.map(branch=>[branch.id,scopedBranches().some(item=>item.id===branch.id)&&(first?.availability[branch.id]??true)]));
    availabilityChanges.forEach((enabled,branch)=>availability[branch]=enabled);
    for(const variant of draft){
      const old=products.find(item=>item.id===variant.id);
      if(old)for(const branch of scopedBranches()){
        const message=availabilityError(old,branch.id,availabilityChanges.has(branch.id)?availabilityChanges.get(branch.id):old.availability[branch.id]);if(message)return error(message);
      }
    }
    const removed=[...form.querySelectorAll('[data-remove-photo]:checked')].map(element=>Number(element.dataset.removePhoto));
    const retained=photos.filter((photo,index)=>!removed.includes(index));
    const files=[...$('#p-photos').files];
    if(retained.length+files.length>6||files.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024))return error('Use up to 6 PNG, JPEG or WebP photos, each up to 2 MB.');
    const savedDraft=draft.map(variant=>({...variant}));
    const details={name,description:input('p-description'),categoryId:category.id,cat:category.name,subcategoryId,pattern:input('p-pattern'),design:input('p-design'),vat:input('p-vat')};
    const action=event.submitter?.value||'save';
    saving=true;form.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{
      const uploaded=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
      })));
      if(!form.isConnected)return;
      if(savedDraft.some(variant=>skuInUse(variant.sku,variant.id)))throw Error('A SKU changed while the images loaded. Review the catalog and retry.');
      const finalPhotos=[...retained,...uploaded];
      let nextId=nextVariantId();
      const updates=savedDraft.map(variant=>{
        const old=products.find(item=>item.id===variant.id);
        const buyingPrice=round(Number(variant.buyingPrice));
        const aliases=[...(old?.skuAliases||[])];
        if(old&&old.sku!==variant.sku&&!aliases.includes(old.sku))aliases.push(old.sku);
        return {...old,...details,id:old?.id||nextId++,groupId:group,style:old?.style||category.code+'-'+String(group).padStart(4,'0'),
          size:variant.size,color:variant.color,sku:variant.sku,skuAliases:aliases,barcode:old?.barcode||variant.barcode,
          buyingPrice,cost:old?.cost??buyingPrice,price:round(Number(variant.price)),
          active:state.role==='owner'?variant.active:(old?.active??true),deleted:false,
          availability:old?{...old.availability,...Object.fromEntries(availabilityChanges)}:{...availability},b1:old?.b1||0,b2:old?.b2||0,photos:finalPhotos,image:finalPhotos[0]||'',art:old?.art||'◇'};
      });
      for(const update of updates){
        const old=products.find(item=>item.id===update.id);
        if(old)Object.assign(old,update);else products.push(update);
      }
      state.search='';catalogSelection.clear();closeModal();render();notify('Catalog saved · '+updates.length+' variants · stock unchanged');
      if(action==='another')productForm();
      if(action==='receive')receiveForm(updates.map(item=>item.id));
    }catch(reason){
      saving=false;form.querySelectorAll('button').forEach(button=>button.disabled=false);error(reason.message||'The photos could not be read.');
    }
  };
}

function showDetail(id) {
  const product=products.find(item=>item.id===id&&!item.deleted);
  if(!product)return;
  openModal('<h2>'+slug(product.name)+'</h2><p>'+slug(product.sku+' · '+product.color+' / '+product.size)+'</p>'+
    '<div class="photo-grid">'+product.photos.map(photo=>'<img src="'+slug(photo)+'" alt="'+slug(product.name)+'">').join('')+'</div>'+
    '<p>'+slug(product.description||'')+'</p><p>'+slug(categoryName(product.categoryId)+(product.subcategoryId?' / '+subcategoryName(product.subcategoryId):''))+'</p>'+
    '<p>Pattern '+slug(product.pattern||'—')+' · Design '+slug(product.design||'—')+'</p>'+
    '<p>Buying price '+money(product.buyingPrice)+' · Selling price '+money(product.price)+' · VAT '+slug(product.vat)+'</p>'+
    '<p>Barcode '+product.barcode+' · Stock '+scopedQuantity(product)+'</p>'+matrix(product)+variantButtons(product)+
    '<div class="modal-foot"><button class="btn" data-close>Close</button></div>');
  bindCatalog();
  document.querySelectorAll('[data-label]').forEach(button=>button.onclick=()=>labels(Number(button.dataset.label)));
}
function labels(id,ids=[id],labelBranch=curBranch()) {
  const variants=ids.map(variantId=>products.find(item=>item.id===variantId&&!item.deleted)).filter(Boolean);
  if(!variants.length)return notify('Select available catalog variants to print.');
  openModal('<h2>'+APP_CONFIG.brand+' · Barcode labels</h2><p>Original Code 128 identities are preserved for reprints.</p>'+
    '<div class="label-variant-list">'+variants.map(product=>'<label><input type="checkbox" data-print-variant="'+product.id+'" checked> '+slug(product.name+' · '+product.size+' / '+product.color+' · '+product.sku)+'</label>').join('')+'</div>'+
    '<div class="form-row">'+field('Labels per variant','label-count','number',1)+field('Width (mm, 40–100)','label-width','number',58)+field('Minimum height (mm, 25–100)','label-height','number',40)+'</div>'+
    '<label><input type="checkbox" id="label-price" checked> Include selling price</label>'+
    '<p class="form-help">Preview follows these dimensions. Print at 100% scale and validate the physical label with your scanner.</p><p id="label-error" role="alert"></p><div id="label-preview" class="label-preview-grid"></div>'+
    '<div class="modal-foot"><button class="btn" data-close>Close</button><button class="btn primary" id="print-labels">Print labels</button></div>');
  const build=(print=false)=>{
    const count=Number($('#label-count').value),width=Number($('#label-width').value),height=Number($('#label-height').value);
    const selected=[...document.querySelectorAll('[data-print-variant]:checked')].map(element=>products.find(product=>product.id===Number(element.dataset.printVariant)));
    if(!selected.length||!Number.isInteger(count)||count<1||count*selected.length>100||!Number.isFinite(width)||width<40||width>100||!Number.isFinite(height)||height<25||height>100){
      $('#label-error').textContent='Choose variants, 1–100 total labels, width 40–100 mm and height 25–100 mm.';
      $('#label-preview').innerHTML='';return null;
    }
    $('#label-error').textContent='';
    const root=document.createElement('div');
    selected.forEach(product=>{
      for(let index=0;index<(print?count:1);index++){
        const label=document.createElement('div');label.className='barcode-label';label.style.width=width+'mm';label.style.minHeight=height+'mm';
        const brand=document.createElement('strong');brand.textContent=APP_CONFIG.brand;
        const name=document.createElement('div');name.textContent=product.name+' · '+product.size+' / '+product.color;
        const sku=document.createElement('div');sku.textContent=product.sku;
        const branch=document.createElement('div');branch.textContent=branchLabel(labelBranch);
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        label.append(brand,name,sku,branch,svg);
        if($('#label-price').checked){const price=document.createElement('div');price.textContent=money(product.price);label.append(price);}
        JsBarcode(svg,product.barcode,{format:'CODE128',width:2,height:40,margin:12,fontSize:16});
        root.append(label);
      }
    });
    return root;
  };
  const preview=()=>{const root=build();if(root)$('#label-preview').replaceChildren(...root.children);};
  document.querySelectorAll('[data-print-variant],#label-count,#label-width,#label-height,#label-price').forEach(element=>element.oninput=preview);
  $('#print-labels').onclick=()=>{
    const root=build(true);if(!root)return;
    $('#print-root')?.remove();root.id='print-root';document.body.append(root);document.body.classList.add('printing-labels');window.print();
  };
  preview();
}

function bulkForm() {
  const selected=[...catalogSelection].map(id=>products.find(item=>item.id===id&&!item.deleted)).filter(Boolean);
  if(!selected.length)return;
  openModal('<h2>Bulk product actions</h2><p>'+selected.length+' variants selected. Category and prices are company-wide. Availability changes apply to the selected branch.</p>'+
    '<form id="bulk-form" novalidate><div class="form-group"><label for="bulk-action">Action</label><select id="bulk-action" class="field">'+
    (state.role==='owner'?'<option value="category">Change category</option><option value="price">Change prices</option><option value="activate">Activate variants</option><option value="deactivate">Deactivate variants</option><option value="delete">Delete unused variants safely</option>':'')+
    '<option value="availability">Branch availability</option></select></div>'+
    '<div id="bulk-category-fields"><label for="bulk-category">Category</label><select id="bulk-category" class="field">'+categoryOptions()+'</select></div>'+
    '<div id="bulk-price-fields" hidden><p>Leave a field blank to keep its current value.</p>'+field('Buying price suggestion','bulk-buying','number','')+field('Selling price','bulk-selling','number','')+'</div>'+
    '<div id="bulk-branch-fields" hidden><label for="bulk-branch">Branch</label><select id="bulk-branch" class="field" '+(curBranch()!=='all'?'disabled':'')+'>'+branchOptions(curBranch()==='all'?APP_CONFIG.branches[0].id:curBranch())+'</select><label><input id="bulk-available" type="checkbox" checked> Available at branch</label></div>'+
    '<p id="bulk-error" role="alert"></p><div id="bulk-preview"></div><div class="modal-foot"><button class="btn" type="button" data-close>Cancel</button><button class="btn" type="submit" value="preview">Validate &amp; Preview</button><button class="btn primary" id="bulk-apply" type="submit" value="apply" disabled>Apply to selected variants</button></div></form>');
  const updateFields=()=>{
    $('#bulk-category-fields').hidden=$('#bulk-action').value!=='category';
    $('#bulk-price-fields').hidden=$('#bulk-action').value!=='price';
    $('#bulk-branch-fields').hidden=$('#bulk-action').value!=='availability';
  };
  $('#bulk-action').onchange=updateFields;updateFields();
  let validated=null;
  const invalidate=()=>{validated=null;$('#bulk-apply').disabled=true;$('#bulk-preview').innerHTML='';};
  $('#bulk-form').oninput=invalidate;$('#bulk-form').onchange=invalidate;
  $('#bulk-form').onsubmit=event=>{
    event.preventDefault();
    const action=$('#bulk-action').value;
    if(state.role!=='owner'&&action!=='availability')return;
    const buying=$('#bulk-buying').value,selling=$('#bulk-selling').value;
    const branch=curBranch()==='all'?$('#bulk-branch').value:curBranch(),enabled=$('#bulk-available').checked;
    const error=message=>$('#bulk-error').textContent=message;
    if(action==='delete'&&selected.some(product=>product.b1||product.b2||variantReferenced(product)))return error('Deletion requires zero stock and no transaction, transfer or cart history. Deactivate used variants instead.');
    if(['price','deactivate'].includes(action)&&selected.some(product=>state.cart.some(line=>line.id===product.id)))return error('Finish or clear the cart before changing these variants.');
    if(action==='price'&&(!buying&&!selling||buying&&(!Number.isFinite(Number(buying))||Number(buying)<0)||selling&&(!Number.isFinite(Number(selling))||round(Number(selling))<=0)))return error('Enter a valid buying or selling price.');
    if(action==='availability')for(const product of selected){const message=availabilityError(product,branch,enabled);if(message)return error(message);}
    const category=categories.find(item=>item.id===Number($('#bulk-category').value)&&!item.archived);
    if(action==='category'&&!category)return error('Choose an active category.');
    if(action==='category'&&selected.some(product=>catalogProducts().some(variant=>variant.groupId===product.groupId&&!catalogSelection.has(variant.id))))return error('Select every variant of each product before changing its shared category.');
    const fingerprint=JSON.stringify({action,buying,selling,branch,enabled,categoryId:category?.id,selected});
    if(event.submitter?.value==='preview'){
      validated=fingerprint;$('#bulk-error').textContent='Review these catalog changes. Stock quantities will stay unchanged.';
      $('#bulk-preview').innerHTML=table(['SKU','Proposed change'],selected.map(product=>[
        slug(product.sku),slug(action==='category'?'Category → '+category.name:action==='price'?
          'Buying '+money(product.buyingPrice)+' → '+money(buying?Number(buying):product.buyingPrice)+' · Selling '+money(product.price)+' → '+money(selling?Number(selling):product.price):
          action==='availability'?branchLabel(branch)+' → '+(enabled?'Available':'Unavailable'):action==='delete'?'Remove unused variant; preserve identity':action==='activate'?'Active':'Inactive')
      ]));$('#bulk-apply').disabled=false;return;
    }
    if(validated!==fingerprint)return error('Validate and preview the current selection before applying.');
    selected.forEach(product=>{
      if(action==='category'){product.categoryId=category.id;product.cat=category.name;product.subcategoryId=null;}
      if(action==='price'){if(buying)product.buyingPrice=round(Number(buying));if(selling)product.price=round(Number(selling));}
      if(action==='availability')product.availability[branch]=enabled;
      if(action==='activate'||action==='deactivate')product.active=action==='activate';
      if(action==='delete'){product.deleted=true;product.active=false;product.availability={'1':false,'2':false};}
    });
    closeModal();catalogSelection.clear();render();notify('Bulk catalog update applied. Stock quantities unchanged.');
  };
}
function productStatus(id) {
  if(state.role!=='owner')return;
  const product=products.find(item=>item.id===id&&!item.deleted);
  if(state.cart.some(line=>line.id===id))return notify('Finish or clear the cart before changing status.');
  product.active=!product.active;render();notify(product.active?'Variant activated':'Variant deactivated');
}
function deleteProduct(id) {
  if(state.role!=='owner')return;
  const product=products.find(item=>item.id===id&&!item.deleted);
  openModal('<h2>Delete unused variant?</h2><p>'+slug(product.sku)+'</p><p>Only variants with zero branch stock and no historical references can be removed from the active catalog. Their identities remain reserved in the demo.</p><p id="delete-error" role="alert"></p><div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn" id="confirm-delete">Delete safely</button></div>');
  $('#confirm-delete').onclick=()=>{
    if(product.b1||product.b2||variantReferenced(product)){$('#delete-error').textContent='This variant has stock or history. Deactivate it instead.';return;}
    product.deleted=true;product.active=false;product.availability={'1':false,'2':false};catalogSelection.delete(product.id);
    closeModal();render();notify('Unused variant removed. Its identity is preserved.');
  };
}

function categoryPage() {
  const owner=state.role==='owner';
  return title('Categories & subcategories','Shared taxonomy with stable category codes and historical references.',
    '<div class="actions"><button class="btn" data-go="products">All Products</button>'+(owner?'<button class="btn primary" data-taxonomy="category">Add category</button><button class="btn" data-taxonomy="subcategory">Add subcategory</button>':'')+'</div>')+
    section('Categories',table(['Name','Code','Status','Actions'],categories.map((item,index)=>[
      slug(item.name),item.code,item.archived?'Archived':'Active',owner?'<div class="actions"><button class="btn small" data-edit-category="'+item.id+'">Edit</button><button class="btn small" data-archive-category="'+item.id+'">'+(item.archived?'Restore':'Archive')+'</button><button class="btn small" data-move-category="'+item.id+':-1" '+(!index?'disabled':'')+' aria-label="Move '+slug(item.name)+' up">↑</button><button class="btn small" data-move-category="'+item.id+':1" '+(index===categories.length-1?'disabled':'')+' aria-label="Move '+slug(item.name)+' down">↓</button></div>':'Owner manages taxonomy'
    ])))+section('Subcategories',table(['Category','Subcategory','Status','Actions'],subcategories.map(item=>[
      slug(categoryName(item.categoryId)),slug(item.name),item.archived?'Archived':'Active',owner?'<div class="actions"><button class="btn small" data-edit-subcategory="'+item.id+'">Edit</button><button class="btn small" data-archive-subcategory="'+item.id+'">'+(item.archived?'Restore':'Archive')+'</button></div>':'Owner manages taxonomy'
    ])))+noReal;
}
function taxonomyForm(type,id) {
  if(state.role!=='owner')return;
  const items=type==='category'?categories:subcategories,existing=items.find(item=>item.id===id);
  openModal('<h2>'+(existing?'Edit ':'Add ')+type+'</h2><form id="taxonomy-form" novalidate>'+field('Name','taxonomy-name','text',existing?.name||'')+
    (type==='category'?field('Stable category code','taxonomy-code','text',existing?.code||''):'<label for="taxonomy-parent">Category</label><select id="taxonomy-parent" class="field">'+categoryOptions(existing?.categoryId)+'</select>')+
    '<p id="taxonomy-error" role="alert"></p><div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save '+type+'</button></div></form>');
  if(type==='category'&&existing)$('#taxonomy-code').readOnly=true;
  $('#taxonomy-form').onsubmit=event=>{
    event.preventDefault();
    const name=$('#taxonomy-name').value.trim(),parent=type==='subcategory'?Number($('#taxonomy-parent').value):null;
    const code=type==='category'?skuPart($('#taxonomy-code').value):null;
    if(!name||items.some(item=>item.id!==id&&item.name.toLowerCase()===name.toLowerCase()&&(type==='category'||item.categoryId===parent))||type==='category'&&(!code||code.length>6||categories.some(item=>item.id!==id&&item.code===code))){
      $('#taxonomy-error').textContent='Use a unique name and, for categories, a unique code of 1–6 letters or digits.';return;
    }
    if(type==='subcategory'&&existing&&existing.categoryId!==parent&&products.some(product=>product.subcategoryId===existing.id)){
      $('#taxonomy-error').textContent='An assigned subcategory must remain with its original category.';return;
    }
    if(type==='subcategory'&&!categories.some(item=>item.id===parent&&!item.archived)){$('#taxonomy-error').textContent='Choose an active parent category.';return;}
    if(existing){existing.name=name;if(type==='subcategory')existing.categoryId=parent;}
    else items.push(type==='category'?{id:Math.max(...categories.map(item=>item.id))+1,name,code,archived:false}:{id:Math.max(0,...subcategories.map(item=>item.id))+1,name,categoryId:parent,archived:false});
    closeModal();render();notify('Taxonomy saved. Existing SKUs retained.');
  };
}

const catalogCsvHeaders=['product_key','name','category_code','subcategory','description','size','color','pattern','design','sku','barcode','buying_price','selling_price','vat_mode','branch','available','active'];
function parseCatalogCsv(text) {
  const rows=[];let row=[],value='',quoted=false,closed=false;
  const source=text.replace(/^\uFEFF/,'');
  for(let index=0;index<source.length;index++){
    const char=source[index];
    if(quoted){
      if(char==='"'&&source[index+1]==='"'){value+='"';index++;}
      else if(char==='"'){quoted=false;closed=true;}
      else value+=char;
      continue;
    }
    if(char==='"'&&!value&&!closed){quoted=true;continue;}
    if(closed&&![' ', '\t', ',', '\r', '\n'].includes(char))throw Error('Unexpected text after a quoted CSV field.');
    if(char===','){row.push(value);value='';closed=false;continue;}
    if(char==='\r'||char==='\n'){
      if(char==='\r'&&source[index+1]==='\n')index++;
      row.push(value);rows.push(row);row=[];value='';closed=false;continue;
    }
    if(closed)continue;
    if(char==='"')throw Error('Quote CSV fields that contain quotes.');
    value+=char;
  }
  if(quoted)throw Error('A quoted CSV field is not closed.');
  row.push(value);
  if(row.some(cell=>cell.trim()))rows.push(row);
  return rows.filter(row=>row.some(cell=>cell.trim()));
}
function previewCatalogImport(text) {
  const parsed=parseCatalogCsv(text);
  if(parsed.length<2)throw Error('Include a header row and at least one product row.');
  if(parsed.length>501)throw Error('Import up to 500 variants per file.');
  const headers=parsed[0].map(value=>value.trim().toLowerCase());
  if(new Set(headers).size!==headers.length)throw Error('Duplicate CSV column names.');
  if(headers.some(header=>!catalogCsvHeaders.includes(header)))throw Error('Use the catalog template columns. Stock quantities and stock movements belong in the opening stock importer.');
  for(const required of ['product_key','name','category_code','size','color','buying_price','selling_price'])if(!headers.includes(required))throw Error('Missing column '+required+'.');
  const records=parsed.slice(1).map((cells,index)=>{
    if(cells.length!==headers.length)throw Error('CSV row '+(index+2)+' has '+cells.length+' fields; expected '+headers.length+'.');
    return Object.fromEntries(headers.map((header,cell)=>[header,cells[cell].trim()]));
  });
  const explicitBarcodes=records.map(record=>record.barcode).filter(Boolean);
  const allocate=barcodeAllocator(explicitBarcodes),groups=new Map(),skus=new Set(),barcodes=new Set(products.map(product=>product.barcode));
  let group=nextGroupId(),id=nextVariantId();
  return records.map((record,index)=>{
    const errors=[],category=categories.find(item=>item.code===record.category_code.toUpperCase()&&!item.archived);
    const subgroup=record.subcategory?subcategories.find(item=>item.categoryId===category?.id&&item.name.toLowerCase()===record.subcategory.toLowerCase()&&!item.archived):null;
    if(!record.name||!record.product_key||!record.size||!record.color)errors.push('Name, product key, size and color are required.');
    if(!category)errors.push('Unknown or archived category code.');
    if(record.subcategory&&!subgroup)errors.push('Unknown or archived subcategory for this category.');
    const details=[record.name,category?.id,record.description||'',record.pattern||'',record.design||'',subgroup?.id||null];
    const key=record.product_key.toLowerCase();
    if(!groups.has(key))groups.set(key,{id:group++,details:JSON.stringify(details),combinations:new Set()});
    const productGroup=groups.get(key),combination=record.color.toLowerCase()+'|'+record.size.toLowerCase();
    if(productGroup.details!==JSON.stringify(details))errors.push('Rows sharing a product key must have matching product details.');
    if(productGroup.combinations.has(combination))errors.push('Duplicate size/color combination in this product.');
    productGroup.combinations.add(combination);
    const sku=record.sku?record.sku.toUpperCase():uniqueCatalogSku(variantSku(category?.code||'NEW',productGroup.id,record.color,record.size),new Set([...skus,...records.map(item=>(item.sku||'').toUpperCase()).filter(Boolean)]));
    if(!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku)||skuInUse(sku)||skus.has(sku))errors.push('Invalid or duplicate company-wide SKU.');
    skus.add(sku);
    const barcode=record.barcode||allocate();
    if(!/^\d{6,24}$/.test(barcode)||barcodes.has(barcode))errors.push('Barcode must be unique and contain 6–24 digits.');
    barcodes.add(barcode);
    const buying=Number(record.buying_price),selling=Number(record.selling_price);
    if(!record.buying_price||!Number.isFinite(buying)||buying<0||!record.selling_price||!Number.isFinite(selling)||round(selling)<=0)errors.push('Invalid buying or selling price.');
    const vat=({inclusive:'included',included:'included',exclusive:'excluded',excluded:'excluded',exempt:'exempt',none:'exempt','':'included'})[(record.vat_mode||'').toLowerCase()];
    if(!vat)errors.push('VAT mode must be included, excluded or exempt.');
    const branchInput=(record.branch||branchLabel(curBranch())).toLowerCase();
    const branch=APP_CONFIG.branches.find(item=>item.id===branchInput||item.name.toLowerCase()===branchInput)?.id||(['all','combined'].includes(branchInput)?'all':null);
    if(!branch||curBranch()!=='all'&&branch!==curBranch())errors.push('The import branch must match the selected assigned scope.');
    function booleanValue(value,fallback=true){
      if(!value)return fallback;
      if(['true','yes','1'].includes(value.toLowerCase()))return true;
      if(['false','no','0'].includes(value.toLowerCase()))return false;
      errors.push('Available and active must be true or false.');return false;
    }
    const available=booleanValue(record.available),active=booleanValue(record.active);
    const availability=Object.fromEntries(APP_CONFIG.branches.map(item=>[item.id,available&&(branch==='all'||item.id===branch)]));
    return {row:index+2,errors,product:{
      id:id++,groupId:productGroup.id,name:record.name,categoryId:category?.id,cat:category?.name,
      style:(category?.code||'NEW')+'-'+String(productGroup.id).padStart(4,'0'),subcategoryId:subgroup?.id||null,
      description:record.description||'',pattern:record.pattern||'',design:record.design||'',
      size:record.size,color:record.color,sku,skuAliases:[],barcode,buyingPrice:round(buying),cost:round(buying),price:round(selling),vat,
      availability,active,deleted:false,b1:0,b2:0,photos:[],image:'',art:'◇'
    }};
  });
}
function importCatalog() {
  openModal('<h2>Import product catalog</h2><p>New catalog variants only. Existing identities and all stock quantities are preserved. CSV supports quoted commas, quotes and multiline descriptions.</p>'+
    '<form id="import-form"><label for="import-file">CSV file (up to 2 MB, 500 variants)</label><input id="import-file" type="file" accept=".csv,text/csv">'+
    '<div class="form-group"><label for="import-text">CSV contents</label><textarea id="import-text" class="input" rows="6" placeholder="Paste a catalog CSV or choose a file"></textarea></div>'+
    '<div class="actions"><button class="btn" type="button" id="import-template">Download template</button><button class="btn" type="button" id="import-preview">Validate &amp; Preview</button></div>'+
    '<p id="import-error" role="alert"></p><div id="import-preview-table"></div>'+
    '<div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary" id="import-confirm" disabled>Import catalog only</button></div></form>');
  $('.modal').classList.add('advanced-product-modal');
  let staged=null,validatedText='';
  const invalidate=()=>{staged=null;$('#import-confirm').disabled=true;};
  $('#import-text').oninput=invalidate;
  $('#import-file').onchange=async event=>{
    invalidate();const file=event.target.files[0];if(!file)return;
    if(file.size>2*1024*1024){$('#import-error').textContent='Choose a CSV up to 2 MB.';return;}
    const form=$('#import-form'),text=await file.text();
    if(form.isConnected){$('#import-text').value=text;$('#import-error').textContent='';}
  };
  $('#import-template').onclick=()=>{
    const category=categories.find(item=>!item.archived);
    downloadCatalogCsv('product-template',[catalogCsvHeaders,[
      'new-style','Sample Polo',category.code,'','', 'L','Black','','','','',680,1490,'included',branchLabel(curBranch()),true,true
    ]]);
  };
  $('#import-preview').onclick=()=>{
    try{
      validatedText=$('#import-text').value;staged=previewCatalogImport(validatedText);
      const invalid=staged.filter(item=>item.errors.length).length;
      $('#import-error').textContent=invalid?invalid+' rows need correction. Nothing has been imported.':staged.length+' catalog variants are ready. Stock and purchases will stay unchanged.';
      $('#import-preview-table').innerHTML=table(['CSV row','Product','Variant','SKU','Barcode','Validation'],staged.map(item=>[
        item.row,slug(item.product.name),slug(item.product.size+' / '+item.product.color),slug(item.product.sku),item.product.barcode,slug(item.errors.join(' ')||'Ready')
      ]));
      $('#import-confirm').disabled=invalid>0;
    }catch(error){invalidate();$('#import-error').textContent=error.message;$('#import-preview-table').innerHTML='';}
  };
  $('#import-form').onsubmit=event=>{
    event.preventDefault();if(!staged||validatedText!==$('#import-text').value)return;
    try{
      const latest=previewCatalogImport(validatedText);
      if(latest.some(item=>item.errors.length)||JSON.stringify(latest)!==JSON.stringify(staged))throw Error('The catalog changed. Validate and preview again before importing.');
      products.push(...latest.map(item=>item.product));
      closeModal();catalogSelection.clear();state.search='';render();notify(latest.length+' catalog variants imported. Stock unchanged.');
    }catch(error){invalidate();$('#import-error').textContent=error.message;}
  };
}
function exportCatalog() {
  const rows=catalogRows();
  if(state.page==='products'){
    const exported=rows.map(product=>{
      const enabled=scopedBranches().filter(branch=>product.availability[branch.id]);
      const branch=curBranch()==='all'?(enabled.length===1?enabled[0].name:'Combined'):branchLabel(curBranch());
      return [
        product.style,product.name,categories.find(item=>item.id===product.categoryId)?.code,subcategoryName(product.subcategoryId),
        product.description,product.size,product.color,product.pattern,product.design,product.sku,product.barcode,product.buyingPrice,product.price,product.vat,
        branch,enabled.length>0,product.active
      ];
    });
    downloadCatalogCsv('catalog-'+branchLabel(curBranch()).toLowerCase().replaceAll(' ','-'),[catalogCsvHeaders,...exported]);
  }else{
    downloadCatalogCsv('stock-'+branchLabel(curBranch()).toLowerCase().replaceAll(' ','-'),[
      ['Brand','Branch','Category','Product','Size','Color','SKU','Barcode','Buying price','Selling price','VAT mode','Stock quantity',...(state.role==='owner'?['Buying value at branch carrying cost','Marked selling value']:[])],
      ...rows.map(product=>[APP_CONFIG.brand,branchLabel(curBranch()),categoryName(product.categoryId),product.name,product.size,product.color,product.sku,product.barcode,product.buyingPrice,product.price,product.vat,scopedQuantity(product),
        ...(state.role==='owner'?[round(stockValue(product)),round(scopedQuantity(product)*product.price)]:[])])
    ]);
  }
}
function bindCatalog() {
  if($('#catalog-category'))$('#catalog-category').onchange=event=>{state.catalogCategory=event.target.value;render();};
  const rows=catalogViews.includes(state.page)?catalogRows():[];
  const updateSelection=()=>{
    if($('#catalog-selection-count'))$('#catalog-selection-count').textContent=catalogSelection.size+' selected';
    document.querySelectorAll('[data-catalog="bulk"],[data-catalog="print"],[data-catalog="receive"]').forEach(button=>button.disabled=!catalogSelection.size);
  };
  document.querySelectorAll('[data-select-variant]').forEach(input=>input.onchange=()=>{
    const id=Number(input.dataset.selectVariant);if(input.checked)catalogSelection.add(id);else catalogSelection.delete(id);updateSelection();
  });
  if($('#catalog-select-all'))$('#catalog-select-all').onchange=event=>{
    rows.forEach(product=>event.target.checked?catalogSelection.add(product.id):catalogSelection.delete(product.id));
    document.querySelectorAll('[data-select-variant]').forEach(input=>input.checked=event.target.checked);updateSelection();
  };
  document.querySelectorAll('[data-catalog]').forEach(button=>button.onclick=()=>{
    const ids=[...catalogSelection];
    const actions={bulk:bulkForm,print:()=>labels(ids[0],ids),receive:()=>receiveForm(ids),import:importCatalog,export:exportCatalog};
    actions[button.dataset.catalog]?.();
  });
  document.querySelectorAll('[data-edit-product]').forEach(button=>button.onclick=()=>productForm(Number(button.dataset.editProduct)));
  document.querySelectorAll('[data-product-status]').forEach(button=>button.onclick=()=>productStatus(Number(button.dataset.productStatus)));
  document.querySelectorAll('[data-product-delete]').forEach(button=>button.onclick=()=>deleteProduct(Number(button.dataset.productDelete)));
  document.querySelectorAll('[data-detail]').forEach(button=>button.onclick=()=>showDetail(Number(button.dataset.detail)));
  document.querySelectorAll('[data-label]').forEach(button=>button.onclick=()=>labels(Number(button.dataset.label)));
  document.querySelectorAll('[data-taxonomy]').forEach(button=>button.onclick=()=>taxonomyForm(button.dataset.taxonomy));
  document.querySelectorAll('[data-edit-category]').forEach(button=>button.onclick=()=>taxonomyForm('category',Number(button.dataset.editCategory)));
  document.querySelectorAll('[data-edit-subcategory]').forEach(button=>button.onclick=()=>taxonomyForm('subcategory',Number(button.dataset.editSubcategory)));
  for(const type of ['category','subcategory']){
    document.querySelectorAll('[data-archive-'+type+']').forEach(button=>button.onclick=()=>{
      if(state.role!=='owner')return;
      const list=type==='category'?categories:subcategories,item=list.find(item=>item.id===Number(button.dataset[type==='category'?'archiveCategory':'archiveSubcategory']));
      item.archived=!item.archived;render();
    });
  }
  document.querySelectorAll('[data-move-category]').forEach(button=>button.onclick=()=>{
    if(state.role!=='owner')return;
    const [id,step]=button.dataset.moveCategory.split(':').map(Number),index=categories.findIndex(item=>item.id===id);
    if(index+step<0||index+step>=categories.length)return;
    [categories[index],categories[index+step]]=[categories[index+step],categories[index]];render();
  });
  if(catalogViews.includes(state.page)&&$('#table-search'))$('#table-search').onkeydown=event=>{
    if(event.key==='Enter'){
      event.preventDefault();state.search=event.target.value.trim();render();
      if(!catalogProducts().some(product=>matchesVariant(product,state.search)||product.style.toLowerCase()===state.search.toLowerCase()))notify('Unknown SKU or barcode');
      $('#table-search')?.focus();
    }
  };
}
const bindBeforeCatalog=bind;
bind=function(){bindBeforeCatalog();bindCatalog();};
