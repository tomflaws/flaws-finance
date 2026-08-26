// Flaws Family Finance — Main App Logic

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  // Auto-login if previously authenticated
  const stored = localStorage.getItem('flaws_finance_auth');
  if (stored && stored === btoa(CONFIG.APP_PASSWORD)) {
    unlockApp();
    return;
  }

  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('dash-month').textContent = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('gate-password').addEventListener('keydown', e => { if (e.key === 'Enter') checkPassword(); });

  // Set today's date as default for fee modal
  document.getElementById('fee-date').value = new Date().toISOString().split('T')[0];

  // Render tax deadlines immediately
  renderTaxDeadlines();
  renderQuarterGrid();
});

// ===== PASSWORD GATE =====
function checkPassword() {
  const val = document.getElementById('gate-password').value;
  if (val === CONFIG.APP_PASSWORD) {
    localStorage.setItem('flaws_finance_auth', btoa(CONFIG.APP_PASSWORD));
    unlockApp();
  } else {
    document.getElementById('gate-error').textContent = 'Incorrect password.';
    document.getElementById('gate-password').value = '';
  }
}

function unlockApp() {
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initApp();
}



async function initApp() {
  await Promise.all([
    loadFeesFromGoogleDrive(),
    loadAssets(),
    loadAllPlaidData(),
    loadCollege(),
    loadFeesFromGoogleDrive(),
    loadAccountTags(),
    loadTaxPayments(),
  ]);
  renderDashboard();
  updateConnectionCount();
}

// ===== TAB NAVIGATION =====
function showTab(name, btn) {
  if (name === "feeincome") { loadFeesFromGoogleDrive(); }
  if (name === "college") { loadCollege(); }
  if (name === "taxes") { renderFeeByQuarter(); }
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.remove('hidden');
  if (btn) btn.classList.add('active');
}

// ===== DASHBOARD =====
function renderDashboard() {
  // Cash & savings
  const cashAccounts = plaidAccounts.filter(a => a.type === 'depository');
  const cashTotal = cashAccounts.reduce((s, a) => s + (a.balances?.current || 0), 0);

  // Investments — exclude 529-tagged accounts
  const tagged529Ids = Object.entries(accountTags).filter(([_,v]) => v.tag === 'college_529').map(([k]) => k);
  const invAccounts = plaidAccounts.filter(a => (a.type === 'investment' || a.type === 'brokerage') && !tagged529Ids.includes(a.account_id));
  const invTotal = invAccounts.reduce((s, a) => s + (a.balances?.current || 0), 0);

  // Credit balances
  const creditAccounts = plaidAccounts.filter(a => a.type === 'credit');
  const creditTotal = creditAccounts.reduce((s, a) => s + (a.balances?.current || 0), 0);

  if (cashTotal || invTotal || creditTotal) {
    document.getElementById('dash-cash').textContent = fmt(cashTotal);
    document.getElementById('dash-investments').textContent = fmt(invTotal);
    document.getElementById('dash-credit').textContent = fmt(creditTotal);
  }

  // College savings dashboard card
  const tagged529 = plaidAccounts.filter(a => accountTags[a.account_id]?.tag === 'college_529');
  const collegeTotal = tagged529.reduce((s,a) => s + (a.balances?.current||0), 0) +
                       collegeData.reduce((s,a) => s + Number(a.value||0), 0);
  const collegEl = document.getElementById('dash-college');
  if (collegEl) collegEl.textContent = fmt(collegeTotal);

  // Net worth (from networth calculation)
  const nw = calcNetWorth();
  if (nw !== null) {
    document.getElementById('dash-networth').textContent = fmt(nw);
  }

  // Fee income YTD
  const year = new Date().getFullYear();
  const ytdFees = feeData.filter(f => f.date.startsWith(year)).reduce((s, f) => s + Number(f.amount), 0);
  document.getElementById('dash-fee-ytd').textContent = fmt(ytdFees);
  document.getElementById('fee-ytd').textContent = fmt(ytdFees);

  // Recent fees on dashboard
  const recentFees = feeData.slice(0, 3);
  const feeEl = document.getElementById('dash-fee-recent');
  feeEl.innerHTML = recentFees.map(f => `
    <div class="fee-recent-item">
      <span>${f.client_name}</span>
      <span class="fee-recent-amount">${fmt(f.amount)}</span>
    </div>
  `).join('');

  // Spending this month
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthTxns = plaidTransactions.filter(t => t.date.startsWith(monthStr) && t.amount > 0);
  const spendEl = document.getElementById('dash-spending-list');
  if (monthTxns.length) {
    const total = monthTxns.reduce((s, t) => s + t.amount, 0);
    spendEl.innerHTML = `<div style="font-family:'DM Serif Display',serif;font-size:28px;color:var(--navy);margin-bottom:8px">${fmt(total)}</div><div style="font-size:12px;color:var(--text-light)">${monthTxns.length} transactions</div>`;
  } else {
    spendEl.innerHTML = '<div class="list-empty">No spending data yet.</div>';
  }
}

