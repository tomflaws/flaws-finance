// Fee Income — reads live from Google Sheets via Vercel API

async function loadFeesFromGoogleDrive() {
  document.getElementById('fee-list').innerHTML = '<div class="list-empty">Loading from Google Drive...</div>';

  try {
    const res = await fetch(`${CONFIG.API_BASE}/fees`);
    if (!res.ok) throw new Error('Failed to fetch fees');
    const { fees } = await res.json();
    renderFeesFromGDrive(fees);
  } catch (err) {
    console.error('Fee load error:', err);
    document.getElementById('fee-list').innerHTML = '<div class="list-empty">Could not load fee data. Check API connection.</div>';
  }
}

function renderFeesFromGDrive(fees) {
  if (!fees || !fees.length) {
    document.getElementById('fee-list').innerHTML = '<div class="list-empty">No fee data found.</div>';
    return;
  }

  const SPREADSHEET_ID = '18mlrfeuGe3Ku9RkoG6D8d1GhJpM72f6D';

  // Only count closed cases for income figures
  const closedFees = fees.filter(f => f.status && f.status.toLowerCase() === 'closed');

  const year = new Date().getFullYear();
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const twelveMonths = new Date(); twelveMonths.setFullYear(twelveMonths.getFullYear() - 1);

  const ytd = closedFees.filter(f => f.month && f.month.startsWith(String(year))).reduce((s, f) => s + Number(f.yourIncome || 0), 0);
  const month = closedFees.filter(f => f.month === monthStr).reduce((s, f) => s + Number(f.yourIncome || 0), 0);
  const last12 = closedFees.filter(f => f.date && new Date(f.date) >= twelveMonths).reduce((s, f) => s + Number(f.yourIncome || 0), 0);

  document.getElementById('fee-ytd').textContent = fmt(ytd);
  document.getElementById('fee-month').textContent = fmt(month);
  document.getElementById('fee-12mo').textContent = fmt(last12);
  document.getElementById('fee-count').textContent = `${closedFees.length} closed / ${fees.length} total`;
  document.getElementById('dash-fee-ytd').textContent = fmt(ytd);

  // Dashboard recent fees (closed only, most recent first)
  const recentFees = [...closedFees].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
  document.getElementById('dash-fee-recent').innerHTML = recentFees.map(f => `
    <div class="fee-recent-item">
      <span>${f.caseName}</span>
      <span class="fee-recent-amount">${fmt(f.yourIncome)}</span>
    </div>
  `).join('');

  // Full fee list — all cases, sorted by date desc
  const sorted = [...fees].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const el = document.getElementById('fee-list');

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="font-size:12px;color:var(--text-light)">Live from Google Drive · <a href="https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}" target="_blank" style="color:var(--navy)">Open spreadsheet ↗</a></span>
      <button class="btn-secondary" style="font-size:11px;padding:5px 10px" onclick="loadFeesFromGoogleDrive()">↻ Refresh</button>
    </div>
    <div class="fee-row" style="font-weight:600;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid var(--border)">
      <div>Date</div><div>Case / Client</div><div>Area</div><div style="text-align:right">Your Income</div>
    </div>
  ` + sorted.map(f => {
    const isClosed = f.status && f.status.toLowerCase() === 'closed';
    return `
      <div class="fee-row" style="${!isClosed ? 'opacity:0.6' : ''}">
        <div class="fee-date">${f.date ? formatDate(f.date) : f.month || '—'}</div>
        <div>
          <div class="fee-client">${f.caseName}</div>
          <div style="font-size:11px;color:var(--text-light)">${f.client} · <span style="color:${isClosed ? 'var(--green)' : 'var(--text-light)'}">${f.status}</span></div>
        </div>
        <div class="fee-area">${f.practiceArea}</div>
        <div style="text-align:right">
          <div class="fee-amount-cell" style="color:${isClosed ? 'var(--green)' : 'var(--text-light)'}">${fmt(f.yourIncome)}</div>
          <div style="font-size:10px;color:var(--text-light)">of ${fmt(f.grossFee)} gross</div>
        </div>
      </div>
    `;
  }).join('');

  renderPracticeAreaBreakdown(closedFees);
}

function renderPracticeAreaBreakdown(fees) {
  const byArea = {};
  fees.forEach(f => {
    const area = f.practiceArea || 'Other';
    if (!byArea[area]) byArea[area] = { count: 0, income: 0 };
    byArea[area].count++;
    byArea[area].income += Number(f.yourIncome || 0);
  });

  const total = Object.values(byArea).reduce((s, a) => s + a.income, 0);
  const sorted = Object.entries(byArea).sort((a, b) => b[1].income - a[1].income);

  let paEl = document.getElementById('fee-practice-areas');
  if (!paEl) {
    const card = document.createElement('div');
    card.className = 'card mt-2';
    card.innerHTML = '<h2 class="card-title">By Practice Area (Closed Cases)</h2><div id="fee-practice-areas"></div>';
    document.getElementById('tab-feeincome').appendChild(card);
    paEl = document.getElementById('fee-practice-areas');
  }

  paEl.innerHTML = sorted.map(([area, data]) => `
    <div class="category-bar-row">
      <div class="category-bar-label">
        <span>${area} (${data.count} case${data.count !== 1 ? 's' : ''})</span>
        <span>${fmt(data.income)} · ${total > 0 ? Math.round(data.income/total*100) : 0}%</span>
      </div>
      <div class="category-bar-track">
        <div class="category-bar-fill" style="width:${total > 0 ? (data.income/total*100) : 0}%"></div>
      </div>
    </div>
  `).join('');
}
