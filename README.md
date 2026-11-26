# Quiz Draw

A small, responsive ballot for nine schools and three quiz contests. Each school can enter once; each contest has three places. Contest assignment is random among contests that still have space, and the database serializes entries so concurrent submissions cannot overfill a contest.

## Supabase setup

1. Create a Supabase project.
2. Open its SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon/publishable key from **Project Settings → API**.
4. Install and run locally:

   ```sh
   npm install
   npm run dev
   ```

The browser only uses the Supabase anon key. The table has RLS enabled and no direct client table permissions; ballot entry and public capacity totals are exposed through narrowly scoped database functions. Do not put a service role key in the browser.

The unique school key trims extra spaces and ignores capitalization, so `Oakfield High` and ` oakfield  high ` count as the same school. The ballot is first come, first served, with a hard cap of three schools per contest.

## Deploy to Vercel

Import the GitHub repository into Vercel, select the Vite framework preset, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as project environment variables. Vercel builds with `npm run build` and serves `dist/`.

## GitHub

Create an empty repository on GitHub, then from this folder:

```sh
git init
git add .
git commit -m "Build quiz draw ballot"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

When all nine entries are assigned, the ballot reveals a **Download final results PDF** button. It retrieves the complete list through `get_final_draw_results`, which refuses to return school assignments until the draw has reached nine entries. If you already ran the schema before adding this feature, run the updated `supabase/schema.sql` again to create the new RPC function.

## Password-protected ballot reset

The site’s **Reset ballot** control calls the `reset-ballot` Supabase Edge Function. The password is checked on the server and must be stored as a Supabase Function Secret; it is not embedded in the frontend or SQL file. Failed attempts are limited to five per network fingerprint per 15-minute window using the private `quiz_reset_attempts` table. The Edge Function uses Supabase’s built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets to clear entries. The service key is never sent to the browser.

For an existing project, run the updated `supabase/schema.sql` in the SQL Editor, then link the Supabase CLI to that project and configure the function secret with the requested reset password (`1245`):

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set QUIZ_RESET_PASSWORD=YOUR_RESET_PASSWORD
supabase functions deploy reset-ballot
```

Replace `YOUR_RESET_PASSWORD` with `1245` when setting the secret. Keep the actual value out of Git. The function config allows public invocation because the website has no user login; password verification and rate limiting happen inside the function.
