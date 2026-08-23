// Supabase client (lightweight fetch-based, no npm needed)

const DB = {
  url: CONFIG.SUPABASE_URL,
  key: CONFIG.SUPABASE_ANON_KEY,

  async query(table, method = 'GET', body = null, params = '') {
    const res = await fetch(`${this.url}/rest/v1/${table}${params}`, {
      method,
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DB error: ${err}`);
    }
    if (method === 'DELETE') return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  async select(table, params = '') {
    return this.query(table, 'GET', null, params);
  },

  async insert(table, data) {
    return this.query(table, 'POST', data);
  },

  async update(table, data, params) {
    return this.query(table, 'PATCH', data, params);
  },

  async delete(table, params) {
    return this.query(table, 'DELETE', null, params);
  },

  async upsert(table, data, params = '') {
    const res = await fetch(`${this.url}/rest/v1/${table}${params}`, {
      method: 'POST',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
};

// ===== DATABASE OPERATIONS =====

async function dbInit() {
  // Create tables if they don't exist (via Supabase SQL or assume they exist)
  // Tables needed: fee_income, plaid_items, manual_assets, quarterly_taxes
  console.log('DB initialized');
}

// Fee Income
async function dbGetFees() {
  return DB.select('fee_income', '?order=date.desc');
}

async function dbInsertFee(fee) {
  return DB.insert('fee_income', fee);
}

async function dbDeleteFee(id) {
  return DB.delete('fee_income', `?id=eq.${id}`);
}

// Manual Assets (real estate, vehicles)
async function dbGetAssets() {
  return DB.select('manual_assets', '?order=created_at.desc');
}

async function dbInsertAsset(asset) {
  return DB.insert('manual_assets', asset);
}

async function dbDeleteAsset(id) {
  return DB.delete('manual_assets', `?id=eq.${id}`);
}

// Plaid access tokens (stored server-side in Vercel env, but we store item metadata here)
async function dbGetPlaidItems() {
  return DB.select('plaid_items', '?order=created_at.asc');
}

async function dbInsertPlaidItem(item) {
  return DB.insert('plaid_items', item);
}

async function dbDeletePlaidItem(id) {
  return DB.delete('plaid_items', `?id=eq.${id}`);
}

// Quarterly tax payments
async function dbGetTaxPayments() {
  return DB.select('quarterly_taxes', '?order=year.desc,quarter.asc');
}

async function dbUpsertTaxPayment(payment) {
  return DB.upsert('quarterly_taxes', payment, '?on_conflict=year,quarter');
}
