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
  return { productId:product.id, productName:product.name, categoryId:product.categoryId, categoryLabel:categoryName(product.categoryId), color:product.color, size:product.size, groupId:product.groupId, vat:product.vat, sku:product.sku, barcode:product.barcode, qty, unitPrice:product.price, unitCost:product.cost,
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
  return round(products.reduce((n,p) => n + stockValue(p,branch),0));
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
  const grouped=new Map();
  rows.flatMap(sale=>sale.lines).forEach(line=>{
    const key=JSON.stringify([line.productId,line.categoryId,line.categoryLabel,line.productName,line.color,line.size]);
    const item=grouped.get(key)||{...line,qty:0,revenue:0,profit:0};
    item.qty+=line.qty*(line.refund?-1:1);
    item.revenue=round(item.revenue+line.revenue);
    item.profit=round(item.profit+line.profit);
    grouped.set(key,item);
  });
  return [...grouped.values()].sort((a,b)=>b.qty-a.qty);
}
function itemTable(rows) {
  return table(['Category','Product','Variant','Net units','Net revenue',...(state.role==='owner'?['Gross profit']:[])],
    groupedLines(rows).map(line=>[
      slug(line.categoryLabel),slug(line.productName),slug(line.color+' / '+line.size),
      line.qty,money(line.revenue),...(state.role==='owner'?[money(line.profit)]:[])
    ]));
}
function categoryTable(rows) {
  const groups=new Map(categories.map(category=>[category.id+'|'+category.name,{name:category.name,qty:0,revenue:0,profit:0}]));
  rows.flatMap(sale=>sale.lines).forEach(line=>{
    const key=line.categoryId+'|'+line.categoryLabel;
    const item=groups.get(key)||{name:line.categoryLabel,qty:0,revenue:0,profit:0};
    item.qty+=line.qty*(line.refund?-1:1);item.revenue=round(item.revenue+line.revenue);item.profit=round(item.profit+line.profit);
    groups.set(key,item);
  });
  return table(['Category','Net units','Net revenue',...(state.role==='owner'?['Gross profit']:[])],
    [...groups.values()].map(item=>[slug(item.name),item.qty,money(item.revenue),...(state.role==='owner'?[money(item.profit)]:[])]));
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
    section('Payment methods',paymentBreakdown(rows))+
    '<p class="note">Revenue includes refund reversals. Gross profit is shown in the Owner preview. Items sold count outbound units. Average invoice is net revenue divided by sales invoice count. All amounts are illustrative, net of VAT.</p>'+noReal;
};
function bestSellingTable(rows) {
  const groups = new Map();
  groupedLines(rows).forEach(line => {
    const key=line.groupId+'|'+line.productName;
    const item = groups.get(key) || { name: line.productName, qty: 0, revenue: 0, profit: 0 };
    item.qty += line.qty;
    item.revenue = round(item.revenue + line.revenue);
    item.profit = round(item.profit + line.profit);
    groups.set(key, item);
  });
  return table(['Product','Net units','Revenue','Gross profit'], [...groups.values()]
    .sort((a,b) => b.qty-a.qty).map(p => [slug(p.name),p.qty,money(p.revenue),money(p.profit)]));
}
function monthlyOverview() {
  if(state.role!=='owner') return ownerOnlyPage();
  const rows=rowsFor(state.month),f=figures(rows),expenses=expenseAmount(state.month);
  const days=new Date(Number(state.month.slice(0,4)),Number(state.month.slice(5,7)),0).getDate();
  return title('Monthly overview','Sales, costs and branch performance from the same sample ledger.')+periodControls(true)+
    '<div class="grid metrics">'+[['REVENUE',f.revenue],['GROSS PROFIT',f.profit],['OPERATING PROFIT',f.profit-expenses+returnVariance(state.month)],['EXPENSES',expenses],['CURRENT INVENTORY VALUE',inventoryValue()]]
    .map(([n,v])=>metric(n,money(v),'Selected scope')).join('')+'</div>'+
    chart('Daily revenue and gross profit',Array.from({length:days},(_,i)=>({label:String(i+1),...figures(rows.filter(s=>s.date===state.month+'-'+String(i+1).padStart(2,'0')))})),true)+
    section('Branch comparison',table(['Branch','Revenue','Gross profit','Expenses','Operating profit'],(curBranch()==='all'?[1,2]:[Number(curBranch())]).map(b=>{
      const v=figures(rowsFor(state.month,String(b))),e=expenseAmount(state.month,String(b));return [branchLabel(b),money(v.revenue),money(v.profit),money(e),money(v.profit-e+returnVariance(state.month,String(b)))];
    })))+section('Best-selling products',bestSellingTable(rows))+section('Variant sales',itemTable(rows))+section('Category performance',categoryTable(rows))+
    '<p class="note">Operating profit includes supplier return credits less returned carrying value. Every expense belongs to its recorded branch. Inventory value is current on-hand cost, independent of the selected reporting month.</p>'+noReal;
}
finance = monthlyOverview;
profitFigures = function() {
  const f=figures(rowsFor(state.month)),ops=expenseAmount(state.month);
  return {revenue:f.revenue,cogs:round(f.revenue-f.profit),ops,profit:round(f.profit-ops+returnVariance(state.month))};
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
  if(p&&!sellableVariant(p)){notify('This variant is inactive or unavailable in the selected branch.');return;}
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
function field(label,id,type='text',value='') {
  return '<div class="form-group"><label for="'+id+'">'+label+'</label><input class="input" id="'+id+'" type="'+type+'" value="'+slug(value)+'"></div>';
}
// Product, taxonomy, receiving preparation and label views live in catalog.js.
window.addEventListener('afterprint',()=>{document.body.classList.remove('printing-labels');$('#print-root')?.remove();});
const originalAction=handleAction;
handleAction = function(action) {
  if(['checkout','scan','transfer','expense'].includes(action)&&!requireBranch())return;
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
    ...Object.entries({...f,expenses:e,purchaseReturnVariance:returnVariance(period),operatingProfit:round(f.profit-e+returnVariance(period)),currentInventoryValue:inventoryValue()}).map(([k,v])=>[APP_CONFIG.brand,period,branchLabel(curBranch()),k,v]),
    [],['Invoice','Date','Hour','Branch','Method','Barcode','SKU','Category','Product','Size','Color','Net units','Net revenue','Gross profit','Discount'],
    ...rows.flatMap(s=>s.lines.map(l=>{
      const p=products.find(p=>p.id===l.productId);
      return [s.id,s.date,s.hour,branchLabel(s.branch),s.method,l.barcode||p.barcode,l.sku||p.sku,l.categoryLabel||categoryName(p.categoryId),l.productName||p.name,l.size||p.size,l.color||p.color,l.qty*(l.refund?-1:1),l.revenue,l.profit,l.discount];
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
const originalBind=bind;
bind = function() {
  originalBind();
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
    if(!p.active||p.deleted||!availableAt(p,from)||!availableAt(p,from===1?'2':'1'))return notify('The variant must be active and available in both transfer branches');
    if(!Number.isInteger(qty)||qty<1||qty>p['b'+from])return notify('Invalid quantity or insufficient sample stock');
    const basis=issueValue(p,from,qty);
    moveStock(p,from,-qty,-basis,'Transfer dispatch','TR-DEMO-'+(state.transfers.length+1));
    state.transfers.unshift({id:'TR-DEMO-'+(state.transfers.length+1),from,basis,to:from===1?2:1,style:p.style,productId:p.id,qty,status:'In transit'});
    state.cart=[];closeModal();render();notify('Sample units dispatched into transit');return;
  }
  if(action==='checkout')confirmRetailCheckout();
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
    moveStock(products.find(p=>p.id===t.productId),t.to,t.qty,t.basis,'Transfer receipt',t.id);t.status='Received';
    render();
  });
};
