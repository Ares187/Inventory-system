-- Run in Supabase SQL editor. Do not publish sample stock externally.
create extension if not exists pgcrypto;
create table public.stores (id uuid primary key default gen_random_uuid(),name text not null unique,address text,locally_location_id text,active boolean not null default true);
create table public.products (id uuid primary key default gen_random_uuid(),brand text not null,model text not null,version text,category text,size text not null,width text not null,color text not null,upc text,internal_sku text not null unique,retail_price numeric(12,2) check(retail_price>=0),active boolean not null default true,created_at timestamptz not null default now());
create unique index products_upc_unique on public.products(upc) where upc is not null and upc<>'';
create table public.employees (user_id uuid primary key references auth.users(id) on delete cascade,role text not null check(role in ('admin','staff')),store_id uuid references public.stores(id));
create table public.inventory (store_id uuid not null references public.stores(id),product_id uuid not null references public.products(id),on_hand integer not null default 0 check(on_hand>=0),updated_at timestamptz not null default now(),primary key(store_id,product_id));
create table public.inventory_movements (id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id),product_id uuid not null references public.products(id),delta integer not null,movement_type text not null check(movement_type in ('initial_count','receipt','sale','return','transfer_in','transfer_out','adjustment')),reference_id text,source text not null default 'manual',actor_id uuid references auth.users(id),created_at timestamptz not null default now(),notes text);
create table public.external_product_mappings (provider text not null,external_variant_id text not null,product_id uuid not null references public.products(id),store_id uuid references public.stores(id),id uuid primary key default gen_random_uuid());
create unique index external_mapping_unique on public.external_product_mappings(provider,external_variant_id,coalesce(store_id::text,''));
create table public.processed_external_events (provider text not null,external_event_id text not null,processed_at timestamptz not null default now(),primary key(provider,external_event_id));
create table public.integration_exceptions(id uuid primary key default gen_random_uuid(),provider text not null,event_id text,payload jsonb not null,reason text not null,created_at timestamptz not null default now(),resolved_at timestamptz);
-- Restrict direct writes; all stock changes must go through controlled server-side transactions.
revoke all on public.stores,public.products,public.employees,public.inventory,public.inventory_movements,public.external_product_mappings,public.processed_external_events,public.integration_exceptions from anon,authenticated;
grant select on public.stores,public.products,public.inventory to authenticated;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.employees enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.external_product_mappings enable row level security;
alter table public.processed_external_events enable row level security;
alter table public.integration_exceptions enable row level security;
create function public.is_employee() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.employees where user_id=auth.uid())$$;
create policy stores_read on public.stores for select to authenticated using (public.is_employee());
create policy products_read on public.products for select to authenticated using (public.is_employee());
create policy inventory_read on public.inventory for select to authenticated using (public.is_employee());
-- Staff cannot mutate stock directly; server-side transactional operations are a subsequent implementation milestone.
