// V1.1 extends the original demo shell and operational screens.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: APP_CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const categories = ['Polo','Half Shirt','Check Shirt','Formal Shirt','T-Shirt','Jeans','Chinos','Panjabi','Jacket'].map((name, i) => ({ id: i + 1, name, archived: false }));
const categoryName = id => categories.find(c => c.id === id)?.name || 'Archived category';
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const assignedBranch = APP_CONFIG.managerBranch;
let ownerBranch = 'all';
try { ownerBranch = localStorage.getItem(APP_CONFIG.branchPreferenceKey) || localStorage.getItem('thread-owner-branch') || 'all'; } catch {}
if (!['all','1','2'].includes(ownerBranch)) ownerBranch = 'all';
Object.assign(state, { branch: ownerBranch, date: today, month: today.slice(0,7), labelVariant: 1 });
icons.monthly = '▦';
icons.categories = '≡';
products.forEach(p => {
  p.categoryId = ({Polos:1, Shirts:4, Trousers:7, 'T-Shirts':5, Panjabis:8, Jeans:6})[p.cat];
  p.vat = 'included';
  p.image = '';
  if (p.style === 'POLO-102') p.style = 'POLO-101';
  if (p.style === 'SHRT-203') p.style = 'SHRT-202';
});
const extraStyles = [
  ['Half Sleeve Linen','HALF-301',2,1690,760], ['Heritage Check','CHECK-401',3,1990,920],
  ['City Jacket','JACK-901',9,4490,2300]
];
extraStyles.forEach(([name,style,categoryId,price,cost]) => {
  products.push({ id:products.length+1, name,style,categoryId,cat:categoryName(categoryId),color:'Navy',size:'L',price,cost,vat:'included',image:'',barcode:String(100001001+products.length),b1:14,b2:9,art:'◇' });
});
[...products].forEach(p => {
  if (products.some(x => x.style === p.style && x.color === p.color && x.size === (['Jeans','Chinos'].includes(categoryName(p.categoryId))?'30':'S'))) return;
  products.push({ ...p, id:products.length+1, size:['Jeans','Chinos'].includes(categoryName(p.categoryId))?'30':'S', barcode:String(100001001+products.length), b1:6,b2:3 });
});
products[products.length-1].b1 = 0;
// Stable company-wide identifiers keep variant stock independent of editable SKUs.
const skuPart = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const colorCodes = {BLACK:'BLK',WHITE:'WHT',NAVY:'NVY',FOREST:'FOR',SAND:'SND',INDIGO:'IND',IVORY:'IVR',SLATE:'SLT','SKY BLUE':'SKY'};
function variantSku(categoryCode, number, color, size) {
  const colorCode=colorCodes[color.toUpperCase()]||skuPart(color).slice(0,6);
  return categoryCode+'-'+String(number).padStart(4,'0')+'-'+colorCode+'-'+skuPart(size);
}
function skuInUse(sku, excludeId) {
  const value=sku.toUpperCase();
  return products.some(p=>p.id!==excludeId&&(p.sku?.toUpperCase()===value||p.skuAliases?.some(alias=>alias.toUpperCase()===value)));
}
function matchesVariant(p, term) {
  return p.barcode===term||p.sku?.toLowerCase()===term.toLowerCase()||p.skuAliases?.some(s=>s.toLowerCase()===term.toLowerCase());
}
const categoryCodes=['POL','HSH','CHK','FRM','TSH','JNS','CHN','PAN','JKT'];
categories.forEach((category,index)=>category.code=categoryCodes[index]);
const productGroups=new Map();
products.forEach(p=>{
  if (!productGroups.has(p.style)) productGroups.set(p.style,productGroups.size+1);
  p.groupId=productGroups.get(p.style);
  p.sku=variantSku(categories.find(c=>c.id===p.categoryId).code,p.groupId,p.color,p.size);
  p.skuAliases=[];
  p.description='';
});

