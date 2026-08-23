// Flaws Family Finance — Main App Logic

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
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
    document.getElementById('gate').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    initApp();
  } else {
    document.getElementById('gate-error').textContent = 'Incorrect password.';
    document.getElementById('gate-password').value = '';
  }
}

async function initApp() {
  await Promise.all([
    loadFees(),
    loadAssets(),
    loadAllPlaidData(),
    loadTaxPayments(),
  ]);
  renderDashboard();
  updateConnectionCount();
}

// ===== TAB NAVIGATION =====
function showTab(name, btn) {
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

  // Investments
  const invAccounts = plaidAccounts.filter(a => a.type === 'investment' || a.type === 'brokerage');
  const invTotal = invAccounts.reduce((s, a) => s + (a.balances?.current || 0), 0);

  // Credit balances
  const creditAccounts = plaidAccounts.filter(a => a.type === 'credit');
  const creditTotal = creditAccounts.reduce((s, a) => s + (a.balances?.current || 0), 0);

  if (cashTotal || invTotal || creditTotal) {
    document.getElementById('dash-cash').textContent = fmt(cashTotal);
    document.getElementById('dash-investments').textContent = fmt(invTotal);
    document.getElementById('dash-credit').textContent = fmt(creditTotal);
  }

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
  const financialAssets = plaidAccounts
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
  await loadFees();
  showToast('Fee logged.', 'success');
}

async function deleteFee(id) {
  if (!confirm('Delete this fee entry?')) return;
  await dbDeleteFee(id);
  await loadFees();
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
    (data || []).forEach(p => { taxPayments[`${p.year}-${p.quarter}`] = p; });
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
    const key = `${year}-${q.q}`;
    const saved = taxPayments[key] || {};
    const isPaid = saved.status === 'paid';
    const dueDate = new Date(q.due);
    const isOverdue = !isPaid && dueDate < today;
    const cardClass = isPaid ? 'paid' : (isOverdue ? 'overdue' : 'upcoming');

    return `
      <div class="quarter-card ${cardClass}">
        <div class="quarter-label">${q.label}</div>
        <div class="quarter-due">Due: ${q.due}</div>
        <div style="font-size:11px;color:var(--text-light)">${q.period}</div>
        <input type="number" class="quarter-amount-input" placeholder="Amount paid" value="${saved.amount || ''}"
          onchange="saveTaxPayment('${year}','${q.q}',this.value, document.getElementById('status-${q.q}').value)" />
        <div class="quarter-status" id="status-row-${q.q}">
          <button id="btn-paid-${q.q}" class="${isPaid ? 'active-paid' : ''}" onclick="setQuarterStatus('${year}','${q.q}','paid')">✓ Paid</button>
          <button id="btn-pending-${q.q}" class="${!isPaid && saved.status ? 'active-pending' : ''}" onclick="setQuarterStatus('${year}','${q.q}','pending')">Pending</button>
        </div>
        <input type="hidden" id="status-${q.q}" value="${saved.status || ''}" />
      </div>
    `;
  }).join('');
}

async function setQuarterStatus(year, quarter, status) {
  const amtInput = document.querySelector(`.quarter-card .quarter-amount-input`);
  const key = `${year}-${quarter}`;
  const existing = taxPayments[key] || {};
  await dbUpsertTaxPayment({ year: Number(year), quarter, status, amount: existing.amount || 0 });
  await loadTaxPayments();
}

async function saveTaxPayment(year, quarter, amount, status) {
  await dbUpsertTaxPayment({ year: Number(year), quarter, amount: Number(amount), status: status || 'pending' });
  const key = `${year}-${quarter}`;
  if (!taxPayments[key]) taxPayments[key] = {};
  taxPayments[key].amount = Number(amount);
}

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

