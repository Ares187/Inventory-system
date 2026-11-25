begin;

create or replace function public.archive_empty_product_variant(p_product_id bigint)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  lock table public.inventory in share row exclusive mode;

  if exists (
    select 1 from public.inventory
    where product_id = p_product_id and quantity > 0
  ) then
    return false;
  end if;

  update public.products set active = false
  where id = p_product_id and active is true;

  return true;
end;
$$;

revoke all on function public.archive_empty_product_variant(bigint) from public, anon, authenticated;
grant execute on function public.archive_empty_product_variant(bigint) to service_role;

commit;