const customersData = [
  {id:1,name:'Demo Customer A',phone:'01XXXXXXXXX',branch:1,consent:true},
  {id:2,name:'Demo Customer B',phone:'01XXXXXXXXX',branch:2,consent:false},
  {id:3,name:'Demo Customer C',phone:'01XXXXXXXXX',branch:1,consent:true},
  {id:4,name:'Demo Customer D',phone:'01XXXXXXXXX',branch:2,consent:true}
];
const ledger = [];
const stockMovements = [];
const dateKey = d => d.toISOString().slice(0,10);
const methods = ['Cash','bKash','Card','Nagad','Bank transfer'];
// Amounts use illustrative net-of-VAT unit prices. VAT mode is catalog metadata.
function saleLine(product, qty, discountRate = 0, refund = false) {
  const gross = round(product.price * qty);
  const discount = round(gross * discountRate);
  const revenue = round(gross - discount);
  return { productId:product.id, sku:product.sku, barcode:product.barcode, qty, unitPrice:product.price, unitCost:product.cost,
    discount:refund ? 0 : discount, revenue:refund ? -revenue : revenue,
    profit:round((revenue - product.cost * qty) * (refund ? -1 : 1)), refund };
}
const anchor = new Date(today + 'T12:00:00Z');
for (let offset = 89; offset >= 0; offset--) {
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() - offset);
  for (const branch of [1,2]) {
    for (let slot = 0; slot < 4; slot++) {
      const p = products[(offset * 3 + branch + slot) % products.length];
      const customer = customersData.filter(c => c.branch === branch)[slot % 2];
      ledger.push({ id:'TH-' + String(ledger.length+1).padStart(5,'0'), date:dateKey(date),
        hour:10+slot*3, branch, customerId:customer.id, method:methods[(offset+slot+branch)%methods.length],
        lines:[saleLine(p,1+slot%2,slot===2 ? .1 : 0)] });
    }
    if (offset % 7 === 0) {
      const p = products[(offset * 3 + branch) % products.length];
      ledger.push({id:'RF-'+ledger.length,date:dateKey(date),hour:17,branch,customerId:branch,method:'Cash',lines:[saleLine(p,1,0,true)]});
    }
  }
}
// Opening balances plus all sample sales/refunds reconcile to the displayed on-hand units.
products.forEach(p => {
  for (const branch of [1,2]) {
    const sold = ledger.filter(s => s.branch===branch).flatMap(s => s.lines).filter(l => l.productId===p.id).reduce((sum,l) => sum + l.qty*(l.refund?-1:1),0);
    stockMovements.push({productId:p.id,branch,qty:p['b'+branch]+sold,type:'Opening balance'});
  }
});
state.expenses = [];
for (const month of [...new Set(ledger.map(s => s.date.slice(0,7)))]) {
  state.expenses.push(
    {date:month+'-01',title:'Store rent',cat:'Rent',branch:1,amount:48000},
    {date:month+'-01',title:'Store rent',cat:'Rent',branch:2,amount:42000},
    {date:month+'-03',title:branchLabel(1)+' campaign',cat:'Advertising',branch:1,amount:12000},
    {date:month+'-05',title:'Staff salaries',cat:'Payroll',branch:1,amount:22000},
    {date:month+'-05',title:'Staff salaries',cat:'Payroll',branch:2,amount:20000}
  );
}
function rowsFor(period, branch = curBranch()) {
  return ledger.filter(s => s.date.startsWith(period) && (branch==='all' || s.branch===Number(branch)));
}
function figures(rows) {
  const lines = rows.flatMap(s => s.lines);
  const sum = key => round(lines.reduce((n,l) => n+l[key],0));
  const invoices = rows.filter(s => s.lines.some(l => !l.refund)).length;
  const revenue = sum('revenue');
  return { revenue, profit:sum('profit'), discounts:sum('discount'), invoices,
    items:lines.filter(l => !l.refund).reduce((n,l) => n+l.qty,0),
    refunds:round(-lines.filter(l => l.refund).reduce((n,l) => n+l.revenue,0)),
    average:invoices ? round(revenue/invoices) : 0 };
}
function expenseAmount(period, branch=curBranch()) {
  return round(state.expenses.filter(e => e.date.startsWith(period) && (branch==='all'||e.branch===Number(branch)))
    .reduce((n,e) => n + e.amount,0));
}
function inventoryValue(branch=curBranch()) {
  return round(products.reduce((n,p) => n + p.cost*(branch==='all' ? p.b1+p.b2 : p['b'+branch]),0));
}
function table(headers, rows) {
  return '<div class="tablewrap"><table class="tbl"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
    (rows.length ? rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('') : '<tr><td colspan="'+headers.length+'">No sample records for this selection.</td></tr>')+'</tbody></table></div>';
}
function section(name, content) { return '<section class="card report-section"><div class="card-head"><h3>'+name+'</h3></div>'+content+'</section>'; }
function chart(name, points, dual=false) {
  const max = Math.max(1,...points.flatMap(p=>[Math.abs(p.revenue),Math.abs(p.profit||0)]));
  return section(name, '<div class="report-chart" role="img" aria-label="'+name+'">'+points.map(p=>
    '<div class="plot-column" title="'+slug(p.label)+' · Revenue '+money(p.revenue)+(dual?' · Profit '+money(p.profit):'')+'"><div class="plot-bars"><i style="height:'+Math.abs(p.revenue)/max*100+'%;background:'+(p.revenue<0?'var(--red)':'var(--accent)')+'"></i>'+
    (dual?'<i class="profit-bar" style="height:'+Math.abs(p.profit)/max*100+'%;background:'+(p.profit<0?'var(--red)':'var(--accent-deep)')+'"></i>':'')+'</div><small>'+slug(p.label)+'</small></div>').join('')+'</div><p class="chart-caption">Revenue '+(dual?'· Deep brown shows gross profit. ':'')+'· Muted rust shows negative values. Hover for amounts. Scroll horizontally for more dates.</p><details><summary>View chart data</summary>'+table(['Time','Revenue',...(dual?['Gross profit']:[])],points.map(p=>[slug(p.label),money(p.revenue),...(dual?[money(p.profit)]:[])]))+'</details>');
}
function exportButton() { return state.role==='owner' ? '<button class="btn" data-action="report">↓ Export sample CSV</button>' : ''; }
function periodControls(monthly) {
  return '<div class="toolbar"><label for="report-period">'+(monthly?'Month / year':'Date')+'</label><input class="input" id="report-period" type="'+(monthly?'month':'date')+'" value="'+(monthly?state.month:state.date)+'">'+exportButton()+'</div>';
}
function groupedLines(rows) {
  const grouped = new Map();
  rows.flatMap(s=>s.lines).forEach(l => {
    const item = grouped.get(l.productId)||{productId:l.productId,qty:0,revenue:0,profit:0};
    item.qty += l.qty*(l.refund?-1:1); item.revenue=round(item.revenue+l.revenue); item.profit=round(item.profit+l.profit);
    grouped.set(l.productId,item);
  });
  return [...grouped.values()].sort((a,b)=>b.qty-a.qty);
}
function itemTable(rows) {
  return table(['Category','Product','Variant','Net units','Net revenue',...(state.role==='owner'?['Gross profit']:[])],groupedLines(rows).map(l=>{
    const p=products.find(p=>p.id===l.productId);
    return [slug(categoryName(p.categoryId)),slug(p.name),slug(p.color+' / '+p.size),l.qty,money(l.revenue),...(state.role==='owner'?[money(l.profit)]:[])];
  }));
}
function categoryTable(rows) {
  return table(['Category','Net units','Net revenue',...(state.role==='owner'?['Gross profit']:[])],categories.map(c=>{
    const lines=rows.map(s=>({...s,lines:s.lines.filter(l=>products.find(p=>p.id===l.productId).categoryId===c.id)}));
    const f=figures(lines);
    const qty=lines.flatMap(s=>s.lines).reduce((n,l)=>n+l.qty*(l.refund?-1:1),0);
    return [slug(c.name),qty,money(f.revenue),...(state.role==='owner'?[money(f.profit)]:[])];
  }));
}
overview = function() {
  const rows=rowsFor(state.date), f=figures(rows);
  return title('Dashboard','Sample sales for the selected day and branch.')+periodControls(false)+
    '<div class="grid metrics">'+[
      ['SALES REVENUE',money(f.revenue)],['INVOICES',f.invoices],['ITEMS SOLD',f.items],...(state.role==='owner'?[['GROSS PROFIT',money(f.profit)]]:[]),
      ['DISCOUNTS',money(f.discounts)],['REFUNDS',money(f.refunds)],['AVERAGE INVOICE',money(f.average)]
    ].map(([name,value])=>metric(name,value,'Selected date')).join('')+'</div>'+
    chart('Hourly net sales',Array.from({length:24},(_,hour)=>({label:String(hour).padStart(2,'0'),revenue:figures(rows.filter(s=>s.hour===hour)).revenue})))+
    section('Item-wise sales',itemTable(rows))+section('Category performance',categoryTable(rows))+
    section('Payment methods',table(['Method','Net revenue'],methods.map(m=>[m,money(figures(rows.filter(s=>s.method===m)).revenue)])))+
    '<p class="note">Revenue includes refund reversals. Gross profit is shown in the Owner preview. Items sold count outbound units. Average invoice is net revenue divided by sales invoice count. All amounts are illustrative, net of VAT.</p>'+noReal;
};
function bestSellingTable(rows) {
  const groups = new Map();
  groupedLines(rows).forEach(line => {
    const product = products.find(p => p.id === line.productId);
    const item = groups.get(product.groupId) || { name: product.name, qty: 0, revenue: 0, profit: 0 };
    item.qty += line.qty;
    item.revenue = round(item.revenue + line.revenue);
    item.profit = round(item.profit + line.profit);
    groups.set(product.groupId, item);
  });
  return table(['Product','Net units','Revenue','Gross profit'], [...groups.values()]
    .sort((a,b) => b.qty-a.qty).map(p => [slug(p.name),p.qty,money(p.revenue),money(p.profit)]));
}
function monthlyOverview() {
  if(state.role!=='owner') return ownerOnlyPage();
  const rows=rowsFor(state.month),f=figures(rows),expenses=expenseAmount(state.month);
  const days=new Date(Number(state.month.slice(0,4)),Number(state.month.slice(5,7)),0).getDate();
  return title('Monthly overview','Sales, costs and branch performance from the same sample ledger.')+periodControls(true)+
    '<div class="grid metrics">'+[['REVENUE',f.revenue],['GROSS PROFIT',f.profit],['OPERATING PROFIT',f.profit-expenses],['EXPENSES',expenses],['CURRENT INVENTORY VALUE',inventoryValue()]]
    .map(([n,v])=>metric(n,money(v),'Selected scope')).join('')+'</div>'+
    chart('Daily revenue and gross profit',Array.from({length:days},(_,i)=>({label:String(i+1),...figures(rows.filter(s=>s.date===state.month+'-'+String(i+1).padStart(2,'0')))})),true)+
    section('Branch comparison',table(['Branch','Revenue','Gross profit','Expenses','Operating profit'],(curBranch()==='all'?[1,2]:[Number(curBranch())]).map(b=>{
      const v=figures(rowsFor(state.month,String(b))),e=expenseAmount(state.month,String(b));return [branchLabel(b),money(v.revenue),money(v.profit),money(e),money(v.profit-e)];
    })))+section('Best-selling products',bestSellingTable(rows))+section('Variant sales',itemTable(rows))+section('Category performance',categoryTable(rows))+
    '<p class="note">Every expense belongs to its recorded branch. Inventory value is current on-hand cost, independent of the selected reporting month.</p>'+noReal;
}
finance = monthlyOverview;
profitFigures = function() {
  const f=figures(rowsFor(state.month)),ops=expenseAmount(state.month);
  return {revenue:f.revenue,cogs:round(f.revenue-f.profit),ops,profit:round(f.profit-ops)};
};
expenses = function() {
  const rows=state.expenses.filter(e=>e.date.startsWith(state.month)&&scoped(e.branch));
  return title('Expense management','Each expense belongs to one branch.', '<button class="btn primary" data-action="expense">＋ Add sample expense</button>')+
    periodControls(true)+'<div class="grid metrics">'+metric('EXPENSES',money(expenseAmount(state.month)),'Selected month and scope')+'</div>'+
    section('Expense entries',table(['Date','Description','Category','Branch','Amount'],rows.map(e=>[
      e.date,slug(e.title),slug(e.cat),branchLabel(e.branch),money(e.amount)
    ])))+noReal;
};
customers = function() {
  const rows=rowsFor(state.month);
  return title('Customers & offers','Sample customer activity for the selected branch and month.','<button class="btn primary" data-action="offer">Create WhatsApp offer</button>')+
    periodControls(true)+section('Sample customers',table(['Customer','Mobile','Branch','Invoices','Net spending','Consent'],customersData.filter(c=>scoped(c.branch)).map(c=>{
      const f=figures(rows.filter(s=>s.customerId===c.id));return [slug(c.name),c.phone,branchLabel(c.branch),f.invoices,money(f.revenue),c.consent?'Yes':'No'];
    })))+noReal;
};
function requireBranch() {
  if(curBranch()==='all'){notify('Select '+APP_CONFIG.branches.map(branch=>branch.name).join(' or ')+' for this operation');return false;}return true;
}
const originalAddCart=addCart;
addCart = function(id) {
  if(!requireBranch())return;
  const p=products.find(p=>p.id===id);
  if(!p){notify('Unknown barcode');return;}
  if(!stock(p)){notify('Out of stock in this branch');return;}
  originalAddCart(id);
};
const originalPos=pos;
pos = function() {
  return originalPos().replace('Search product, size, SKU or barcode (e.g. 100001001)','Scan barcode + Enter, or search product / SKU')+
    '<p class="note">F2 focuses the scan field. Type 100001001 and press Enter to simulate a USB scanner. Repeated scans add units up to available branch stock. Other form fields accept normal typing.</p>';
};
function scanBarcode(value) {
  const p=products.find(p=>p.barcode===value.trim());
  if(!p){notify('Unknown barcode — '+value.trim());return;}
  state.search='';addCart(p.id);
  $('#pos-search')?.focus();
}
function categoryPage() {
  const owner=state.role==='owner';
  return title('Categories','One shared category catalog for both branches.',owner?'<button class="btn primary" data-v11="category-new">＋ Create category</button>':'')+
    section('Category order',table(['Category','Status','Actions'],categories.map((c,i)=>[
      slug(c.name),c.archived?'Archived':'Active',owner?
      '<div class="actions"><button class="btn small" data-category-edit="'+c.id+'">Rename</button><button class="btn small" data-category-archive="'+c.id+'">'+(c.archived?'Restore':'Archive')+'</button><button aria-label="Move '+slug(c.name)+' up" class="btn small" data-category-move="'+c.id+':-1" '+(i===0?'disabled':'')+'>↑</button><button aria-label="Move '+slug(c.name)+' down" class="btn small" data-category-move="'+c.id+':1" '+(i===categories.length-1?'disabled':'')+'>↓</button></div>':'Owner manages categories'
    ])))+'<p class="note">Archiving hides a category from new product forms. Existing variants and historical reports retain it.</p>'+noReal;
}
function field(label,id,type='text',value='') {
  return '<div class="form-group"><label for="'+id+'">'+label+'</label><input class="input" id="'+id+'" type="'+type+'" value="'+slug(value)+'"></div>';
}
function variantButtons(p) {
  return '<div class="actions"><button class="btn small" data-detail="'+p.id+'">Details</button><button class="btn small" data-label="'+p.id+'">Print Barcode</button><button class="btn small" data-label="'+p.id+'">Reprint Barcode</button></div>';
}
productsPage = function() {
  const list=products.filter(p=>[p.name,p.sku,p.style,...(p.skuAliases||[]),p.barcode,categoryName(p.categoryId),p.color,p.size].join(' ').toLowerCase().includes(state.search.toLowerCase()));
  return title('Products & barcodes','Shared styles and variants with immutable demo barcodes.','<button class="btn primary" data-action="product-form">＋ Add New Product</button>')+
    '<div class="toolbar"><input aria-label="Search products" class="search" id="table-search" placeholder="Search product / SKU / barcode" value="'+slug(state.search)+'"></div>'+
    section('Variant catalog',table(['Product','Category','SKU / Style','Size / Color','Price','Cost','VAT mode','Barcode','Actions'],list.map(p=>[
      (p.image?'<img class="variant-image" src="'+slug(p.image)+'" alt="">':'')+slug(p.name),slug(categoryName(p.categoryId)),slug(p.sku),slug(p.size+' / '+p.color),money(p.price),money(p.cost),slug(p.vat),p.barcode,variantButtons(p)
    ])))+noReal;
};
function matrix(p) {
  const variants=products.filter(x=>x.groupId===p.groupId);
  const sizes=[...new Set(variants.map(x=>x.size))], colors=[...new Set(variants.map(x=>x.color))];
  return table(['Color / size',...sizes],colors.map(color=>[slug(color),...sizes.map(size=>{
    const v=variants.find(x=>x.color===color&&x.size===size);return v?stock(v):'—';
  })]));
}
inventory = function() {
  const term=state.search.trim().toLowerCase();
  const list=products.filter(p=>[p.name,p.sku,p.style,...(p.skuAliases||[]),p.barcode,p.color,p.size].join(' ').toLowerCase().includes(term));
  const exact=products.find(p=>matchesVariant(p,state.search.trim()))||products.find(p=>p.style.toLowerCase()===term);
  const styles=[...new Set(list.map(p=>p.style))];
  return title('Inventory control','Scan or search to locate an exact variant and all size / color availability.','<div class="actions"><button class="btn primary" data-action="product-form">＋ Add New Product</button><button class="btn" data-v11="receive">＋ Receive sample stock</button></div>')+
    '<div class="grid metrics">'+metric('ON-HAND UNITS',products.reduce((n,p)=>n+stock(p),0),'Selected branch scope')+(state.role==='owner'?metric('INVENTORY VALUE',money(inventoryValue()),'Current cost'):'')+'</div>'+
    '<div class="toolbar"><input id="table-search" class="search" aria-label="Inventory barcode or SKU" placeholder="Scan barcode + Enter or search SKU" value="'+slug(state.search)+'"></div>'+
    (exact?section(matchesVariant(exact,state.search.trim())?'Exact match':'Style availability', '<b>'+slug(exact.name+' · '+exact.color+' / '+exact.size)+'</b><p>'+slug(exact.sku)+' · '+stock(exact)+' units in selected scope · '+exact.barcode+'</p>'+variantButtons(exact)+matrix(exact)):'')+
    section('Stock by variant',table(['Product','SKU','Color / Size','Barcode',...(curBranch()==='all'?APP_CONFIG.branches.map(branch=>branch.name):[]),'Available','Actions'],list.map(p=>[
      slug(p.name),slug(p.sku),slug(p.color+' / '+p.size),p.barcode,...(curBranch()==='all'?[p.b1,p.b2]:[]),stock(p),variantButtons(p)
    ])))+styles.map(style=>section(slug(style)+' · size / color matrix',matrix(products.find(p=>p.style===style)))).join('')+noReal;
};
function productForm() {
  const formBranch = state.role === 'manager' ? assignedBranch : (curBranch() === 'all' ? '' : curBranch());
  const productNumber = Math.max(...products.map(p => p.groupId)) + 1;
  const manualSkus = new Map();
  const quantities = new Map();
  let draft = [];

  openModal('<h2>Add New Product</h2><p>Create shared variants and receive initial stock into one branch. Sample changes reset on refresh.</p>'+
    '<form id="product-form" novalidate>'+
    '<div class="form-row">'+field('Product name','p-name')+
    '<div class="form-group"><label for="p-category">Category</label><div class="category-picker"><select id="p-category" class="field"></select><button type="button" class="btn small" id="add-category-inline">＋ New category</button></div></div></div>'+
    '<div id="inline-category" hidden><div class="form-row">'+field('New category name','new-category-name')+field('Category code','new-category-code')+
    '</div><button type="button" class="btn small" id="save-inline-category">Add category</button><p id="category-error" role="alert"></p></div>'+
    '<div class="form-group"><label for="p-description">Description (optional)</label><textarea id="p-description" class="input" rows="2"></textarea></div>'+
    '<div class="form-row">'+field('Sizes (comma separated)','p-sizes','text','S, M, L')+field('Colors (comma separated)','p-colors','text','Black, Navy')+'</div>'+
    '<div class="form-row">'+field('Buying cost (BDT)','p-cost','number',680)+field('Selling price (BDT)','p-price','number',1490)+
    '<div class="form-group"><label for="p-vat">VAT mode</label><select class="field" id="p-vat"><option value="included">Inclusive</option><option value="excluded">Exclusive</option><option value="exempt">Exempt</option></select></div></div>'+
    '<div class="form-row"><div class="form-group"><label for="p-branch">Initial stock branch</label><select class="field" id="p-branch" '+(state.role==='manager'||curBranch()!=='all'?'disabled':'')+'>'+
    '<option value="">Choose a branch</option>'+branchOptions(formBranch)+'</select></div>'+
    field('Initial units per variant','p-stock','number',0)+
    '<div class="form-group"><label for="p-sku-mode">SKU entry</label><select id="p-sku-mode" class="field"><option value="auto">Auto Generate</option><option value="manual">Manual SKU</option></select></div></div>'+
    '<div class="form-group"><label for="p-image">Product image (PNG, JPEG or WebP, up to 2 MB)</label><input id="p-image" type="file" accept="image/png,image/jpeg,image/webp"><img id="image-preview" class="variant-image" alt="Product image preview" hidden></div>'+
    '<h3>Variant SKUs and initial stock</h3><p class="form-help">A separate barcode is generated for every color and size. Edit stock per variant below.</p><div id="variant-draft"></div>'+
    '<p id="form-error" role="alert" aria-live="polite"></p>'+
    '<div class="modal-foot product-save-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn" type="submit" value="another">Save &amp; Add Another</button><button class="btn" type="submit" value="print">Save &amp; Print Barcode</button><button class="btn primary" type="submit" value="save">Save</button></div></form>');
  const form = $('#product-form');
  form.closest('.modal').classList.add('product-entry-modal');
  const value = id => form.querySelector('#'+id).value.trim();
  const splitValues = id => [...new Set(value(id).split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.toUpperCase()))];
  const showError = (message, id) => {
    $('#form-error').textContent = message;
    form.querySelectorAll('[aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));
    if (id) { const input=form.querySelector('#'+id);input?.setAttribute('aria-invalid','true');input?.focus(); }
    return false;
  };
  const fillCategories = selected => {
    $('#p-category').innerHTML = categories.filter(c=>!c.archived).map(c=>'<option value="'+c.id+'">'+slug(c.name)+'</option>').join('');
    if (selected) $('#p-category').value=String(selected);
  };
  const updateDraft = () => {
    form.querySelectorAll('[data-draft-sku]').forEach(input=>manualSkus.set(input.dataset.draftSku,input.value));
    form.querySelectorAll('[data-draft-stock]').forEach(input=>quantities.set(input.dataset.draftStock,input.value));
    const sizes=splitValues('p-sizes'),colors=splitValues('p-colors');
    const category=categories.find(c=>c.id===Number(value('p-category')));
    draft=[];
    if (sizes.length*colors.length>50) {
      $('#variant-draft').innerHTML='<p role="alert">Use up to 50 size/color combinations per product.</p>';
      return;
    }
    for (const color of colors) for (const size of sizes) {
      const key=color+'|'+size;
      const suggested=variantSku(category?.code||'NEW',productNumber,color,size);
      draft.push({key,color,size,sku:value('p-sku-mode')==='manual'?(manualSkus.get(key)||suggested):suggested});
    }
    const manual=value('p-sku-mode')==='manual';
    $('#variant-draft').innerHTML=table(['Color','Size','SKU','Initial units'],draft.map((v,i)=>[
      slug(v.color),slug(v.size),
      '<input id="draft-sku-'+i+'" class="input sku-input" aria-label="SKU '+slug(v.color+' '+v.size)+'" '+(manual?'':'readonly')+' data-draft-sku="'+slug(v.key)+'" value="'+slug(v.sku)+'">',
      '<input id="draft-stock-'+i+'" class="input stock-input" aria-label="Stock '+slug(v.color+' '+v.size)+'" type="number" min="0" step="1" data-draft-stock="'+slug(v.key)+'" value="'+slug(quantities.get(v.key)??value('p-stock'))+'">'
    ]));
  };
  fillCategories();
  $('#p-branch').value=formBranch;
  ['p-category','p-sizes','p-colors','p-sku-mode'].forEach(id=>$('#'+id).addEventListener('change',updateDraft));
  $('#p-stock').oninput=()=>{
    quantities.clear();
    form.querySelectorAll('[data-draft-stock]').forEach(input=>input.value=value('p-stock'));
    updateDraft();
  };
  $('#add-category-inline').onclick=()=>{ $('#inline-category').hidden=!$('#inline-category').hidden;$('#new-category-name').focus(); };
  $('#new-category-name').oninput=()=>{ $('#new-category-code').value=skuPart(value('new-category-name')).slice(0,3); };
  $('#save-inline-category').onclick=()=>{
    const name=value('new-category-name'),code=skuPart(value('new-category-code'));
    if (!name||!code||code.length>6||categories.some(c=>c.name.toLowerCase()===name.toLowerCase()||c.code===code)) {
      $('#category-error').textContent='Enter a unique category name and a unique code of 1–6 letters or digits.';
      return;
    }
    const category={id:Math.max(...categories.map(c=>c.id))+1,name,code,archived:false};
    categories.push(category);
    fillCategories(category.id);$('#inline-category').hidden=true;$('#category-error').textContent='';updateDraft();
  };
  $('#p-image').onchange=()=>{
    const file=$('#p-image').files[0];
    $('#image-preview').hidden=true;
    if (file&&['image/png','image/jpeg','image/webp'].includes(file.type)&&file.size<=2*1024*1024) {
      const reader=new FileReader();
      reader.onload=()=>{if(form.isConnected&&$('#p-image').files[0]===file){$('#image-preview').src=reader.result;$('#image-preview').hidden=false;}};
      reader.readAsDataURL(file);
    }
  };
  updateDraft();
  form.onsubmit=async event=>{
    event.preventDefault();
    // Synchronize suggestions after keyboard submission without a preceding blur.
    updateDraft();
    const name=value('p-name'),description=value('p-description');
    const category=categories.find(c=>c.id===Number(value('p-category'))&&!c.archived);
    const price=Number(value('p-price')),cost=Number(value('p-cost'));
    const branch=curBranch()==='all'?value('p-branch'):curBranch();
    const file=$('#p-image').files[0],vat=value('p-vat');
    if (!name) return showError('Enter a product name.','p-name');
    if (!category) return showError('Choose an active category.','p-category');
    if (!value('p-price')||!Number.isFinite(price)||round(price)<=0) return showError('Enter a selling price of at least 0.01.','p-price');
    if (!value('p-cost')||!Number.isFinite(cost)||cost<0) return showError('Enter a nonnegative buying cost.','p-cost');
    if (!['1','2'].includes(branch)) return showError('Choose a branch for the initial stock.','p-branch');
    if (!draft.length) return showError('Enter sizes and colors, up to 50 combinations.','p-sizes');
    if (file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)) return showError('Choose a PNG, JPEG or WebP up to 2 MB.','p-image');
    const skus=new Set();
    for (const [i,variant] of draft.entries()) {
      variant.sku=form.querySelector('#draft-sku-'+i).value.trim().toUpperCase();
      variant.qty=Number(form.querySelector('#draft-stock-'+i).value);
      if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(variant.sku)) return showError('Use a SKU of 1–64 letters, numbers, dots, hyphens or underscores.','draft-sku-'+i);
      if (skus.has(variant.sku)||skuInUse(variant.sku)) return showError('SKU '+variant.sku+' is already assigned. Choose a unique company-wide SKU.','draft-sku-'+i);
      if (!form.querySelector('#draft-stock-'+i).value||!Number.isInteger(variant.qty)||variant.qty<0||variant.qty>10000) return showError('Enter 0–10000 whole units for every variant.','draft-stock-'+i);
      skus.add(variant.sku);
    }
    const savedVariants=draft.map(variant=>({...variant}));
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
    const action=event.submitter?.value||'save';
    try {
      const image=file?await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
      }):'';
      if (!form.isConnected) return;
      // Recheck after image loading before publishing the complete product in memory.
      if (savedVariants.some(v=>skuInUse(v.sku))) { buttons.forEach(button=>button.disabled=false);return showError('A SKU was assigned while loading the image. Update the SKU and save again.'); }
      let id=Math.max(...products.map(p=>p.id));
      let barcode=Math.max(...products.map(p=>Number(p.barcode)));
      const created=savedVariants.map(v=>({
        id:++id,groupId:productNumber,name,description,style:category.code+'-'+String(productNumber).padStart(4,'0'),
        categoryId:category.id,cat:category.name,color:v.color,size:v.size,price:round(price),cost:round(cost),vat,image,
        sku:v.sku,skuAliases:[],barcode:String(++barcode),b1:branch==='1'?v.qty:0,b2:branch==='2'?v.qty:0,art:'◇'
      }));
      if (created.some(p=>products.some(existing=>existing.barcode===p.barcode))) throw Error('Barcode collision');
      products.push(...created);
      created.forEach(p=>stockMovements.push({productId:p.id,branch:Number(branch),qty:p['b'+branch],type:'Initial stock'}));
      state.search='';
      closeModal();render();notify('Product saved · '+created.length+' variants · '+branchLabel(branch));
      if (action==='another') productForm();
      if (action==='print') labels(created[0].id,created.map(p=>p.id),branch);
    } catch {
      buttons.forEach(button=>button.disabled=false);
      showError('The product could not be saved. Check the image and try again.');
    }
  };
}

