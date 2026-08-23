// Plaid Link integration

let plaidHandler = null;
let plaidAccounts = [];
let plaidTransactions = [];
let plaidHoldings = [];

async function openPlaidLink() {
  try {
    showToast('Connecting to Plaid...');
    // Get link token from our Vercel backend
    const res = await fetch(`${CONFIG.API_BASE}/create-link-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error('Could not get link token');
    const { link_token } = await res.json();

    plaidHandler = Plaid.create({
      token: link_token,
      onSuccess: async (public_token, metadata) => {
        await exchangePlaidToken(public_token, metadata);
      },
      onExit: (err) => {
        if (err) showToast('Connection cancelled.', 'error');
      },
      onEvent: (eventName) => {
        console.log('Plaid event:', eventName);
      },
    });

    plaidHandler.open();
  } catch (err) {
    console.error('Plaid link error:', err);
    showToast('Could not connect. Check API setup.', 'error');
  }
}

async function exchangePlaidToken(publicToken, metadata) {
  try {
    showToast('Linking account...');
    const res = await fetch(`${CONFIG.API_BASE}/exchange-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token: publicToken }),
    });

    if (!res.ok) throw new Error('Token exchange failed');
    const { access_token, item_id } = await res.json();

    // Save item metadata to Supabase
    await dbInsertPlaidItem({
      item_id,
      institution_name: metadata.institution?.name || 'Unknown',
      institution_id: metadata.institution?.institution_id,
    });

    showToast(`${metadata.institution?.name || 'Account'} connected!`, 'success');
    await loadAllPlaidData();
    updateConnectionCount();
  } catch (err) {
    console.error('Exchange error:', err);
    showToast('Account linking failed.', 'error');
  }
}

