CREATE TABLE IF NOT EXISTS public.creator_order_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.creator_orders(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 10 AND 1000),
    status TEXT NOT NULL DEFAULT 'pending_mfi'
        CHECK (status IN ('pending_mfi', 'approved', 'declined')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_note TEXT CHECK (review_note IS NULL OR char_length(review_note) <= 500)
);

ALTER TABLE public.creator_order_returns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_order_returns FROM PUBLIC, anon;
DROP POLICY IF EXISTS "Buyers and MFI read creator order returns" ON public.creator_order_returns;
CREATE POLICY "Buyers and MFI read creator order returns"
    ON public.creator_order_returns FOR SELECT
    TO authenticated
    USING (
        public.is_sumthin_mfi_operator()
        OR requester_id = auth.uid()
    );
GRANT SELECT ON public.creator_order_returns TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.creator_order_returns FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_creator_order_return(
    p_order_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_order RECORD;
    v_return_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sign in to request a return.');
    END IF;
    IF p_reason IS NULL OR char_length(trim(p_reason)) NOT BETWEEN 10 AND 1000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Explain the reason for your return in 10 to 1000 characters.');
    END IF;

    SELECT orders.id, orders.requester_id, orders.payment_authorization_id,
           orders.fulfilment_status, orders.delivered_at, payments.payment_type
      INTO v_order
      FROM public.creator_orders AS orders
      JOIN public.salary_payment_authorizations AS payments
        ON payments.id = orders.payment_authorization_id
     WHERE orders.id = p_order_id
       AND orders.requester_id = auth.uid()
     FOR UPDATE OF orders;
    IF NOT FOUND OR v_order.payment_type <> 'shop_order' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This shop order could not be found.');
    END IF;
    IF v_order.fulfilment_status <> 'delivered' OR v_order.delivered_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A return can be requested after Fleetbase confirms delivery.');
    END IF;
    IF v_order.delivered_at < now() - interval '24 hours' THEN
        RETURN jsonb_build_object('success', false, 'error', 'The 24-hour return request period has ended.');
    END IF;

    INSERT INTO public.creator_order_returns (order_id, requester_id, reason)
    VALUES (v_order.id, auth.uid(), trim(p_reason))
    RETURNING id INTO v_return_id;

    RETURN jsonb_build_object('success', true, 'return_id', v_return_id, 'status', 'pending_mfi');
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'A return request has already been submitted for this order.');
END;
$$;

CREATE OR REPLACE FUNCTION public.review_creator_order_return(
    p_return_id UUID,
    p_status TEXT,
    p_review_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_sumthin_mfi_operator() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only an MFI operator can review shop returns.');
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('approved', 'declined') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Choose approved or declined.');
    END IF;
    IF p_review_note IS NOT NULL AND char_length(p_review_note) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Review notes must be 500 characters or fewer.');
    END IF;

    UPDATE public.creator_order_returns
       SET status = p_status,
           reviewed_at = now(),
           reviewed_by = auth.uid(),
           review_note = NULLIF(trim(p_review_note), '')
     WHERE id = p_return_id
       AND status = 'pending_mfi';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'This return request is no longer awaiting review.');
    END IF;

    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.request_creator_order_return(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_creator_order_return(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.review_creator_order_return(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_creator_order_return(UUID, TEXT, TEXT) TO authenticated;
