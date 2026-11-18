
-- Migration 007: Store-to-store inventory transfers

create or replace function public.transfer_inventory(
    p_from_store_id bigint,
    p_to_store_id bigint,
    p_product_id bigint,
    p_quantity integer,
    p_reason text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_source_quantity integer;
    v_destination_quantity integer;
begin
    if p_from_store_id = p_to_store_id then
        raise exception 'Source and destination must differ';
    end if;

    if p_quantity <= 0 or p_quantity is null then
        raise exception 'Transfer quantity must be positive';
    end if;

    if p_from_store_id is null
       or p_to_store_id is null
       or p_product_id is null then
        raise exception 'Store and product IDs are required';
    end if;

    -- Lock both inventory rows in a consistent order
    -- to reduce the risk of deadlocks.
    perform 1
    from public.inventory
    where product_id = p_product_id
      and store_id in (
          p_from_store_id,
          p_to_store_id
      )
    order by store_id
    for update;

    if (
        select count(*)
        from public.inventory
        where product_id = p_product_id
          and store_id in (
              p_from_store_id,
              p_to_store_id
          )
    ) <> 2 then
        raise exception 'Inventory record missing at a store';
    end if;

    select quantity into v_source_quantity
    from public.inventory
    where store_id = p_from_store_id
      and product_id = p_product_id;

    select quantity into v_destination_quantity
    from public.inventory
    where store_id = p_to_store_id
      and product_id = p_product_id;

    if v_source_quantity < p_quantity then
        raise exception 'Insufficient source inventory';
    end if;

    -- Deduct from source.
    update public.inventory
    set
        quantity = quantity - p_quantity,
        updated_at = now()
    where store_id = p_from_store_id
      and product_id = p_product_id;

    -- Add to destination.
    update public.inventory
    set
        quantity = quantity + p_quantity,
        updated_at = now()
    where store_id = p_to_store_id
      and product_id = p_product_id;

    -- Record the outgoing movement.
    insert into public.inventory_movements (
        store_id, product_id, movement_type,
        quantity_change, quantity_before,
        quantity_after, reason, employee_id
    )
    values (
        p_from_store_id, p_product_id, 'transfer_out',
        -p_quantity, v_source_quantity,
        v_source_quantity - p_quantity,
        p_reason, auth.uid()
    );

    -- Record the incoming movement.
    insert into public.inventory_movements (
        store_id, product_id, movement_type,
        quantity_change, quantity_before,
        quantity_after, reason, employee_id
    )
    values (
        p_to_store_id, p_product_id, 'transfer_in',
        p_quantity, v_destination_quantity,
        v_destination_quantity + p_quantity,
        p_reason, auth.uid()
    );
end;
$$;

-- Restrict access until employee permissions exist.
revoke all on function public.transfer_inventory(
    bigint, bigint, bigint, integer, text
) from public, anon, authenticated;
