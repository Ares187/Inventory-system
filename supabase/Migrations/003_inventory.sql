
-- Migration 003: Store inventory

create table if not exists public.inventory (
    id bigint generated always as identity primary key,

    store_id bigint not null
        references public.stores(id),

    product_id bigint not null
        references public.products(id),

    quantity integer not null default 0,

    updated_at timestamptz not null default now(),

    constraint inventory_quantity_nonnegative
        check (quantity >= 0),

    constraint inventory_unique_store_product
        unique (store_id, product_id)
);
