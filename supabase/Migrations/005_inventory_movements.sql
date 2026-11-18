
-- Migration 005: Inventory movement history

create table if not exists public.inventory_movements (
    id bigint generated always as identity primary key,

    store_id bigint not null
        references public.stores(id),

    product_id bigint not null
        references public.products(id),

    movement_type text not null,

    quantity_change integer not null,

    quantity_before integer not null,
    quantity_after integer not null,

    reason text,

    employee_id uuid references auth.users(id),

    created_at timestamptz not null default now(),

    constraint movement_type_valid
        check (movement_type in (
            'receiving',
            'sale',
            'return',
            'transfer_in',
            'transfer_out',
            'adjustment',
            'reversal'
        )),

    constraint movement_quantity_consistent
        check (
            quantity_after =
            quantity_before + quantity_change
        ),

    constraint movement_quantities_nonnegative
        check (
            quantity_before >= 0
            and quantity_after >= 0
        )
);

create index if not exists idx_movements_store_product
on public.inventory_movements (
    store_id,
    product_id,
    created_at desc
);

-- Prevent direct access by application roles for now.
revoke all on public.inventory_movements
from anon, authenticated;
