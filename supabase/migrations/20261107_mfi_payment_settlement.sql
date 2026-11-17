ALTER TABLE public.salary_payment_authorizations
    ADD COLUMN IF NOT EXISTS settled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.review_salary_payment_authorization(
    p_authorization_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_status TEXT;
    v_payment_type TEXT;
BEGIN
    IF NOT public.is_sumthin_mfi_operator() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only an MFI operator can review payment authorizations.');
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('settled', 'voided') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Choose settled or voided.');
    END IF;

    SELECT status, payment_type
      INTO v_current_status, v_payment_type
      FROM public.salary_payment_authorizations
     WHERE id = p_authorization_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment authorization not found.');
    END IF;
    IF v_current_status <> 'authorized' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This payment authorization has already been reviewed.');
    END IF;

    IF p_status = 'settled' THEN
        UPDATE public.salary_payment_authorizations
           SET status = 'settled',
               settled_at = now(),
               settled_by = auth.uid()
         WHERE id = p_authorization_id
           AND status = 'authorized';
    ELSE
        IF v_payment_type = 'shop_order' AND EXISTS (
            SELECT 1
              FROM public.creator_orders
             WHERE payment_authorization_id = p_authorization_id
               AND status = 'fulfilled'
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'A fulfilled shop order cannot be voided.');
        END IF;

        UPDATE public.salary_payment_authorizations
           SET status = 'voided',
               voided_at = now(),
               voided_by = auth.uid()
         WHERE id = p_authorization_id
           AND status = 'authorized';

        IF v_payment_type = 'shop_order' THEN
            UPDATE public.creator_orders
               SET status = 'cancelled'
             WHERE payment_authorization_id = p_authorization_id
               AND status IN ('requested', 'accepted');
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_salary_payment_authorization(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_salary_payment_authorization(UUID, TEXT) TO authenticated;
