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
          and not (
            nullif(trim(h.hike_variant_id::text), '') is null
            and h.classification is not distinct from 'unresolved'
            and h.classification_reason is not distinct from 'Unrecognized product category'
            and nullif(trim(h.size), '') is null
            and nullif(trim(h.width), '') is null
            and nullif(trim(h.color), '') is null
            and nullif(trim(h.barcode), '') is not null
            and exists (
              select 1 from hike_product_index variant
              where variant.hike_product_id = c.hike_parent_id
                and variant.hike_variant_id::text = h.hike_product_id::text
                and variant.active is distinct from false
                and variant.classification = 'shoe'
                and variant.classification_reason in ('Footwear category', 'Valid footwear size and width')
                and variant.sku = h.sku and trim(variant.barcode) = trim(h.barcode)
                and lower(trim(variant.size)) = c.size and lower(trim(variant.width)) = c.width
            )
          )
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
