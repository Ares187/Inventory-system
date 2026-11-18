
-- Seed 002: Sample inventory quantities

insert into public.inventory (
    store_id,
    product_id,
    quantity
)
select
    s.id,
    p.id,
    case
        when s.id = (select min(id) from public.stores)
            then 8
        when s.id = (select max(id) from public.stores)
            then 3
        else 5
    end
from public.stores s
cross join public.products p
where s.active = true
  and p.active = true
on conflict (store_id, product_id) do nothing;
