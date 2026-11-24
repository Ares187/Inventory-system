begin;

-- Resolve a SKU to one approved shoe family and one size/width pair.
-- Conflicting catalog rows cannot supply employee color choices.
create or replace function public.hike_color_candidates(p_sku text)
returns table(product_id bigint, size text, width text, color text)
language sql stable set search_path = public
as $$
  with catalog as (
    select m.hike_parent_id,
           regexp_replace(trim(m.shoe_name), '[[:space:]]+/.*$', '') as family,
           lower(trim(h.size)) as size,
           lower(trim(h.width)) as width
    from hike_product_index h
    join hike_shoe_master m on m.hike_parent_id = h.hike_product_id
    where h.sku = p_sku and h.active is distinct from false
      and h.classification = 'shoe'
      and h.classification_reason in ('Footwear category', 'Valid footwear size and width')
      and nullif(trim(h.size), '') is not null and nullif(trim(h.width), '') is not null
    group by 1, 2, 3, 4
  ), verified as (
    select c.*
    from catalog c
    where (select count(*) from catalog) = 1
      and not exists (
        select 1 from hike_product_index h
        where h.sku = p_sku and h.active is distinct from false
          and (
            h.classification is distinct from 'shoe'
            or coalesce(h.classification_reason, '') not in ('Footwear category', 'Valid footwear size and width')
            or h.hike_product_id is distinct from c.hike_parent_id
            or nullif(lower(trim(h.size)), '') is distinct from c.size
            or nullif(lower(trim(h.width)), '') is distinct from c.width
            or nullif(trim(h.color), '') is not null
            or trim(coalesce(h.barcode, '')) ~ '^[0-9]{12,14}$'
          )
      )
  )
  select p.id, p.size::text, p.width::text, p.color::text
  from verified v
  join products p on p.active = true
    and lower(trim(p.size::text)) = v.size
    and lower(trim(p.width::text)) = v.width
    and nullif(trim(p.color::text), '') is not null
  cross join lateral (
    select lower(regexp_replace(split_part(v.family, ' ', 1), '[^a-zA-Z]', '', 'g')) as hike_gender,
           lower(regexp_replace(trim(p.gender::text), '[^a-zA-Z]', '', 'g')) as local_gender,
           regexp_replace(lower(regexp_replace(v.family, '^[^[:space:]]+[[:space:]]+', '')), '(^|[^a-z])v([0-9])', '\1\2', 'g') as hike_name,
           regexp_replace(lower(trim(p.model)), '(^|[^a-z])v([0-9])', '\1\2', 'g') as model_name,
           regexp_replace(lower(trim(coalesce(p.version, ''))), '^v([0-9])', '\1', 'g') as version_name
  ) n
  where (
    (n.hike_gender in ('m','men','mens','male') and n.local_gender in ('m','men','mens','male'))
    or (n.hike_gender in ('w','women','womens','female') and n.local_gender in ('w','women','womens','female'))
  )
  and regexp_replace(n.hike_name, '[^a-z0-9]', '', 'g') in (
    regexp_replace(concat_ws(' ', n.model_name, n.version_name), '[^a-z0-9]', '', 'g'),
    regexp_replace(concat_ws(' ', lower(p.brand), n.model_name, n.version_name), '[^a-z0-9]', '', 'g'),
    case when n.version_name = '' or regexp_replace(n.model_name, '^.*[[:space:]]', '') = n.version_name
      then regexp_replace(n.model_name, '[^a-z0-9]', '', 'g') end,
    case when n.version_name = '' or regexp_replace(n.model_name, '^.*[[:space:]]', '') = n.version_name
      then regexp_replace(concat_ws(' ', lower(p.brand), n.model_name), '[^a-z0-9]', '', 'g') end
  );
$$;

create or replace function public.ingest_hike_live_batch(p_lines jsonb, p_cutoff timestamptz)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_line record;
  v_result jsonb;
  v_item_id bigint;
  v_inserted integer := 0;
  v_already integer := 0;
  v_deducted integer := 0;
  v_unresolved integer := 0;
  v_settings hike_sync_settings%rowtype;