// ===== NET WORTH =====
let assetData = [];

async function loadAssets() {
  try {
    const data = await dbGetAssets();
    assetData = data || [];
    renderNetWorth();
  } catch (e) {
    console.warn('Assets load failed:', e);
    assetData = [];
  }
}

function calcNetWorth() {
  const tagged529Ids = Object.entries(accountTags).filter(([_,v]) => v.tag === "college_529").map(([k]) => k);
  const financialAssets = plaidAccounts.filter(a => !tagged529Ids.includes(a.account_id))
    .filter(a => a.type !== 'credit' && a.type !== 'loan')
    .reduce((s, a) => s + (a.balances?.current || 0), 0);

  const liabilities = plaidAccounts
    .filter(a => a.type === 'credit' || a.type === 'loan')
    .reduce((s, a) => s + (a.balances?.current || 0), 0);

  const realEstate = assetData
    .filter(a => a.type === 'real_estate')
    .reduce((s, a) => s + Number(a.value || 0), 0);

  const reMortgages = assetData
    .filter(a => a.type === 'real_estate')
    .reduce((s, a) => s + Number(a.mortgage || 0), 0);

  const vehicles = assetData
    .filter(a => a.type === 'vehicle')
    .reduce((s, a) => s + Number(a.value || 0), 0);

  return financialAssets + realEstate + vehicles - liabilities - reMortgages;
}

