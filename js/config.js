// Flaws Family Finance — Configuration
// NOTE: Plaid Secret is handled server-side only (Vercel function)
// This file is safe to commit — no secrets here

const CONFIG = {
  APP_PASSWORD: 'L7zx15vy!@!@',
  PLAID_CLIENT_ID: '6a8b0842f953a8000dd09e4f',
  PLAID_ENV: 'production', // 'sandbox' for testing, 'production' for live
  SUPABASE_URL: 'https://hamxiiioxuzgvuzfrqce.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbXhpaWlveHV6Z3Z1emZycWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODcwODQsImV4cCI6MjA5NTI2MzA4NH0.XEWwxM5H-7TpDiMX-FEhVOEonhd4exFHJ-eNCXzZsqU',
  // Vercel backend URL — update after deploying
  API_BASE: 'https://flaws-finance-api.vercel.app/api',
};