function showDetail(id) {
  const p=products.find(p=>p.id===id);
  openModal('<h2>'+slug(p.name)+'</h2><p>'+slug(p.sku+' · '+p.color+' / '+p.size)+'</p>'+
    (p.image?'<img class="detail-image" src="'+slug(p.image)+'" alt="'+slug(p.name)+'">':'')+
    '<p>'+slug(p.description||'')+'</p><p>'+slug(categoryName(p.categoryId))+' · '+money(p.price)+' · Buying cost '+money(p.cost)+' · VAT '+slug(p.vat)+'</p>'+
    '<p>Barcode '+p.barcode+' · '+slug(branchLabel(curBranch()))+' · Available '+stock(p)+'</p>'+matrix(p)+variantButtons(p)+
    '<details><summary>Edit SKU</summary><form id="sku-edit-form">'+field('Variant SKU','edit-sku','text',p.sku)+
    '<p id="sku-error" role="alert"></p><button class="btn" type="submit">Save SKU</button></form></details>'+
    '<div class="modal-foot"><button class="btn" data-close>Close</button></div>');
  bindV11();
  $('#sku-edit-form').onsubmit=e=>{
    e.preventDefault();
    const sku=$('#edit-sku').value.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku)||skuInUse(sku,p.id)) {
      $('#sku-error').textContent='Enter a valid, unique company-wide SKU.';return;
    }
    if (sku!==p.sku) {
      p.skuAliases.push(p.sku);
      p.sku=sku;
    }
    closeModal();render();notify('SKU updated. Barcode and history preserved.');
  };
}

