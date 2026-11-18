
-- Migration 006: Transactional inventory adjustments

create or replace function public.adjust_inventory(
    p_store_id bigint,
    p_product_id bigint,
    p_change integer,
    p_movement_type text,
    p_reason text default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
    v_old_quantity integer;
    v_new_quantity integer;
begin
    if p_change = 0 then
        raise exception 'Quantity change cannot be zero';
    end if;

    if p_movement_type not in (
        'receiving',
        'sale',
        'return',
        'transfer_in',
        'transfer_out',
        'adjustment',
        'reversal'
    ) then
        raise exception 'Invalid movement type';
    end if;

    -- Lock the inventory row during this operation.
    select quantity
    into v_old_quantity
    from public.inventory
    where store_id = p_store_id
      and product_id = p_product_id
    for update;

    if not found then
        raise exception 'Inventory record not found';
    end if;

    v_new_quantity := v_old_quantity + p_change;

    if v_new_quantity < 0 then
        raise exception 'Insufficient inventory';
    end if;

    -- Update current inventory.
    update public.inventory
    set
        quantity = v_new_quantity,
        updated_at = now()
    where store_id = p_store_id
      and product_id = p_product_id;

    -- Record the movement.
    insert into public.inventory_movements (
        store_id,
        product_id,
        movement_type,
        quantity_change,
        quantity_before,
        quantity_after,
        reason,
        employee_id
    )
    values (
        p_store_id,
        p_product_id,
        p_movement_type,
        p_change,
        v_old_quantity,
        v_new_quantity,
        p_reason,
        auth.uid()
    );

    return v_new_quantity;
end;
$$;

-- Remove the older, three-argument function.
drop function if exists public.adjust_inventory(
    bigint, bigint, integer
);

-- Keep this function unavailable to application
-- users until authentication and permissions exist.
revoke all on function public.adjust_inventory(
    bigint, bigint, integer, text, text
) from public, anon, authenticated;
