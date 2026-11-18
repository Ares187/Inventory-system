
-- Migration 008: Employee accounts and roles

create table if not exists public.employees (
    id bigint generated always as identity primary key,

    name text not null,

    pin_hash text not null,

    role text not null default 'employee'
        check (role in (
            'owner',
            'manager',
            'employee'
        )),

    active boolean not null default true,

    created_at timestamptz not null default now()
);

-- Only one owner account is permitted.
create unique index if not exists
    employees_single_owner
on public.employees (role)
where role = 'owner';

-- Restrict direct access to employee records.
revoke all on public.employees
from anon, authenticated;
