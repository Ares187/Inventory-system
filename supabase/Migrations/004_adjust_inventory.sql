
-- Migration 004: Inventory adjustment function

create or replace function public.adjust_inventory(
    p_store_id bigint,
    p_product_id bigint,
    p_change integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
    v_new_quantity integer;
begin
    if p_change = 0 then
        raise exception 'Quantity change cannot be zero';
    end if;

    update public.inventory
    set
        quantity = quantity + p_change,
        updated_at = now()
    where store_id = p_store_id
      and product_id = p_product_id
      and quantity + p_change >= 0
    returning quantity into v_new_quantity;

    if not found then
        raise exception
            'Inventory record missing or insufficient stock';
    end if;

    return v_new_quantity;
end;
$$;

-- Development-only permissions:
-- Do not expose this function to application users yet.
revoke all on function public.adjust_inventory(
    bigint, bigint, integer
) from public, anon, authenticated;