async function loadAllPlaidData() {
  try {
    const items = await dbGetPlaidItems();
    if (!items || items.length === 0) return;

    // Load accounts, transactions, and holdings from backend
    const [accountsRes, txRes, holdingsRes] = await Promise.all([
      fetch(`${CONFIG.API_BASE}/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
      fetch(`${CONFIG.API_BASE}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
      fetch(`${CONFIG.API_BASE}/holdings`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
    ]);

    if (accountsRes.ok) {
      const data = await accountsRes.json();
      plaidAccounts = data.accounts || [];
    }

    if (txRes.ok) {
      const data = await txRes.json();
      plaidTransactions = data.transactions || [];
    }

    if (holdingsRes.ok) {
      const data = await holdingsRes.json();
      plaidHoldings = data.holdings || [];
    }

    renderAccounts();
    renderTransactions();
    renderHoldings();
    renderNetWorth();
    renderDashboard();
    updateConnectionCount();

  } catch (err) {
    console.error('Error loading Plaid data:', err);
  }
}

function updateConnectionCount() {
  dbGetPlaidItems().then(items => {
    const count = items ? items.length : 0;
    document.getElementById('connection-count').textContent = `${count} / 10 connections`;
  });
}

// ===== RENDER FUNCTIONS =====

function renderAccounts() {
  const el = document.getElementById('accounts-list');
  if (!plaidAccounts.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⬡</div><p>No accounts connected yet.</p><button class="btn-primary" onclick="openPlaidLink()">Connect Your First Account</button></div>`;
    return;
  }

  el.innerHTML = plaidAccounts.map(acct => {
    const bal = acct.balances?.current ?? 0;
    const isNeg = acct.type === 'credit' || acct.type === 'loan';
    const tag = accountTags[acct.account_id] || {};
    const is529 = tag.tag === 'college_529';
    const tagBadge = is529
      ? `<div style="font-size:10px;background:var(--gold);color:var(--navy);padding:2px 7px;border-radius:10px;font-weight:600;display:inline-block;margin-top:3px">🎓 529 · ${tag.beneficiary || ''}</div>`
      : '';
    return `
      <div class="account-card" style="${is529 ? 'border-left:3px solid var(--gold)' : ''}">
        <div class="account-info">
          <div class="account-name">${acct.name}</div>
          <div class="account-type">${acct.subtype || acct.type}</div>
          <div class="account-institution">${acct.institution_name || ''}</div>
          ${tagBadge}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="account-balance ${isNeg ? 'negative' : ''}">${isNeg ? '-' : ''}${fmt(bal)}</div>
          <button onclick="openAccountTagModal('${acct.account_id}','${acct.name.replace(/'/g,"\\'")}')
" style="font-size:11px;background:var(--cream-dark);border:1px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;color:var(--text-mid)">⚙ Tag</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderTransactions() {
  const el = document.getElementById('transactions-list');
  if (!plaidTransactions.length) {
    el.innerHTML = '<div class="list-empty">Connect an account to see transactions.</div>';
    renderSpendingBreakdown([]);
    return;
  }

  // Populate month filter
  const months = [...new Set(plaidTransactions.map(t => t.date.substring(0, 7)))].sort().reverse();
  const monthFilter = document.getElementById('spending-month-filter');
  monthFilter.innerHTML = '<option value="">All Recent</option>' +
    months.map(m => `<option value="${m}">${formatMonth(m)}</option>`).join('');

  // Populate category filter
  const cats = [...new Set(plaidTransactions.map(t => t.personal_finance_category?.primary || t.category?.[0] || 'Other'))].sort();
  const catFilter = document.getElementById('spending-category-filter');
  catFilter.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');

  filterTransactions();
}

function filterTransactions() {
  const monthVal = document.getElementById('spending-month-filter').value;
  const catVal = document.getElementById('spending-category-filter').value;

  let filtered = plaidTransactions.filter(t => t.amount > 0); // exclude credits for spending

  if (monthVal) filtered = filtered.filter(t => t.date.startsWith(monthVal));
  if (catVal) filtered = filtered.filter(t => {
    const cat = t.personal_finance_category?.primary || t.category?.[0] || 'Other';
    return cat === catVal;
  });

  const el = document.getElementById('transactions-list');
  el.innerHTML = filtered.slice(0, 100).map(t => {
    const cat = t.personal_finance_category?.primary || t.category?.[0] || 'Other';
    return `
      <div class="transaction-row">
        <div class="txn-left">
          <div class="txn-name">${t.merchant_name || t.name}</div>
          <div class="txn-cat">${cat}</div>
          <div class="txn-date">${formatDate(t.date)}</div>
        </div>
        <div class="txn-amount">${fmt(Math.abs(t.amount))}</div>
      </div>
    `;
  }).join('');

  renderSpendingBreakdown(filtered);
}

function renderSpendingBreakdown(transactions) {
  const el = document.getElementById('spending-category-breakdown');
  if (!transactions.length) { el.innerHTML = '<div class="list-empty">No data.</div>'; return; }

  const byCategory = {};
  transactions.forEach(t => {
    const cat = t.personal_finance_category?.primary || t.category?.[0] || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + Math.abs(t.amount);
  });

  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  el.innerHTML = sorted.map(([cat, amt]) => `
    <div class="category-bar-row">
      <div class="category-bar-label">
        <span>${cat.replace(/_/g, ' ')}</span>
        <span>${fmt(amt)}</span>
      </div>
      <div class="category-bar-track">
        <div class="category-bar-fill" style="width:${Math.min(100, (amt/total)*100)}%"></div>
      </div>
    </div>
  `).join('');
}

function renderHoldings() {
  const el = document.getElementById('holdings-list');
  if (!plaidHoldings.length) {
    el.innerHTML = '<div class="list-empty">Connect an investment account to see holdings.</div>';
    document.getElementById('inv-total').textContent = '—';
    document.getElementById('inv-basis').textContent = '—';
    document.getElementById('inv-gain').textContent = '—';
    return;
  }

  let totalVal = 0, totalBasis = 0;
  plaidHoldings.forEach(h => {
    totalVal += h.institution_value || 0;
    totalBasis += h.cost_basis || 0;
  });

  const gain = totalVal - totalBasis;
  document.getElementById('inv-total').textContent = fmt(totalVal);
  document.getElementById('inv-basis').textContent = fmt(totalBasis);
  const gainEl = document.getElementById('inv-gain');
  gainEl.textContent = (gain >= 0 ? '+' : '') + fmt(gain);
  gainEl.style.color = gain >= 0 ? 'var(--green)' : 'var(--red)';

  el.innerHTML = `
    <div class="holding-row" style="font-weight:600;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid var(--border)">
      <div>Symbol</div><div>Name</div><div style="text-align:right">Value</div><div style="text-align:right">Cost Basis</div><div style="text-align:right">Gain/Loss</div>
    </div>
  ` + plaidHoldings.map(h => {
    const g = (h.institution_value || 0) - (h.cost_basis || 0);
    return `
      <div class="holding-row">
        <div class="holding-ticker">${h.security?.ticker_symbol || '—'}</div>
        <div><div class="holding-name">${h.security?.name || h.security?.unofficial_currency_code || 'Unknown'}</div></div>
        <div class="holding-val">${fmt(h.institution_value || 0)}</div>
        <div class="holding-val">${h.cost_basis ? fmt(h.cost_basis) : '—'}</div>
        <div class="holding-gain ${g >= 0 ? 'pos' : 'neg'}">${g !== 0 ? (g >= 0 ? '+' : '') + fmt(g) : '—'}</div>
      </div>
    `;
  }).join('');
}
