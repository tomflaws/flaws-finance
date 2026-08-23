# Flaws Family Finance

Private family financial dashboard with Plaid bank integration.

## Architecture

- **Frontend:** GitHub Pages (`tomflaws.github.io/flaws-finance`) — password protected
- **Backend API:** Vercel serverless functions (`flaws-finance-api.vercel.app`) — holds Plaid secret
- **Database:** Supabase — fee income, assets, quarterly taxes

---

## Step 1: Supabase Setup

1. Go to your Supabase project dashboard
2. Click **SQL Editor** → **New Query**
3. Paste the contents of `supabase-setup.sql` and click **Run**
4. This creates all required tables with proper security

---

## Step 2: Deploy the Backend API to Vercel

1. Create a new GitHub repo called `flaws-finance-api`
2. Push the contents of the `flaws-finance-api/` folder to it
3. Go to [vercel.com](https://vercel.com) → **New Project** → import `flaws-finance-api`
4. In Vercel project settings → **Environment Variables**, add:

   | Variable | Value |
   |---|---|
   | `PLAID_CLIENT_ID` | `6a8b0842f953a8000dd09e4f` |
   | `PLAID_SECRET` | *(your Plaid secret)* |
   | `PLAID_ENV` | `production` |
   | `SUPABASE_URL` | `https://hamxiiioxuzgvuzfrqce.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | *(get from Supabase → Settings → API → service_role key)* |

5. Deploy. Note your Vercel URL (e.g. `https://flaws-finance-api.vercel.app`)

---

## Step 3: Update Frontend Config

In `js/config.js`, update the `API_BASE` line to your Vercel URL:

```js
API_BASE: 'https://flaws-finance-api.vercel.app/api',
```

---

## Step 4: Deploy Frontend to GitHub Pages

1. Create a new GitHub repo called `flaws-finance`
2. Push the contents of the `flaws-finance/` folder (this folder) to it
3. Go to repo Settings → **Pages** → Source: **Deploy from branch** → `main` / `/ (root)`
4. Your app will be live at `https://tomflaws.github.io/flaws-finance`

---

## Usage

1. Visit `https://tomflaws.github.io/flaws-finance`
2. Enter password
3. Click **+ Connect Account** to link bank/investment accounts via Plaid
4. Use **Fee Income** tab to log contingency fees
5. Use **Net Worth** tab to add home and vehicles
6. Use **Tax Center** to track quarterly estimates

---

## Notes

- Plaid free trial: 10 institution connections max
- The Plaid secret never touches the frontend — it lives only in Vercel
- Fee income and asset data stored in Supabase
- Tax calculators use 2026 IRS brackets (approximate — not tax advice)
