# OneSitio — Barangay Talampas e-Services & Transparency Portal

React + TypeScript (Vite) frontend with Supabase (Postgres, Auth, Storage).
A student project inspired by the CADENA Act ("Blockchain the Budget", SB 1506). Not an official government service.

## Features

**Public**
- Home with live document catalog, fund summary, latest ledger blocks, projects
- Request tracker by reference code (no login, name masked)
- Transparency ledger with in-browser SHA-256 chain verification

**Residents** (`/app`)
- Sign up with email, Google, or Facebook
- ID upload with in-browser OCR (Tesseract.js) + selfie via camera
- Request documents for self or household members
- Track status with timeline, pay approved requests (simulated GCash / Maya / QR Ph / card)
- Manage household members and profile

**Staff** (`/staff`)
- Verify residents (view ID, selfie, OCR text) — approve or return with a note
- Process requests: review → approve → payment → ready → released, or reject
- Record cash payments
- Post ledger entries (append-only) and manage projects

## Setup

1. `npm install`
2. Create `.env`:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
3. Supabase Dashboard → **SQL Editor** → paste `supabase/schema.sql` → **Run** (safe to re-run).
4. **Authentication → Providers → Email**: turn off *Confirm email* for demos (so new residents can upload their ID immediately).
5. **Google / Facebook sign-in**: Authentication → Providers → enable Google and Facebook with their client ID/secret.
   Add `http://localhost:5173/auth/callback` (and your deployed URL) to Authentication → URL Configuration → Redirect URLs.
6. `npm run dev`, register an account, then make it staff in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin', verification_status = 'verified'
   where email = 'you@example.com';
   ```

## Database (summary)

| Table | Purpose |
|---|---|
| `profiles` | Resident/staff profile (1:1 with `auth.users`), role, verification status, ID/selfie paths, OCR text |
| `household_members` | Dependents a head of household can request for |
| `document_types` | Catalog: clearance, indigency, residency, business (fees, requirements) |
| `document_requests` | Requests with reference code `REQ-####`, status, payment status |
| `request_events` | Status history / timeline (written by trigger) |
| `payments` | Simulated e-wallet and cash payments |
| `projects` | Public infrastructure projects |
| `ledger_blocks` | Append-only SHA-256 hash chain of allocations, collections, disbursements |
| `fund_summary` (view) | Totals per fund |

RPCs: `track_request`, `pay_request`, `cancel_request`, `record_cash_payment`, `verify_ledger`.
Storage buckets: `resident-docs` (private), `project-images` (public).
Row Level Security is on for every table: residents only see their own data; staff see everything; the public can read the catalog, projects and ledger.