function renderNetWorth() {
  const nw = calcNetWorth();
  document.getElementById('nw-total').textContent = fmt(nw);
  document.getElementById('dash-networth').textContent = fmt(nw);

  // Financial accounts
  const financialAccounts = plaidAccounts.filter(a => a.type !== 'credit' && a.type !== 'loan');
  const financialTotal = financialAccounts.reduce((s, a) => s + (a.balances?.current || 0), 0);
  document.getElementById('nw-accounts-total').textContent = fmt(financialTotal);
  const acctEl = document.getElementById('nw-accounts-list');
  if (financialAccounts.length) {
    acctEl.innerHTML = financialAccounts.map(a => `
      <div class="nw-item">
        <span class="nw-item-label">${a.name}</span>
        <span class="nw-item-value">${fmt(a.balances?.current || 0)}</span>
      </div>
    `).join('');
  } else {
    acctEl.innerHTML = '<div class="list-empty">No accounts connected.</div>';
  }

  // Real estate
  const reAssets = assetData.filter(a => a.type === 'real_estate');
  const reTotal = reAssets.reduce((s, a) => s + Number(a.value || 0) - Number(a.mortgage || 0), 0);
  document.getElementById('nw-real-estate-total').textContent = fmt(reTotal);
  const reEl = document.getElementById('nw-real-estate-list');
  reEl.innerHTML = reAssets.length ? reAssets.map(a => `
    <div class="nw-item">
      <div>
        <div class="nw-item-label">${a.label}</div>
        ${a.mortgage ? `<div style="font-size:11px;color:var(--text-light)">Mortgage: -${fmt(a.mortgage)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="nw-item-value">${fmt(Number(a.value) - Number(a.mortgage || 0))}</span>
        <div class="nw-item-actions"><button onclick="deleteAsset('${a.id}')">✕</button></div>
      </div>
    </div>
  `).join('') : '<div class="list-empty">No properties added.</div>';

  // Vehicles
  const vehAssets = assetData.filter(a => a.type === 'vehicle');
  const vehTotal = vehAssets.reduce((s, a) => s + Number(a.value || 0), 0);
  document.getElementById('nw-vehicles-total').textContent = fmt(vehTotal);
  const vehEl = document.getElementById('nw-vehicles-list');
  vehEl.innerHTML = vehAssets.length ? vehAssets.map(a => `
    <div class="nw-item">
      <span class="nw-item-label">${a.label}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="nw-item-value">${fmt(a.value)}</span>
        <div class="nw-item-actions"><button onclick="deleteAsset('${a.id}')">✕</button></div>
      </div>
    </div>
  `).join('') : '<div class="list-empty">No vehicles added.</div>';

  // Liabilities
  const liabilityAccounts = plaidAccounts.filter(a => a.type === 'credit' || a.type === 'loan');
  const liabTotal = liabilityAccounts.reduce((s, a) => s + (a.balances?.current || 0), 0);
  document.getElementById('nw-liabilities-total').textContent = `-${fmt(liabTotal)}`;
  const liabEl = document.getElementById('nw-liabilities-list');
  liabEl.innerHTML = liabilityAccounts.length ? liabilityAccounts.map(a => `
    <div class="nw-item">
      <span class="nw-item-label">${a.name}</span>
      <span class="nw-item-value neg">-${fmt(a.balances?.current || 0)}</span>
    </div>
  `).join('') : '<div class="list-empty">No liabilities from connected accounts.</div>';
}

async function saveRealEstate() {
  const address = document.getElementById('re-address').value.trim();
  const value = document.getElementById('re-value').value;
  const mortgage = document.getElementById('re-mortgage').value || 0;
  if (!address || !value) { showToast('Please fill in address and value.', 'error'); return; }
  await dbInsertAsset({ type: 'real_estate', label: address, value: Number(value), mortgage: Number(mortgage) });
  closeModal('real-estate-modal');
  document.getElementById('re-address').value = '';
  document.getElementById('re-value').value = '';
  document.getElementById('re-mortgage').value = '';
  await loadAssets();
  showToast('Property saved.', 'success');
}

async function saveVehicle() {
  const name = document.getElementById('veh-name').value.trim();
  const year = document.getElementById('veh-year').value;
  const value = document.getElementById('veh-value').value;
  if (!name || !value) { showToast('Please fill in vehicle name and value.', 'error'); return; }
  const label = year ? `${year} ${name}` : name;
  await dbInsertAsset({ type: 'vehicle', label, value: Number(value) });
  closeModal('vehicle-modal');
  document.getElementById('veh-name').value = '';
  document.getElementById('veh-year').value = '';
  document.getElementById('veh-value').value = '';
  await loadAssets();
  showToast('Vehicle saved.', 'success');
}

async function deleteAsset(id) {
  if (!confirm('Remove this asset?')) return;
  await dbDeleteAsset(id);
  await loadAssets();
  showToast('Asset removed.');
}

// ===== FEE INCOME =====
let feeData = [];

async function loadFees() {
  try {
    const data = await dbGetFees();
    feeData = data || [];
    renderFees();
    renderDashboard();
  } catch (e) {
    console.warn('Fees load failed:', e);
    feeData = [];
  }
}

function renderFees() {
  const year = new Date().getFullYear();
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const ytd = feeData.filter(f => f.date.startsWith(String(year))).reduce((s, f) => s + Number(f.amount), 0);
  const month = feeData.filter(f => f.date.startsWith(monthStr)).reduce((s, f) => s + Number(f.amount), 0);
  const twelveMonths = new Date(); twelveMonths.setFullYear(twelveMonths.getFullYear() - 1);
  const last12 = feeData.filter(f => new Date(f.date) >= twelveMonths).reduce((s, f) => s + Number(f.amount), 0);

  document.getElementById('fee-ytd').textContent = fmt(ytd);
  document.getElementById('fee-month').textContent = fmt(month);
  document.getElementById('fee-12mo').textContent = fmt(last12);
  document.getElementById('fee-count').textContent = feeData.length;

  const el = document.getElementById('fee-list');
  if (!feeData.length) {
    el.innerHTML = '<div class="list-empty">No fees logged yet. Click "+ Log Fee" to add one.</div>';
    return;
  }

  el.innerHTML = `
    <div class="fee-row" style="font-weight:600;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid var(--border)">
      <div>Date</div><div>Client / Case</div><div>Area</div><div style="text-align:right">Fee</div>
    </div>
  ` + feeData.map(f => `
    <div class="fee-row">
      <div class="fee-date">${formatDate(f.date)}</div>
      <div>
        <div class="fee-client">${f.client_name}</div>
        ${f.notes ? `<div style="font-size:11px;color:var(--text-light)">${f.notes}</div>` : ''}
      </div>
      <div class="fee-area">${f.practice_area}</div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
        <div class="fee-amount-cell">${fmt(f.amount)}</div>
        <button class="fee-delete" onclick="deleteFee('${f.id}')">✕</button>
      </div>
    </div>
  `).join('');
}

async function saveFee() {
  const date = document.getElementById('fee-date').value;
  const client = document.getElementById('fee-client').value.trim();
  const amount = document.getElementById('fee-amount').value;
  const area = document.getElementById('fee-area').value;
  const notes = document.getElementById('fee-notes').value.trim();

  if (!date || !client || !amount) { showToast('Please fill in date, client, and amount.', 'error'); return; }

  await dbInsertFee({ date, client_name: client, amount: Number(amount), practice_area: area, notes });
  closeModal('fee-modal');
  document.getElementById('fee-client').value = '';
  document.getElementById('fee-amount').value = '';
  document.getElementById('fee-notes').value = '';
  document.getElementById('fee-date').value = new Date().toISOString().split('T')[0];
  await loadFeesFromGoogleDrive();
  showToast('Fee logged.', 'success');
}

async function deleteFee(id) {
  if (!confirm('Delete this fee entry?')) return;
  await dbDeleteFee(id);
  await loadFeesFromGoogleDrive();
  showToast('Fee removed.');
}

// ===== TAX CENTER =====
const TAX_QUARTERS_2026 = [
  { q: 'Q1', label: 'Q1 2026', due: 'April 15, 2026', period: 'Jan 1 – Mar 31' },
  { q: 'Q2', label: 'Q2 2026', due: 'June 16, 2026', period: 'Apr 1 – May 31' },
  { q: 'Q3', label: 'Q3 2026', due: 'September 15, 2026', period: 'Jun 1 – Aug 31' },
  { q: 'Q4', label: 'Q4 2026', due: 'January 15, 2027', period: 'Sep 1 – Dec 31' },
];

let taxPayments = {};

async function loadTaxPayments() {
  try {
    const data = await dbGetTaxPayments();
    taxPayments = {};
    (data || []).forEach(p => { taxPayments[`${p.year}-${p.quarter}`] = p; }); // quarter may be 'Q1-FED' or 'Q1-MA'
    renderQuarterGrid();
  } catch (e) {
    console.warn('Tax payments load failed:', e);
  }
}

function renderQuarterGrid() {
  const year = 2026;
  const today = new Date();
  const el = document.getElementById('quarter-grid');
  if (!el) return;

  el.innerHTML = TAX_QUARTERS_2026.map(q => {
    const fedKey = `${year}-${q.q}-FED`;
    const maKey = `${year}-${q.q}-MA`;
    const fed = taxPayments[fedKey] || {};
    const ma = taxPayments[maKey] || {};
    const fedPaid = fed.status === 'paid';
    const maPaid = ma.status === 'paid';
    const dueDate = new Date(q.due);
    const isOverdue = dueDate < today;
    const bothPaid = fedPaid && maPaid;
    const cardClass = bothPaid ? 'paid' : (isOverdue && !bothPaid ? 'overdue' : 'upcoming');
    const fedTotal = Number(fed.amount || 0);
    const maTotal = Number(ma.amount || 0);
    const combined = fedTotal + maTotal;

    return `
      <div class="quarter-card ${cardClass}">
        <div class="quarter-label">${q.label}</div>
        <div class="quarter-due">Due: ${q.due} · ${q.period}</div>
        <div id="quarter-total-${q.q}" style="font-size:13px;font-weight:700;color:var(--navy);margin:6px 0">${combined > 0 ? 'Total: ' + fmt(combined) : ''}</div>

        <div style="margin-top:8px;font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.06em">🇺🇸 Federal</div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <input type="number" class="quarter-amount-input" style="flex:1" placeholder="Amount" value="${fed.amount || ''}"
            oninput="updateQuarterTotal('${year}','${q.q}',this);saveTaxPaymentSplit('${year}','${q.q}','FED',this.value)"
            id="fed-amt-${q.q}" />
          <button style="padding:6px 10px;border-radius:5px;border:1px solid var(--border);background:${fedPaid ? 'var(--green)' : 'white'};color:${fedPaid ? 'white' : 'var(--text-mid)'};cursor:pointer;font-size:11px"
            onclick="toggleTaxPaymentStatus('${year}','${q.q}','FED')">${fedPaid ? '✓ Paid' : 'Mark Paid'}</button>
        </div>

        <div style="margin-top:10px;font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.06em">🦞 Massachusetts</div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <input type="number" class="quarter-amount-input" style="flex:1" placeholder="Amount" value="${ma.amount || ''}"
            oninput="updateQuarterTotal('${year}','${q.q}',this);saveTaxPaymentSplit('${year}','${q.q}','MA',this.value)"
            id="ma-amt-${q.q}" />
          <button style="padding:6px 10px;border-radius:5px;border:1px solid var(--border);background:${maPaid ? 'var(--green)' : 'white'};color:${maPaid ? 'white' : 'var(--text-mid)'};cursor:pointer;font-size:11px"
            onclick="toggleTaxPaymentStatus('${year}','${q.q}','MA')">${maPaid ? '✓ Paid' : 'Mark Paid'}</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateQuarterTotal(year, quarter, changedInput) {
  const fedEl = document.getElementById('fed-amt-' + quarter);
  const maEl = document.getElementById('ma-amt-' + quarter);
  const totalEl = document.getElementById('quarter-total-' + quarter);
  if (!fedEl || !maEl || !totalEl) return;
  const fed = Number(fedEl.value) || 0;
  const ma = Number(maEl.value) || 0;
  const combined = fed + ma;
  totalEl.textContent = combined > 0 ? 'Total: ' + fmt(combined) : '';
}

async function saveTaxPaymentSplit(year, quarter, jurisdiction, amount) {
  const key = `${year}-${quarter}-${jurisdiction}`;
  const existing = taxPayments[key] || {};
  await dbUpsertTaxPayment({ year: Number(year), quarter: `${quarter}-${jurisdiction}`, amount: Number(amount), status: existing.status || 'pending' });
  if (!taxPayments[key]) taxPayments[key] = {};
  taxPayments[key].amount = Number(amount);
  renderQuarterGrid();
}

async function toggleTaxPaymentStatus(year, quarter, jurisdiction) {
  const key = `${year}-${quarter}-${jurisdiction}`;
  const existing = taxPayments[key] || {};
  const newStatus = existing.status === 'paid' ? 'pending' : 'paid';
  await dbUpsertTaxPayment({ year: Number(year), quarter: `${quarter}-${jurisdiction}`, amount: Number(existing.amount || 0), status: newStatus });
  taxPayments[key] = { ...existing, status: newStatus };
  renderQuarterGrid();
}

// Legacy aliases
async function setQuarterStatus(year, quarter, status) {}
async function saveTaxPayment(year, quarter, amount, status) {}

function renderTaxDeadlines() {
  const el = document.getElementById('dash-tax-deadline');
  if (!el) return;
  const today = new Date();
  const upcoming = TAX_QUARTERS_2026.map(q => ({ ...q, dueDate: new Date(q.due) }))
    .filter(q => q.dueDate >= today)
    .sort((a, b) => a.dueDate - b.dueDate);

  if (!upcoming.length) {
    el.innerHTML = '<div class="deadline-item"><span>All 2026 quarterly deadlines passed.</span></div>';
    return;
  }

  el.innerHTML = upcoming.slice(0, 3).map((q, i) => `
    <div class="deadline-item ${i === 0 ? 'next' : ''}">
      <div>
        <div class="deadline-label">${i === 0 ? '▶ NEXT DUE' : q.label}</div>
        <div style="font-size:13px;font-weight:500;color:${i===0?'white':'var(--navy)'}">${i === 0 ? q.label : q.period}</div>
      </div>
      <div class="deadline-date">${q.due}</div>
    </div>
  `).join('');
}

// ===== TAX CALCULATIONS =====

// 2026 Federal brackets MFJ
const FED_BRACKETS_MFJ = [
  { max: 23850, rate: 0.10 }, { max: 96950, rate: 0.12 },
  { max: 206700, rate: 0.22 }, { max: 394600, rate: 0.24 },
  { max: 501050, rate: 0.32 }, { max: 751600, rate: 0.35 },
  { max: Infinity, rate: 0.37 }
];
const FED_BRACKETS_SINGLE = [
  { max: 11925, rate: 0.10 }, { max: 48475, rate: 0.12 },
  { max: 103350, rate: 0.22 }, { max: 197300, rate: 0.24 },
  { max: 250525, rate: 0.32 }, { max: 626350, rate: 0.35 },
  { max: Infinity, rate: 0.37 }
];
const STD_DEDUCTION_MFJ = 30000;
const STD_DEDUCTION_SINGLE = 15000;

function applyBrackets(taxable, brackets) {
  let tax = 0, prev = 0;
  for (const b of brackets) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, b.max) - prev) * b.rate;
    prev = b.max;
  }
  return tax;
}

