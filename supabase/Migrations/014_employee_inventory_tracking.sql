
CREATE OR REPLACE FUNCTION public.adjust_inventory(
    p_store_id bigint,
    p_product_id bigint,
    p_change integer,
    p_movement_type text,
    p_reason text DEFAULT NULL,
    p_employee_id bigint DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    v_old_quantity integer;
    v_new_quantity integer;
BEGIN
    IF p_change = 0 THEN
        RAISE EXCEPTION 'Quantity change cannot be zero';
    END IF;

    IF p_movement_type NOT IN (
        'receiving',
        'sale',
        'return',
        'transfer_in',
        'transfer_out',
        'adjustment',
        'reversal'
    ) THEN
        RAISE EXCEPTION 'Invalid movement type';
    END IF;

    IF p_employee_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.employees
        WHERE id = p_employee_id
          AND active = true
    ) THEN
        RAISE EXCEPTION 'Valid employee required';
    END IF;

    SELECT quantity
    INTO v_old_quantity
    FROM public.inventory
    WHERE store_id = p_store_id
      AND product_id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found';
    END IF;

    v_new_quantity := v_old_quantity + p_change;

    IF v_new_quantity < 0 THEN
        RAISE EXCEPTION 'Insufficient inventory';
    END IF;

    UPDATE public.inventory
    SET
        quantity = v_new_quantity,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = p_product_id;

    INSERT INTO public.inventory_movements (
        store_id,
        product_id,
        movement_type,
        quantity_change,
        quantity_before,
        quantity_after,
        reason,
        performed_by_employee_id
    )
    VALUES (
        p_store_id,
        p_product_id,
        p_movement_type,
        p_change,
        v_old_quantity,
        v_new_quantity,
        p_reason,
        p_employee_id
    );

    RETURN v_new_quantity;
END;
$function$;

-- Remove the old five-argument version.
DROP FUNCTION IF EXISTS public.adjust_inventory(
    bigint, bigint, integer, text, text
);

-- Only the server-side Supabase client may execute this function.
REVOKE ALL ON FUNCTION public.adjust_inventory(
    bigint, bigint, integer, text, text, bigint
) FROM PUBLIC, anon, authenticated;