begin
  select * into v_settings from hike_sync_settings where id = 1 for update;
  if not found or v_settings.enabled is distinct from true or v_settings.live_mode is distinct from true
    or v_settings.sales_cutoff is distinct from p_cutoff then
    raise exception 'Live Hike settings changed during synchronization';
  end if;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(
      sale_id text, line_id text, outlet_id text, product_name text,
      sku text, barcode text, quantity numeric, sale_date timestamptz
    )
  loop
    -- Older test imports used real sale IDs. Preserve the rows and free
    -- the live IDs when a sale is first seen by the upgraded importer.
    update hike_sale_items
    set hike_sale_id = 'TEST-LEGACY-' || id::text
    where hike_sale_id = v_line.sale_id and hike_line_item_id = v_line.line_id
      and test_mode is true and hike_sale_id not like 'TEST-%';

    -- A manufacturer barcode on the actual sale must agree with the catalog.
    -- Keep conflicts in general review, where no employee color choice is offered.
    if v_line.barcode ~ '^[0-9]{12,14}$' and not exists (
      select 1 from hike_product_index
      where sku = v_line.sku and trim(barcode) = v_line.barcode
        and nullif(trim(color), '') is not null and active is distinct from false
    ) then
      if v_line.sale_id is null or v_line.sale_id like 'TEST-%'
        or v_line.line_id is null or v_line.quantity is null
        or v_line.quantity <= 0 or v_line.quantity <> trunc(v_line.quantity)
        or v_line.sale_date is null or v_line.sale_date < p_cutoff
        or not exists (
          select 1 from hike_outlet_mapping
          where hike_outlet_id = v_line.outlet_id and store_id in (1, 2, 3)
        ) then
        raise exception 'Invalid Hike sale line';
      end if;

      insert into hike_sale_items (
        hike_sale_id, hike_line_item_id, hike_outlet_id, product_name,
        sku, barcode, quantity, sale_date, status, test_mode
      ) values (
        v_line.sale_id, v_line.line_id, v_line.outlet_id, v_line.product_name,
        v_line.sku, v_line.barcode, v_line.quantity, v_line.sale_date, 'unresolved', false
      )
      on conflict (hike_sale_id, hike_line_item_id) do nothing
      returning id into v_item_id;

      if found then
        insert into hike_unresolved_sales (sale_item_id, reason)
        values (v_item_id, 'Product classification requires review: sale barcode conflicts with catalog');
        v_result := jsonb_build_object('result', 'unresolved');
      else
        v_result := jsonb_build_object('result', 'already_imported');
      end if;
    else
      v_result := ingest_hike_live_item(
        v_line.sale_id, v_line.line_id, v_line.outlet_id, v_line.product_name,
        v_line.sku, v_line.quantity, v_line.sale_date
      );

      if v_result->>'result' = 'already_imported' and v_result->>'status' = 'unresolved' then
        -- Replay exact matches that previously lacked a product or inventory.
        -- The nested block rolls back the pending status if matching still fails.
        select s.id into v_item_id
        from hike_sale_items s
        join hike_unresolved_sales u on u.sale_item_id = s.id
        where s.id = (v_result->>'saleItemId')::bigint and s.test_mode is false
          and u.resolved_at is null
          and u.reason in ('No matching inventory product', 'Insufficient inventory', 'query returned no rows')
          and exists (
            select 1 from hike_product_index h
            where h.sku = s.sku and trim(h.barcode) ~ '^[0-9]{12,14}$'
              and nullif(trim(h.color), '') is not null
          );
        if found then
          begin
            update hike_sale_items set status = 'pending' where id = v_item_id;
            perform process_hike_sale_inventory(v_item_id);
            v_deducted := v_deducted + 1;
          exception when others then
            null;
          end;
        end if;
      end if;
    end if;

    case v_result->>'result'
      when 'already_imported' then v_already := v_already + 1;
      when 'deducted' then v_inserted := v_inserted + 1; v_deducted := v_deducted + 1;
      when 'unresolved' then v_inserted := v_inserted + 1; v_unresolved := v_unresolved + 1;
      else raise exception 'Unexpected Hike ingestion result';
    end case;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted, 'alreadyImported', v_already,
    'deducted', v_deducted, 'unresolved', v_unresolved
  );
end;
$$;

create or replace function public.advance_hike_sync_checkpoint(p_cutoff timestamptz, p_through timestamptz)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update hike_sync_settings
  set last_successful_sync = greatest(last_successful_sync, p_through)
  where id = 1 and enabled is true and live_mode is true
    and sales_cutoff = p_cutoff and p_through >= p_cutoff;
  if not found then
    raise exception 'Live Hike settings changed during synchronization';
  end if;
end;
$$;

create or replace function public.get_pending_hike_colors()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.sale_date desc, q.id desc), '[]'::jsonb)
  from (
    select s.id, s.hike_sale_id, s.product_name, s.quantity, s.sale_date,
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

revoke all on function public.hike_color_candidates(text) from public, anon, authenticated;
revoke all on function public.ingest_hike_live_batch(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.advance_hike_sync_checkpoint(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.get_pending_hike_colors() from public, anon, authenticated;
revoke all on function public.confirm_hike_sale_color(bigint, bigint, bigint) from public, anon, authenticated;

grant execute on function public.ingest_hike_live_batch(jsonb, timestamptz) to service_role;
grant execute on function public.advance_hike_sync_checkpoint(timestamptz, timestamptz) to service_role;
grant execute on function public.get_pending_hike_colors() to service_role;
grant execute on function public.confirm_hike_sale_color(bigint, bigint, bigint) to service_role;

commit;
