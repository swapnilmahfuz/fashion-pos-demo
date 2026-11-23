// V1.1 extends the original demo shell and operational screens.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const categories = ['Polo','Half Shirt','Check Shirt','Formal Shirt','T-Shirt','Jeans','Chinos','Panjabi','Jacket'].map((name, i) => ({ id: i + 1, name, archived: false }));
const categoryName = id => categories.find(c => c.id === id)?.name || 'Archived category';
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const assignedBranch = '1';
let ownerBranch = 'all';
try { ownerBranch = localStorage.getItem('thread-owner-branch') || 'all'; } catch {}
if (!['all','1','2'].includes(ownerBranch)) ownerBranch = 'all';
Object.assign(state, { branch: ownerBranch, date: today, month: today.slice(0,7), labelVariant: 1 });
navItems[0][1] = 'Daily Overview';
navItems.splice(1, 0, ['monthly', 'Monthly Overview']);
navItems.splice(4, 0, ['categories', 'Categories']);
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
  return { productId:product.id, qty, unitPrice:product.price, unitCost:product.cost,
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
    {date:month+'-03',title:'Gulshan campaign',cat:'Advertising',branch:1,amount:12000},
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
    '<div class="plot-column" title="'+slug(p.label)+' · Revenue '+money(p.revenue)+(dual?' · Profit '+money(p.profit):'')+'"><div class="plot-bars"><i style="height:'+Math.abs(p.revenue)/max*100+'%;background:'+(p.revenue<0?'#b85649':'#1b4840')+'"></i>'+
    (dual?'<i class="profit-bar" style="height:'+Math.abs(p.profit)/max*100+'%;background:'+(p.profit<0?'#b85649':'#a9bfae')+'"></i>':'')+'</div><small>'+slug(p.label)+'</small></div>').join('')+'</div><p class="chart-caption">Revenue '+(dual?'· Light green shows gross profit. ':'')+'· Red shows negative values. Hover for amounts. Scroll horizontally for more dates.</p><details><summary>View chart data</summary>'+table(['Time','Revenue',...(dual?['Gross profit']:[])],points.map(p=>[slug(p.label),money(p.revenue),...(dual?[money(p.profit)]:[])]))+'</details>');
}
function exportButton() { return '<button class="btn" data-action="report">↓ Export sample CSV</button>'; }
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
  return table(['Category','Product','Variant','Net units','Net revenue','Gross profit'],groupedLines(rows).map(l=>{
    const p=products.find(p=>p.id===l.productId);
    return [slug(categoryName(p.categoryId)),slug(p.name),slug(p.color+' / '+p.size),l.qty,money(l.revenue),money(l.profit)];
  }));
}
function categoryTable(rows) {
  return table(['Category','Net units','Net revenue','Gross profit'],categories.map(c=>{
    const lines=rows.map(s=>({...s,lines:s.lines.filter(l=>products.find(p=>p.id===l.productId).categoryId===c.id)}));
    const f=figures(lines);
    const qty=lines.flatMap(s=>s.lines).reduce((n,l)=>n+l.qty*(l.refund?-1:1),0);
    return [slug(c.name),qty,money(f.revenue),money(f.profit)];
  }));
}
overview = function() {
  const rows=rowsFor(state.date), f=figures(rows);
  return title('Daily overview','Sample sales for the selected day and branch.')+periodControls(false)+
    '<div class="grid metrics">'+[
      ['SALES REVENUE',money(f.revenue)],['INVOICES',f.invoices],['ITEMS SOLD',f.items],['GROSS PROFIT',money(f.profit)],
      ['DISCOUNTS',money(f.discounts)],['REFUNDS',money(f.refunds)],['AVERAGE INVOICE',money(f.average)]
    ].map(([name,value])=>metric(name,value,'Selected date')).join('')+'</div>'+
    chart('Hourly net sales',Array.from({length:24},(_,hour)=>({label:String(hour).padStart(2,'0'),revenue:figures(rows.filter(s=>s.hour===hour)).revenue})))+
    section('Item-wise sales',itemTable(rows))+section('Category performance',categoryTable(rows))+
    section('Payment methods',table(['Method','Net revenue'],methods.map(m=>[m,money(figures(rows.filter(s=>s.method===m)).revenue)])))+
    '<p class="note">Revenue and gross profit include refund reversals. Items sold count outbound units. Average invoice is net revenue divided by sales invoice count. All amounts are illustrative, net of VAT.</p>'+noReal;
};
function bestSellingTable(rows) {
  const groups = new Map();
  groupedLines(rows).forEach(line => {
    const product = products.find(p => p.id === line.productId);
    const item = groups.get(product.style) || { name: product.name, qty: 0, revenue: 0, profit: 0 };
    item.qty += line.qty;
    item.revenue = round(item.revenue + line.revenue);
    item.profit = round(item.profit + line.profit);
    groups.set(product.style, item);
  });
  return table(['Product','Net units','Revenue','Gross profit'], [...groups.values()]
    .sort((a,b) => b.qty-a.qty).map(p => [slug(p.name),p.qty,money(p.revenue),money(p.profit)]));
}
function monthlyOverview() {
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
const originalControls=controls;
controls = function() {
  if(state.role==='manager') state.branch=assignedBranch;
  originalControls();
  const branch=$('#branch');
  branch.innerHTML=state.role==='manager'?'<option value="1">Branch 1 · Gulshan (assigned)</option>':
    '<option value="all">Combined</option><option value="1">Branch 1 · Gulshan</option><option value="2">Branch 2 · Dhanmondi</option>';
  branch.value=state.branch;
  branch.disabled=state.role==='manager';
  $('#role').onchange=e=>{
    state.role=e.target.value;state.branch=state.role==='manager'?assignedBranch:ownerBranch;state.cart=[];closeModal();render();
  };
  branch.onchange=e=>{
    if(state.role==='manager')return;
    ownerBranch=e.target.value;state.branch=ownerBranch;state.cart=[];closeModal();
    try {localStorage.setItem('thread-owner-branch',ownerBranch);} catch {}
    render();
  };
};
function requireBranch() {
  if(curBranch()==='all'){notify('Select Branch 1 or Branch 2 for this operation');return false;}return true;
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
  const list=products.filter(p=>[p.name,p.style,p.barcode,categoryName(p.categoryId),p.color,p.size].join(' ').toLowerCase().includes(state.search.toLowerCase()));
  return title('Products & barcodes','Shared styles and variants with immutable demo barcodes.','<button class="btn primary" data-action="product-form">＋ Add product / variants</button>')+
    '<div class="toolbar"><input aria-label="Search products" class="search" id="table-search" placeholder="Search product / SKU / barcode" value="'+slug(state.search)+'"></div>'+
    section('Variant catalog',table(['Product','Category','SKU / Style','Size / Color','Price','Cost','VAT mode','Barcode','Actions'],list.map(p=>[
      (p.image?'<img class="variant-image" src="'+slug(p.image)+'" alt="">':'')+slug(p.name),slug(categoryName(p.categoryId)),slug(p.style),slug(p.size+' / '+p.color),money(p.price),money(p.cost),slug(p.vat),p.barcode,variantButtons(p)
    ])))+noReal;
};
function matrix(p) {
  const variants=products.filter(x=>x.style===p.style);
  const sizes=[...new Set(variants.map(x=>x.size))], colors=[...new Set(variants.map(x=>x.color))];
  return table(['Color / size',...sizes],colors.map(color=>[slug(color),...sizes.map(size=>{
    const v=variants.find(x=>x.color===color&&x.size===size);return v?stock(v):'—';
  })]));
}
inventory = function() {
  const term=state.search.trim().toLowerCase();
  const list=products.filter(p=>[p.name,p.style,p.barcode,p.color,p.size].join(' ').toLowerCase().includes(term));
  const exact=products.find(p=>p.barcode===state.search.trim()||p.style.toLowerCase()===term);
  const styles=[...new Set(list.map(p=>p.style))];
  return title('Inventory control','Scan or search to locate an exact variant and all size / color availability.','<button class="btn primary" data-v11="receive">＋ Receive sample stock</button>')+
    '<div class="grid metrics">'+metric('ON-HAND UNITS',products.reduce((n,p)=>n+stock(p),0),'Selected branch scope')+metric('INVENTORY VALUE',money(inventoryValue()),'Current cost')+'</div>'+
    '<div class="toolbar"><input id="table-search" class="search" aria-label="Inventory barcode or SKU" placeholder="Scan barcode + Enter or search SKU" value="'+slug(state.search)+'"></div>'+
    (exact?section(exact.barcode===state.search.trim()?'Exact match':'Style availability', '<b>'+slug(exact.name+' · '+exact.color+' / '+exact.size)+'</b><p>'+stock(exact)+' units in selected scope · '+exact.barcode+'</p>'+variantButtons(exact)+matrix(exact)):'')+
    section('Stock by variant',table(['Product','SKU','Color / Size','Barcode',...(curBranch()==='all'?['Branch 1','Branch 2']:[]),'Available','Actions'],list.map(p=>[
      slug(p.name),slug(p.style),slug(p.color+' / '+p.size),p.barcode,...(curBranch()==='all'?[p.b1,p.b2]:[]),stock(p),variantButtons(p)
    ])))+styles.map(style=>section(slug(style)+' · size / color matrix',matrix(products.find(p=>p.style===style)))).join('')+noReal;
};
function productForm() {
  openModal('<h2>Add product variants</h2><p>Shared catalog. New variants start with zero stock. Receive stock in an individual branch.</p><form id="product-form">'+
    field('Product name','p-name')+field('SKU / style code','p-style')+
    '<div class="form-group"><label for="p-category">Category</label><select id="p-category" class="field">'+categories.filter(c=>!c.archived).map(c=>'<option value="'+c.id+'">'+slug(c.name)+'</option>').join('')+'</select></div>'+
    field('Sizes (comma separated)','p-sizes','text','S, M, L')+field('Colors (comma separated)','p-colors','text','Black, Navy')+
    '<div class="form-row">'+field('Net unit price (BDT)','p-price','number',1490)+field('Unit cost (BDT)','p-cost','number',680)+'</div>'+
    '<div class="form-group"><label for="p-vat">VAT mode (demo metadata)</label><select class="field" id="p-vat"><option value="included">Included</option><option value="excluded">Excluded</option><option value="exempt">Exempt</option></select></div>'+
    '<div class="form-group"><label for="p-image">Product image (up to 2 MB)</label><input id="p-image" type="file" accept="image/png,image/jpeg,image/webp"></div>'+
    '<p id="form-error" role="alert"></p><div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Create variants</button></div></form>');
  $('#product-form').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,save=form.querySelector('[type=submit]');
    const value=id=>$('#'+id).value.trim();
    const name=value('p-name'),style=value('p-style'),price=Number(value('p-price')),cost=Number(value('p-cost'));
    const sizes=[...new Set(value('p-sizes').split(',').map(s=>s.trim()).filter(Boolean))];
    const colors=[...new Set(value('p-colors').split(',').map(s=>s.trim()).filter(Boolean))];
    const categoryId=Number(value('p-category')),vat=value('p-vat'),file=$('#p-image').files[0];
    const error=message=>$('#form-error').textContent=message;
    if(!name||!style||!sizes.length||!colors.length||sizes.length*colors.length>50||!Number.isFinite(price)||price<=0||!Number.isFinite(cost)||cost<0||!categories.some(c=>c.id===categoryId&&!c.archived))return error('Enter name, style, category, up to 50 variants, positive price and nonnegative cost.');
    if(products.some(p=>p.style.toLowerCase()===style.toLowerCase()))return error('Use a unique style code.');
    if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024))return error('Choose PNG, JPEG or WebP up to 2 MB.');
    save.disabled=true;
    try {
      const image=file?await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);}):'';
      if(!form.isConnected)return;
      for(const color of colors)for(const size of sizes){
        const id=Math.max(...products.map(p=>p.id))+1;
        const barcode=String(Math.max(...products.map(p=>Number(p.barcode)))+1);
        products.push({id,name,style,categoryId,cat:categoryName(categoryId),color,size,price,cost,vat,image,barcode,b1:0,b2:0,art:'◇'});
      }
      closeModal();render();notify('Sample variants created with unique Code 128 barcodes');
    } catch {save.disabled=false;error('Image could not be loaded. Try again.');}
  };
}
function showDetail(id) {
  const p=products.find(p=>p.id===id);
  openModal('<h2>'+slug(p.name)+'</h2><p>'+slug(p.style+' · '+p.color+' / '+p.size)+'</p>'+
    (p.image?'<img class="detail-image" src="'+slug(p.image)+'" alt="'+slug(p.name)+'">':'')+
    '<p>'+slug(categoryName(p.categoryId))+' · '+money(p.price)+' · Cost '+money(p.cost)+' · VAT '+slug(p.vat)+'</p><p>Barcode '+p.barcode+' · Available '+stock(p)+'</p>'+matrix(p)+variantButtons(p)+
    '<div class="modal-foot"><button class="btn" data-close>Close</button></div>');
  bindV11();
}
function labels(id) {
  state.labelVariant=id;
  const p=products.find(p=>p.id===id);
  openModal('<h2>Print / reprint barcode</h2><p>'+slug(p.name+' · '+p.color+' / '+p.size)+'. Reprints keep '+p.barcode+'.</p>'+
    '<div class="form-row">'+field('Number of labels','label-count','number',1)+
    '<div class="form-group"><label for="label-width">Label width</label><select id="label-width" class="field"><option value="58">58 mm</option><option value="80">80 mm</option></select></div></div>'+
    '<p>Use 100% scale in print settings. Check physical scanner readability on your printer.</p><div id="label-preview"></div><div class="modal-foot"><button class="btn" data-close>Close</button><button class="btn primary" id="print-labels">Print labels</button></div>');
  $('#label-preview').innerHTML='<svg id="barcode-preview"></svg>';
  JsBarcode('#barcode-preview',p.barcode,{format:'CODE128',width:2,height:45,margin:12});
  $('#print-labels').onclick=()=>{
    const count=Number($('#label-count').value),width=Number($('#label-width').value);
    if(!Number.isInteger(count)||count<1||count>100)return notify('Choose 1–100 labels');
    $('#print-root')?.remove();
    const root=document.createElement('div');root.id='print-root';
    for(let i=0;i<count;i++){
      const label=document.createElement('div');label.className='barcode-label';label.style.width=width+'mm';
      const text=document.createElement('div');text.textContent=p.name+' · '+p.color+' / '+p.size+' · '+money(p.price);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      label.append(text,svg);root.append(label);JsBarcode(svg,p.barcode,{format:'CODE128',width:2,height:45,margin:12,fontSize:16});
    }
    document.body.append(root);document.body.classList.add('printing-labels');window.print();
  };
}
window.addEventListener('afterprint',()=>{document.body.classList.remove('printing-labels');$('#print-root')?.remove();});
function receiveForm() {
  if(!requireBranch())return;
  openModal('<h2>Receive sample stock</h2><p>'+branchLabel(curBranch())+' · temporary browser state</p><form id="receive-form"><div class="form-group"><label for="receive-variant">Variant</label><select class="field" id="receive-variant">'+products.map(p=>'<option value="'+p.id+'">'+slug(p.name+' · '+p.style+' · '+p.color+'/'+p.size)+'</option>').join('')+'</select></div>'+field('Units received','receive-qty','number',5)+field('Supplier','receive-supplier','text','Riverside Textiles')+
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
  const period=state.page==='overview'?state.date:state.month;
  const rows=rowsFor(period),f=figures(rows),e=expenseAmount(period);
  const csvRows=[['Period','Branch','Metric','Value'],
    ...Object.entries({...f,expenses:e,operatingProfit:round(f.profit-e),currentInventoryValue:inventoryValue()}).map(([k,v])=>[period,curBranch(),k,v]),
    [],['Invoice','Date','Hour','Branch','Method','Barcode','Category','Product','Size','Color','Net units','Net revenue','Gross profit','Discount'],
    ...rows.flatMap(s=>s.lines.map(l=>{
      const p=products.find(p=>p.id===l.productId);
      return [s.id,s.date,s.hour,s.branch,s.method,p.barcode,categoryName(p.categoryId),p.name,p.size,p.color,l.qty*(l.refund?-1:1),l.revenue,l.profit,l.discount];
    }))];
  const csv=csvRows.map(row=>row.map(value=>'"'+(typeof value === 'string' ? value.replace(/^[=+@-]/,"'"+value[0]) : String(value)).replaceAll('"','""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='thread-v1.1-'+period+'-'+curBranch()+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindV11() {
  document.querySelectorAll('[data-v11]').forEach(b=>b.onclick=()=>{
    if(b.dataset.v11==='receive')return receiveForm();
    if(state.role!=='owner')return;
    openModal('<h2>Create category</h2>'+field('Category name','category-name')+'<div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="category-save">Save</button></div>');
    $('#category-save').onclick=()=>{
      const name=$('#category-name').value.trim();
      if(!name||categories.some(c=>c.name.toLowerCase()===name.toLowerCase()))return notify('Enter a unique category name');
      categories.push({id:Math.max(...categories.map(c=>c.id))+1,name,archived:false});closeModal();render();
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
    if(e.key==='Enter'){e.preventDefault();state.search=e.target.value.trim();render();if(!products.some(p=>p.barcode===state.search||p.style.toLowerCase()===state.search.toLowerCase()))notify('Unknown barcode or SKU');$('#table-search')?.focus();}
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
  const sale={id:'DEMO-'+(ledger.length+1),date:today,hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',hour12:false}).format(new Date())),branch:Number(curBranch()),method:$('#pay-method').value,customerId:null,
    lines:state.cart.map(l=>saleLine(products.find(p=>p.id===l.id),l.qty,discountRate))};
  // Assign rounding remainder to the final line so invoice and report totals agree.
  const remainder=round(t.total-sale.lines.reduce((n,l)=>n+l.revenue,0));
  const last=sale.lines[sale.lines.length-1];last.revenue=round(last.revenue+remainder);last.profit=round(last.profit+remainder);last.discount=round(last.discount-remainder);
  state.cart.forEach(l=>products.find(p=>p.id===l.id)['b'+curBranch()]-=l.qty);
  ledger.push(sale);state.demoTransactions.push(sale);state.cart=[];state.discount=0;state.customer='';
  closeModal();render();
  openModal('<h2>Sample receipt generated</h2><div id="demo-receipt" class="receipt"><h3>THREAD /</h3><p>'+sale.id+' · '+branchLabel(sale.branch)+' · '+today+'</p>'+
    table(['Item','Units','Net amount'],sale.lines.map(l=>[slug(products.find(p=>p.id===l.productId).name),l.qty,money(l.revenue)]))+
    '<p>Discount '+money(t.discount)+' · Total '+money(t.total)+' · '+slug(sale.method)+'</p><p>DEMONSTRATION — NOT A TAX INVOICE</p></div><div class="modal-foot"><button class="btn" data-close>Close</button><button class="btn primary" onclick="window.print()">Print demo receipt</button></div>');
  notify('Demo sale added to reports and sample stock');
},true);
// A scanner can also start while focus is on the page itself. Editable fields
// keep their keystrokes, including Enter. F2 always returns to the POS scan box.
let scannerBuffer = '';
let scannerLastKey = 0;
document.addEventListener('keydown', event => {
  if (!['pos','inventory'].includes(state.page) || $('#overlay')) return;
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
const originalSettings = settings;
settings = function() {
  return originalSettings().replace('one selected branch at a time','one assigned branch')
    .replace('Manager operates one branch.', 'Manager is assigned to Branch 1 (Gulshan) for this demo.')
    .replace('Cannot see consolidated company reports or manage account assignments.', 'Reports and operational actions use the assigned branch. Category management belongs to the Owner.');
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
$('.support').innerHTML='Designed for modern retail.<br>v1.1 · Sample data resets on refresh';
render();
