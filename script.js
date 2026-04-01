/* ═══════════════════════════════════════
   DATA LAYER
═══════════════════════════════════════ */
const DB = {
  get(key, def=[]) {
    try { return JSON.parse(localStorage.getItem('bl_'+key)) ?? def; } catch { return def; }
  },
  set(key, val) { localStorage.setItem('bl_'+key, JSON.stringify(val)); },
  id() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
};

// Seed demo data if empty
function seedIfEmpty() {
  if (DB.get('seeded', false)) return;
  DB.set('products', [
    { id: DB.id(), name: 'Product A', price: 500, gstRate: 18, stock: 50 },
    { id: DB.id(), name: 'Product B', price: 1200, gstRate: 12, stock: 30 },
    { id: DB.id(), name: 'Product C', price: 250, gstRate: 5, stock: 100 },
    { id: DB.id(), name: 'Service X', price: 3000, gstRate: 18, stock: 999 },
  ]);
  DB.set('sales', [
    { id: DB.id(), items: [{name:'Product A',qty:2,price:500,gstRate:18,itemTotal:1000,itemGST:180}], total:1000, gst:180, finalTotal:1180, date: new Date(Date.now()-86400000*2).toISOString(), customer: 'Walk-in' },
    { id: DB.id(), items: [{name:'Product B',qty:1,price:1200,gstRate:12,itemTotal:1200,itemGST:144}], total:1200, gst:144, finalTotal:1344, date: new Date(Date.now()-86400000).toISOString(), customer: 'Walk-in' },
  ]);
  DB.set('expenses', [
    { id: DB.id(), name: 'Office Rent', amount: 5000, date: new Date().toISOString().split('T')[0], category: 'Rent' },
    { id: DB.id(), name: 'Electricity', amount: 1200, date: new Date().toISOString().split('T')[0], category: 'Utilities' },
  ]);
  DB.set('customers', [
    { id: DB.id(), name: 'Rahul Sharma', phone: '9876543210', pendingAmount: 2500, city: 'Delhi' },
    { id: DB.id(), name: 'Priya Singh', phone: '9988776655', pendingAmount: 0, city: 'Mumbai' },
  ]);
  DB.set('suppliers', [
    { id: DB.id(), name: 'ABC Traders', phone: '9111222333', pendingAmount: 8000, city: 'Jaipur' },
  ]);
  DB.set('inputGST', 0);
  DB.set('businessName', 'ChitRagupt Business');
  DB.set('gstNumber', 'GSTIN12345678');
  DB.set('seeded', true);
}

/* ═══════════════════════════════════════
   CALCULATIONS
═══════════════════════════════════════ */
const Calc = {
  sales() { return DB.get('sales'); },
  expenses() { return DB.get('expenses'); },
  products() { return DB.get('products'); },

  totalSales() { return this.sales().reduce((s,x)=>s+x.finalTotal,0); },
  totalGSTCollected() { return this.sales().reduce((s,x)=>s+x.gst,0); },
  totalOrders() { return this.sales().length; },
  totalExpenses() { return this.expenses().reduce((s,x)=>s+x.amount,0); },
  profit() { return this.totalSales() - this.totalExpenses(); },
  inventoryValue() { return this.products().reduce((s,p)=>s+p.price*p.stock,0); },
  totalReceivable() { return DB.get('customers',[]).reduce((s,c)=>s+c.pendingAmount,0); },
  cashBalance() { return this.totalSales() - this.totalExpenses(); },
  netGST() { return this.totalGSTCollected() - (DB.get('inputGST',0)||0); },
  netWorth() {
    const assets = this.cashBalance() + this.inventoryValue() + this.totalReceivable() + (DB.get('inputGST',0)||0);
    const liabilities = this.totalGSTCollected();
    return assets - liabilities;
  }
};

/* ═══════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════ */
const fmt = n => '₹' + (+n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = d => new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const fmtShort = d => new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});

function toast(msg, type='success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(()=>t.remove(), 3000);
}

function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
document.getElementById('modal-overlay').addEventListener('click', e => {
  if(e.target === document.getElementById('modal-overlay')) closeModal();
});

