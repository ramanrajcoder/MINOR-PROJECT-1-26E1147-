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

// Initialize empty data stores on first visit
function seedIfEmpty() {
  if (DB.get('seeded', false)) return;
  DB.set('products',  []);
  DB.set('sales',     []);
  DB.set('expenses',  []);
  DB.set('customers', []);
  DB.set('suppliers', []);
  DB.set('inputGST',  0);
  DB.set('businessName', '');
  DB.set('gstNumber', '');
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
    manual:'User Manual & System Description', calculator:'Business Calculator'
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
    <div class="card settings-section">
      <div class="card-title">🔐 Account &amp; Security</div>
      <div style="color:var(--text2);font-size:13px;margin-bottom:16px">Logout to lock the app. Your data stays safe.</div>
      <button class="btn btn-danger" onclick="handleLogout()">🚪 Logout &amp; Lock App</button>
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
   PAGE: DEMAND FORECAST
═══════════════════════════════════════ */
window.renderForecast = function() {
  const sales    = DB.get('sales',   []);
  const products = DB.get('products', []);

  // ── 1. Build per-product daily sales map ─────────────────────────────────
  const productSalesMap = {};
  products.forEach(p => { productSalesMap[p.name] = {}; });

  sales.forEach(sale => {
    const dateStr = sale.date ? sale.date.split('T')[0] : null;
    if (!dateStr) return;
    (sale.items || []).forEach(item => {
      if (!productSalesMap[item.name]) productSalesMap[item.name] = {};
      productSalesMap[item.name][dateStr] = (productSalesMap[item.name][dateStr] || 0) + (item.qty || 0);
    });
  });

  // ── 2. Determine date range of all sales ─────────────────────────────────
  const allDates = sales.map(s => s.date ? s.date.split('T')[0] : null).filter(Boolean).sort();
  const firstDate = allDates.length ? new Date(allDates[0]) : new Date();
  const today = new Date(); today.setHours(0,0,0,0);
  const daySpan = Math.max(1, Math.round((today - firstDate) / 86400000) + 1);

  // ── 3. For each product, compute metrics ─────────────────────────────────
  const forecastData = products.map(product => {
    const dailyMap  = productSalesMap[product.name] || {};
    const totalSold = Object.values(dailyMap).reduce((a,b)=>a+b, 0);
    const avgDaily  = totalSold / daySpan;

    // Trend: compare last-7-days avg vs prior-7-days avg
    const last7 = [], prior7 = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const qty = dailyMap[ds] || 0;
      if (i < 7) last7.push(qty); else prior7.push(qty);
    }
    const avg7  = last7.reduce((a,b)=>a+b,0)  / 7;
    const avg14 = prior7.reduce((a,b)=>a+b,0) / 7;

    let trend = 'stable', trendIcon = '→', trendColor = 'var(--text3)';
    const diff = avg7 - avg14;
    if (diff > 0.05)       { trend = 'rising';  trendIcon = '↑'; trendColor = 'var(--green)'; }
    else if (diff < -0.05) { trend = 'falling'; trendIcon = '↓'; trendColor = 'var(--red)'; }

    // Weighted forecast: 60% last-7-avg + 40% overall-avg
    const forecastDaily = avg7 > 0 ? (avg7 * 0.6 + avgDaily * 0.4) : avgDaily;
    const demand7  = Math.ceil(forecastDaily * 7);
    const demand30 = Math.ceil(forecastDaily * 30);
    const currentStock = product.stock || 0;

    return {
      name: product.name,
      stock: currentStock,
      avgDaily,
      trend, trendIcon, trendColor,
      demand7, demand30,
      reorderAlert7:  currentStock < demand7,
      reorderAlert30: currentStock < demand30,
      totalSold,
    };
  });

  const alertCount = forecastData.filter(f => f.reorderAlert7).length;

  // ── 4. Render ─────────────────────────────────────────────────────────────
  const el = document.getElementById('content');
  el.innerHTML = `
  <div class="stats-grid" style="margin-bottom:24px;">
    <div class="stat-card blue">
      <div class="stat-icon">📦</div>
      <div class="stat-label">Products Tracked</div>
      <div class="stat-val">${products.length}</div>
      <div class="stat-sub">in inventory</div>
    </div>
    <div class="stat-card ${alertCount > 0 ? 'red' : 'green'}">
      <div class="stat-icon">🚨</div>
      <div class="stat-label">Reorder Alerts (7d)</div>
      <div class="stat-val" style="color:${alertCount>0?'var(--red)':'var(--green)'}">${alertCount}</div>
      <div class="stat-sub">${alertCount>0?'products need restocking':'all stocks sufficient'}</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-icon">🔮</div>
      <div class="stat-label">Forecast Horizon</div>
      <div class="stat-val" style="font-size:18px;">7 / 30d</div>
      <div class="stat-sub">based on ${daySpan} days of data</div>
    </div>
    <div class="stat-card purple">
      <div class="stat-icon">📈</div>
      <div class="stat-label">Rising Products</div>
      <div class="stat-val" style="color:var(--purple)">${forecastData.filter(f=>f.trend==='rising').length}</div>
      <div class="stat-sub">demand trending up</div>
    </div>
  </div>

  ${alertCount > 0 ? `
  <div style="background:rgba(192,57,43,0.08);border:1.5px solid rgba(192,57,43,0.30);border-radius:var(--radius-lg);padding:14px 20px;margin-bottom:20px;display:flex;align-items:center;gap:14px;">
    <span style="font-size:24px;">🚨</span>
    <div>
      <div style="font-family:var(--font-head);font-weight:700;color:var(--red);font-size:14px;">Reorder Alert — ${alertCount} Product${alertCount>1?'s':''} Running Low</div>
      <div style="font-size:12px;color:var(--text2);margin-top:3px;">
        ${forecastData.filter(f=>f.reorderAlert7).map(f=>`<strong>${f.name}</strong> (stock: ${f.stock}, need ${f.demand7} in 7d)`).join(' &nbsp;·&nbsp; ')}
      </div>
    </div>
  </div>` : ''}

  <div class="card" style="margin-bottom:24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:0;">📊 Product Demand Forecast</div>
      <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">Trend = last 7d vs prior 7d · weighted moving avg</div>
    </div>
    <div class="table-wrap">
      <table id="forecast-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Current Stock</th>
            <th>Avg Daily Sales</th>
            <th>Trend</th>
            <th>Predicted (7d)</th>
            <th>Predicted (30d)</th>
            <th>7d Status</th>
            <th>30d Status</th>
          </tr>
        </thead>
        <tbody>
          ${forecastData.map(f=>`
          <tr>
            <td style="font-weight:600;color:var(--royal-blue);">${f.name}</td>
            <td class="mono">${f.stock} units</td>
            <td class="mono">${f.avgDaily.toFixed(2)}/day</td>
            <td>
              <span style="font-size:18px;font-weight:700;color:${f.trendColor};">${f.trendIcon}</span>
              <span style="font-size:12px;color:${f.trendColor};margin-left:4px;text-transform:capitalize;">${f.trend}</span>
            </td>
            <td class="mono" style="font-weight:600;">${f.demand7} units</td>
            <td class="mono" style="font-weight:600;">${f.demand30} units</td>
            <td>${f.reorderAlert7
              ? '<span class="badge badge-red">⚠ Reorder Now</span>'
              : '<span class="badge badge-green">✔ Sufficient</span>'}</td>
            <td>${f.reorderAlert30
              ? '<span class="badge badge-yellow">⚠ Plan Reorder</span>'
              : '<span class="badge badge-green">✔ Sufficient</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div style="margin-bottom:8px;font-family:var(--font-head);font-size:13px;font-weight:700;color:var(--royal-blue);text-transform:uppercase;letter-spacing:0.5px;">📦 Per-Product Breakdown</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-bottom:24px;">
    ${forecastData.map(f=>{
      const pct7 = f.demand7>0 ? Math.min(100,Math.round((f.stock/f.demand7)*100)) : 100;
      const barColor = pct7>=100?'var(--green)':pct7>=50?'var(--yellow)':'var(--red)';
      return `
      <div class="card" style="padding:16px;border-top:3px solid ${f.reorderAlert7?'var(--red)':'var(--royal-blue)'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div style="font-family:var(--font-head);font-size:13px;font-weight:700;color:var(--royal-blue);">${f.name}</div>
          <span style="font-size:20px;color:${f.trendColor};">${f.trendIcon}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          <div style="background:var(--surface2);border-radius:8px;padding:8px 10px;">
            <div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);text-transform:uppercase;">Stock</div>
            <div style="font-size:16px;font-weight:700;color:var(--royal-blue);font-family:var(--font-head);">${f.stock}</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:8px 10px;">
            <div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);text-transform:uppercase;">Avg/Day</div>
            <div style="font-size:16px;font-weight:700;color:var(--royal-blue);font-family:var(--font-head);">${f.avgDaily.toFixed(1)}</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:8px 10px;">
            <div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);text-transform:uppercase;">Need (7d)</div>
            <div style="font-size:16px;font-weight:700;color:${f.reorderAlert7?'var(--red)':'var(--green)'};font-family:var(--font-head);">${f.demand7}</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:8px 10px;">
            <div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);text-transform:uppercase;">Need (30d)</div>
            <div style="font-size:16px;font-weight:700;color:${f.reorderAlert30?'var(--yellow)':'var(--green)'};font-family:var(--font-head);">${f.demand30}</div>
          </div>
        </div>
        <div style="margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:4px;">
            <span>Stock vs 7d Demand</span><span>${pct7}%</span>
          </div>
          <div style="background:var(--surface3);border-radius:20px;height:7px;overflow:hidden;">
            <div style="width:${pct7}%;background:${barColor};height:100%;border-radius:20px;transition:width 0.5s;"></div>
          </div>
        </div>
        ${f.reorderAlert7
          ? `<div style="margin-top:8px;font-size:11px;color:var(--red);font-weight:600;background:rgba(192,57,43,0.08);border-radius:6px;padding:5px 8px;">⚠ Shortfall of ${Math.max(0,f.demand7-f.stock)} units — reorder now</div>`
          : `<div style="margin-top:8px;font-size:11px;color:var(--green);font-weight:600;background:rgba(26,122,74,0.07);border-radius:6px;padding:5px 8px;">✔ Sufficient for 7-day demand</div>`
        }
      </div>`;
    }).join('')}
  </div>

  <div style="background:rgba(32,60,116,0.04);border:1px solid var(--border);border-radius:var(--radius);padding:14px 18px;margin-bottom:24px;">
    <div style="font-family:var(--font-head);font-size:12px;font-weight:700;color:var(--royal-blue);margin-bottom:6px;">ℹ️ How Forecasting Works</div>
    <ul style="list-style:none;padding:0;margin:0;font-size:12px;color:var(--text2);line-height:2.0;">
      <li>› <strong>Avg Daily Sales</strong> = Total units sold ÷ Days since first sale</li>
      <li>› <strong>Trend</strong> = Last-7-day average vs prior-7-day average &nbsp;(↑ Rising &nbsp;/ ↓ Falling &nbsp;/ → Stable)</li>
      <li>› <strong>Demand Prediction</strong> = Weighted avg: 60% last-7-day rate + 40% overall rate, multiplied by 7 or 30</li>
      <li>› <strong>Reorder Alert</strong> = Triggered when current stock &lt; predicted demand for that period</li>
    </ul>
  </div>`;
};

pages.forecast = function() {
  renderForecast();
};

/* stub handleLangSwitch removed — full version below from enhanced file */

/* ═══════════════════════════════════════
   LOGIN SYSTEM
═══════════════════════════════════════ */
(function initLoginSystem() {
  const isLoggedIn = localStorage.getItem('bl_loggedIn') === 'true';
  const userData = (() => { try { return JSON.parse(localStorage.getItem('bl_user')) || null; } catch { return null; } })();

  const loginScreen = document.getElementById('login-screen');
  const registerView = document.getElementById('login-register-view');
  const pinView = document.getElementById('login-pin-view');

  if (isLoggedIn) {
    // Already logged in — hide screen immediately
    loginScreen.classList.add('hidden');
    return;
  }

  if (userData && userData.pin) {
    // Returning user — show PIN entry
    registerView.style.display = 'none';
    pinView.style.display = 'block';
    document.getElementById('login-biz-name').textContent = userData.businessName || 'Welcome Back!';
    document.getElementById('login-owner-name').textContent = (userData.ownerName ? 'Hello, ' + userData.ownerName + '!' : '') + ' Enter your PIN to continue.';
    setTimeout(() => document.getElementById('login-pin').focus(), 100);
  } else {
    // First time — show registration
    registerView.style.display = 'block';
    pinView.style.display = 'none';
    setTimeout(() => document.getElementById('reg-biz').focus(), 100);
  }
})();

window.handleRegister = function() {
  const biz = document.getElementById('reg-biz').value.trim();
  const owner = document.getElementById('reg-owner').value.trim();
  const pin = document.getElementById('reg-pin').value.trim();
  const errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  if (!biz) { errEl.textContent = 'Please enter your business name.'; return; }
  if (!owner) { errEl.textContent = 'Please enter the owner name.'; return; }
  if (!/^\d{4}$/.test(pin)) { errEl.textContent = 'PIN must be exactly 4 digits.'; return; }
  localStorage.setItem('bl_user', JSON.stringify({ businessName: biz, ownerName: owner, pin: pin }));
  localStorage.setItem('bl_loggedIn', 'true');
  // Also seed business name into app settings
  DB.set('businessName', biz);
  document.getElementById('login-screen').classList.add('hidden');
  toast('🎉 Welcome, ' + owner + '! Account created.');
};

window.handleLogin = function() {
  const pin = document.getElementById('login-pin').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  let userData = null;
  try { userData = JSON.parse(localStorage.getItem('bl_user')); } catch {}
  if (!userData || !userData.pin) { errEl.textContent = 'No account found. Please refresh.'; return; }
  if (pin !== userData.pin) { errEl.textContent = '❌ Incorrect PIN. Please try again.'; document.getElementById('login-pin').value = ''; document.getElementById('login-pin').focus(); return; }
  localStorage.setItem('bl_loggedIn', 'true');
  document.getElementById('login-screen').classList.add('hidden');
  toast('✅ Welcome back, ' + (userData.ownerName || 'User') + '!');
};

window.handleLogout = function() {
  if (!confirm('Logout and lock the app?')) return;
  localStorage.setItem('bl_loggedIn', 'false');
  toast('Logged out. Reloading…', 'error');
  setTimeout(() => location.reload(), 900);
};

/* ═══════════════════════════════════════
   PAGE: CALCULATOR
═══════════════════════════════════════ */
pages.calculator = function() {
  document.getElementById('page-title').textContent = 'Business Calculator';
  document.getElementById('content').innerHTML = `
  <div style="max-width:680px">
    <div class="calc-tabs">
      <div class="calc-tab active" onclick="switchCalcTab('gst',this)">🧾 GST Calculator</div>
      <div class="calc-tab" onclick="switchCalcTab('margin',this)">📈 Profit Margin</div>
      <div class="calc-tab" onclick="switchCalcTab('reorder',this)">📦 Reorder Quantity</div>
    </div>

    <!-- GST Calculator -->
    <div class="calc-panel active" id="calc-gst">
      <div class="card">
        <div class="card-title">🧾 GST Calculator</div>
        <p style="font-size:13px;color:var(--text2);margin-bottom:20px;">Calculate GST on any amount. Supports inclusive and exclusive modes.</p>
        <div class="form-row">
          <div class="calc-input-group" style="flex:1">
            <label>Amount (₹)</label>
            <input type="number" id="gst-amount" placeholder="e.g. 1000" min="0" oninput="calcGST()">
          </div>
          <div class="calc-input-group" style="flex:1">
            <label>GST Rate (%)</label>
            <select id="gst-rate" onchange="calcGST()">
              <option value="0">0% (Exempt)</option>
              <option value="5">5%</option>
              <option value="12" selected>12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>
          <div class="calc-input-group" style="flex:1">
            <label>Mode</label>
            <select id="gst-mode" onchange="calcGST()">
              <option value="exclusive">Exclusive (Add GST)</option>
              <option value="inclusive">Inclusive (Extract GST)</option>
            </select>
          </div>
        </div>
        <div class="calc-result-box" id="gst-result" style="display:none">
          <div class="calc-result-row"><span>Base Amount</span><span class="val" id="gst-base">—</span></div>
          <div class="calc-result-row"><span>CGST (<span id="gst-half-lbl">9</span>%)</span><span class="val" id="gst-cgst">—</span></div>
          <div class="calc-result-row"><span>SGST (<span id="gst-half-lbl2">9</span>%)</span><span class="val" id="gst-sgst">—</span></div>
          <div class="calc-result-row"><span>Total GST</span><span class="val" id="gst-total-gst">—</span></div>
          <div class="calc-result-row total"><span>Final Amount (with GST)</span><span class="val" id="gst-final">—</span></div>
        </div>
      </div>
    </div>

    <!-- Profit Margin Calculator -->
    <div class="calc-panel" id="calc-margin">
      <div class="card">
        <div class="card-title">📈 Profit Margin Calculator</div>
        <p style="font-size:13px;color:var(--text2);margin-bottom:20px;">Find out your profit amount and margin % from cost and selling price.</p>
        <div class="form-row">
          <div class="calc-input-group" style="flex:1">
            <label>Cost Price (₹)</label>
            <input type="number" id="pm-cost" placeholder="e.g. 600" min="0" oninput="calcMargin()">
          </div>
          <div class="calc-input-group" style="flex:1">
            <label>Selling Price (₹)</label>
            <input type="number" id="pm-sell" placeholder="e.g. 900" min="0" oninput="calcMargin()">
          </div>
        </div>
        <div class="calc-input-group">
          <label>GST Rate on Sale (%) — Optional</label>
          <select id="pm-gst" onchange="calcMargin()">
            <option value="0">0% (No GST)</option>
            <option value="5">5%</option>
            <option value="12">12%</option>
            <option value="18" selected>18%</option>
            <option value="28">28%</option>
          </select>
        </div>
        <div class="calc-result-box" id="margin-result" style="display:none">
          <div class="calc-result-row"><span>Cost Price</span><span class="val" id="pm-r-cost">—</span></div>
          <div class="calc-result-row"><span>Selling Price (excl. GST)</span><span class="val" id="pm-r-sell">—</span></div>
          <div class="calc-result-row"><span>GST Amount</span><span class="val" id="pm-r-gst">—</span></div>
          <div class="calc-result-row"><span>Gross Profit</span><span class="val" id="pm-r-profit">—</span></div>
          <div class="calc-result-row"><span>Profit Margin %</span><span class="val" id="pm-r-margin">—</span></div>
          <div class="calc-result-row"><span>Markup %</span><span class="val" id="pm-r-markup">—</span></div>
          <div class="calc-result-row total"><span>Customer Pays (incl. GST)</span><span class="val" id="pm-r-final">—</span></div>
        </div>
      </div>
    </div>

    <!-- Reorder Quantity Calculator -->
    <div class="calc-panel" id="calc-reorder">
      <div class="card">
        <div class="card-title">📦 Reorder Quantity Calculator</div>
        <p style="font-size:13px;color:var(--text2);margin-bottom:20px;">Calculate the optimal reorder point and Economic Order Quantity (EOQ).</p>
        <div class="form-row">
          <div class="calc-input-group" style="flex:1">
            <label>Daily Sales (units/day)</label>
            <input type="number" id="rq-daily" placeholder="e.g. 20" min="0" oninput="calcReorder()">
          </div>
          <div class="calc-input-group" style="flex:1">
            <label>Lead Time (days)</label>
            <input type="number" id="rq-lead" placeholder="e.g. 5" min="0" oninput="calcReorder()">
          </div>
        </div>
        <div class="form-row">
          <div class="calc-input-group" style="flex:1">
            <label>Safety Stock (units)</label>
            <input type="number" id="rq-safety" placeholder="e.g. 50" min="0" oninput="calcReorder()">
          </div>
          <div class="calc-input-group" style="flex:1">
            <label>Annual Demand (units)</label>
            <input type="number" id="rq-annual" placeholder="e.g. 7300" min="0" oninput="calcReorder()">
          </div>
        </div>
        <div class="form-row">
          <div class="calc-input-group" style="flex:1">
            <label>Ordering Cost per Order (₹)</label>
            <input type="number" id="rq-order-cost" placeholder="e.g. 500" min="0" oninput="calcReorder()">
          </div>
          <div class="calc-input-group" style="flex:1">
            <label>Holding Cost per Unit/Year (₹)</label>
            <input type="number" id="rq-hold" placeholder="e.g. 20" min="0" oninput="calcReorder()">
          </div>
        </div>
        <div class="calc-result-box" id="reorder-result" style="display:none">
          <div class="calc-result-row"><span>Reorder Point (ROP)</span><span class="val" id="rq-r-rop">—</span></div>
          <div class="calc-result-row"><span>Safety Stock</span><span class="val" id="rq-r-safety">—</span></div>
          <div class="calc-result-row"><span>Avg Stock During Lead Time</span><span class="val" id="rq-r-avg">—</span></div>
          <div class="calc-result-row"><span>EOQ (Economic Order Qty)</span><span class="val" id="rq-r-eoq">—</span></div>
          <div class="calc-result-row total"><span>Orders Per Year</span><span class="val" id="rq-r-orders">—</span></div>
        </div>
      </div>
    </div>
  </div>`;
};

window.switchCalcTab = function(tab, el) {
  document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.calc-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('calc-' + tab).classList.add('active');
};

window.calcGST = function() {
  const amount = parseFloat(document.getElementById('gst-amount').value) || 0;
  const rate = parseFloat(document.getElementById('gst-rate').value) || 0;
  const mode = document.getElementById('gst-mode').value;
  const result = document.getElementById('gst-result');
  if (amount <= 0) { result.style.display = 'none'; return; }
  result.style.display = 'block';
  let base, gstAmt, final;
  if (mode === 'exclusive') {
    base = amount;
    gstAmt = base * rate / 100;
    final = base + gstAmt;
  } else {
    final = amount;
    base = amount / (1 + rate / 100);
    gstAmt = final - base;
  }
  const half = rate / 2;
  document.getElementById('gst-half-lbl').textContent = half;
  document.getElementById('gst-half-lbl2').textContent = half;
  document.getElementById('gst-base').textContent = fmt(base);
  document.getElementById('gst-cgst').textContent = fmt(gstAmt / 2);
  document.getElementById('gst-sgst').textContent = fmt(gstAmt / 2);
  document.getElementById('gst-total-gst').textContent = fmt(gstAmt);
  document.getElementById('gst-final').textContent = fmt(final);
};

window.calcMargin = function() {
  const cost = parseFloat(document.getElementById('pm-cost').value) || 0;
  const sell = parseFloat(document.getElementById('pm-sell').value) || 0;
  const gstRate = parseFloat(document.getElementById('pm-gst').value) || 0;
  const result = document.getElementById('margin-result');
  if (cost <= 0 || sell <= 0) { result.style.display = 'none'; return; }
  result.style.display = 'block';
  const gstAmt = sell * gstRate / 100;
  const finalPrice = sell + gstAmt;
  const profit = sell - cost;
  const margin = (profit / sell) * 100;
  const markup = (profit / cost) * 100;
  document.getElementById('pm-r-cost').textContent = fmt(cost);
  document.getElementById('pm-r-sell').textContent = fmt(sell);
  document.getElementById('pm-r-gst').textContent = fmt(gstAmt);
  document.getElementById('pm-r-profit').textContent = fmt(profit);
  document.getElementById('pm-r-margin').textContent = margin.toFixed(2) + '%';
  document.getElementById('pm-r-markup').textContent = markup.toFixed(2) + '%';
  document.getElementById('pm-r-final').textContent = fmt(finalPrice);
};

window.calcReorder = function() {
  const daily = parseFloat(document.getElementById('rq-daily').value) || 0;
  const lead = parseFloat(document.getElementById('rq-lead').value) || 0;
  const safety = parseFloat(document.getElementById('rq-safety').value) || 0;
  const annual = parseFloat(document.getElementById('rq-annual').value) || 0;
  const orderCost = parseFloat(document.getElementById('rq-order-cost').value) || 0;
  const hold = parseFloat(document.getElementById('rq-hold').value) || 0;
  const result = document.getElementById('reorder-result');
  if (daily <= 0 || lead <= 0) { result.style.display = 'none'; return; }
  result.style.display = 'block';
  const rop = (daily * lead) + safety;
  const avg = daily * lead;
  const eoq = (orderCost > 0 && hold > 0 && annual > 0)
    ? Math.sqrt((2 * annual * orderCost) / hold)
    : 0;
  const ordersPerYear = eoq > 0 ? (annual / eoq) : 0;
  document.getElementById('rq-r-rop').textContent = Math.round(rop) + ' units';
  document.getElementById('rq-r-safety').textContent = Math.round(safety) + ' units';
  document.getElementById('rq-r-avg').textContent = Math.round(avg) + ' units';
  document.getElementById('rq-r-eoq').textContent = eoq > 0 ? Math.round(eoq) + ' units' : '— (fill all fields)';
  document.getElementById('rq-r-orders').textContent = ordersPerYear > 0 ? ordersPerYear.toFixed(1) + ' orders/year' : '—';
};

/* ═══════════════════════════════════════════════════════
   TRANSLATION OBJECT — EN / HI
═══════════════════════════════════════════════════════ */
const LANG = {
  EN: {
    pill: 'EN', label: 'English',
    navItems: {
      dashboard: 'Dashboard', pos: 'POS / Billing', inventory: 'Inventory',
      sales: 'Sales Analytics', expenses: 'Expenses', pl: 'Profit & Loss',
      balance: 'Balance Sheet', gst: 'GST Dashboard', cashbook: 'Bank / Cash Book',
      customers: 'Customers', suppliers: 'Suppliers', reports: 'Reports',
      manual: 'User Manual', settings: 'Settings'
    },
    sections: { Core: 'Core', Finance: 'Finance', 'Tax & Bank': 'Tax & Bank', CRM: 'CRM', System: 'System' },
    pageTitle: {
      dashboard: 'Overview Dashboard', pos: 'POS / Billing', inventory: 'Inventory',
      sales: 'Sales Analytics', expenses: 'Expenses', pl: 'Profit & Loss',
      balance: 'Balance Sheet', gst: 'GST Dashboard', cashbook: 'Bank / Cash Book',
      customers: 'Customers & Suppliers', suppliers: 'Customers & Suppliers',
      reports: 'Reports', manual: 'User Manual', settings: 'Settings'
    }
  },
  HI: {
    pill: 'HI', label: 'हिंदी',
    navItems: {
      dashboard: 'डैशबोर्ड', pos: 'बिलिंग', inventory: 'इन्वेंटरी',
      sales: 'बिक्री विश्लेषण', expenses: 'खर्च', pl: 'लाभ-हानि',
      balance: 'बैलेंस शीट', gst: 'जीएसटी डैशबोर्ड', cashbook: 'बैंक / कैश बुक',
      customers: 'ग्राहक', suppliers: 'सप्लायर', reports: 'रिपोर्ट',
      manual: 'उपयोगकर्ता मैनुअल', settings: 'सेटिंग्स'
    },
    sections: { Core: 'मुख्य', Finance: 'वित्त', 'Tax & Bank': 'कर और बैंक', CRM: 'सीआरएम', System: 'सिस्टम' },
    pageTitle: {
      dashboard: 'ओवरव्यू डैशबोर्ड', pos: 'बिलिंग', inventory: 'इन्वेंटरी',
      sales: 'बिक्री विश्लेषण', expenses: 'खर्च', pl: 'लाभ-हानि',
      balance: 'बैलेंस शीट', gst: 'जीएसटी डैशबोर्ड', cashbook: 'बैंक / कैश बुक',
      customers: 'ग्राहक और सप्लायर', suppliers: 'ग्राहक और सप्लायर',
      reports: 'रिपोर्ट', manual: 'उपयोगकर्ता मैनुअल', settings: 'सेटिंग्स'
    }
  }
};

let _currentLang = 'EN';

/* ── FIXED handleLangSwitch ── */
window.handleLangSwitch = function() {
  _currentLang = (_currentLang === 'EN') ? 'HI' : 'EN';
  const t = LANG[_currentLang];
  const pill = document.getElementById('lang-pill');
  const label = document.getElementById('lang-label');
  if (pill) pill.textContent = t.pill;
  if (label) label.textContent = t.label;

  // Update all nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    const icon = el.querySelector('.icon');
    if (icon && t.navItems[page]) {
      el.innerHTML = '';
      el.appendChild(icon);
      el.appendChild(document.createTextNode(' ' + t.navItems[page]));
    }
  });

  // Update nav section labels
  document.querySelectorAll('.nav-section').forEach(el => {
    const key = el.textContent.trim();
    // Try to find a match in the EN sections to get the canonical key
    const enSections = LANG.EN.sections;
    for (const [enKey, enVal] of Object.entries(enSections)) {
      if (el.getAttribute('data-section') === enKey || el.textContent.trim() === enKey || el.textContent.trim() === LANG.HI.sections[enKey]) {
        el.setAttribute('data-section', enKey);
        el.textContent = t.sections[enKey] || enKey;
        break;
      }
    }
  });

  // Update topbar page title for current page
  const titleEl = document.getElementById('page-title');
  if (titleEl) {
    // find current active nav page
    const active = document.querySelector('.nav-item.active');
    if (active) {
      const page = active.getAttribute('data-page');
      if (t.pageTitle[page]) titleEl.textContent = t.pageTitle[page];
    }
  }
  const langName = _currentLang === 'EN' ? 'English' : 'हिंदी';
  toast(`🌐 Language: ${langName}`, 'success');
};

/* ── Tag nav-sections with data-section on load ── */
(function tagNavSections() {
  const enKeys = Object.keys(LANG.EN.sections);
  document.querySelectorAll('.nav-section').forEach(el => {
    const txt = el.textContent.trim();
    if (enKeys.includes(txt)) el.setAttribute('data-section', txt);
  });
})();

/* ═══════════════════════════════════════════════════════
   CHATBOT ENGINE
═══════════════════════════════════════════════════════ */
(function initChatbot() {
  const fab    = document.getElementById('cr-chat-fab');
  const panel  = document.getElementById('cr-chat-panel');
  const msgs   = document.getElementById('cr-chat-messages');
  const input  = document.getElementById('cr-chat-input');
  const sendBtn= document.getElementById('cr-chat-send');
  const micBtn = document.getElementById('cr-chat-mic');

  // Toggle panel
  fab.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    fab.classList.toggle('active', open);
    if (open && msgs.children.length === 0) botSay(
      'नमस्ते! 👋 I\'m ChitRagupt AI. Ask me anything about your inventory, sales, or finances!\n\n' +
      'Try: "best selling product", "total sales today", "stock of Product A", "total profit", "low stock items"'
    );
    if (open) setTimeout(() => input.focus(), 100);
  });

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });

  function handleSend() {
    const q = input.value.trim();
    if (!q) return;
    userSay(q);
    input.value = '';
    const typing = showTyping();
    setTimeout(() => {
      typing.remove();
      botSay(answerQuery(q));
    }, 420);
  }

  function userSay(text) {
    const div = document.createElement('div');
    div.className = 'cr-msg user';
    div.innerHTML = `<div class="cr-msg-bubble">${escHtml(text)}</div>`;
    msgs.appendChild(div);
    scrollBottom();
  }

  function botSay(text) {
    const div = document.createElement('div');
    div.className = 'cr-msg bot';
    div.innerHTML = `<div class="cr-bot-icon">🤖</div><div class="cr-msg-bubble">${escHtml(text).replace(/\n/g,'<br>')}</div>`;
    msgs.appendChild(div);
    scrollBottom();
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'cr-msg bot';
    div.innerHTML = `<div class="cr-bot-icon">🤖</div><div class="cr-msg-bubble cr-typing"><span></span><span></span><span></span></div>`;
    msgs.appendChild(div);
    scrollBottom();
    return div;
  }

  function scrollBottom() { msgs.scrollTop = msgs.scrollHeight; }
  function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── RULE-BASED QUERY ENGINE using Calc object ── */
  function answerQuery(q) {
    const lq = q.toLowerCase();
    const products  = Calc.products();
    const sales     = Calc.sales();
    const expenses  = Calc.expenses();

    // ── BEST SELLING PRODUCT
    if (/best.sel|top.product|most.sold|sabse zyada|popular product/i.test(lq)) {
      const tally = {};
      sales.forEach(s => s.items.forEach(it => {
        tally[it.name] = (tally[it.name] || 0) + (it.qty || 1);
      }));
      const sorted = Object.entries(tally).sort((a,b) => b[1]-a[1]);
      if (!sorted.length) return '📊 No sales data yet. Complete some sales first!';
      const [name, qty] = sorted[0];
      const rest = sorted.slice(1,3).map(([n,q]) => `${n} (${q} units)`).join(', ');
      return `🏆 Best selling: **${name}** with ${qty} units sold.${rest ? `\n\nRunners-up: ${rest}` : ''}`;
    }

    // ── STOCK OF A SPECIFIC PRODUCT
    const stockMatch = lq.match(/stock\s+(?:of\s+)?(.+)|(.+)\s+(?:ka\s+)?stock|how much.+?(?:of\s+)?(.+)/i);
    if (stockMatch && /stock|kitna|quantity|inventory/i.test(lq)) {
      const term = (stockMatch[1] || stockMatch[2] || stockMatch[3] || '').trim().toLowerCase();
      if (term.length > 1) {
        const found = products.filter(p => p.name.toLowerCase().includes(term));
        if (!found.length) return `❌ No product found matching "${term}". Check your inventory!`;
        return found.map(p =>
          `📦 **${p.name}**: ${p.stock} units in stock\n   Price: ₹${p.price} | GST: ${p.gstRate}%`
        ).join('\n\n');
      }
    }

    // ── TOTAL SALES TODAY
    if (/today.s?|aaj|today/i.test(lq) && /sale|revenue|billing/i.test(lq)) {
      const today = new Date().toDateString();
      const todaySales = sales.filter(s => new Date(s.date).toDateString() === today);
      const amt = todaySales.reduce((sum,s) => sum+s.finalTotal, 0);
      return `📅 Today's Sales: **${fmt(amt)}** across ${todaySales.length} order(s).`;
    }

    // ── TOTAL SALES (all time)
    if (/total.sale|overall.sale|kitna.bika|all.sale|revenue/i.test(lq)) {
      return `💰 Total Revenue: **${fmt(Calc.totalSales())}**\n   Orders: ${Calc.totalOrders()}\n   GST Collected: ${fmt(Calc.totalGSTCollected())}`;
    }

    // ── TOTAL PROFIT
    if (/profit|munafa|net.earning|earning/i.test(lq)) {
      const p = Calc.profit();
      const icon = p >= 0 ? '📈' : '📉';
      return `${icon} Net Profit: **${fmt(p)}**\n   Revenue: ${fmt(Calc.totalSales())}\n   Expenses: ${fmt(Calc.totalExpenses())}`;
    }

    // ── TOTAL EXPENSES
    if (/expense|kharcha|spending|cost/i.test(lq)) {
      const byCategory = {};
      expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category]||0)+e.amount; });
      const cats = Object.entries(byCategory).slice(0,4).map(([c,a]) => `  • ${c}: ${fmt(a)}`).join('\n');
      return `💸 Total Expenses: **${fmt(Calc.totalExpenses())}**\n\nBy Category:\n${cats || '  (no categories)'}`;
    }

    // ── LOW STOCK / OUT OF STOCK
    if (/low.stock|kam.stock|stock.alert|out.of.stock|reorder|khatam/i.test(lq)) {
      const low = products.filter(p => p.stock <= 10).sort((a,b) => a.stock-b.stock);
      if (!low.length) return '✅ All products have good stock levels (>10 units).';
      return `⚠️ Low Stock Alert (≤10 units):\n\n` + low.map(p => `📦 ${p.name}: **${p.stock} units**`).join('\n');
    }

    // ── INVENTORY VALUE
    if (/inventory.value|stock.value|total.inventory|saman/i.test(lq)) {
      return `🏪 Total Inventory Value: **${fmt(Calc.inventoryValue())}**\n   Products: ${products.length}`;
    }

    // ── HOW MANY PRODUCTS
    if (/how many product|product count|kitne product|products do/i.test(lq)) {
      return `📦 You have **${products.length} products** in inventory.\n` + products.map(p=>`  • ${p.name} (${p.stock} units)`).join('\n');
    }

    // ── GST
    if (/gst|tax/i.test(lq)) {
      return `🧮 GST Summary:\n   Collected: **${fmt(Calc.totalGSTCollected())}**\n   Net Payable: ${fmt(Calc.netGST())}`;
    }

    // ── CASH BALANCE
    if (/cash|balance|paisa|funds/i.test(lq)) {
      return `💵 Cash Balance: **${fmt(Calc.cashBalance())}**\n   (Revenue minus Expenses)`;
    }

    // ── CUSTOMER RECEIVABLE
    if (/customer|receivable|pending.payment|udhar/i.test(lq)) {
      const cust = DB.get('customers',[]);
      return `👥 Customers: **${cust.length}**\n   Total Receivable: ${fmt(Calc.totalReceivable())}`;
    }

    // ── LIST ALL PRODUCTS
    if (/list.*product|show.*product|all product|product list/i.test(lq)) {
      if (!products.length) return '📦 No products in inventory yet.';
      return `📦 Products (${products.length}):\n\n` +
        products.map(p => `  • **${p.name}** — ₹${p.price} | Stock: ${p.stock} | GST: ${p.gstRate}%`).join('\n');
    }

    // ── RECENT SALES
    if (/recent.sale|last.sale|latest.order|order/i.test(lq)) {
      if (!sales.length) return '📋 No sales recorded yet.';
      const recent = [...sales].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
      return `📋 Recent Sales:\n\n` + recent.map(s =>
        `  ${fmtShort(s.date)} — **${fmt(s.finalTotal)}** | ${s.customer || 'Walk-in'}`
      ).join('\n');
    }

    // ── HELP
    if (/help|kya.kar|what can|commands/i.test(lq)) {
      return `🤖 I can answer:\n\n• "best selling product"\n• "stock of [product name]"\n• "total sales today"\n• "total profit"\n• "low stock items"\n• "total expenses"\n• "inventory value"\n• "GST summary"\n• "recent sales"\n• "list all products"\n• "customer balance"`;
    }

    // ── FALLBACK: try product name match
    const matchedProduct = products.find(p => lq.includes(p.name.toLowerCase()));
    if (matchedProduct) {
      const p = matchedProduct;
      const prodSales = sales.filter(s => s.items.some(it => it.name === p.name));
      const unitsSold = prodSales.reduce((sum,s) => {
        const it = s.items.find(i => i.name === p.name);
        return sum + (it ? it.qty : 0);
      }, 0);
      return `📦 **${p.name}**\n   Price: ₹${p.price} | GST: ${p.gstRate}%\n   Stock: ${p.stock} units\n   Units Sold: ${unitsSold}`;
    }

    return `🤔 I didn't understand that. Try asking:\n• "best selling product"\n• "stock of Product A"\n• "total sales today"\n• "show profit"\n\nOr type "help" for all commands.`;
  }

  /* ═══════════════════════════════
     VOICE INPUT — Web Speech API
  ═══════════════════════════════ */
  let recognition = null;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startRecognition(targetInput, btnEl) {
    if (!SpeechRec) {
      toast('🎤 Voice input not supported in this browser. Try Chrome.', 'error');
      return;
    }
    if (recognition) { recognition.stop(); return; }
    recognition = new SpeechRec();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    btnEl.classList.add('listening');
    recognition.start();

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      targetInput.value = transcript;
      targetInput.dispatchEvent(new Event('input'));
    };
    recognition.onerror = () => { btnEl.classList.remove('listening'); recognition = null; };
    recognition.onend = () => { btnEl.classList.remove('listening'); recognition = null; };
  }

  // Chatbot panel mic
  micBtn.addEventListener('click', () => startRecognition(input, micBtn));

  // Topbar mic button — opens chatbot and fills input
  const topbarMic = document.getElementById('topbar-mic-btn');
  if (topbarMic) {
    topbarMic.addEventListener('click', () => {
      if (!panel.classList.contains('open')) {
        panel.classList.add('open');
        fab.classList.add('active');
        if (msgs.children.length === 0) botSay(
          'नमस्ते! 👋 I\'m ChitRagupt AI. Listening…'
        );
      }
      startRecognition(input, topbarMic);
    });
  }

})(); // end initChatbot


/* ═══════════════════════════════════════
   INIT — boot sequence
═══════════════════════════════════════ */
seedIfEmpty();
navigate('dashboard');