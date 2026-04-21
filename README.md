# AWANSHI ENTERPRISES Invoice Software

This is a browser-based billing app for creating both bills and proforma invoices with Supabase-backed auth, per-user workspaces, and a deployment-ready API layer for Vercel.

## Features

- Dashboard with totals and recent documents
- Item Store for saving products with stock, HSN code, and default rate
- Bill and proforma invoice form with separate auto-numbering, GST, discount, notes, and item lines
- Live document preview
- Browser cache using `IndexedDB` with Supabase as the primary per-account backend
- Shared backend logic that works locally and through Vercel API routes
- Supabase client bootstrap with project URL and anon key support
- Full backup export and import in JSON format
- Status change, preview, delete, and print support
- Supabase-powered signup, email confirmation, login, and password reset flow
- Per-account Supabase storage for profiles, items, invoices, and document counters
- Per-account company onboarding with business details, invoice header, and bank notes
- Item-wise sell, purchase, and stock summary
- Username availability checking and backend-enforced uniqueness

## Local Run

1. Open `index.html` in your web browser.
2. Add products in the `Item Store` tab to save stock, HSN code, and rate.
3. Create bills or proforma invoices from the `New Document` tab.
4. Use the `Preview` tab to print or save PDF.
5. Use the `Dashboard` backup panel to export or import your full data.
6. Run the backend in `backend/` when testing locally.

## Supabase Setup

1. Create a Supabase project.
2. Copy your `Project URL` and `anon` key from Supabase `Project Settings -> API`.
3. Save them in `supabase-config.js`.
4. In Supabase `Authentication -> Providers -> Email`, enable email signups.
5. In Supabase `Authentication -> URL Configuration`, add your app URL as a redirect URL if you host this project over `http://` or `https://`.
6. Create the Supabase tables from `supabase-schema.sql` in the SQL editor, or run the backend setup script if you have database access. The schema creates:

- `profiles` for account details
- `profiles` also stores each account's company name, GST, business email, phone, address, default GST, and bank notes
- `user_counters` for bill / proforma numbering
- `items` for each account's item store
- `invoices` for each account's saved bills and proforma invoices

```sql
-- See supabase-schema.sql for the full schema and RLS policies.
```

7. Open `index.html` in the browser so the Supabase script and config load before `app.js`.
8. New users can sign up, receive a confirmation email from Supabase, log in after confirming, and get an isolated workspace backed by Supabase.

Important:

- Use only the `anon` key in the frontend.
- Do not place the `service_role` key in browser files.
- If you open the app directly with `file://`, signup and login still work, but email redirect links are best handled when the app is hosted on a real local/server URL.

## Vercel Deployment

This project is now prepared to deploy frontend and backend together on Vercel.

### What deploys

- Static frontend files from the project root
- Serverless API route at `api/[...route].js`
- Shared backend logic from `backend/api-core.js`

### Vercel environment variables

Set these in your Vercel project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGIN`

Recommended `ALLOWED_ORIGIN`:

- your Vercel app URL, for example `https://aebill.vercel.app`

For your current Supabase project, a ready-to-copy setup file is included here:

- [VERCEL_ENV_SETUP.md](C:/Users/ADMIN/OneDrive/Desktop/BILL/VERCEL_ENV_SETUP.md)

### Supabase auth settings

In Supabase `Authentication -> URL Configuration`, set:

- Site URL = your Vercel app URL
- Redirect URLs = your Vercel app URL

### Frontend backend routing

- Local static dev on `127.0.0.1:5500` still talks to `127.0.0.1:3000`
- Hosted deployments automatically use same-origin API calls such as `/api/workspace`

That means once deployed, every device will talk to the same public Vercel backend instead of your laptop.

## Notes

- Data is cached in the browser for convenience, but signed-in users now read and write their workspace data from Supabase.
- Existing `localStorage` data is migrated into the database on first load.
- Clearing browser site storage removes only the convenience cache, not the Supabase source of truth.
- Cross-device sync requires the backend to be deployed publicly, not left running only on your local machine.
