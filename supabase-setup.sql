-- Run this in your Supabase SQL editor to create the required tables

-- Fee income log
CREATE TABLE IF NOT EXISTS fee_income (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  client_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  practice_area TEXT,
  notes TEXT
);

-- Manual assets (real estate, vehicles)
CREATE TABLE IF NOT EXISTS manual_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  type TEXT NOT NULL, -- 'real_estate' or 'vehicle'
  label TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  mortgage NUMERIC(12,2) DEFAULT 0
);

-- Plaid item metadata (institution names, etc.) — public info only
CREATE TABLE IF NOT EXISTS plaid_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  item_id TEXT UNIQUE NOT NULL,
  institution_name TEXT,
  institution_id TEXT
);

-- Plaid access tokens — server-side only, protected by service key
CREATE TABLE IF NOT EXISTS plaid_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  item_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL
);

-- Quarterly estimated tax payments
CREATE TABLE IF NOT EXISTS quarterly_taxes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  quarter TEXT NOT NULL, -- 'Q1','Q2','Q3','Q4'
  amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending', -- 'paid' or 'pending'
  UNIQUE(year, quarter)
);

-- Row Level Security: lock plaid_tokens to service role only
ALTER TABLE plaid_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No public access to tokens" ON plaid_tokens
  FOR ALL USING (false);

-- Allow public read/write on everything else (password-gated at app level)
ALTER TABLE fee_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON fee_income FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE manual_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON manual_assets FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON plaid_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quarterly_taxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON quarterly_taxes FOR ALL USING (true) WITH CHECK (true);