function printSection(id, title) {
  const el = document.getElementById(id);
  if (!el) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>body{font-family:sans-serif;padding:20px;color:#111}table{width:100%;border-collapse:collapse}
  th,td{padding:8px 12px;border:1px solid #ddd;font-size:13px}th{background:#f5f5f5}
  h2{margin-bottom:16px}.total{font-weight:bold;font-size:16px}</style></head><body>
  <h2>${DB.get('businessName','My Business')} — ${title}</h2>${el.innerHTML}</body></html>`);
  w.document.close(); w.print();
}

function downloadPDF(id, title) {
  const el = document.getElementById(id);
  if (!el) return;
  const opt = { margin: 10, filename: title.replace(/\s+/g,'_')+'.pdf', html2canvas:{scale:2}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} };
  html2pdf().set(opt).from(el).save();
}

/* ═══════════════════════════════════════
   ROUTER
═══════════════════════════════════════ */
const pages = {};
let currentPage = 'dashboard';
let activeCharts = [];

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n=>{
    n.classList.toggle('active', n.dataset.page === page);
  });
  activeCharts.forEach(c => { try { c.destroy(); } catch{} });
  activeCharts = [];
  const titles = {
    dashboard:'Overview Dashboard', pos:'POS / Billing', inventory:'Inventory Management',
    sales:'Sales Analytics', expenses:'Expenses Management', pl:'Profit & Loss',
    balance:'Balance Sheet', gst:'GST Dashboard', cashbook:'Bank / Cash Book',
    customers:'Customers', suppliers:'Suppliers', reports:'Reports', settings:'Settings',
    manual:'User Manual & System Description'
  };
  document.getElementById('page-title').textContent = titles[page] || page;
  document.getElementById('topbar-actions').innerHTML = '';
  document.getElementById('content').innerHTML = '';
  if (pages[page]) pages[page]();
}

document.querySelectorAll('.nav-item').forEach(n=>{
  n.addEventListener('click', ()=>navigate(n.dataset.page));
});

/* ═══════════════════════════════════════
   PAGE: DASHBOARD
═══════════════════════════════════════ */
pages.dashboard = function() {
  const sales = Calc.totalSales(), exp = Calc.totalExpenses(), profit = Calc.profit();
  const orders = Calc.totalOrders(), gst = Calc.totalGSTCollected(), inv = Calc.inventoryValue();

  // Last 7 days sales for chart
  const last7 = [];
  for(let i=6;i>=0;i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = d.toISOString().split('T')[0];
    const dayTotal = DB.get('sales').filter(s=>s.date.startsWith(ds)).reduce((a,s)=>a+s.finalTotal,0);
    last7.push({ label: fmtShort(d), val: dayTotal });
  }
  const recentSales = DB.get('sales').slice(-5).reverse();
  const lowStock = DB.get('products').filter(p=>p.stock < 20).slice(0,5);

  const el = document.getElementById('content');
  el.innerHTML = `
  <div class="stats-grid">
    <div class="stat-card green">
      <div class="stat-icon">💰</div>
      <div class="stat-label">Total Sales</div>
      <div class="stat-val" style="color:#1a7a4a">${fmt(sales)}</div>
      <div class="stat-sub">${orders} orders</div>
    </div>
    <div class="stat-card red">
      <div class="stat-icon">💸</div>
      <div class="stat-label">Total Expenses</div>
      <div class="stat-val" style="color:var(--red)">${fmt(exp)}</div>
      <div class="stat-sub">${DB.get('expenses').length} entries</div>
    </div>
    <div class="stat-card ${profit>=0?'accent':'orange'}">
      <div class="stat-icon">📊</div>
      <div class="stat-label">Net Profit</div>
      <div class="stat-val ${profit>=0?'hl-accent':'hl-red'}">${fmt(profit)}</div>
      <div class="stat-sub">${profit>=0?'Profitable':'Loss making'}</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-icon">🧮</div>
      <div class="stat-label">GST Collected</div>
      <div class="stat-val" style="color:var(--royal-blue)">${fmt(gst)}</div>
      <div class="stat-sub">Output GST</div>
    </div>
    <div class="stat-card purple">
      <div class="stat-icon">📦</div>
      <div class="stat-label">Inventory Value</div>
      <div class="stat-val" style="color:var(--purple)">${fmt(inv)}</div>
      <div class="stat-sub">${DB.get('products').length} products</div>
    </div>
    <div class="stat-card pink">
      <div class="stat-icon">👥</div>
      <div class="stat-label">Receivables</div>
      <div class="stat-val" style="color:var(--accent3)">${fmt(Calc.totalReceivable())}</div>
      <div class="stat-sub">${DB.get('customers').length} customers</div>
    </div>
  </div>
  <div class="grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-title">📈 Sales — Last 7 Days</div>
      <div class="chart-container"><canvas id="salesChart"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">🥧 Revenue Breakdown</div>
      <div class="chart-container"><canvas id="breakChart"></canvas></div>
    </div>
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">🧾 Recent Bills</div>
      ${recentSales.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Items</th><th>Amount</th></tr></thead>
        <tbody>${recentSales.map(s=>`<tr>
          <td>${fmtDate(s.date)}</td>
          <td>${s.items.length} item(s)</td>
          <td class="mono hl-green">${fmt(s.finalTotal)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty"><div class="empty-icon">🧾</div><div class="empty-text">No bills yet</div></div>`}
    </div>
    <div class="card">
      <div class="card-title">⚠️ Low Stock Alert</div>
      ${lowStock.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Stock</th><th>Value</th></tr></thead>
        <tbody>${lowStock.map(p=>`<tr>
          <td>${p.name}</td>
          <td><span class="badge ${p.stock<=5?'badge-red':'badge-yellow'}">${p.stock} units</span></td>
          <td class="mono">${fmt(p.price*p.stock)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">All stock healthy</div></div>`}
    </div>
  </div>`;

  // Charts
  const sCtx = document.getElementById('salesChart').getContext('2d');
  const sc = new Chart(sCtx, {
    type:'bar',
    data: { labels: last7.map(d=>d.label), datasets:[{ data: last7.map(d=>d.val), backgroundColor:'rgba(110,231,183,0.3)', borderColor:'#203C74', borderWidth:1.5, borderRadius:4 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(32,60,116,0.08)'},ticks:{color:'#7a8fb5',font:{size:10}}}, y:{grid:{color:'rgba(32,60,116,0.08)'},ticks:{color:'#7a8fb5',font:{size:10},callback:v=>'₹'+v.toLocaleString('en-IN')}} }, responsive:true, maintainAspectRatio:false }
  });
  const bCtx = document.getElementById('breakChart').getContext('2d');
  const bc = new Chart(bCtx, {
    type:'doughnut',
    data:{ labels:['Sales (ex-GST)','GST Collected','Expenses'],
      datasets:[{ data:[sales-gst, gst, exp], backgroundColor:['rgba(110,231,183,0.7)','rgba(56,189,248,0.7)','rgba(248,113,113,0.7)'], borderWidth:0 }] },
    options:{ plugins:{ legend:{ labels:{ color:'#3d5080', font:{size:11} } } }, responsive:true, maintainAspectRatio:false, cutout:'65%' }
  });
  activeCharts.push(sc, bc);
};

/* ═══════════════════════════════════════
   PAGE: POS / BILLING
═══════════════════════════════════════ */
let cart = [];

pages.pos = function() {
  const products = DB.get('products');
  const customers = DB.get('customers');

  document.getElementById('content').innerHTML = `
  <div class="pos-layout">
    <div class="pos-left">
      <div class="form-row" style="margin-bottom:14px">
        <div class="form-group">
          <label>Search Product</label>
          <input id="pos-search" placeholder="Type to filter…" oninput="renderProductGrid()">
        </div>
        <div class="form-group">
          <label>Customer</label>
          <select id="pos-customer">
            <option value="Walk-in">Walk-in</option>
            ${customers.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Payment Mode</label>
          <select id="pos-payment">
            <option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option>
          </select>
        </div>
      </div>
      <div id="product-grid" class="product-grid"></div>
    </div>
    <div class="pos-right">
      <div class="pos-header">
        <div style="font-family:var(--font-head);font-weight:700;font-size:15px">🧾 Current Bill</div>
        <div id="pos-bill-no" style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:2px">Bill #${Date.now().toString().slice(-6)}</div>
      </div>
      <div class="pos-items" id="pos-cart"></div>
      <div class="pos-summary">
        <div class="pos-summary-row"><span>Subtotal</span><span id="pos-subtotal" class="mono">₹0.00</span></div>
        <div class="pos-summary-row"><span>GST</span><span id="pos-gst" class="mono hl-blue">₹0.00</span></div>
        <div class="pos-summary-row">
          <span>Discount</span>
          <input id="pos-discount" type="number" min="0" placeholder="0" style="width:70px;text-align:right;padding:4px 8px;font-size:13px" oninput="updateCartSummary()">
        </div>
        <div class="pos-summary-total">
          <span>TOTAL</span>
          <span id="pos-total">₹0.00</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-secondary" style="flex:1" onclick="clearCart()">🗑 Clear</button>
          <button class="btn btn-primary" style="flex:2" onclick="completeSale()">✅ Charge & Print</button>
        </div>
      </div>
    </div>
  </div>`;

  renderProductGrid();
  renderCart();
};

window.renderProductGrid = function() {
  const q = document.getElementById('pos-search')?.value?.toLowerCase() || '';
  const products = DB.get('products').filter(p => p.name.toLowerCase().includes(q));
  const el = document.getElementById('product-grid');
  if (!el) return;
  el.innerHTML = products.map(p=>`
    <div class="product-tile" onclick="addToCart('${p.id}')">
      <div class="p-name">${p.name}</div>
      <div class="p-price">${fmt(p.price)}</div>
      <div class="p-gst">GST: ${p.gstRate}%</div>
      <div class="p-stock ${p.stock<10?'hl-red':''}">${p.stock} in stock</div>
    </div>
  `).join('') || '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">No products found</div></div>';
};

window.addToCart = function(id) {
  const p = DB.get('products').find(x=>x.id===id);
  if (!p) return;
  if (p.stock <= 0) { toast('Out of stock!', 'error'); return; }
  const ex = cart.find(x=>x.id===id);
  if (ex) {
    if (ex.qty >= p.stock) { toast('Max stock reached!', 'error'); return; }
    ex.qty++;
  } else { cart.push({id,name:p.name,price:p.price,gstRate:p.gstRate,qty:1,stock:p.stock}); }
  renderCart();
};

window.removeFromCart = function(id) { cart = cart.filter(x=>x.id!==id); renderCart(); };

window.updateQty = function(id, delta) {
  const item = cart.find(x=>x.id===id);
  if (!item) return;
  item.qty = Math.max(1, Math.min(item.stock, item.qty + delta));
  renderCart();
};

window.renderCart = function() {
  const el = document.getElementById('pos-cart');
  if (!el) return;
  if (!cart.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🛒</div><div class="empty-text">Add products to bill</div></div>'; updateCartSummary(); return; }
  el.innerHTML = cart.map(item=>{
    const it = item.price * item.qty;
    const ig = (it * item.gstRate) / 100;
    return `<div class="pos-item-row">
      <div class="pos-item-name"><div>${item.name}</div><div style="font-size:11px;color:var(--text3)">GST ${item.gstRate}% → ${fmt(ig)}</div></div>
      <button class="btn btn-sm btn-secondary" onclick="updateQty('${item.id}',-1)" style="padding:3px 8px">−</button>
      <span class="mono" style="min-width:28px;text-align:center">${item.qty}</span>
      <button class="btn btn-sm btn-secondary" onclick="updateQty('${item.id}',1)" style="padding:3px 8px">+</button>
      <span class="pos-item-price">${fmt(it+ig)}</span>
      <button onclick="removeFromCart('${item.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px">✕</button>
    </div>`;
  }).join('');
  updateCartSummary();
};

window.updateCartSummary = function() {
  let sub=0, gstAmt=0;
  cart.forEach(item=>{ const it=item.price*item.qty; sub+=it; gstAmt+=(it*item.gstRate)/100; });
  const disc = parseFloat(document.getElementById('pos-discount')?.value||0)||0;
  const total = sub + gstAmt - disc;
  const se = document.getElementById('pos-subtotal'), ge=document.getElementById('pos-gst'), te=document.getElementById('pos-total');
  if(se) se.textContent = fmt(sub);
  if(ge) ge.textContent = fmt(gstAmt);
  if(te) te.textContent = fmt(total);
};

window.clearCart = function() { cart = []; renderCart(); };

window.completeSale = function() {
  if (!cart.length) { toast('Cart is empty!', 'error'); return; }
  let sub=0, gstAmt=0;
  const items = cart.map(item=>{
    const it=item.price*item.qty; const ig=(it*item.gstRate)/100;
    sub+=it; gstAmt+=ig;
    return {name:item.name,qty:item.qty,price:item.price,gstRate:item.gstRate,itemTotal:it,itemGST:ig};
  });
  const disc = parseFloat(document.getElementById('pos-discount')?.value||0)||0;
  const finalTotal = sub + gstAmt - disc;
  const custId = document.getElementById('pos-customer')?.value || 'Walk-in';
  const payment = document.getElementById('pos-payment')?.value || 'Cash';
  const sale = { id:DB.id(), items, total:sub, gst:gstAmt, discount:disc, finalTotal, date:new Date().toISOString(), customer: custId, payment };

  // Save sale
  const sales = DB.get('sales'); sales.push(sale); DB.set('sales', sales);

  // Deduct stock
  const products = DB.get('products');
  cart.forEach(ci=>{ const p=products.find(x=>x.id===ci.id); if(p) p.stock=Math.max(0,p.stock-ci.qty); });
  DB.set('products', products);

  // Credit customer if Credit payment
  if (payment === 'Credit' && custId !== 'Walk-in') {
    const customers = DB.get('customers');
    const c = customers.find(x=>x.id===custId);
    if(c) { c.pendingAmount = (c.pendingAmount||0) + finalTotal; DB.set('customers', customers); }
  }

  showInvoice(sale);
  cart = [];
  renderCart();
  renderProductGrid();
  toast('Sale completed!');
};

function showInvoice(sale) {
  const biz = DB.get('businessName','My Business');
  const gstNo = DB.get('gstNumber','N/A');
  openModal(`
    <div id="invoice-content">
      <div style="text-align:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
        <div style="font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--royal-blue)">${biz}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">GSTIN: ${gstNo}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">TAX INVOICE</div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:14px;font-size:12px;color:var(--text2)">
        <div>Bill #: <span class="mono">${sale.id.slice(-8).toUpperCase()}</span></div>
        <div>Date: ${fmtDate(sale.date)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:6px 4px;color:var(--text3)">Item</th>
          <th style="text-align:right;padding:6px 4px;color:var(--text3)">Qty</th>
          <th style="text-align:right;padding:6px 4px;color:var(--text3)">Price</th>
          <th style="text-align:right;padding:6px 4px;color:var(--text3)">GST</th>
          <th style="text-align:right;padding:6px 4px;color:var(--text3)">Total</th>
        </tr></thead>
        <tbody>${sale.items.map(i=>`<tr style="border-bottom:1px solid rgba(32,60,116,0.08)">
          <td style="padding:7px 4px">${i.name}</td>
          <td style="padding:7px 4px;text-align:right">${i.qty}</td>
          <td style="padding:7px 4px;text-align:right;font-family:var(--font-mono)">${fmt(i.price)}</td>
          <td style="padding:7px 4px;text-align:right;font-family:var(--font-mono)">${i.gstRate}%</td>
          <td style="padding:7px 4px;text-align:right;font-family:var(--font-mono)">${fmt(i.itemTotal+i.itemGST)}</td>
        </tr>`).join('')}</tbody>
      </table>
      <div style="border-top:1px solid var(--border);padding-top:10px">
        <div style="display:flex;justify-content:space-between;color:var(--text2);font-size:12px;margin-bottom:4px"><span>Subtotal</span><span>${fmt(sale.total)}</span></div>
        <div style="display:flex;justify-content:space-between;color:var(--accent2);font-size:12px;margin-bottom:4px"><span>GST</span><span>${fmt(sale.gst)}</span></div>
        ${sale.discount?`<div style="display:flex;justify-content:space-between;color:var(--red);font-size:12px;margin-bottom:4px"><span>Discount</span><span>-${fmt(sale.discount)}</span></div>`:''}
        <div style="display:flex;justify-content:space-between;font-family:var(--font-head);font-size:16px;font-weight:700;color:var(--royal-blue);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><span>TOTAL</span><span>${fmt(sale.finalTotal)}</span></div>
      </div>
      <div style="text-align:center;margin-top:16px;font-size:11px;color:var(--text3)">Payment: ${sale.payment} | Thank you for your business!</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-blue" onclick="printInvoice('${sale.id}')">🖨 Print</button>
      <button class="btn btn-primary" onclick="downloadInvoicePDF('${sale.id}')">⬇ PDF</button>
    </div>
  `);
};

window.printInvoice = function() {
  const el = document.getElementById('invoice-content');
  if (!el) return;
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Invoice</title><style>body{font-family:sans-serif;padding:20px;max-width:400px;margin:auto}table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #eee}th{text-align:left;font-size:12px;color:#666}.total{font-weight:bold;font-size:16px}</style></head><body>${el.innerHTML}</body></html>`);
  w.document.close(); w.print();
};

window.downloadInvoicePDF = function() {
  const el = document.getElementById('invoice-content');
  if (!el) return;
  html2pdf().set({ margin:10, filename:'invoice.pdf', html2canvas:{scale:2}, jsPDF:{unit:'mm',format:'a4'} }).from(el).save();
};

/* ═══════════════════════════════════════
   PAGE: INVENTORY
═══════════════════════════════════════ */
pages.inventory = function() {
  const products = DB.get('products');

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-secondary" onclick="printSection('inv-table','Inventory')">🖨 Print</button>
    <button class="btn btn-primary" onclick="showAddProduct()">+ Add Product</button>`;

  document.getElementById('content').innerHTML = `
  <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
    <div class="stat-card blue"><div class="stat-label">Total Products</div><div class="stat-val hl-blue">${products.length}</div></div>
    <div class="stat-card green"><div class="stat-label">Inventory Value</div><div class="stat-val hl-green">${fmt(Calc.inventoryValue())}</div></div>
    <div class="stat-card orange"><div class="stat-label">Low Stock (< 20)</div><div class="stat-val" style="color:var(--accent4)">${products.filter(p=>p.stock<20).length}</div></div>
    <div class="stat-card red"><div class="stat-label">Out of Stock</div><div class="stat-val hl-red">${products.filter(p=>p.stock===0).length}</div></div>
  </div>
  <div class="card">
    <div class="card-title">📦 Product Inventory</div>
    <div class="table-wrap" id="inv-table">
      <table>
        <thead><tr><th>#</th><th>Product Name</th><th>Price</th><th>GST Rate</th><th>Stock</th><th>Stock Value</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${products.map((p,i)=>`<tr>
          <td class="mono" style="color:var(--text3)">${i+1}</td>
          <td><b>${p.name}</b></td>
          <td class="mono">${fmt(p.price)}</td>
          <td><span class="gst-rate-tag">${p.gstRate}%</span></td>
          <td class="mono ${p.stock===0?'hl-red':p.stock<20?'hl-yellow':''}">${p.stock}</td>
          <td class="mono">${fmt(p.price*p.stock)}</td>
          <td><span class="badge ${p.stock===0?'badge-red':p.stock<20?'badge-yellow':'badge-green'}">${p.stock===0?'Out of Stock':p.stock<20?'Low Stock':'In Stock'}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="stockAdjust('${p.id}')">± Adjust</button>
            <button class="btn btn-sm btn-secondary" onclick="editProduct('${p.id}')" style="margin-left:4px">✏</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')" style="margin-left:4px">🗑</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="8"><div class="empty"><div class="empty-icon">📦</div><div class="empty-text">No products added yet</div></div></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
};

window.showAddProduct = function(existing=null) {
  openModal(`
    <div class="modal-title">${existing?'Edit':'Add'} Product</div>
    <div class="form-row"><div class="form-group"><label>Product Name</label><input id="p-name" value="${existing?.name||''}" placeholder="e.g. Product A"></div></div>
    <div class="form-row">
      <div class="form-group"><label>Price (₹)</label><input id="p-price" type="number" value="${existing?.price||''}" placeholder="0.00"></div>
      <div class="form-group"><label>GST Rate (%)</label>
        <select id="p-gst">${[0,5,12,18,28].map(r=>`<option value="${r}" ${existing?.gstRate==r?'selected':''}>${r}%</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Stock (qty)</label><input id="p-stock" type="number" value="${existing?.stock||0}" placeholder="0"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveProduct('${existing?.id||''}')">Save Product</button>
    </div>`);
};

window.saveProduct = function(id) {
  const name = document.getElementById('p-name').value.trim();
  const price = parseFloat(document.getElementById('p-price').value)||0;
  const gstRate = parseInt(document.getElementById('p-gst').value)||0;
  const stock = parseInt(document.getElementById('p-stock').value)||0;
  if (!name) { toast('Product name required', 'error'); return; }
  const products = DB.get('products');
  if (id) {
    const p = products.find(x=>x.id===id);
    if(p) { p.name=name; p.price=price; p.gstRate=gstRate; p.stock=stock; }
  } else {
    products.push({id:DB.id(), name, price, gstRate, stock});
  }
  DB.set('products', products);
  closeModal(); navigate('inventory');
  toast(id ? 'Product updated!' : 'Product added!');
};

window.editProduct = function(id) {
  const p = DB.get('products').find(x=>x.id===id);
  if(p) showAddProduct(p);
};

window.deleteProduct = function(id) {
  if(!confirm('Delete this product?')) return;
  DB.set('products', DB.get('products').filter(x=>x.id!==id));
  navigate('inventory'); toast('Product deleted');
};

window.stockAdjust = function(id) {
  const p = DB.get('products').find(x=>x.id===id);
  if(!p) return;
  openModal(`
    <div class="modal-title">Stock Adjustment — ${p.name}</div>
    <div style="margin-bottom:14px;color:var(--text2)">Current Stock: <b class="hl-accent">${p.stock}</b></div>
    <div class="form-row">
      <div class="form-group"><label>Type</label><select id="adj-type"><option>Add (Purchase)</option><option>Remove (Write-off)</option></select></div>
      <div class="form-group"><label>Quantity</label><input id="adj-qty" type="number" min="1" value="1"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="doStockAdj('${id}')">Apply</button>
    </div>`);
};

window.doStockAdj = function(id) {
  const qty = parseInt(document.getElementById('adj-qty').value)||0;
  const type = document.getElementById('adj-type').value;
  const products = DB.get('products');
  const p = products.find(x=>x.id===id);
  if(!p) return;
  if(type.includes('Add')) p.stock += qty; else p.stock = Math.max(0, p.stock-qty);
  DB.set('products', products);
  closeModal(); navigate('inventory');
  toast(`Stock ${type.includes('Add')?'added':'removed'}: ${qty} units`);
};

/* ═══════════════════════════════════════
   PAGE: SALES ANALYTICS
═══════════════════════════════════════ */
pages.sales = function() {
  const sales = DB.get('sales');
  const totalSales = Calc.totalSales();
  const totalGST = Calc.totalGSTCollected();
  const orders = Calc.totalOrders();
  const avg = orders ? totalSales/orders : 0;

  // Monthly grouping
  const monthly = {};
  sales.forEach(s => {
    const m = s.date.slice(0,7);
    if(!monthly[m]) monthly[m] = {total:0,gst:0,count:0};
    monthly[m].total += s.finalTotal;
    monthly[m].gst += s.gst;
    monthly[m].count++;
  });
  const months = Object.keys(monthly).sort().slice(-6);

  document.getElementById('topbar-actions').innerHTML = `<button class="btn btn-secondary" onclick="printSection('sales-print','Sales Analytics')">🖨 Print</button>`;

  document.getElementById('content').innerHTML = `
  <div id="sales-print">
  <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
    <div class="stat-card green"><div class="stat-label">Total Revenue</div><div class="stat-val hl-green">${fmt(totalSales)}</div></div>
    <div class="stat-card blue"><div class="stat-label">GST Collected</div><div class="stat-val hl-blue">${fmt(totalGST)}</div></div>
    <div class="stat-card purple"><div class="stat-label">Total Orders</div><div class="stat-val" style="color:var(--purple)">${orders}</div></div>
    <div class="stat-card accent"><div class="stat-label">Avg Order Value</div><div class="stat-val hl-accent">${fmt(avg)}</div></div>
  </div>
  <div class="grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-title">📊 Monthly Revenue</div>
      <div class="chart-container"><canvas id="monthChart"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">📋 Monthly Summary</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Orders</th><th>Revenue</th><th>GST</th></tr></thead>
          <tbody>${months.map(m=>`<tr>
            <td class="mono">${m}</td>
            <td>${monthly[m].count}</td>
            <td class="mono hl-green">${fmt(monthly[m].total)}</td>
            <td class="mono hl-blue">${fmt(monthly[m].gst)}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="empty-text" style="padding:20px;text-align:center;color:var(--text3)">No data</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">🧾 All Bills</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Bill ID</th><th>Date</th><th>Customer</th><th>Items</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Payment</th></tr></thead>
        <tbody>${sales.slice().reverse().map(s=>`<tr>
          <td class="mono" style="color:var(--text3)">${s.id.slice(-8).toUpperCase()}</td>
          <td>${fmtDate(s.date)}</td>
          <td>${s.customer==='Walk-in'?s.customer:(DB.get('customers').find(c=>c.id===s.customer)?.name||'Unknown')}</td>
          <td>${s.items.length}</td>
          <td class="mono">${fmt(s.total)}</td>
          <td class="mono hl-blue">${fmt(s.gst)}</td>
          <td class="mono hl-green">${fmt(s.finalTotal)}</td>
          <td><span class="badge badge-blue">${s.payment||'Cash'}</span></td>
        </tr>`).join('') || '<tr><td colspan="8"><div class="empty"><div class="empty-icon">📈</div><div class="empty-text">No sales yet</div></div></td></tr>'}</tbody>
      </table>
    </div>
  </div>
  </div>`;

  const ctx = document.getElementById('monthChart').getContext('2d');
  const mc = new Chart(ctx, {
    type:'line',
    data:{ labels:months.map(m=>{ const [y,mo]=m.split('-'); return new Date(y,mo-1).toLocaleString('en-IN',{month:'short',year:'2-digit'}); }),
      datasets:[
        { label:'Revenue', data:months.map(m=>monthly[m].total), borderColor:'#203C74', backgroundColor:'rgba(110,231,183,0.1)', tension:0.4, fill:true },
        { label:'GST', data:months.map(m=>monthly[m].gst), borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,0.05)', tension:0.4 }
      ]},
    options:{ plugins:{legend:{labels:{color:'#3d5080',font:{size:11}}}}, scales:{ x:{grid:{color:'rgba(32,60,116,0.08)'},ticks:{color:'#7a8fb5'}}, y:{grid:{color:'rgba(32,60,116,0.08)'},ticks:{color:'#7a8fb5',callback:v=>'₹'+v.toLocaleString('en-IN')}} }, responsive:true, maintainAspectRatio:false }
  });
  activeCharts.push(mc);
};

/* ═══════════════════════════════════════
   PAGE: EXPENSES
═══════════════════════════════════════ */
pages.expenses = function() {
  const expenses = DB.get('expenses');
  const total = Calc.totalExpenses();
  const cats = {};
  expenses.forEach(e=>{ cats[e.category||'Other'] = (cats[e.category||'Other']||0) + e.amount; });

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-secondary" onclick="printSection('exp-print','Expenses')">🖨 Print</button>
    <button class="btn btn-primary" onclick="showAddExpense()">+ Add Expense</button>`;

  document.getElementById('content').innerHTML = `
  <div id="exp-print">
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card red"><div class="stat-label">Total Expenses</div><div class="stat-val hl-red">${fmt(total)}</div></div>
    <div class="stat-card orange"><div class="stat-label">No. of Entries</div><div class="stat-val" style="color:var(--accent4)">${expenses.length}</div></div>
    <div class="stat-card purple"><div class="stat-label">Categories</div><div class="stat-val" style="color:var(--purple)">${Object.keys(cats).length}</div></div>
  </div>
  <div class="grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-title">📂 By Category</div>
      ${Object.entries(cats).map(([k,v])=>`
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:13px"><span>${k}</span><span class="mono">${fmt(v)}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${total?Math.round(v/total*100):0}%;background:var(--accent4)"></div></div>
        </div>`).join('') || '<div class="empty" style="padding:20px"><div class="empty-text">No expenses</div></div>'}
    </div>
    <div class="card">
      <div class="card-title">🥧 Category Split</div>
      <div class="chart-container"><canvas id="expChart"></canvas></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">💸 Expense Entries</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Category</th><th>Date</th><th>Amount</th><th>Actions</th></tr></thead>
        <tbody>${expenses.slice().reverse().map((e,i)=>`<tr>
          <td class="mono" style="color:var(--text3)">${expenses.length-i}</td>
          <td>${e.name}</td>
          <td><span class="badge badge-yellow">${e.category||'Other'}</span></td>
          <td>${fmtDate(e.date)}</td>
          <td class="mono hl-red">${fmt(e.amount)}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deleteExpense('${e.id}')">🗑</button></td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="empty"><div class="empty-icon">💸</div><div class="empty-text">No expenses recorded</div></div></td></tr>'}</tbody>
      </table>
    </div>
  </div>
  </div>`;

  if(Object.keys(cats).length) {
    const ctx = document.getElementById('expChart').getContext('2d');
    const ec = new Chart(ctx, {
      type:'doughnut',
      data:{ labels:Object.keys(cats), datasets:[{ data:Object.values(cats), backgroundColor:['rgba(248,113,113,0.7)','rgba(251,191,36,0.7)','rgba(167,139,250,0.7)','rgba(56,189,248,0.7)','rgba(110,231,183,0.7)'], borderWidth:0 }] },
      options:{ plugins:{legend:{labels:{color:'#3d5080',font:{size:11}}}}, responsive:true, maintainAspectRatio:false, cutout:'60%' }
    });
    activeCharts.push(ec);
  }
};

window.showAddExpense = function() {
  openModal(`
    <div class="modal-title">Add Expense</div>
    <div class="form-row">
      <div class="form-group"><label>Description</label><input id="e-name" placeholder="e.g. Office Rent"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Category</label>
        <select id="e-cat"><option>Rent</option><option>Utilities</option><option>Salaries</option><option>Marketing</option><option>Travel</option><option>Supplies</option><option>Other</option></select>
      </div>
      <div class="form-group"><label>Amount (₹)</label><input id="e-amount" type="number" placeholder="0.00"></div>
      <div class="form-group"><label>Date</label><input id="e-date" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveExpense()">Add Expense</button>
    </div>`);
};

window.saveExpense = function() {
  const name = document.getElementById('e-name').value.trim();
  const amount = parseFloat(document.getElementById('e-amount').value)||0;
  const category = document.getElementById('e-cat').value;
  const date = document.getElementById('e-date').value;
  if(!name || !amount) { toast('Fill all fields', 'error'); return; }
  const exp = DB.get('expenses');
  exp.push({id:DB.id(), name, amount, category, date});
  DB.set('expenses', exp);
  closeModal(); navigate('expenses');
  toast('Expense added!');
};

window.deleteExpense = function(id) {
  if(!confirm('Delete this expense?')) return;
  DB.set('expenses', DB.get('expenses').filter(x=>x.id!==id));
  navigate('expenses'); toast('Expense deleted');
};

/* ═══════════════════════════════════════
   PAGE: PROFIT & LOSS
═══════════════════════════════════════ */
pages.pl = function() {
  const sales = Calc.totalSales(), gst = Calc.totalGSTCollected();
  const netSales = sales - gst;
  const exp = Calc.totalExpenses();
  const profit = netSales - exp;

  // Expense breakdown
  const expenses = DB.get('expenses');
  const cats = {};
  expenses.forEach(e=>{ cats[e.category||'Other']=(cats[e.category||'Other']||0)+e.amount; });

  document.getElementById('topbar-actions').innerHTML = `<button class="btn btn-secondary" onclick="printSection('pl-print','Profit & Loss')">🖨 Print</button>`;

  document.getElementById('content').innerHTML = `
  <div id="pl-print">
  <div style="text-align:center;margin-bottom:20px">
    <div style="font-family:var(--font-head);font-size:20px;font-weight:800">${DB.get('businessName','My Business')}</div>
    <div style="color:var(--text3);font-size:12px;font-family:var(--font-mono)">Profit & Loss Statement — All Time</div>
  </div>
  <div class="grid-2">
    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">💹 Income</div>
        <div class="pl-row"><span>Gross Sales</span><span class="mono hl-green">${fmt(sales)}</span></div>
        <div class="pl-row" style="color:var(--text3)"><span>Less: GST Output</span><span class="mono">- ${fmt(gst)}</span></div>
        <div class="pl-total"><span>Net Sales</span><span class="hl-green">${fmt(netSales)}</span></div>
      </div>
      <div class="card">
        <div class="card-title">💸 Expenses</div>
        ${Object.entries(cats).map(([k,v])=>`<div class="pl-row"><span>${k}</span><span class="mono hl-red">- ${fmt(v)}</span></div>`).join('')}
        <div class="pl-total"><span>Total Expenses</span><span class="hl-red">${fmt(exp)}</span></div>
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">⚖️ Summary</div>
        <div class="pl-row"><span>Net Sales</span><span class="mono hl-green">${fmt(netSales)}</span></div>
        <div class="pl-row"><span>Total Expenses</span><span class="mono hl-red">${fmt(exp)}</span></div>
        <div style="margin-top:16px;padding:20px;background:${profit>=0?'rgba(74,222,128,0.08)':'rgba(248,113,113,0.08)'};border:1px solid ${profit>=0?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)'};border-radius:var(--radius-lg);text-align:center">
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px;font-family:var(--font-mono)">${profit>=0?'NET PROFIT':'NET LOSS'}</div>
          <div style="font-family:var(--font-head);font-size:36px;font-weight:800;color:${profit>=0?'var(--green)':'var(--red)'}">${fmt(Math.abs(profit))}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:6px">Margin: ${netSales?((profit/netSales)*100).toFixed(1):0}%</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">📊 Revenue vs Expenses</div>
        <div class="chart-container"><canvas id="plChart"></canvas></div>
      </div>
    </div>
  </div>
  </div>`;

  const ctx = document.getElementById('plChart').getContext('2d');
  const pc = new Chart(ctx, {
    type:'bar',
    data:{ labels:['Revenue','GST','Expenses','Profit'],
      datasets:[{ data:[netSales, gst, exp, Math.abs(profit)], backgroundColor:['rgba(74,222,128,0.6)','rgba(56,189,248,0.6)','rgba(248,113,113,0.6)',profit>=0?'rgba(110,231,183,0.6)':'rgba(248,113,113,0.6)'], borderRadius:6 }]},
    options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(32,60,116,0.08)'},ticks:{color:'#7a8fb5'}}, y:{grid:{color:'rgba(32,60,116,0.08)'},ticks:{color:'#7a8fb5',callback:v=>'₹'+v.toLocaleString('en-IN')}} }, responsive:true, maintainAspectRatio:false }
  });
  activeCharts.push(pc);
};

/* ═══════════════════════════════════════
   PAGE: BALANCE SHEET
═══════════════════════════════════════ */
pages.balance = function() {
  const cash = Calc.cashBalance();
  const invVal = Calc.inventoryValue();
  const receivable = Calc.totalReceivable();
  const inputGST = DB.get('inputGST',0)||0;
  const outputGST = Calc.totalGSTCollected();
  const totalAssets = cash + invVal + receivable + inputGST;
  const totalLiabilities = outputGST;
  const netWorth = totalAssets - totalLiabilities;

  document.getElementById('topbar-actions').innerHTML = `<button class="btn btn-secondary" onclick="printSection('bs-print','Balance Sheet')">🖨 Print</button>`;

  document.getElementById('content').innerHTML = `
  <div id="bs-print">
  <div style="text-align:center;margin-bottom:20px">
    <div style="font-family:var(--font-head);font-size:20px;font-weight:800">${DB.get('businessName','My Business')}</div>
    <div style="color:var(--text3);font-size:12px;font-family:var(--font-mono)">Balance Sheet — As on ${fmtDate(new Date())}</div>
  </div>
  <div class="grid-2" style="margin-bottom:20px">
    <div class="bs-col">
      <div class="bs-head" style="color:var(--green)">ASSETS</div>
      <div class="pl-row"><span>Cash & Bank Balance</span><span class="mono hl-green">${fmt(cash)}</span></div>
      <div class="pl-row"><span>Inventory Value</span><span class="mono">${fmt(invVal)}</span></div>
      <div class="pl-row"><span>Accounts Receivable</span><span class="mono">${fmt(receivable)}</span></div>
      <div class="pl-row"><span>Input GST Credit</span><span class="mono">${fmt(inputGST)}</span></div>
      <div class="pl-total" style="margin-top:10px"><span>TOTAL ASSETS</span><span class="hl-green">${fmt(totalAssets)}</span></div>
    </div>
    <div class="bs-col">
      <div class="bs-head" style="color:var(--red)">LIABILITIES</div>
      <div class="pl-row"><span>Output GST Payable</span><span class="mono hl-red">${fmt(outputGST)}</span></div>
      <div class="pl-row" style="color:var(--text3)"><span>Accounts Payable</span><span class="mono">₹0.00</span></div>
      <div class="pl-total" style="margin-top:10px"><span>TOTAL LIABILITIES</span><span class="hl-red">${fmt(totalLiabilities)}</span></div>
    </div>
  </div>
  <div style="background:${netWorth>=0?'rgba(74,222,128,0.08)':'rgba(248,113,113,0.08)'};border:1px solid ${netWorth>=0?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)'};border-radius:var(--radius-lg);padding:24px;text-align:center">
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px;font-family:var(--font-mono)">NET WORTH (Assets − Liabilities)</div>
    <div style="font-family:var(--font-head);font-size:38px;font-weight:800;color:${netWorth>=0?'var(--green)':'var(--red)'}">${fmt(netWorth)}</div>
  </div>
  </div>`;
};

/* ═══════════════════════════════════════
   PAGE: GST DASHBOARD
═══════════════════════════════════════ */
pages.gst = function() {
  const outputGST = Calc.totalGSTCollected();
  const inputGST = DB.get('inputGST',0)||0;
  const netGST = outputGST - inputGST;
  const sales = DB.get('sales');

  // GST by slab
  const slabs = {};
  sales.forEach(s=>s.items.forEach(i=>{
    const r = i.gstRate+'%';
    if(!slabs[r]) slabs[r]={taxable:0,gst:0,count:0};
    slabs[r].taxable += i.itemTotal;
    slabs[r].gst += i.itemGST;
    slabs[r].count++;
  }));

  document.getElementById('topbar-actions').innerHTML = `<button class="btn btn-secondary" onclick="printSection('gst-print','GST Dashboard')">🖨 Print</button>`;

  document.getElementById('content').innerHTML = `
  <div id="gst-print">
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card green"><div class="stat-label">Output GST (Collected)</div><div class="stat-val hl-green">${fmt(outputGST)}</div><div class="stat-sub">From sales</div></div>
    <div class="stat-card blue"><div class="stat-label">Input GST (Paid)</div><div class="stat-val hl-blue">${fmt(inputGST)}</div><div class="stat-sub">From purchases</div></div>
    <div class="stat-card ${netGST>=0?'orange':'green'}"><div class="stat-label">Net GST Payable</div><div class="stat-val ${netGST>=0?'hl-yellow':'hl-green'}">${fmt(Math.abs(netGST))}</div><div class="stat-sub">${netGST>=0?'To pay':'Refund due'}</div></div>
  </div>
  <div class="card" style="margin-bottom:20px">
    <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
      Input GST Entry
      <div style="display:flex;gap:10px;align-items:center">
        <input id="input-gst-val" type="number" value="${inputGST}" style="width:140px" placeholder="Enter Input GST">
        <button class="btn btn-primary btn-sm" onclick="saveInputGST()">Save</button>
      </div>
    </div>
    <div style="color:var(--text3);font-size:12px">Enter the total GST paid on your purchases (input tax credit).</div>
  </div>
  <div class="card" style="margin-bottom:20px">
    <div class="card-title">🧮 GST by Tax Slab</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>GST Rate</th><th>Transactions</th><th>Taxable Value</th><th>GST Amount</th></tr></thead>
        <tbody>${Object.entries(slabs).sort().map(([r,d])=>`<tr>
          <td><span class="gst-rate-tag">${r}</span></td>
          <td>${d.count}</td>
          <td class="mono">${fmt(d.taxable)}</td>
          <td class="mono hl-blue">${fmt(d.gst)}</td>
        </tr>`).join('') || '<tr><td colspan="4"><div class="empty"><div class="empty-icon">🧮</div><div class="empty-text">No GST data</div></div></td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <div class="card-title">📝 GST Reconciliation</div>
    <div class="pl-row"><span>Output GST (Collected from customers)</span><span class="mono hl-green">${fmt(outputGST)}</span></div>
    <div class="pl-row"><span>Input GST (Paid on purchases)</span><span class="mono hl-blue">${fmt(inputGST)}</span></div>
    <div class="pl-total"><span>${netGST>=0?'NET GST PAYABLE':'GST REFUND'}</span><span class="${netGST>=0?'hl-yellow':'hl-green'}">${fmt(Math.abs(netGST))}</span></div>
  </div>
  </div>`;
};

window.saveInputGST = function() {
  const val = parseFloat(document.getElementById('input-gst-val').value)||0;
  DB.set('inputGST', val);
  navigate('gst'); toast('Input GST saved!');
};

/* ═══════════════════════════════════════
   PAGE: CASH BOOK
═══════════════════════════════════════ */
pages.cashbook = function() {
  const inflow = Calc.totalSales();
  const outflow = Calc.totalExpenses();
  const balance = inflow - outflow;
  const sales = DB.get('sales');
  const expenses = DB.get('expenses');

  // Combine transactions
  const txns = [
    ...sales.map(s=>({date:s.date, desc:`Sale #${s.id.slice(-6).toUpperCase()}`, type:'Inflow', amount:s.finalTotal})),
    ...expenses.map(e=>({date:e.date, desc:e.name, type:'Outflow', amount:e.amount}))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));

  document.getElementById('topbar-actions').innerHTML = `<button class="btn btn-secondary" onclick="printSection('cb-print','Cash Book')">🖨 Print</button>`;

  document.getElementById('content').innerHTML = `
  <div id="cb-print">
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card green"><div class="stat-label">Total Inflow</div><div class="stat-val hl-green">${fmt(inflow)}</div><div class="stat-sub">${sales.length} sales</div></div>
    <div class="stat-card red"><div class="stat-label">Total Outflow</div><div class="stat-val hl-red">${fmt(outflow)}</div><div class="stat-sub">${expenses.length} expenses</div></div>
    <div class="stat-card ${balance>=0?'accent':'orange'}"><div class="stat-label">Net Balance</div><div class="stat-val ${balance>=0?'hl-accent':'hl-red'}">${fmt(balance)}</div><div class="stat-sub">${balance>=0?'Positive':'Negative'}</div></div>
  </div>
  <div class="card">
    <div class="card-title">💰 Cash Book Ledger</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Inflow</th><th>Outflow</th></tr></thead>
        <tbody>${txns.map(t=>`<tr>
          <td>${fmtDate(t.date)}</td>
          <td>${t.desc}</td>
          <td><span class="badge ${t.type==='Inflow'?'badge-green':'badge-red'}">${t.type}</span></td>
          <td class="mono ${t.type==='Inflow'?'hl-green':''}">${t.type==='Inflow'?fmt(t.amount):'—'}</td>
          <td class="mono ${t.type==='Outflow'?'hl-red':''}">${t.type==='Outflow'?fmt(t.amount):'—'}</td>
        </tr>`).join('') || '<tr><td colspan="5"><div class="empty"><div class="empty-icon">💰</div><div class="empty-text">No transactions</div></div></td></tr>'}</tbody>
        <tfoot><tr style="background:var(--surface2)">
          <td colspan="3" style="padding:10px 14px;font-weight:700;font-family:var(--font-head)">CLOSING BALANCE</td>
          <td class="mono hl-green" style="padding:10px 14px">${fmt(inflow)}</td>
          <td class="mono hl-red" style="padding:10px 14px">${fmt(outflow)}</td>
        </tr></tfoot>
      </table>
    </div>
  </div>
  </div>`;
};

/* ═══════════════════════════════════════
   PAGE: CUSTOMERS
═══════════════════════════════════════ */
pages.customers = function() {
  const customers = DB.get('customers');
  const total = Calc.totalReceivable();

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-secondary" onclick="printSection('cust-print','Customers')">🖨 Print</button>
    <button class="btn btn-primary" onclick="showAddCustomer()">+ Add Customer</button>`;

  document.getElementById('content').innerHTML = `
  <div id="cust-print">
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card blue"><div class="stat-label">Total Customers</div><div class="stat-val hl-blue">${customers.length}</div></div>
    <div class="stat-card orange"><div class="stat-label">Total Outstanding</div><div class="stat-val hl-yellow">${fmt(total)}</div></div>
    <div class="stat-card green"><div class="stat-label">Cleared Accounts</div><div class="stat-val hl-green">${customers.filter(c=>c.pendingAmount===0).length}</div></div>
  </div>
  <div class="card">
    <div class="card-title">👥 Customer List</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>City</th><th>Pending Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${customers.map((c,i)=>`<tr>
          <td class="mono" style="color:var(--text3)">${i+1}</td>
          <td><b>${c.name}</b></td>
          <td class="mono">${c.phone||'—'}</td>
          <td>${c.city||'—'}</td>
          <td class="mono ${c.pendingAmount>0?'hl-yellow':''}">${fmt(c.pendingAmount)}</td>
          <td><span class="badge ${c.pendingAmount>0?'badge-yellow':'badge-green'}">${c.pendingAmount>0?'Pending':'Cleared'}</span></td>
          <td>
            ${c.pendingAmount>0?`<button class="btn btn-sm btn-primary" onclick="recordPayment('${c.id}','customer')">💳 Pay</button>`:''}
            <button class="btn btn-sm btn-danger" onclick="deleteEntity('${c.id}','customers')" style="margin-left:4px">🗑</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty"><div class="empty-icon">👥</div><div class="empty-text">No customers added</div></div></td></tr>'}</tbody>
      </table>
    </div>
  </div>
  </div>`;
};

window.showAddCustomer = function() {
  openModal(`
    <div class="modal-title">Add Customer</div>
    <div class="form-row"><div class="form-group"><label>Name</label><input id="c-name" placeholder="Customer name"></div></div>
    <div class="form-row">
      <div class="form-group"><label>Phone</label><input id="c-phone" placeholder="Mobile number"></div>
      <div class="form-group"><label>City</label><input id="c-city" placeholder="City"></div>
    </div>
    <div class="form-row"><div class="form-group"><label>Opening Balance (₹)</label><input id="c-pending" type="number" value="0" placeholder="0"></div></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveCustomer()">Add Customer</button>
    </div>`);
};

window.saveCustomer = function() {
  const name = document.getElementById('c-name').value.trim();
  if(!name) { toast('Name required', 'error'); return; }
  const customers = DB.get('customers');
  customers.push({id:DB.id(), name, phone:document.getElementById('c-phone').value, city:document.getElementById('c-city').value, pendingAmount:parseFloat(document.getElementById('c-pending').value)||0});
  DB.set('customers', customers);
  closeModal(); navigate('customers'); toast('Customer added!');
};

window.recordPayment = function(id, type) {
  const key = type==='customer'?'customers':'suppliers';
  const entities = DB.get(key);
  const e = entities.find(x=>x.id===id);
  if(!e) return;
  openModal(`
    <div class="modal-title">Record Payment — ${e.name}</div>
    <div style="margin-bottom:14px;color:var(--text2)">Outstanding: <b class="hl-yellow">${fmt(e.pendingAmount)}</b></div>
    <div class="form-row"><div class="form-group"><label>Amount Received (₹)</label><input id="pay-amount" type="number" max="${e.pendingAmount}" value="${e.pendingAmount}"></div></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="applyPayment('${id}','${key}')">Record Payment</button>
    </div>`);
};

window.applyPayment = function(id, key) {
  const amount = parseFloat(document.getElementById('pay-amount').value)||0;
  const entities = DB.get(key);
  const e = entities.find(x=>x.id===id);
  if(!e) return;
  e.pendingAmount = Math.max(0, e.pendingAmount - amount);
  DB.set(key, entities);
  closeModal(); navigate(key==='customers'?'customers':'suppliers'); toast('Payment recorded!');
};

window.deleteEntity = function(id, key) {
  if(!confirm('Delete?')) return;
  DB.set(key, DB.get(key).filter(x=>x.id!==id));
  navigate(key==='customers'?'customers':'suppliers'); toast('Deleted');
};

/* ═══════════════════════════════════════
   PAGE: SUPPLIERS
═══════════════════════════════════════ */
pages.suppliers = function() {
  const suppliers = DB.get('suppliers');
  const total = suppliers.reduce((s,x)=>s+x.pendingAmount,0);

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-secondary" onclick="printSection('sup-print','Suppliers')">🖨 Print</button>
    <button class="btn btn-primary" onclick="showAddSupplier()">+ Add Supplier</button>`;

  document.getElementById('content').innerHTML = `
  <div id="sup-print">
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card purple"><div class="stat-label">Total Suppliers</div><div class="stat-val" style="color:var(--purple)">${suppliers.length}</div></div>
    <div class="stat-card red"><div class="stat-label">Total Payables</div><div class="stat-val hl-red">${fmt(total)}</div></div>
    <div class="stat-card green"><div class="stat-label">Cleared</div><div class="stat-val hl-green">${suppliers.filter(s=>s.pendingAmount===0).length}</div></div>
  </div>
  <div class="card">
    <div class="card-title">🏭 Supplier List</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>City</th><th>Payable</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${suppliers.map((s,i)=>`<tr>
          <td class="mono" style="color:var(--text3)">${i+1}</td>
          <td><b>${s.name}</b></td>
          <td class="mono">${s.phone||'—'}</td>
          <td>${s.city||'—'}</td>
          <td class="mono ${s.pendingAmount>0?'hl-red':''}">${fmt(s.pendingAmount)}</td>
          <td><span class="badge ${s.pendingAmount>0?'badge-red':'badge-green'}">${s.pendingAmount>0?'Payable':'Cleared'}</span></td>
          <td>
            ${s.pendingAmount>0?`<button class="btn btn-sm btn-primary" onclick="recordPayment('${s.id}','supplier')">💳 Pay</button>`:''}
            <button class="btn btn-sm btn-danger" onclick="deleteEntity('${s.id}','suppliers')" style="margin-left:4px">🗑</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty"><div class="empty-icon">🏭</div><div class="empty-text">No suppliers added</div></div></td></tr>'}</tbody>
      </table>
    </div>
  </div>
  </div>`;
};

window.showAddSupplier = function() {
  openModal(`
    <div class="modal-title">Add Supplier</div>
    <div class="form-row"><div class="form-group"><label>Name</label><input id="s-name" placeholder="Supplier name"></div></div>
    <div class="form-row">
      <div class="form-group"><label>Phone</label><input id="s-phone" placeholder="Mobile number"></div>
      <div class="form-group"><label>City</label><input id="s-city" placeholder="City"></div>
    </div>
    <div class="form-row"><div class="form-group"><label>Opening Payable (₹)</label><input id="s-pending" type="number" value="0"></div></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveSupplier()">Add Supplier</button>
    </div>`);
};

window.saveSupplier = function() {
  const name = document.getElementById('s-name').value.trim();
  if(!name) { toast('Name required','error'); return; }
  const suppliers = DB.get('suppliers');
  suppliers.push({id:DB.id(), name, phone:document.getElementById('s-phone').value, city:document.getElementById('s-city').value, pendingAmount:parseFloat(document.getElementById('s-pending').value)||0});
  DB.set('suppliers', suppliers);
  closeModal(); navigate('suppliers'); toast('Supplier added!');
};

/* ═══════════════════════════════════════
   PAGE: REPORTS
═══════════════════════════════════════ */
pages.reports = function() {
  const sales = DB.get('sales');
  const products = DB.get('products');
  
  // Top products by revenue
  const prodRevenue = {};
  sales.forEach(s=>s.items.forEach(i=>{ prodRevenue[i.name]=(prodRevenue[i.name]||0)+i.itemTotal+i.itemGST; }));
  const topProds = Object.entries(prodRevenue).sort((a,b)=>b[1]-a[1]).slice(0,5);

  document.getElementById('topbar-actions').innerHTML = `<button class="btn btn-secondary" onclick="printSection('reports-print','Reports')">🖨 Print</button>`;

  document.getElementById('content').innerHTML = `
  <div id="reports-print">
  <div class="grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-title">🏆 Top Products by Revenue</div>
      ${topProds.map(([name,rev],i)=>`
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span>${i+1}. ${name}</span><span class="mono hl-green">${fmt(rev)}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${topProds[0]?Math.round(rev/topProds[0][1]*100):0}%;background:var(--accent)"></div></div>
        </div>`).join('') || '<div class="empty" style="padding:20px"><div class="empty-text">No data</div></div>'}
    </div>
    <div class="card">
      <div class="card-title">📊 Revenue Chart</div>
      <div class="chart-container"><canvas id="topProdChart"></canvas></div>
    </div>
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">📦 Stock Report</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Stock</th><th>Value</th></tr></thead>
        <tbody>${products.map(p=>`<tr>
          <td>${p.name}</td>
          <td class="${p.stock<10?'hl-red':p.stock<20?'hl-yellow':''}">${p.stock}</td>
          <td class="mono">${fmt(p.price*p.stock)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-title">💹 Financial Summary</div>
      <div class="pl-row"><span>Gross Revenue</span><span class="mono hl-green">${fmt(Calc.totalSales())}</span></div>
      <div class="pl-row"><span>GST Collected</span><span class="mono hl-blue">${fmt(Calc.totalGSTCollected())}</span></div>
      <div class="pl-row"><span>Total Expenses</span><span class="mono hl-red">${fmt(Calc.totalExpenses())}</span></div>
      <div class="pl-row"><span>Net Profit</span><span class="mono ${Calc.profit()>=0?'hl-green':'hl-red'}">${fmt(Calc.profit())}</span></div>
      <div class="pl-row"><span>Inventory Value</span><span class="mono">${fmt(Calc.inventoryValue())}</span></div>
      <div class="pl-row"><span>Outstanding Receivables</span><span class="mono hl-yellow">${fmt(Calc.totalReceivable())}</span></div>
      <div class="pl-row"><span>Net Worth</span><span class="mono ${Calc.netWorth()>=0?'hl-accent':'hl-red'}">${fmt(Calc.netWorth())}</span></div>
    </div>
  </div>
  </div>`;

  if(topProds.length) {
    const ctx = document.getElementById('topProdChart').getContext('2d');
    const tc = new Chart(ctx, {
      type:'bar', indexAxis:'y',
      data:{ labels:topProds.map(([n])=>n), datasets:[{ data:topProds.map(([,v])=>v), backgroundColor:'rgba(32,60,116,0.5)', borderColor:'#203C74', borderWidth:1, borderRadius:4 }] },
      options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(32,60,116,0.08)'},ticks:{color:'#7a8fb5',callback:v=>'₹'+v.toLocaleString('en-IN')}}, y:{grid:{color:'rgba(32,60,116,0.08)'},ticks:{color:'#3d5080'}} }, responsive:true, maintainAspectRatio:false }
    });
    activeCharts.push(tc);
  }
};

/* ═══════════════════════════════════════
   PAGE: SETTINGS
═══════════════════════════════════════ */
pages.settings = function() {
  document.getElementById('content').innerHTML = `
  <div style="max-width:600px">
    <div class="card settings-section">
      <div class="card-title">🏢 Business Information</div>
      <div class="form-group" style="margin-bottom:14px"><label>Business Name</label><input id="set-biz" value="${DB.get('businessName','My Business')}"></div>
      <div class="form-group" style="margin-bottom:14px"><label>GSTIN Number</label><input id="set-gst" value="${DB.get('gstNumber','N/A')}"></div>
      <div class="form-group" style="margin-bottom:14px"><label>Address</label><input id="set-addr" value="${DB.get('address','')}"></div>
      <div class="form-group" style="margin-bottom:16px"><label>Phone</label><input id="set-phone" value="${DB.get('bizPhone','')}"></div>
      <button class="btn btn-primary" onclick="saveSettings()">💾 Save Settings</button>
    </div>
    <div class="card settings-section">
      <div class="card-title">🗄️ Data Management</div>
      <div style="color:var(--text2);font-size:13px;margin-bottom:16px">Export or reset all application data stored in your browser.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-blue" onclick="exportData()">⬇ Export JSON</button>
        <button class="btn btn-secondary" onclick="importData()">⬆ Import JSON</button>
        <button class="btn btn-danger" onclick="resetData()">🗑 Reset All Data</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">ℹ️ About</div>
      <div style="color:var(--text2);font-size:13px">
        <b>ChitRagupt v1.0</b> — AI-Powered Inventory &amp; Finance<br>
        <span style="color:var(--text3)">All data is stored locally in your browser using LocalStorage. No data is sent to any server.</span>
      </div>
    </div>
  </div>`;
};

window.saveSettings = function() {
  DB.set('businessName', document.getElementById('set-biz').value);
  DB.set('gstNumber', document.getElementById('set-gst').value);
  DB.set('address', document.getElementById('set-addr').value);
  DB.set('bizPhone', document.getElementById('set-phone').value);
  toast('Settings saved!');
};

window.exportData = function() {
  const keys = ['products','sales','expenses','customers','suppliers','inputGST','businessName','gstNumber','address','bizPhone'];
  const data = {};
  keys.forEach(k => data[k] = DB.get(k));
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bizledger-backup.json';
  a.click();
  toast('Data exported!');
};

window.importData = function() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        Object.entries(data).forEach(([k,v]) => DB.set(k,v));
        toast('Data imported!'); navigate('dashboard');
      } catch { toast('Invalid file!','error'); }
    };
    reader.readAsText(file);
  };
  input.click();
};

window.resetData = function() {
  if(!confirm('This will delete ALL data permanently. Are you sure?')) return;
  localStorage.clear();
  toast('All data cleared'); seedIfEmpty(); navigate('dashboard');
};

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
/* ═══════════════════════════════════════
   PAGE: USER MANUAL
═══════════════════════════════════════ */
pages.manual = function() {
  document.getElementById('topbar-actions').innerHTML = `<button class="btn btn-secondary" onclick="window.print()">🖨 Print Manual</button>`;
  document.getElementById('content').innerHTML = `
  <div style="max-width:860px;margin:0 auto">

    <!-- Header Banner -->
    <div style="background:linear-gradient(135deg,var(--royal-blue) 0%,#2d50a0 100%);border-radius:var(--radius-lg);padding:32px 36px;margin-bottom:28px;color:#fff;position:relative;overflow:hidden;">
      <div style="position:absolute;right:-20px;top:-20px;font-size:120px;opacity:0.07;">📖</div>
      <div style="font-family:var(--font-head);font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:8px;">Documentation</div>
      <div style="font-family:var(--font-head);font-size:28px;font-weight:800;margin-bottom:6px;">Chitragupt User Manual</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.75);">AI-Powered Inventory & Finance — Complete System Guide</div>
      <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;">
        <span style="background:rgba(255,255,255,0.15);border-radius:20px;padding:4px 14px;font-size:12px;font-family:var(--font-mono);">v1.0</span>
        <span style="background:rgba(189,149,78,0.35);border-radius:20px;padding:4px 14px;font-size:12px;font-family:var(--font-mono);color:#f5d99a;">Web-Based</span>
        <span style="background:rgba(255,255,255,0.15);border-radius:20px;padding:4px 14px;font-size:12px;font-family:var(--font-mono);">LocalStorage Powered</span>
      </div>
    </div>

    <!-- Section 1: Introduction -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid var(--royal-blue);">
        <div style="width:36px;height:36px;background:rgba(32,60,116,0.10);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📌</div>
        <div>
          <div style="font-family:var(--font-head);font-size:15px;font-weight:800;color:var(--royal-blue);">1. Introduction</div>
          <div style="font-size:12px;color:var(--text3);">Section 1.1 — What is Chitragupt?</div>
        </div>
      </div>
      <p style="color:var(--text2);font-size:13.5px;line-height:1.8;">
        <strong style="color:var(--royal-blue);">Chitragupt</strong> is a web-based business management system designed for local businesses to manage
        <strong>inventory, billing, sales, expenses,</strong> and <strong>financial records</strong> efficiently.
        It simplifies complex accounting operations and provides real-time insights — all running directly in your browser with no server required.
      </p>
      <div style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
        ${['🧾 Billing & Invoices','📦 Inventory Tracking','💸 Expense Management','📊 P&L Reports','🧮 GST Tracking','💰 Bank / Cash Book'].map(f=>`
          <div style="background:rgba(32,60,116,0.05);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;font-size:13px;font-weight:500;color:var(--royal-blue);">${f}</div>
        `).join('')}
      </div>
    </div>

    <!-- Section 1.2: System Access -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid var(--royal-blue);">
        <div style="width:36px;height:36px;background:rgba(32,60,116,0.10);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🔐</div>
        <div>
          <div style="font-family:var(--font-head);font-size:15px;font-weight:800;color:var(--royal-blue);">1.2 System Access</div>
          <div style="font-size:12px;color:var(--text3);">How to get started</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${[
          ['1','Open Application','Open the HTML file in any modern web browser (Chrome, Edge, Firefox)'],
          ['2','Access Dashboard','User lands directly on the Overview Dashboard — no login required for prototype'],
          ['3','Start Using','All data is saved automatically in browser LocalStorage — no internet needed']
        ].map(([n,title,desc])=>`
          <div style="display:flex;align-items:flex-start;gap:14px;padding:12px 16px;background:rgba(32,60,116,0.04);border-radius:var(--radius);border-left:3px solid var(--royal-gold);">
            <div style="width:26px;height:26px;background:var(--royal-blue);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${n}</div>
            <div><div style="font-weight:600;color:var(--royal-blue);font-size:13px;">${title}</div><div style="font-size:12px;color:var(--text2);margin-top:2px;">${desc}</div></div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 1.4: Modules -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid var(--royal-blue);">
        <div style="width:36px;height:36px;background:rgba(32,60,116,0.10);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🗂️</div>
        <div>
          <div style="font-family:var(--font-head);font-size:15px;font-weight:800;color:var(--royal-blue);">1.4 Modules Overview</div>
          <div style="font-size:12px;color:var(--text3);">All available modules and their features</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;">
        ${[
          ['🧾','POS / Billing',['Select product','Enter quantity','Auto GST calculation','Generate & print invoice'],'pos'],
          ['📦','Inventory',['Add/update products','Track stock levels','Low stock alerts','Purchase entries'],'inventory'],
          ['📈','Sales Analytics',['Daily/monthly sales','Top products','Revenue charts','Sales trends'],'sales'],
          ['💸','Expenses',['Add expenses','Categorize spending','Track totals','GST input tracking'],'expenses'],
          ['⚖️','Profit & Loss',['Revenue summary','Expense breakdown','Net profit','Financial clarity'],'pl'],
          ['🧮','GST Dashboard',['Input GST tracking','Output GST collected','Net GST payable','GST reports'],'gst'],
          ['💰','Bank / Cash Book',['Cash inflow/outflow','Balance tracking','Transaction history','Financial records'],'cashbook'],
          ['🏦','Balance Sheet',['Assets overview','Liabilities','Net worth','Financial position'],'balance'],
          ['👥','Customers & Suppliers',['Manage records','Track credit/debit','Payment recording','Contact info'],'customers'],
          ['📋','Reports',['Generate reports','Print statements','Top products','Financial summary'],'reports'],
        ].map(([icon,name,features,page])=>`
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;cursor:pointer;transition:all 0.18s;" 
               onmouseover="this.style.borderColor='var(--royal-blue)';this.style.boxShadow='0 4px 12px rgba(32,60,116,0.10)'"
               onmouseout="this.style.borderColor='var(--border)';this.style.boxShadow='none'"
               onclick="navigate('${page}')">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:20px;">${icon}</span>
              <span style="font-family:var(--font-head);font-weight:700;font-size:13px;color:var(--royal-blue);">${name}</span>
            </div>
            <ul style="list-style:none;padding:0;margin:0;">
              ${features.map(f=>`<li style="font-size:12px;color:var(--text2);padding:2px 0;padding-left:14px;position:relative;">
                <span style="position:absolute;left:0;color:var(--royal-gold);">›</span>${f}
              </li>`).join('')}
            </ul>
            <div style="margin-top:10px;font-size:11px;color:var(--royal-gold);font-family:var(--font-mono);font-weight:600;">Click to open →</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 2: Development Phases -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid var(--royal-blue);">
        <div style="width:36px;height:36px;background:rgba(32,60,116,0.10);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏗️</div>
        <div>
          <div style="font-family:var(--font-head);font-size:15px;font-weight:800;color:var(--royal-blue);">2. Development Phases</div>
          <div style="font-size:12px;color:var(--text3);">How Chitragupt was built</div>
        </div>
      </div>
      <div style="position:relative;padding-left:28px;">
        <div style="position:absolute;left:10px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,var(--royal-blue),var(--royal-gold));border-radius:2px;"></div>
        ${[
          ['🔍','Requirement Analysis','Identified business problems, defined features and scope'],
          ['🎨','System Design','Created architecture, UI layouts and component structure'],
          ['🗄️','Data Modeling','Structured product, sales, expense and customer data schemas'],
          ['💻','Frontend Development','Built complete UI using HTML, CSS and JavaScript'],
          ['⚙️','Logic Implementation','GST calculations, profit tracking, inventory management'],
          ['💾','Data Storage','Implemented LocalStorage for full browser-side persistence'],
          ['🧪','Testing','Verified all calculations, edge cases and functionality'],
          ['✨','Enhancement','Added reports, print features and analytics charts'],
          ['🚀','Deployment','Ready for demonstration and real-world use'],
        ].map(([icon,phase,desc],i)=>`
          <div style="display:flex;gap:14px;margin-bottom:16px;position:relative;">
            <div style="width:32px;height:32px;background:${i%2===0?'var(--royal-blue)':'var(--royal-gold)'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;margin-left:-16px;border:3px solid var(--surface);z-index:1;">${icon}</div>
            <div style="padding-top:4px;">
              <div style="font-weight:700;font-size:13px;color:var(--royal-blue);">${phase}</div>
              <div style="font-size:12px;color:var(--text2);margin-top:2px;">${desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 3: Capabilities -->
    <div class="grid-2" style="margin-bottom:20px;">
      <!-- Core Features -->
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid var(--royal-blue);">
          <div style="width:36px;height:36px;background:rgba(32,60,116,0.10);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">✅</div>
          <div>
            <div style="font-family:var(--font-head);font-size:14px;font-weight:800;color:var(--royal-blue);">Core Features</div>
            <div style="font-size:11px;color:var(--text3);">Available Now</div>
          </div>
        </div>
        ${['Billing and invoice generation','Inventory tracking & alerts','Expense management','Profit & Loss calculation','Balance sheet generation','GST tracking & reporting','Bank / Cash book','Customer & supplier CRM'].map(f=>`
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);">
            <span style="color:#1a7a4a;font-size:14px;">✔</span>
            <span style="font-size:13px;color:var(--text2);">${f}</span>
          </div>
        `).join('')}
      </div>
      <!-- Future Scope -->
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid var(--royal-gold);">
          <div style="width:36px;height:36px;background:rgba(189,149,78,0.12);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🚀</div>
          <div>
            <div style="font-family:var(--font-head);font-size:14px;font-weight:800;color:var(--royal-gold);">Future Scope</div>
            <div style="font-size:11px;color:var(--text3);">Coming Soon</div>
          </div>
        </div>
        ${[
          ['🤖','AI demand forecasting','Predict stock needs using sales patterns'],
          ['🎤','Voice interaction','Hands-free billing via voice commands'],
          ['🌐','Multi-language support','Hindi & regional language UI'],
          ['☁️','Cloud storage','Sync data across devices securely'],
          ['📱','Mobile app','Dedicated Android & iOS application'],
        ].map(([icon,title,desc])=>`
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:16px;flex-shrink:0;">${icon}</span>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text);">${title}</div>
              <div style="font-size:11px;color:var(--text3);">${desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Business Benefits -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid var(--royal-blue);">
        <div style="width:36px;height:36px;background:rgba(32,60,116,0.10);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">💼</div>
        <div>
          <div style="font-family:var(--font-head);font-size:15px;font-weight:800;color:var(--royal-blue);">Business Benefits</div>
          <div style="font-size:12px;color:var(--text3);">Why use Chitragupt?</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
        ${[
          ['⚡','Saves Time','Automates repetitive billing and accounting tasks'],
          ['🎯','Reduces Errors','Eliminates manual calculation mistakes'],
          ['📈','Better Decisions','Real-time data drives smarter business choices'],
          ['💡','Financial Clarity','Clear view of profit, loss and cash position'],
          ['📊','Increases Profitability','Identify top products and cut unnecessary costs'],
        ].map(([icon,title,desc])=>`
          <div style="background:rgba(32,60,116,0.04);border:1px solid var(--border);border-radius:var(--radius);padding:16px;text-align:center;">
            <div style="font-size:26px;margin-bottom:8px;">${icon}</div>
            <div style="font-weight:700;font-size:13px;color:var(--royal-blue);margin-bottom:4px;">${title}</div>
            <div style="font-size:12px;color:var(--text3);">${desc}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Conclusion -->
    <div style="background:linear-gradient(135deg,rgba(32,60,116,0.06) 0%,rgba(189,149,78,0.08) 100%);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px 28px;text-align:center;">
      <div style="font-size:28px;margin-bottom:10px;">🏆</div>
      <div style="font-family:var(--font-head);font-size:16px;font-weight:800;color:var(--royal-blue);margin-bottom:10px;">Conclusion</div>
      <p style="font-size:13.5px;color:var(--text2);line-height:1.8;max-width:620px;margin:0 auto;">
        Chitragupt integrates <strong>inventory, billing,</strong> and <strong>financial analytics</strong> into a single platform, 
        providing real-time insights and enabling efficient, data-driven decision making for local businesses.
      </p>
      <div style="margin-top:16px;">
        <button class="btn btn-primary" onclick="navigate('dashboard')" style="margin-right:10px;">📊 Go to Dashboard</button>
        <button class="btn btn-secondary" onclick="window.print()">🖨 Print Manual</button>
      </div>
    </div>

  </div>`;
};

/* ═══════════════════════════════════════
   LANGUAGE SWITCH
═══════════════════════════════════════ */
window.handleLangSwitch = function() {
  const pill = document.getElementById('lang-pill');
  const label = document.getElementById('lang-label');
  if (pill && pill.textContent.trim() === 'EN') {
    // Show under development toast
    toast('🚧 हिंदी मोड — Under Development! Coming Soon.', 'error');
  } else {
    pill.textContent = 'EN';
    label.textContent = 'English';
  }
};

seedIfEmpty();
navigate('dashboard');
