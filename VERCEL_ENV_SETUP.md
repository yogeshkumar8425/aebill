# Vercel Env Setup

Set these environment variables in your Vercel project:

```text
SUPABASE_URL=https://vqmamkmsjmxaajgtmssr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxbWFta21zam14YWFqZ3Rtc3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MjcyNzMsImV4cCI6MjA5MTIwMzI3M30.j3X0Ztm-kv1FKB7Cm2HEbdDQnpQO_E1ad3r3iY6nQyM
SUPABASE_SERVICE_ROLE_KEY=PASTE_YOUR_SERVICE_ROLE_KEY_HERE
ALLOWED_ORIGIN=https://YOUR-VERCEL-DOMAIN.vercel.app
```

After first deploy:

1. Copy your live Vercel URL.
2. Replace `ALLOWED_ORIGIN` with that exact URL.
3. In Supabase Authentication URL Configuration set:
   - Site URL = your live Vercel URL
   - Redirect URL = your live Vercel URL

Important:

- Keep `SUPABASE_SERVICE_ROLE_KEY` only in Vercel server environment variables.
- Do not place the service role key in frontend files.
