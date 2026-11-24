begin;

alter table public.hike_sale_items
  add column if not exists color_confirmation_expired_at timestamptz;

create or replace view public.hike_color_queue_candidates as
select s.id, s.hike_sale_id, s.product_name, s.quantity, s.sale_date,
       s.feldryva_received_at, s.sku, m.store_id, st.name as store_name,
       coalesce(s.feldryva_received_at, s.sale_date) + interval '24 hours' as expires_at,
       choices.size, choices.width, choices.products
from public.hike_sale_items s
join public.hike_sync_settings settings on settings.id = 1 and s.sale_date >= settings.sales_cutoff
join public.hike_outlet_mapping m on m.hike_outlet_id = s.hike_outlet_id and m.store_id in (1, 2, 3)
join public.stores st on st.id = m.store_id
cross join lateral (
  select min(c.size) as size, min(c.width) as width,
         jsonb_agg(jsonb_build_object(
           'id', c.product_id, 'color', c.color, 'quantity', coalesce(i.quantity, 0)
         ) order by c.color, c.product_id) as products
  from public.hike_color_candidates(s.sku) c
  left join public.inventory i on i.store_id = m.store_id and i.product_id = c.product_id
) choices
where s.test_mode is false and s.hike_sale_id not like 'TEST-%'
  and s.status in ('pending', 'unresolved') and s.color_confirmation_expired_at is null
  and choices.products is not null
  and trim(coalesce(s.barcode, '')) !~ '^[0-9]{12,14}$'
  and not exists (select 1 from public.hike_product_mapping hp where hp.hike_sku = s.sku);

revoke all on public.hike_color_queue_candidates from public, anon, authenticated;

create or replace function public.get_pending_hike_colors()
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.sale_date desc, q.id desc), '[]'::jsonb)
  from (
    select * from public.hike_color_queue_candidates
    where expires_at > now()
    order by sale_date desc, id desc
    limit 200
  ) q;
$$;

create or replace function public.count_pending_hike_color_sales()
returns bigint language sql stable security definer set search_path = public
as $$
  select count(distinct hike_sale_id) from public.hike_color_queue_candidates
  where expires_at > now();
$$;

create or replace function public.expire_pending_hike_colors()
returns void language sql security definer set search_path = public
as $$
  with expired as (
    update public.hike_sale_items s
    set color_confirmation_expired_at = now()
    from public.hike_color_queue_candidates q
    where s.id = q.id and q.expires_at <= now()
      and s.status in ('pending', 'unresolved') and s.color_confirmation_expired_at is null
    returning s.id, q.store_id, s.hike_sale_id, s.product_name, s.sku, s.quantity
  ), closed_review as (
    update public.hike_unresolved_sales u
    set resolved_at = now(), resolution_notes = 'Color confirmation expired after 24 hours'
    from expired e
    where u.sale_item_id = e.id and u.resolved_at is null
  )
  insert into public.activity_log (store_id, action, entity_type, entity_id, description, metadata)
  select store_id, 'integration.color_confirmation_expired', 'hike_sale_item', id::text,
         format('%s · SKU %s · Qty %s. Color was unconfirmed for 24 hours. Stock was not deducted.',
                coalesce(product_name, 'Unknown shoe'), sku, quantity),
         jsonb_build_object('provider', 'Hike', 'details', jsonb_build_object('external_event_id', hike_sale_id))
  from expired;
$$;

create or replace function public.get_hike_review_items()
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.sale_date desc, q.id desc), '[]'::jsonb)
  from (
    select s.id, s.hike_sale_id, s.hike_outlet_id, s.product_name, s.sku,
           s.quantity, s.sale_date, s.test_mode, coalesce(u.reason, '') as reason
    from public.hike_sale_items s
    left join lateral (
      select reason from public.hike_unresolved_sales
      where sale_item_id = s.id and resolved_at is null
      limit 1
    ) u on true
    where s.status = 'unresolved' and s.test_mode is false
      and s.hike_sale_id not like 'TEST-%' and s.color_confirmation_expired_at is null
      and not exists (select 1 from public.hike_color_queue_candidates q where q.id = s.id)
    order by s.sale_date desc, s.id desc
    limit 500
  ) q;
$$;

revoke all on function public.count_pending_hike_color_sales() from public, anon, authenticated;
revoke all on function public.expire_pending_hike_colors() from public, anon, authenticated;
revoke all on function public.get_hike_review_items() from public, anon, authenticated;
grant execute on function public.count_pending_hike_color_sales() to service_role;
grant execute on function public.expire_pending_hike_colors() to service_role;
grant execute on function public.get_hike_review_items() to service_role;

create or replace function public.confirm_hike_sale_color(
  p_sale_item_id bigint, p_product_id bigint, p_employee_id bigint
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_settings hike_sync_settings%rowtype;
  v_sale hike_sale_items%rowtype;
  v_store_id bigint;
  v_remaining numeric;
begin
  select * into v_settings from hike_sync_settings where id = 1 for update;
  if not found or v_settings.enabled is distinct from true or v_settings.live_mode is distinct from true
    or v_settings.sales_cutoff is null then
    raise exception 'Live Hike processing is disabled';
  end if;

  select * into v_sale from hike_sale_items where id = p_sale_item_id for update;
  if not found or v_sale.status not in ('pending', 'unresolved')
    or v_sale.color_confirmation_expired_at is not null
    or coalesce(v_sale.feldryva_received_at, v_sale.sale_date) <= clock_timestamp() - interval '24 hours'
    or v_sale.test_mode is distinct from false or v_sale.hike_sale_id like 'TEST-%'
    or trim(coalesce(v_sale.barcode, '')) ~ '^[0-9]{12,14}$'
    or v_sale.sale_date is null or v_sale.sale_date < v_settings.sales_cutoff
    or v_sale.quantity is null or v_sale.quantity <= 0 or v_sale.quantity <> trunc(v_sale.quantity) then
    raise exception 'Sale is not eligible for color confirmation';
  end if;

  if not exists (
    select 1 from hike_color_candidates(v_sale.sku) where product_id = p_product_id
  ) or exists (select 1 from hike_product_mapping hp where hp.hike_sku = v_sale.sku) then
    raise exception 'Selected variant does not match the approved Hike sale';
  end if;

  select store_id into v_store_id from hike_outlet_mapping
  where hike_outlet_id = v_sale.hike_outlet_id and store_id in (1, 2, 3);
  if not found then
    raise exception 'Hike outlet is not mapped to a live store';
  end if;

  update inventory set quantity = quantity - v_sale.quantity
  where store_id = v_store_id and product_id = p_product_id and quantity >= v_sale.quantity
  returning quantity into v_remaining;
  if not found then
    raise exception 'Insufficient inventory at the selling store';
  end if;

  update hike_sale_items
  set status = 'deducted', inventory_product_id = p_product_id,
      processed_at = now(), resolved_at = now(), resolved_by = p_employee_id
  where id = p_sale_item_id;

  update hike_unresolved_sales
  set resolved_at = now(), resolved_by = p_employee_id,
      resolution_notes = 'Employee confirmed the purchased color'
  where sale_item_id = p_sale_item_id and resolved_at is null;

  return jsonb_build_object('success', true, 'storeId', v_store_id, 'remainingQuantity', v_remaining);
end;
$$;

commit;
