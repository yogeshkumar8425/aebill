# Backend Setup

This backend now acts as the app-data bridge between the frontend and Supabase.

## What It Does

- starts a local HTTP server
- verifies the signed-in user's Supabase access token
- reads and writes `profiles`, `user_counters`, `items`, and `invoices`
- keeps the `service_role` key server-side only

## Routes

- `GET /api/health`
- `GET /api/workspace`
- `PUT /api/workspace`

`/api/workspace` is authenticated and expects a Supabase bearer token from the logged-in frontend session.

## Run

1. Copy `.env.example` to `.env` if you want custom values.
2. Make sure `.env` contains:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Open a terminal in `backend`.
4. Run `node server.js`

Default URL: `http://127.0.0.1:3000`

## Frontend Connection

The frontend is configured to call:

- `http://127.0.0.1:3000/api/workspace`

If you run the backend on a different host or port, update:

- [supabase-config.js](C:/Users/ADMIN/OneDrive/Desktop/BILL/supabase-config.js)

## Supabase Secrets

- Keep `SUPABASE_SERVICE_ROLE_KEY` only in `backend/.env`.
- Do not expose the service role key in frontend files.
- The frontend should only use the public `anon` key for auth/session handling.