function labels(id, ids = [id], labelBranch = curBranch()) {
  state.labelVariant=id;
  const variants=ids.map(variantId=>products.find(p=>p.id===variantId));
  const p=products.find(p=>p.id===id);
  openModal('<h2>'+APP_CONFIG.brand+' · Print / reprint barcode</h2><p>'+slug(branchLabel(labelBranch))+' · Reprints preserve each variant’s original barcode.</p>'+
    '<div class="label-variant-list">'+variants.map(v=>'<label><input type="checkbox" data-print-variant="'+v.id+'" checked> '+slug(v.name+' · '+v.color+' / '+v.size+' · '+v.sku)+'</label>').join('')+'</div>'+
    '<div class="form-row">'+field('Labels per variant','label-count','number',1)+
    '<div class="form-group"><label for="label-width">Label width</label><select id="label-width" class="field"><option value="58">58 mm</option><option value="80">80 mm</option></select></div></div>'+
    '<p>Use 100% scale in print settings. Check physical scanner readability on your printer.</p><div id="label-preview"><strong>'+APP_CONFIG.brand+'</strong><p>'+slug(p.sku)+'</p><svg id="barcode-preview"></svg></div>'+
    '<div class="modal-foot"><button class="btn" data-close>Close</button><button class="btn primary" id="print-labels">Print labels</button></div>');
  JsBarcode('#barcode-preview',p.barcode,{format:'CODE128',width:2,height:45,margin:12});
  $('#print-labels').onclick=()=>{
    const count=Number($('#label-count').value),width=Number($('#label-width').value);
    const selected=[...document.querySelectorAll('[data-print-variant]:checked')].map(input=>products.find(p=>p.id===Number(input.dataset.printVariant)));
    if(!selected.length||!Number.isInteger(count)||count<1||count*selected.length>100)return notify('Choose variants and 1–100 total labels');
    $('#print-root')?.remove();
    const root=document.createElement('div');root.id='print-root';
    for(const variant of selected) for(let i=0;i<count;i++){
      const label=document.createElement('div');label.className='barcode-label';label.style.width=width+'mm';
      const brand=document.createElement('strong');brand.textContent=APP_CONFIG.brand+' · '+APP_CONFIG.businessType;
      const text=document.createElement('div');text.textContent=variant.name+' · '+variant.color+' / '+variant.size+' · '+money(variant.price);
      const sku=document.createElement('div');sku.textContent=variant.sku+' · '+branchLabel(labelBranch);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      label.append(brand,text,sku,svg);root.append(label);
      JsBarcode(svg,variant.barcode,{format:'CODE128',width:2,height:45,margin:12,fontSize:16});
    }
    document.body.append(root);document.body.classList.add('printing-labels');window.print();
  };
}