function calcBothTaxes() {
  const fedIncome = Number(document.getElementById('fed-income').value) || 0;
  const fedOther = Number(document.getElementById('fed-other').value) || 0;
  const fedDed = Number(document.getElementById('fed-deductions').value) || 0;
  const filing = document.getElementById('fed-filing').value;

  // Auto-fill MA income from Federal
  const maIncomeEl = document.getElementById('ma-income');
  if (!maIncomeEl.value && fedIncome) maIncomeEl.value = fedIncome;
  const maIncome = Number(maIncomeEl.value) || 0;
  const maOther = Number(document.getElementById('ma-other').value) || 0;
  const maDed = Number(document.getElementById('ma-deductions').value) || 0;

  if (!fedIncome && !maIncome) {
    document.getElementById('federal-results').innerHTML = '';
    document.getElementById('ma-results').innerHTML = '';
    document.getElementById('combined-results').innerHTML = '';
    return;
  }

  // === FEDERAL ===
  const grossFed = fedIncome + fedOther;
  const netSE = fedIncome * 0.9235;
  const seTax = netSE * 0.153;
  const seDeduction = seTax * 0.5;
  const agi = grossFed - fedDed - seDeduction;
  const stdDed = filing === 'mfj' ? STD_DEDUCTION_MFJ : STD_DEDUCTION_SINGLE;
  const fedTaxable = Math.max(0, agi - stdDed);
  const brackets = filing === 'mfj' ? FED_BRACKETS_MFJ : FED_BRACKETS_SINGLE;
  const fedIncomeTax = applyBrackets(fedTaxable, brackets);
  const fedTotal = fedIncomeTax + seTax;
  const fedEffective = grossFed > 0 ? (fedTotal / grossFed * 100).toFixed(1) : 0;
  const fedQuarterly = fedTotal / 4;

  document.getElementById('federal-results').innerHTML = `
    <div class="calc-line"><span>Gross Income</span><span>${fmt(grossFed)}</span></div>
    <div class="calc-line"><span>SE Tax Deduction</span><span>-${fmt(seDeduction)}</span></div>
    <div class="calc-line"><span>Business Deductions</span><span>-${fmt(fedDed)}</span></div>
    <div class="calc-line"><span>Standard Deduction</span><span>-${fmt(stdDed)}</span></div>
    <div class="calc-line"><span>Federal Taxable Income</span><span>${fmt(fedTaxable)}</span></div>
    <div class="calc-line"><span>Federal Income Tax</span><span>${fmt(fedIncomeTax)}</span></div>
    <div class="calc-line"><span>Self-Employment Tax (15.3%)</span><span>${fmt(seTax)}</span></div>
    <div class="calc-line"><span>Effective Rate</span><span>${fedEffective}%</span></div>
    <div class="calc-line"><span>Quarterly Estimate</span><span>${fmt(fedQuarterly)}</span></div>
    <div class="calc-line"><span>Federal Total</span><span>${fmt(fedTotal)}</span></div>
  `;

  // === MASSACHUSETTS ===
  const grossMA = maIncome + maOther;
  const maTaxable = Math.max(0, grossMA - maDed);
  let maTax = 0;
  if (maTaxable <= 1000000) {
    maTax = maTaxable * 0.05;
  } else {
    maTax = 1000000 * 0.05 + (maTaxable - 1000000) * 0.09;
  }
  const maEffective = grossMA > 0 ? (maTax / grossMA * 100).toFixed(1) : 0;
  const maQuarterly = maTax / 4;

  document.getElementById('ma-results').innerHTML = `
    <div class="calc-line"><span>Gross MA Income</span><span>${fmt(grossMA)}</span></div>
    <div class="calc-line"><span>MA Deductions</span><span>-${fmt(maDed)}</span></div>
    <div class="calc-line"><span>MA Taxable Income</span><span>${fmt(maTaxable)}</span></div>
    ${maTaxable > 1000000 ? `<div class="calc-line"><span>First $1M @ 5%</span><span>${fmt(50000)}</span></div><div class="calc-line"><span>Over $1M @ 9%</span><span>${fmt((maTaxable-1000000)*0.09)}</span></div>` : `<div class="calc-line"><span>MA Rate (5%)</span><span>5%</span></div>`}
    <div class="calc-line"><span>Effective Rate</span><span>${maEffective}%</span></div>
    <div class="calc-line"><span>Quarterly Estimate</span><span>${fmt(maQuarterly)}</span></div>
    <div class="calc-line"><span>MA Total</span><span>${fmt(maTax)}</span></div>
  `;

  // === COMBINED ===
  const combinedTotal = fedTotal + maTax;
  const combinedEffective = grossFed > 0 ? (combinedTotal / grossFed * 100).toFixed(1) : 0;
  const combinedQuarterly = combinedTotal / 4;

  document.getElementById('combined-results').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:8px">
      <div><div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em">Federal Total</div><div style="font-family:'DM Serif Display',serif;font-size:26px;color:white">${fmt(fedTotal)}</div></div>
      <div><div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em">MA Total</div><div style="font-family:'DM Serif Display',serif;font-size:26px;color:white">${fmt(maTax)}</div></div>
      <div><div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em">Combined Total</div><div style="font-family:'DM Serif Display',serif;font-size:26px;color:var(--gold-light)">${fmt(combinedTotal)}</div></div>
      <div><div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em">Effective Rate</div><div style="font-size:20px;font-weight:600;color:white">${combinedEffective}%</div></div>
      <div><div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em">Quarterly Estimate</div><div style="font-family:'DM Serif Display',serif;font-size:26px;color:var(--gold-light)">${fmt(combinedQuarterly)}</div></div>
      <div><div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em">Monthly Set-Aside</div><div style="font-family:'DM Serif Display',serif;font-size:26px;color:white">${fmt(combinedTotal/12)}</div></div>
    </div>
  `;
}

// Keep old functions as aliases for compatibility
function calcSETax() { calcBothTaxes(); }
function calcAnnualTax() { calcBothTaxes(); }

// Fee by quarter — called after fees load
function renderFeeByQuarter() {
  const year = new Date().getFullYear();
  const quarterMap = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

  // Get fees from the Google Drive data via feeincome-gdrive
  // We need to access the fees from the DOM or re-fetch — use a global
  if (typeof window._feeData === 'undefined') return;

  const closedFees = window._feeData.filter(f => f.status && f.status.toLowerCase() === 'closed');
  closedFees.forEach(f => {
    // Try month field first, fall back to date field
    let mo = null;
    if (f.month && f.month.startsWith(String(year))) {
      mo = parseInt(f.month.split('-')[1]);
    } else if (f.date && f.date.startsWith(String(year))) {
      mo = parseInt(f.date.split('-')[1]);
    }
    if (!mo) return;
    const income = Number(f.yourIncome || 0);
    if (mo <= 3) quarterMap.Q1 += income;
    else if (mo <= 6) quarterMap.Q2 += income;
    else if (mo <= 9) quarterMap.Q3 += income;
    else quarterMap.Q4 += income;
  });

  const ytd = Object.values(quarterMap).reduce((s, v) => s + v, 0);
  ['Q1','Q2','Q3','Q4'].forEach((q, i) => {
    const el = document.getElementById('fee-q' + (i+1));
    if (el) el.textContent = fmt(quarterMap[q]);
  });
  const ytdEl = document.getElementById('tax-fee-ytd');
  if (ytdEl) ytdEl.textContent = fmt(ytd);

  // Pre-fill the federal income field with YTD
  const fedEl = document.getElementById('fed-income');
  if (fedEl && !fedEl.value && ytd > 0) {
    fedEl.value = Math.round(ytd);
    calcBothTaxes();
  }
}

// ===== MODAL HELPERS =====
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function closeModalOutside(event, id) {
  if (event.target === document.getElementById(id)) closeModal(id);
}

// ===== TOAST =====
function showToast(msg, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== UTILITIES =====
function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonth(str) {
  const [y, m] = str.split('-');
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ===== COLLEGE SAVINGS (529) =====
let collegeData = [];

async function loadCollege() {
  try {
    const data = await dbGetAssets();
    collegeData = (data || []).filter(a => a.type === 'college_529');
    renderCollege();
    renderNetWorth529();
  } catch (e) {
    console.warn('College load failed:', e);
  }
}

function renderCollege() {
  // Plaid-tagged 529 accounts
  const tagged529 = plaidAccounts.filter(a => accountTags[a.account_id]?.tag === 'college_529');
  const plaidTotal = tagged529.reduce((s, a) => s + (a.balances?.current || 0), 0);

  // Manually entered 529s
  const manualTotal = collegeData.reduce((s, a) => s + Number(a.value || 0), 0);
  const contributed = collegeData.reduce((s, a) => s + Number(a.mortgage || 0), 0);
  const grandTotal = plaidTotal + manualTotal;
  const growth = grandTotal - contributed;

  if (document.getElementById('college-total')) document.getElementById('college-total').textContent = fmt(grandTotal);
  if (document.getElementById('college-contributed')) document.getElementById('college-contributed').textContent = fmt(contributed);
  if (document.getElementById('college-growth')) document.getElementById('college-growth').textContent = fmt(growth);
  if (document.getElementById('college-count')) document.getElementById('college-count').textContent = tagged529.length + collegeData.length;

  const el = document.getElementById('college-list');
  if (!el) return;

  const plaidItems = tagged529.map(a => {
    const tag = accountTags[a.account_id] || {};
    return `
      <div class="nw-item" style="border-left:3px solid var(--gold);padding-left:10px">
        <div>
          <div class="nw-item-label" style="font-weight:600">${a.name}</div>
          <div style="font-size:11px;color:var(--text-light)">${tag.beneficiary ? 'Beneficiary: ' + tag.beneficiary : ''} · ${a.institution_name || ''}</div>
          <div style="font-size:10px;color:var(--gold);font-weight:600">Auto-synced from Plaid</div>
        </div>
        <span class="nw-item-value" style="color:var(--gold);font-size:18px">${fmt(a.balances?.current || 0)}</span>
      </div>`;
  });

  const manualItems = collegeData.map(a => {
    const g = Number(a.value) - Number(a.mortgage || 0);
    return `
      <div class="nw-item">
        <div>
          <div class="nw-item-label" style="font-weight:600">${a.label}</div>
          <div style="font-size:11px;color:var(--text-light)">Contributed: ${fmt(a.mortgage || 0)} · Growth: <span style="color:${g >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(g)}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="nw-item-value" style="color:var(--gold);font-size:18px">${fmt(a.value)}</span>
          <button onclick="deleteAsset('${a.id}')" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:12px">✕</button>
        </div>
      </div>`;
  });

  const all = [...plaidItems, ...manualItems];
  el.innerHTML = all.length ? all.join('') : '<div class="list-empty">No 529 accounts yet. Tag a Plaid account above or click "+ Add 529 Account".</div>';

  // Update net worth 529 section
  const nwEl = document.getElementById('nw-529-list');
  if (nwEl) {
    const nwItems = [
      ...tagged529.map(a => `<div class="nw-item"><span class="nw-item-label">${a.name} (${accountTags[a.account_id]?.beneficiary || '529'})</span><span class="nw-item-value" style="color:var(--gold)">${fmt(a.balances?.current || 0)}</span></div>`),
      ...collegeData.map(a => `<div class="nw-item"><span class="nw-item-label">${a.label}</span><span class="nw-item-value" style="color:var(--gold)">${fmt(a.value)}</span></div>`)
    ];
    nwEl.innerHTML = nwItems.length ? nwItems.join('') : '<div class="list-empty">No 529 accounts added.</div>';
    if (document.getElementById('nw-529-total')) document.getElementById('nw-529-total').textContent = fmt(grandTotal);
  }
}

function renderNetWorth529() {
  const total = collegeData.reduce((s, a) => s + Number(a.value || 0), 0);
  document.getElementById('nw-529-total').textContent = fmt(total);
  const el = document.getElementById('nw-529-list');
  if (!collegeData.length) {
    el.innerHTML = '<div class="list-empty">No 529 accounts added. <a href="#" onclick="showTab(\'college\',null);return false;" style="color:var(--navy)">Add in College Savings tab →</a></div>';
    return;
  }
  el.innerHTML = collegeData.map(a => `
    <div class="nw-item">
      <span class="nw-item-label">${a.label}</span>
      <span class="nw-item-value" style="color:var(--gold)">${fmt(a.value)}</span>
    </div>
  `).join('');
}

async function saveCollege529() {
  const beneficiary = document.getElementById('college-beneficiary').value.trim();
  const plan = document.getElementById('college-plan').value.trim();
  const balance = document.getElementById('college-balance').value;
  const contrib = document.getElementById('college-contrib').value || 0;
  if (!beneficiary || !balance) { showToast('Please fill in beneficiary and balance.', 'error'); return; }
  const label = `${plan || '529'} — ${beneficiary}`;
  await dbInsertAsset({ type: 'college_529', label, value: Number(balance), mortgage: Number(contrib), notes: plan });
  closeModal('college-modal');
  document.getElementById('college-beneficiary').value = '';
  document.getElementById('college-plan').value = '';
  document.getElementById('college-balance').value = '';
  document.getElementById('college-contrib').value = '';
  await loadCollege();
  showToast('529 account saved.', 'success');
}

// ===== ACCOUNT TAGGING =====
let accountTags = {};

async function loadAccountTags() {
  try {
    const data = await dbGetAssets();
    accountTags = {};
    (data || []).filter(a => a.type === 'account_tag').forEach(a => {
      const parts = a.label.split('::');
      if (parts.length >= 2) {
        accountTags[parts[0]] = { tag: parts[1], beneficiary: parts[2] || '' };
      }
    });
  } catch (e) {
    console.warn('Account tags load failed:', e);
  }
}

async function saveAccountTag(accountId, tag, beneficiary) {
  // Remove existing tag for this account
  try {
    const data = await dbGetAssets();
    const existing = (data || []).find(a => a.type === 'account_tag' && a.label === accountId);
    if (existing) await dbDeleteAsset(existing.id);
  } catch (e) {}

  if (tag && tag !== 'default') {
    const ben = beneficiary || '';
    await dbInsertAsset({ type: 'account_tag', label: accountId + '::' + tag + '::' + ben, value: 0, mortgage: 0 });
    accountTags[accountId] = { tag, beneficiary: ben };
  }
  accountTags[accountId] = { tag, beneficiary };
  closeModal('account-tag-modal');
  renderAccounts();
  renderNetWorth();
  renderCollege();
  showToast('Account tagged.', 'success');
}

function openAccountTagModal(accountId, accountName) {
  const existing = accountTags[accountId] || {};
  document.getElementById('tag-account-id').value = accountId;
  document.getElementById('tag-account-name').textContent = accountName;
  document.getElementById('tag-type').value = existing.tag || 'default';
  document.getElementById('tag-beneficiary').value = existing.beneficiary || '';
  document.getElementById('tag-beneficiary-row').style.display = existing.tag === 'college_529' ? 'flex' : 'none';
  openModal('account-tag-modal');
}

function onTagTypeChange() {
  const val = document.getElementById('tag-type').value;
  document.getElementById('tag-beneficiary-row').style.display = val === 'college_529' ? 'flex' : 'none';
}
