begin;

alter table public.hike_sale_items
  add column if not exists feldryva_received_at timestamptz;

-- Existing sales keep a null timestamp. New rows record their first import.
alter table public.hike_sale_items
  alter column feldryva_received_at set default clock_timestamp();

create or replace function public.get_pending_hike_colors()returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.sale_date desc, q.id desc), '[]'::jsonb)
  from (
    select s.id, s.hike_sale_id, s.product_name, s.quantity, s.sale_date, s.feldryva_received_at,
           m.store_id, st.name as store_name,
           choices.size, choices.width, choices.products
    from hike_sale_items s
    join hike_sync_settings settings on settings.id = 1 and s.sale_date >= settings.sales_cutoff
    join hike_outlet_mapping m on m.hike_outlet_id = s.hike_outlet_id and m.store_id in (1, 2, 3)
    join stores st on st.id = m.store_id
    cross join lateral (
      select min(c.size) as size, min(c.width) as width,
             jsonb_agg(jsonb_build_object(
               'id', c.product_id, 'color', c.color, 'quantity', coalesce(i.quantity, 0)
             ) order by c.color, c.product_id) as products
      from hike_color_candidates(s.sku) c
      left join inventory i on i.store_id = m.store_id and i.product_id = c.product_id
    ) choices
    where s.test_mode is false and s.hike_sale_id not like 'TEST-%'
      and s.status in ('pending', 'unresolved') and choices.products is not null
      and trim(coalesce(s.barcode, '')) !~ '^[0-9]{12,14}$'
      and not exists (select 1 from hike_product_mapping hp where hp.hike_sku = s.sku)
    order by s.sale_date desc, s.id desc
    limit 200
  ) q;
$$;

commit;
