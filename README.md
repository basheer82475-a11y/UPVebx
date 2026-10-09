# UPVebx

Responsive web agency site with a Supabase-backed enquiry form and portfolio. Published portfolio entries are managed at `/admin.html`; only the configured admin account can add, publish, unpublish or delete them.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from your Supabase project.
3. Run the complete SQL in `supabase-schema.sql` in the Supabase SQL editor.
4. Create an email/password user in Supabase under Authentication → Users. In SQL Editor, run the admin membership insert at the bottom of `supabase-schema.sql`, replacing the example email with the user's email.
5. Run `npm run dev`, visit `/admin.html`, and sign in to add recent website builds.

The public site only displays projects marked as published. Preview images are uploaded to the public `portfolio-previews` bucket; database changes and uploads are restricted by row-level security to users listed in `public.admin_users`.

Use only a Supabase publishable key in browser code. Never put a secret or service-role key in `.env.local`.

## Staff calling management

Run the updated `supabase-schema.sql` in the Supabase SQL editor to add staff profiles, assigned business records, call history, revenue and expense records, and row-level security policies. The existing admin account can then create staff accounts from the **Staff Details** section in `/admin.html`; staff sign in at `/staff.html`. Use **Revenue & Expenses** to save each website budget and its categorized expenses. Supabase Auth stores password hashes. If email confirmation is enabled for the project, newly created staff must confirm their email before signing in.

The PDF importer accepts text-based PDFs up to 20 MB and extracts business names and phone numbers for review before import. Scanned image PDFs need OCR and will show a processing error instead of importing empty data.