// SE Tax Calculator
function calcSETax() {
  const income = Number(document.getElementById('se-income').value) || 0;
  if (!income) { document.getElementById('se-results').innerHTML = ''; return; }

  const netSE = income * 0.9235; // SE income subject to SE tax
  const seTax = netSE * 0.153; // 15.3% (12.4% SS + 2.9% Medicare)
  const deduction = seTax * 0.5; // Deductible half of SE tax
  const taxableIncome = income - deduction;

  document.getElementById('se-results').innerHTML = `
    <div class="calc-line"><span>Net SE Earnings (92.35%)</span><span>${fmt(netSE)}</span></div>
    <div class="calc-line"><span>Social Security (12.4%)</span><span>${fmt(netSE * 0.124)}</span></div>
    <div class="calc-line"><span>Medicare (2.9%)</span><span>${fmt(netSE * 0.029)}</span></div>
    <div class="calc-line"><span>SE Tax Deduction (50%)</span><span>-${fmt(deduction)}</span></div>
    <div class="calc-line"><span>Total SE Tax</span><span>${fmt(seTax)}</span></div>
  `;
}

// Annual Tax Calculator (2026 MFJ brackets, approximate)
const TAX_BRACKETS_MFJ_2026 = [
  { max: 23850, rate: 0.10 },
  { max: 96950, rate: 0.12 },
  { max: 206700, rate: 0.22 },
  { max: 394600, rate: 0.24 },
  { max: 501050, rate: 0.32 },
  { max: 751600, rate: 0.35 },
  { max: Infinity, rate: 0.37 },
];

const TAX_BRACKETS_SINGLE_2026 = [
  { max: 11925, rate: 0.10 },
  { max: 48475, rate: 0.12 },
  { max: 103350, rate: 0.22 },
  { max: 197300, rate: 0.24 },
  { max: 250525, rate: 0.32 },
  { max: 626350, rate: 0.35 },
  { max: Infinity, rate: 0.37 },
];

const STANDARD_DEDUCTION_MFJ_2026 = 30000;
const STANDARD_DEDUCTION_SINGLE_2026 = 15000;

function calcAnnualTax() {
  const gross = Number(document.getElementById('tax-income').value) || 0;
  const deductions = Number(document.getElementById('tax-deductions').value) || 0;
  const filing = document.getElementById('tax-filing').value;

  if (!gross) { document.getElementById('annual-results').innerHTML = ''; return; }

  const brackets = filing === 'mfj' ? TAX_BRACKETS_MFJ_2026 : TAX_BRACKETS_SINGLE_2026;
  const standardDeduction = filing === 'mfj' ? STANDARD_DEDUCTION_MFJ_2026 : STANDARD_DEDUCTION_SINGLE_2026;

  // SE tax
  const netSE = gross * 0.9235;
  const seTax = netSE * 0.153;
  const seDeduction = seTax * 0.5;

  // AGI
  const agi = gross - deductions - seDeduction;
  const taxable = Math.max(0, agi - standardDeduction);

  // Income tax
  let incomeTax = 0;
  let prev = 0;
  for (const bracket of brackets) {
    if (taxable <= prev) break;
    const chunk = Math.min(taxable, bracket.max) - prev;
    incomeTax += chunk * bracket.rate;
    prev = bracket.max;
  }

  const totalTax = incomeTax + seTax;
  const effectiveRate = gross > 0 ? (totalTax / gross * 100).toFixed(1) : 0;
  const quarterlyEstimate = totalTax / 4;

  document.getElementById('annual-results').innerHTML = `
    <div class="calc-line"><span>Gross Income</span><span>${fmt(gross)}</span></div>
    <div class="calc-line"><span>Business Deductions</span><span>-${fmt(deductions)}</span></div>
    <div class="calc-line"><span>SE Tax Deduction</span><span>-${fmt(seDeduction)}</span></div>
    <div class="calc-line"><span>Standard Deduction (${filing === 'mfj' ? 'MFJ' : 'Single'})</span><span>-${fmt(standardDeduction)}</span></div>
    <div class="calc-line"><span>Taxable Income</span><span>${fmt(taxable)}</span></div>
    <div class="calc-line"><span>Federal Income Tax</span><span>${fmt(incomeTax)}</span></div>
    <div class="calc-line"><span>Self-Employment Tax</span><span>${fmt(seTax)}</span></div>
    <div class="calc-line"><span>Effective Rate</span><span>${effectiveRate}%</span></div>
    <div class="calc-line"><span>Quarterly Estimate</span><span>${fmt(quarterlyEstimate)}</span></div>
    <div class="calc-line"><span>Estimated Total Tax</span><span>${fmt(totalTax)}</span></div>
  `;
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