window.addEventListener('afterprint',()=>{document.body.classList.remove('printing-labels');$('#print-root')?.remove();});
function receiveForm() {
  if(!requireBranch())return;
  openModal('<h2>Receive sample stock</h2><p>'+branchLabel(curBranch())+' · temporary browser state</p><form id="receive-form"><div class="form-group"><label for="receive-variant">Variant</label><select class="field" id="receive-variant">'+products.map(p=>'<option value="'+p.id+'">'+slug(p.name+' · '+p.sku+' · '+p.color+'/'+p.size)+'</option>').join('')+'</select></div>'+field('Units received','receive-qty','number',5)+field('Supplier','receive-supplier','text','Riverside Textiles')+
    '<div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Receive units</button></div></form>');
  $('#receive-form').onsubmit=e=>{
    e.preventDefault();const qty=Number($('#receive-qty').value),p=products.find(p=>p.id===Number($('#receive-variant').value));
    if(!Number.isInteger(qty)||qty<1||qty>10000)return notify('Enter 1–10000 whole units');
    if(!requireBranch())return;
    p['b'+curBranch()]+=qty;stockMovements.push({productId:p.id,branch:Number(curBranch()),qty,type:'Receipt'});
    state.purchases.unshift({id:'GRN-DEMO-'+(state.purchases.length+1),supplier:$('#receive-supplier').value,branch:Number(curBranch()),items:qty,total:round(p.cost*qty)});
    closeModal();render();notify('Sample stock received');
  };
}
const originalAction=handleAction;
handleAction = function(action) {
  if(['checkout','scan','transfer','purchase','expense','stocktake'].includes(action)&&!requireBranch())return;
  if(action==='product-form')return productForm();
  if(action==='purchase'||action==='stocktake')return receiveForm();
  if(action==='labels')return labels(products[0].id);
  if(action==='role-manager'||action==='role-owner'){
    state.role=action==='role-manager'?'manager':'owner';state.branch=state.role==='manager'?assignedBranch:ownerBranch;state.cart=[];render();return;
  }
  if(action==='report')return exportReport();
  originalAction(action);
  if(action==='transfer')$('#tr-from').disabled=true;
  if(action==='scan')$('#scan-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const value=e.target.value;closeModal();scanBarcode(value);}};
};
function exportReport() {
  if(state.role!=='owner'){notify('Report exports are available in the Owner preview.');return;}
  const period=state.page==='overview'?state.date:state.month;
  const rows=rowsFor(period),f=figures(rows),e=expenseAmount(period);
  let csvRows=[['Brand','Period','Branch','Metric','Value'],
    ...Object.entries({...f,expenses:e,operatingProfit:round(f.profit-e),currentInventoryValue:inventoryValue()}).map(([k,v])=>[APP_CONFIG.brand,period,branchLabel(curBranch()),k,v]),
    [],['Invoice','Date','Hour','Branch','Method','Barcode','SKU','Category','Product','Size','Color','Net units','Net revenue','Gross profit','Discount'],
    ...rows.flatMap(s=>s.lines.map(l=>{
      const p=products.find(p=>p.id===l.productId);
      return [s.id,s.date,s.hour,branchLabel(s.branch),s.method,l.barcode||p.barcode,l.sku||p.sku,categoryName(p.categoryId),p.name,p.size,p.color,l.qty*(l.refund?-1:1),l.revenue,l.profit,l.discount];
    }))];
  if(state.page==='expenses'){
    const expenses=state.expenses.filter(item=>item.date.startsWith(period)&&scoped(item.branch));
    csvRows=[
      ['Brand','Period','Branch','Metric','Value'],
      [APP_CONFIG.brand,period,branchLabel(curBranch()),'expenses',expenseAmount(period)],
      [],['Date','Description','Category','Branch','Amount'],
      ...expenses.map(item=>[item.date,item.title,item.cat,branchLabel(item.branch),item.amount])
    ];
  }
  if(state.page==='customers'){
    csvRows=[
      ['Brand','Period','Branch'],[APP_CONFIG.brand,period,branchLabel(curBranch())],
      [],['Customer','Mobile','Branch','Invoices','Net spending','Consent'],
      ...customersData.filter(customer=>scoped(customer.branch)).map(customer=>{
        const totals=figures(rows.filter(sale=>sale.customerId===customer.id));
        return [customer.name,customer.phone,branchLabel(customer.branch),totals.invoices,totals.revenue,customer.consent?'Yes':'No'];
      })
    ];
  }
  const csv=csvRows.map(row=>row.map(value=>'"'+(typeof value === 'string' ? value.replace(/^[=+@-]/,"'"+value[0]) : String(value)).replaceAll('"','""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=APP_CONFIG.brand.toLowerCase()+'-v1.2-'+period+'-'+branchLabel(curBranch()).toLowerCase().replaceAll(' ','-')+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindV11() {
  document.querySelectorAll('[data-v11]').forEach(b=>b.onclick=()=>{
    if(b.dataset.v11==='receive')return receiveForm();
    if(state.role!=='owner')return;
    openModal('<h2>Create category</h2>'+field('Category name','category-name')+'<div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="category-save">Save</button></div>');
    $('#category-save').onclick=()=>{
      const name=$('#category-name').value.trim();
      if(!name||categories.some(c=>c.name.toLowerCase()===name.toLowerCase()))return notify('Enter a unique category name');
      categories.push({id:Math.max(...categories.map(c=>c.id))+1,name,code:'CAT'+String(Math.max(...categories.map(c=>c.id))+1),archived:false});closeModal();render();
    };
  });
  document.querySelectorAll('[data-category-edit]').forEach(b=>b.onclick=()=>{
    if(state.role!=='owner')return;
    const c=categories.find(c=>c.id===Number(b.dataset.categoryEdit));
    openModal('<h2>Rename category</h2>'+field('Category name','category-name','text',c.name)+'<div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="category-save">Save</button></div>');
    $('#category-save').onclick=()=>{
      const name=$('#category-name').value.trim();
      if(!name||categories.some(x=>x.id!==c.id&&x.name.toLowerCase()===name.toLowerCase()))return notify('Enter a unique category name');
      c.name=name;products.filter(p=>p.categoryId===c.id).forEach(p=>p.cat=name);closeModal();render();
    };
  });
  document.querySelectorAll('[data-category-archive]').forEach(b=>b.onclick=()=>{if(state.role!=='owner')return;const c=categories.find(c=>c.id===Number(b.dataset.categoryArchive));c.archived=!c.archived;render();});
  document.querySelectorAll('[data-category-move]').forEach(b=>b.onclick=()=>{if(state.role!=='owner')return;const [id,step]=b.dataset.categoryMove.split(':').map(Number),i=categories.findIndex(c=>c.id===id);if(i+step<0||i+step>=categories.length)return;[categories[i],categories[i+step]]=[categories[i+step],categories[i]];render();});
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>showDetail(Number(b.dataset.detail)));
  document.querySelectorAll('[data-label]').forEach(b=>b.onclick=()=>labels(Number(b.dataset.label)));
}
const originalBind=bind;
bind = function() {
  originalBind();bindV11();
  document.querySelectorAll('[data-add]').forEach(tile => {
    const product = products.find(p => p.id === Number(tile.dataset.add));
    if (product.image) tile.querySelector('.product-art').innerHTML = '<img class="detail-image" src="'+slug(product.image)+'" alt="">';
  });
  if($('#report-period'))$('#report-period').onchange=e=>{
    if(!e.target.value)return;
    if(state.page==='overview')state.date=e.target.value;else state.month=e.target.value;
    render();
  };
  if($('#pos-search'))$('#pos-search').onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();scanBarcode(e.target.value);}
  };
  if(state.page==='inventory'&&$('#table-search'))$('#table-search').onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();state.search=e.target.value.trim();render();if(!products.some(p=>matchesVariant(p,state.search)||p.style.toLowerCase()===state.search.toLowerCase()))notify('Unknown barcode or SKU');$('#table-search')?.focus();}
  };
};
render = function() {
  controls();nav();
  $('#crumb').textContent='Workspace';
  $('#crumb2').textContent=navItems.find(x=>x[0]===state.page)?.[1]||'Daily Overview';
  const pages={overview,monthly:monthlyOverview,pos,products:productsPage,categories:categoryPage,inventory,purchases,transfers,expenses,finance,customers,settings};
  $('#content').innerHTML=(pages[state.page]||overview)();bind();
};
// Capture saves that need V1.1 ledger updates before the original demo handlers.
$('#modal-root').addEventListener('click',e=>{
  const button=e.target.closest('[data-save]');if(!button)return;
  const action=button.dataset.save;
  if(!['checkout','expense','transfer'].includes(action))return;
  e.stopImmediatePropagation();
  if(!requireBranch())return;
  if(action==='expense'){
    const amount=Number($('#ex-amount').value);
    if(!Number.isFinite(amount)||amount<=0)return notify('Enter a positive finite amount');
    state.expenses.unshift({date:today,title:$('#ex-title').value||'Sample expense',cat:$('#ex-cat').value,branch:Number(curBranch()),amount:round(amount)});
    closeModal();render();notify('Sample expense added');return;
  }
  if(action==='transfer'){
    const p=products.find(p=>p.id===Number($('#tr-product').value)),qty=Number($('#tr-qty').value),from=Number(curBranch());
    if(!Number.isInteger(qty)||qty<1||qty>p['b'+from])return notify('Invalid quantity or insufficient sample stock');
    p['b'+from]-=qty;stockMovements.push({productId:p.id,branch:from,qty:-qty,type:'Transfer dispatch'});
    state.transfers.unshift({id:'TR-DEMO-'+(state.transfers.length+1),from,to:from===1?2:1,style:p.style,productId:p.id,qty,status:'In transit'});
    state.cart=[];closeModal();render();notify('Sample units dispatched into transit');return;
  }
  if(!state.cart.length)return;
  if(state.cart.some(l=>l.qty>stock(products.find(p=>p.id===l.id))))return notify('Cart exceeds available branch stock');
  const t=totals(),discountRate=t.sub?t.discount/t.sub:0;
  const sale={id:'DEMO-'+(ledger.length+1),date:today,hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:APP_CONFIG.timezone,hour:'2-digit',hour12:false}).format(new Date())),branch:Number(curBranch()),method:$('#pay-method').value,customerId:null,
    lines:state.cart.map(l=>saleLine(products.find(p=>p.id===l.id),l.qty,discountRate))};
  // Assign rounding remainder to the final line so invoice and report totals agree.
  const remainder=round(t.total-sale.lines.reduce((n,l)=>n+l.revenue,0));
  const last=sale.lines[sale.lines.length-1];last.revenue=round(last.revenue+remainder);last.profit=round(last.profit+remainder);last.discount=round(last.discount-remainder);
  state.cart.forEach(l=>products.find(p=>p.id===l.id)['b'+curBranch()]-=l.qty);
  ledger.push(sale);state.demoTransactions.push(sale);state.cart=[];state.discount=0;state.customer='';
  closeModal();render();
  openModal('<h2>Sample receipt generated</h2><div id="demo-receipt" class="receipt"><h3>'+APP_CONFIG.brand+'</h3><p>'+sale.id+' · '+branchLabel(sale.branch)+' · '+today+'</p>'+
    table(['Item / SKU','Units','Net amount'],sale.lines.map(l=>[slug(products.find(p=>p.id===l.productId).name+' / '+l.sku),l.qty,money(l.revenue)]))+
    '<p>Discount '+money(t.discount)+' · Total '+money(t.total)+' · '+slug(sale.method)+'</p><p>DEMONSTRATION — NOT A TAX INVOICE</p></div><div class="modal-foot"><button class="btn" data-close>Close</button><button class="btn primary" onclick="window.print()">Print demo receipt</button></div>');
  notify('Demo sale added to reports and sample stock');
},true);
// A scanner can also start while focus is on the page itself. Editable fields
// keep their keystrokes, including Enter. F2 always returns to the POS scan box.
let scannerBuffer = '';
let scannerLastKey = 0;
document.addEventListener('keydown', event => {
  if (!['pos','inventory'].includes(state.page) || $('#overlay') || document.body.classList.contains('navigation-open')) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const now = performance.now();
  if (now - scannerLastKey > 120) scannerBuffer = '';
  scannerLastKey = now;
  if (event.key.length === 1) scannerBuffer += event.key;
  if (event.key !== 'Enter' || !scannerBuffer) return;
  event.preventDefault();
  const barcode = scannerBuffer;
  scannerBuffer = '';
  if (state.page === 'pos') scanBarcode(barcode);
  else {
    state.search = barcode;
    render();
    if (!products.some(p => p.barcode === barcode)) notify('Unknown barcode');
    $('#table-search')?.focus();
  }
});
const originalPurchases = purchases;
purchases = function() {
  const html = originalPurchases();
  // Supplier balances are outside this sample ledger, so show actual receipt units.
  return html.replace(metric('SUPPLIER PAYABLE',money(43750*(curBranch()==='all'?1:.5)),'Sample outstanding balance','◈'),
    metric('RECEIVED UNITS',state.purchases.filter(p=>scoped(p.branch)).reduce((n,p)=>n+p.items,0),'Listed sample receipts','▥'))
    .replace(metric('ACTIVE SUPPLIERS','4','Illustrative vendors','♧'),
    metric('ACTIVE SUPPLIERS',new Set(state.purchases.filter(p=>scoped(p.branch)).map(p=>p.supplier)).size,'Listed sample vendors','♧'));
};
const originalTransfers=transfers;
transfers=function(){
  return originalTransfers()+section('Receive inbound transfers',table(['Transfer','Variant','Units','Action'],state.transfers.filter(t=>t.productId&&t.status==='In transit'&&Number(curBranch())===t.to).map(t=>[
    t.id,slug(t.style),t.qty,'<button class="btn small" data-receive-transfer="'+t.id+'">Receive transfer</button>'
  ])));
};
const baseBind=bind;
bind=function(){
  baseBind();
  document.querySelectorAll('[data-receive-transfer]').forEach(b=>b.onclick=()=>{
    const t=state.transfers.find(t=>t.id===b.dataset.receiveTransfer);
    if(!t||t.status!=='In transit'||Number(curBranch())!==t.to)return;
    products.find(p=>p.id===t.productId)['b'+t.to]+=t.qty;t.status='Received';
    stockMovements.push({productId:t.productId,branch:t.to,qty:t.qty,type:'Transfer receipt'});render();
  });
};
