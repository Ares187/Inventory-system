# Sneaker Factory Inventory — Foundation (v0.1)

This is an **initial scaffold, not a completed inventory MVP**. It includes a searchable sample inventory UI, Supabase email/password sign-in, schema migration, employee-gated read policies, and tables for audit history and integration adapters. Stock mutations, bulk imports, feeds, Hike ingestion and deployment have **not** been implemented yet.

## Local setup
1. Install Node.js 20+.
2. Run `npm install` and `npm run dev` in this directory.
3. Visit http://localhost:3000. Without environment variables, the UI shows fictional demonstration data.

## Shared database setup
1. Create a Supabase project; run `supabase/001_initial.sql` in its SQL Editor.
2. Create a user in Supabase Authentication > Users; create a store record and then add their `auth.users` UUID to `public.employees` with role `admin` and the store UUID. Example:
   `insert into public.stores(name) values ('Sample Store A') returning id;`
   `insert into public.employees(user_id,role,store_id) values ('AUTH-USER-UUID','admin','STORE-UUID');`
3. Copy `.env.example` to `.env.local`, fill the project URL and **publishable/anon** key (never service-role key), then restart dev server.
4. To see live inventory, add product and inventory rows using the SQL Editor (admin only). No seeded live inventory is included.

## Safety
- Never load demo stock into real Locally feeds.
- Do not give browsers service-role keys.
- Never modify inventory via ad-hoc client writes. Next build phase: transactional server-side receiving/adjustment/transfer operations with audit entries and role enforcement.
- Hike exact variant identifiers and Locally feed format still require verification.
