
-- Migration 012: Employee login sessions

create table public.employee_sessions (
    id bigint generated always as identity primary key,

    employee_id bigint not null
        references public.employees(id),

    token_hash text not null unique,

    created_at timestamptz not null
        default now(),

    expires_at timestamptz not null,

    revoked_at timestamptz,

    constraint session_expiry_valid
        check (expires_at > created_at)
);

-- Make employee session lookups faster
create index employee_sessions_employee_idx
    on public.employee_sessions(employee_id);

create index employee_sessions_expiry_idx
    on public.employee_sessions(expires_at);

-- Prevent direct access from the browser
alter table public.employee_sessions
    enable row level security;

revoke all on public.employee_sessions
    from anon, authenticated;
