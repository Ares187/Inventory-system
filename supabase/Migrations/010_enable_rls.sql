
-- Enable Row Level Security on our tables

alter table public.stores
enable row level security;

alter table public.products
enable row level security;

alter table public.inventory
enable row level security;

alter table public.inventory_movements
enable row level security;

alter table public.employees
enable row level security;
