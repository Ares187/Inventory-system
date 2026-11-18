
-- Sneaker Factory Inventory System
-- Migration 001: Store locations
-- Creates the stores table if it does not already exist.

create table if not exists public.stores (
    id bigint generated always as identity primary key,
    name text not null,
    address text,
    locally_location_id text,
    active boolean not null default true,
    created_at timestamptz not null default now()
);
