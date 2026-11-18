
-- Sneaker Factory Inventory System
-- Migration 002: Product catalog

create table if not exists public.products (
    id bigint generated always as identity primary key,

    gender text not null,
    brand text not null,
    model text not null,
    version text,
    size text not null,
    width text not null,
    color text not null,

    upc text,
    internal_sku text unique,
    retail_price numeric(10,2) not null,

    active boolean not null default true,

    created_at timestamptz not null default now(),

    constraint products_price_nonnegative
        check (retail_price >= 0)
);
