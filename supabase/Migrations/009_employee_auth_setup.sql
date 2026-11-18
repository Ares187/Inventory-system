
-- Migration 009: Employee authentication preparation

-- Enable PostgreSQL's cryptographic functions.
create extension if not exists pgcrypto
with schema extensions;

-- Prevent duplicate employee display names.
create unique index if not exists
    employees_unique_name
on public.employees (lower(name));

-- Add the employee account responsible for
-- each inventory movement.
alter table public.inventory_movements
add column if not exists performed_by_employee_id bigint
references public.employees(id);

-- Speed up employee history lookups.
create index if not exists
    idx_movements_employee
on public.inventory_movements (
    performed_by_employee_id,
    created_at desc
);

-- Require four-digit PINs when generating hashes.
-- This function is only for trusted backend use.
create or replace function public.hash_employee_pin(
    p_pin text
)
returns text
language plpgsql
set search_path = ''
as $$
begin
    if p_pin is null
       or p_pin !~ '^[0-9]{4}$' then
        raise exception 'PIN must contain exactly four digits';
    end if;

    return extensions.crypt(
        p_pin,
        extensions.gen_salt('bf', 10)
    );
end;
$$;

-- Do not expose PIN hashing to normal application roles.
revoke all on function public.hash_employee_pin(text)
from public, anon, authenticated;
