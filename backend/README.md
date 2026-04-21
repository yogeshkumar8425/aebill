# Backend Setup

This backend now acts as the app-data bridge between the frontend and Supabase, both for local Node.js development and Vercel deployment.

## What It Does

- starts a local HTTP server
- exposes the same logic through Vercel API routes
- verifies the signed-in user's Supabase access token
- reads and writes `profiles`, `user_counters`, `items`, and `invoices`
- keeps the `service_role` key server-side only

## Routes

- `GET /api/health`
- `GET /api/auth/check-username`
- `POST /api/auth/signup`
- `GET /api/workspace`
- `PUT /api/workspace`

`/api/workspace` is authenticated and expects a Supabase bearer token from the logged-in frontend session.

## Local Run

1. Copy `.env.example` to `.env` if you want custom values.
2. Make sure `.env` contains:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALLOWED_ORIGIN` if you want to restrict frontend access locally
3. Open a terminal in `backend`.
4. Run `node server.js`

Default URL: `http://127.0.0.1:3000`

## Vercel Deployment

When deployed on Vercel:

- `api/[...route].js` becomes the public backend
- Vercel environment variables replace `backend/.env`
- the frontend automatically uses same-origin API calls on the deployed domain

Set these Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGIN`

## Supabase Secrets

- Keep `SUPABASE_SERVICE_ROLE_KEY` only in `backend/.env`.
- Do not expose the service role key in frontend files.
- The frontend should only use the public `anon` key for auth/session handling.
