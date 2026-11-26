// Phase 1 shell. Business operations remain in app.js and v11.js.
const mobileNavigation = window.matchMedia('(max-width: 850px)');
let drawerOpen = false;

function canAccessPage(page) {
  return state.role === 'owner' || !APP_CONFIG.ownerPages.includes(page);
}
function navigationItem() {
  return APP_CONFIG.navigation.flatMap(group=>group.items)
    .find(item=>(item.pages||[item.page]).includes(state.page));
}
function closeNavigation(restoreFocus = true) {
  drawerOpen = false;
  document.body.classList.remove('navigation-open');
  $('#nav-toggle').setAttribute('aria-expanded','false');
  $('#nav-backdrop').hidden = true;
  $('#sidebar').inert = mobileNavigation.matches;
  $('#sidebar').removeAttribute('role');
  $('#sidebar').removeAttribute('aria-modal');
  if(!modalSession) $('.main-wrap').inert = false;
  if(restoreFocus && mobileNavigation.matches) $('#nav-toggle').focus();
}
function openNavigation() {
  if(!mobileNavigation.matches)return;
  drawerOpen = true;
  document.body.classList.add('navigation-open');
  $('#nav-toggle').setAttribute('aria-expanded','true');
  $('#nav-backdrop').hidden = false;
  $('#sidebar').inert = false;
  $('#sidebar').setAttribute('role','dialog');
  $('#sidebar').setAttribute('aria-modal','true');
  $('.main-wrap').inert = true;
  ($('#nav [aria-current="page"]') || $('#nav-close')).focus();
}
function navigate(page) {
  const apply = () => {
    closeNavigation(false);
    state.page = canAccessPage(page) ? page : 'overview';
    state.search = '';
    render();
    $('#content h1').tabIndex=-1;
    $('#content h1').focus();
  };
  if(modalSession)requestModalClose(apply);else apply();
}
nav = function() {
  $('#nav').innerHTML = APP_CONFIG.navigation.map(group=>{
    const items=group.items.filter(item=>!item.owner||state.role==='owner');
    if(!items.length)return '';
    return '<section class="nav-group"><h2>'+group.label+'</h2>'+items.map(item=>{
      if(item.planned)return '<div class="nav-future"><span aria-hidden="true">'+item.icon+'</span><div>'+item.label+'<small>Planned · Phase '+item.planned+'</small></div></div>';
      const active=(item.pages||[item.page]).includes(state.page);
      return '<button class="nav-item '+(active?'active':'')+'" data-page="'+item.page+'" '+(active?'aria-current="page"':'')+'><span aria-hidden="true">'+item.icon+'</span>'+item.label+'</button>';
    }).join('')+'</section>';
  }).join('');
  $('#nav').querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>navigate(button.dataset.page));
};
function confirmScopeChange(apply) {
  if(modalSession){
    requestModalClose(()=>confirmScopeChange(apply));
    return;
  }
  if(!state.cart.length){apply();return;}
  openModal('<h2>Change demo scope?</h2><p>Changing role or branch clears the current cart and its checkout fields.</p><div class="modal-foot"><button class="btn primary" data-close>Keep current scope</button><button class="btn" id="confirm-scope">Change scope</button></div>');
  $('#confirm-scope').onclick=()=>{closeModal();apply();};
}
function resetCheckoutScope() {
  state.cart=[];
  state.discount=0;
  state.customer='';
  catalogSelection.clear();
}
controls = function() {
  state.branch = state.role==='manager' ? assignedBranch : ownerBranch;
  const role=$('#role'), branch=$('#branch');
  role.value=state.role;
  branch.innerHTML=state.role==='owner' ? branchOptions(state.branch,true) :
    '<option value="'+assignedBranch+'">'+branchLabel(assignedBranch)+' (assigned)</option>';
  branch.value=state.branch;
  branch.disabled=state.role==='manager';
  role.onchange=event=>{
    const next=event.target.value;
    role.value=state.role;
    confirmScopeChange(()=>{
      state.role=next;
      state.branch=next==='manager'?assignedBranch:ownerBranch;
      resetCheckoutScope();
      render();
    });
  };
  branch.onchange=event=>{
    const next=event.target.value;
    branch.value=state.branch;
    if(state.role!=='owner'||!['all',...APP_CONFIG.branches.map(item=>item.id)].includes(next))return;
    confirmScopeChange(()=>{
      ownerBranch=next;state.branch=next;
      resetCheckoutScope();
      try{localStorage.setItem(APP_CONFIG.branchPreferenceKey,next);}catch{}
      render();
    });
  };
};
function contextualTabs() {
  if(!catalogViews.includes(state.page))return '';
  return '<div class="context-tabs" role="tablist" aria-label="Products and inventory views">'+
    catalogViews.map(page=>
      '<button id="tab-'+page+'" role="tab" aria-selected="'+(state.page===page)+'" aria-controls="workspace-panel" tabindex="'+(state.page===page?0:-1)+'" data-tab="'+page+'">'+APP_CONFIG.pages[page]+'</button>'
    ).join('')+'</div>';
}
function ownerOnlyPage() {
  return title('Owner preview required','Use the Owner role simulation to review financial analytics.')+noReal;
}
settings = function() {
  const owner=state.role==='owner';
  return title('Settings',owner?'Company settings and access overview.':'Assigned-branch access overview.')+
    section(owner?'Company configuration':'Assigned workspace',
      table(['Setting','Demo value'],[
        ['Brand',APP_CONFIG.brand],['Business',APP_CONFIG.businessType],
        ['Branch scope',branchLabel(curBranch())],
        ...(owner?[
          ['Branches',APP_CONFIG.branches.map(branch=>branch.name).join(' / ')],
          ['Currency',APP_CONFIG.currency],['Timezone',APP_CONFIG.timezone],
          ['Financial administration','Owner preview only']
        ]:[['Assigned branch',branchLabel(assignedBranch)],['Access','Operational modules within the assigned branch']])
      ]))+
    '<div class="note"><strong>Browser-only role simulation</strong><br>The header role selector previews Owner and Manager access to public sample data. Production authentication and server-enforced branch permissions belong to the approved backend phases.</div>'+
    (owner?'<p class="settings-pending">Company editing, manager accounts and financial/security administration are planned for their designated phases.</p>':'')+noReal;
};
function marketingPage() {
  return title('Marketing','Prepare an offer message for the selected branch.',
    '<button class="btn primary" data-action="offer">Create offer message</button>')+
    section('Offer text','<p class="subtitle">The existing demo copies your message to the clipboard. Recipient selection, WhatsApp sharing and SMS delivery are planned for Phase 8.</p>')+noReal;
}
function reportsPage() {
  return monthlyOverview().replace('<h1>Monthly overview</h1>','<h1>Reports</h1>');
}
render = function() {
  controls();
  if(!canAccessPage(state.page))state.page='overview';
  nav();
  const item=navigationItem();
  const group=APP_CONFIG.navigation.find(group=>group.items.includes(item));
  $('#crumb').textContent=item?.label===APP_CONFIG.pages[state.page] ? group.label : (item?.label||'Workspace');
  $('#crumb2').textContent=APP_CONFIG.pages[state.page]||'Dashboard';
  const pages={overview,monthly:monthlyOverview,pos,products:productsPage,categories:categoryPage,inventory,lowstock:catalogPage,deadstock:deadPage,defective:damagePage,damage:damagePage,adjustments:adjustmentPage,purchases,transfers,expenses,finance:reportsPage,customers,marketing:marketingPage,settings};
  if(!pages[state.page])state.page='overview';
  const tabs=contextualTabs();
  $('#content').innerHTML=tabs+'<div id="workspace-panel" '+(tabs?'role="tabpanel" aria-labelledby="tab-'+state.page+'"':'')+'>'+pages[state.page]()+'</div>';
  bind();
  document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>navigate(button.dataset.go));
  document.querySelectorAll('[data-tab]').forEach(button=>{
    button.onclick=()=>navigate(button.dataset.tab);
    button.onkeydown=event=>{
      const order=catalogViews;
      let index=order.indexOf(state.page);
      if(event.key==='ArrowRight')index=(index+1)%order.length;
      else if(event.key==='ArrowLeft')index=(index+order.length-1)%order.length;
      else if(event.key==='Home')index=0;
      else if(event.key==='End')index=order.length-1;
      else return;
      event.preventDefault();navigate(order[index]);$('#tab-'+order[index]).focus();
    };
  });
  if(state.role!=='owner')document.querySelectorAll('[data-action="report"]').forEach(button=>button.remove());
  if(mobileNavigation.matches&&!drawerOpen)$('#sidebar').inert=true;
};
// Protect an edited SKU when navigating from its detail dialog to labels/details.
$('#modal-root').addEventListener('click',event=>{
  const button=event.target.closest('[data-label],[data-detail]');
  const edit=event.target.closest('[data-edit-product]');
  if(edit&&modalIsDirty()){event.preventDefault();event.stopImmediatePropagation();requestModalClose(()=>productForm(Number(edit.dataset.editProduct)));return;}
  if(!button||!modalIsDirty())return;
  event.preventDefault();event.stopImmediatePropagation();
  const id=Number(button.dataset.label||button.dataset.detail);
  requestModalClose(()=>button.dataset.label?labels(id):showDetail(id));
},true);
$('#nav-toggle').onclick=openNavigation;
$('#nav-close').onclick=()=>closeNavigation();
$('#nav-backdrop').onclick=()=>closeNavigation();
mobileNavigation.addEventListener('change',()=>closeNavigation(false));
document.addEventListener('keydown',event=>{
  if(!drawerOpen)return;
  if(event.key==='Escape'){event.preventDefault();closeNavigation();return;}
  if(event.key==='Tab'){
    const items=[...$('#sidebar').querySelectorAll('button')].filter(button=>button.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
document.title=APP_CONFIG.brand+' — '+APP_CONFIG.businessType+' POS Demo '+APP_CONFIG.release;
document.querySelectorAll('[data-brand]').forEach(element=>element.textContent=APP_CONFIG.brand);
document.querySelectorAll('[data-business]').forEach(element=>element.textContent=APP_CONFIG.businessType);
document.querySelectorAll('[data-brand-initial]').forEach(element=>element.textContent=APP_CONFIG.brand[0]);
render();
closeNavigation(false);
