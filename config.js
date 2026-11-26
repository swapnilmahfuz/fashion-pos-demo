// Shared identity and shell configuration for the public sample-data demo.
const APP_CONFIG = Object.freeze({
  brand: 'QAHAF',
  businessType: 'Men’s Fashion',
  locale: 'en-BD',
  timezone: 'Asia/Dhaka',
  currency: 'BDT',
  release: 'Phase 3',
  branchPreferenceKey: 'qahaf-owner-branch',
  managerBranch: '1',
  lowStockThreshold: 5,
  branches: Object.freeze([
    Object.freeze({ id: '1', name: 'New Market' }),
    Object.freeze({ id: '2', name: 'Dakbangla' })
  ]),
  pages: Object.freeze({
    overview: 'Dashboard', monthly: 'Monthly Overview', pos: 'POS & Sales',
    inventory: 'Stock Report', products: 'All Products', categories: 'Categories',
    lowstock: 'Low Stock', deadstock: 'Dead Stock', defective: 'Defective Stock',
    purchases: 'Purchases', transfers: 'Stock Transfers', expenses: 'Expenses',
    customers: 'Contacts', finance: 'Reports', marketing: 'Marketing', settings: 'Settings'
  }),
  ownerPages: Object.freeze(['monthly', 'finance']),
  navigation: Object.freeze([
    { label: 'Overview', items: [
      { page: 'overview', label: 'Dashboard', icon: '▦' },
      { page: 'monthly', label: 'Monthly Overview', icon: '▦', owner: true }
    ] },
    { label: 'Operations', items: [
      { page: 'pos', label: 'POS & Sales', icon: '▣' },
      { page: 'inventory', pages: ['products', 'inventory', 'lowstock', 'deadstock', 'defective', 'categories'], label: 'Products & Inventory', icon: '◇' },
      { page: 'purchases', label: 'Purchases', icon: '▤' },
      { page: 'transfers', label: 'Stock Transfers', icon: '⇄' },
      { label: 'Damage & Dead Stock', icon: '▧', planned: 5 },
      { page: 'expenses', label: 'Expenses', icon: '▧' },
      { label: 'Funds & Accounts', icon: '▨', planned: 6, owner: true }
    ] },
    { label: 'Relationships', items: [
      { page: 'customers', label: 'Contacts', icon: '♧' },
      { page: 'marketing', label: 'Marketing', icon: '↗' }
    ] },
    { label: 'Administration', items: [
      { page: 'finance', label: 'Reports', icon: '▥', owner: true },
      { page: 'settings', label: 'Settings', icon: '⚙︎' }
    ] }
  ])
});
const branchName = id => APP_CONFIG.branches.find(branch => branch.id === String(id))?.name || 'Combined';
const branchOptions = (selected, combined = false) =>
  (combined ? [{ id: 'all', name: 'Combined' }, ...APP_CONFIG.branches] : APP_CONFIG.branches)
    .map(branch => '<option value="'+branch.id+'" '+(String(selected)===branch.id?'selected':'')+'>'+branch.name+'</option>').join('');
