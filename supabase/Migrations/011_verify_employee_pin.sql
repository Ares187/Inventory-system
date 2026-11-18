
-- Migration 011: Employee PIN verification

create or replace function public.verify_employee_pin(
    p_employee_id bigint,
    p_pin text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    v_pin_hash text;
begin
    if p_pin is null
       or p_pin !~ '^[0-9]{4}$' then
        return false;
    end if;

    select pin_hash
    into v_pin_hash
    from public.employees
    where id = p_employee_id
      and active = true;

    if not found then
        return false;
    end if;

    return v_pin_hash = extensions.crypt(
        p_pin,
        v_pin_hash
    );
end;
$$;

-- Only our privileged backend may call this.
revoke all on function public.verify_employee_pin(
    bigint, text
) from public, anon, authenticated;
