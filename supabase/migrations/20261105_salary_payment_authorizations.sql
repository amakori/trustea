-- Migration version: 20261105
-- Separate salary-facility applications from individual payment authorizations.
-- Payment authorization reserves outstanding exposure but does not settle funds.

ALTER TABLE public.salary_applications
    DROP CONSTRAINT IF EXISTS salary_applications_context_type_check;

ALTER TABLE public.salary_applications
    ADD CONSTRAINT salary_applications_context_type_check
    CHECK (context_type IN ('creator_support', 'shop_order', 'salary_facility'));

ALTER TABLE public.salary_applications
    ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

DROP POLICY IF EXISTS "Users can insert own salary applications" ON public.salary_applications;
CREATE POLICY "Users can insert own salary applications"
    ON public.salary_applications FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND status = 'pending_mfi'
        AND approved_limit IS NULL
        AND pin_hash IS NULL
        AND pin_set_at IS NULL
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
    );

REVOKE SELECT ON TABLE public.salary_applications FROM anon, authenticated;
GRANT SELECT (
    id, user_id, applicant_first_name, applicant_last_name, employment_number,
    payslip_url, context_type, context_ref_id, context_label, amount, status,
    approved_limit, pin_set_at, reviewer_notes, reviewed_at, reviewed_by,
    created_at, updated_at
) ON TABLE public.salary_applications TO authenticated;

CREATE TABLE IF NOT EXISTS public.salary_payment_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    salary_application_id UUID NOT NULL REFERENCES public.salary_applications(id) ON DELETE RESTRICT,
    request_id UUID NOT NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('donation', 'subscription', 'shop_order')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
    recipient_name TEXT,
    recipient_phone TEXT,
    note TEXT NOT NULL DEFAULT '',
    creator_id UUID REFERENCES public.creator_profiles(id) ON DELETE RESTRICT,
    tier_id UUID REFERENCES public.creator_tiers(id) ON DELETE RESTRICT,
    product_id UUID REFERENCES public.creator_products(id) ON DELETE RESTRICT,
    subscription_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'authorized'
        CHECK (status IN ('authorized', 'settled', 'voided')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    UNIQUE (user_id, request_id),
    CHECK (
        (payment_type = 'donation' AND recipient_name IS NOT NULL AND creator_id IS NULL AND tier_id IS NULL AND product_id IS NULL AND subscription_expires_at IS NULL)
        OR (payment_type = 'subscription' AND creator_id IS NOT NULL AND tier_id IS NOT NULL AND product_id IS NULL AND subscription_expires_at IS NOT NULL)
        OR (payment_type = 'shop_order' AND creator_id IS NOT NULL AND product_id IS NOT NULL AND tier_id IS NULL AND subscription_expires_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS salary_payment_authorizations_user_open
    ON public.salary_payment_authorizations (user_id, created_at DESC)
    WHERE status = 'authorized';

ALTER TABLE public.creator_orders
    ADD COLUMN IF NOT EXISTS payment_authorization_id UUID
    REFERENCES public.salary_payment_authorizations(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.creator_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE RESTRICT,
    tier_id UUID NOT NULL REFERENCES public.creator_tiers(id) ON DELETE RESTRICT,
    payment_authorization_id UUID NOT NULL UNIQUE
        REFERENCES public.salary_payment_authorizations(id) ON DELETE RESTRICT,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > starts_at)
);

ALTER TABLE public.salary_payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users and MFI can read salary payment authorizations" ON public.salary_payment_authorizations;
CREATE POLICY "Users and MFI can read salary payment authorizations"
    ON public.salary_payment_authorizations FOR SELECT
    USING (user_id = auth.uid() OR public.is_sumthin_mfi_operator());

DROP POLICY IF EXISTS "Users and MFI can read creator subscriptions" ON public.creator_subscriptions;
CREATE POLICY "Users and MFI can read creator subscriptions"
    ON public.creator_subscriptions FOR SELECT
    USING (user_id = auth.uid() OR public.is_sumthin_mfi_operator());

GRANT SELECT ON public.salary_payment_authorizations, public.creator_subscriptions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.salary_payment_authorizations, public.creator_subscriptions FROM anon, authenticated;
REVOKE INSERT ON public.creator_orders FROM authenticated;
DROP POLICY IF EXISTS "Customers request active creator products" ON public.creator_orders;

CREATE OR REPLACE FUNCTION public.has_active_creator_support(p_creator_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.creator_support_mandates AS mandate
         WHERE mandate.creator_id = p_creator_id
           AND mandate.supporter_id = auth.uid()
           AND mandate.status = 'active'
    ) OR EXISTS (
        SELECT 1
          FROM public.creator_subscriptions AS subscription
         WHERE subscription.creator_id = p_creator_id
           AND subscription.user_id = auth.uid()
           AND subscription.status = 'active'
           AND subscription.expires_at > now()
           AND EXISTS (
               SELECT 1
                 FROM public.salary_payment_authorizations AS payment_auth
                WHERE payment_auth.id = subscription.payment_authorization_id
                  AND payment_auth.status <> 'voided'
           )
    );
$$;

CREATE OR REPLACE FUNCTION public.set_salary_payment_pin(
    p_application_id UUID,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_status TEXT;
    v_approved_limit NUMERIC(12, 2);
    v_pin_set_at TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
    END IF;
    IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 numeric digits.');
    END IF;

    SELECT status, approved_limit, pin_set_at
      INTO v_status, v_approved_limit, v_pin_set_at
      FROM public.salary_applications
     WHERE id = p_application_id
       AND user_id = v_user_id
       AND context_type = 'salary_facility'
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Approved salary application not found.');
    END IF;
    IF v_status <> 'approved' OR v_approved_limit IS NULL OR v_approved_limit <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'MFI approval with a positive limit is required before setting a PIN.');
    END IF;
    IF v_pin_set_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A payment PIN is already configured for this application.');
    END IF;

    UPDATE public.salary_applications
       SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
           pin_set_at = now(),
           pin_failed_attempts = 0,
           pin_locked_until = NULL
     WHERE id = p_application_id;

    RETURN jsonb_build_object('success', true, 'message', 'Payment PIN configured successfully.');
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_salary_payment(
    p_request_id UUID,
    p_payment_type TEXT,
    p_pin TEXT,
    p_amount NUMERIC DEFAULT NULL,
    p_recipient_name TEXT DEFAULT NULL,
    p_recipient_phone TEXT DEFAULT NULL,
    p_note TEXT DEFAULT '',
    p_tier_id UUID DEFAULT NULL,
    p_product_id UUID DEFAULT NULL,
    p_quantity INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_application RECORD;
    v_existing RECORD;
    v_creator_id UUID;
    v_creator_name TEXT;
    v_amount NUMERIC(12, 2);
    v_outstanding NUMERIC(12, 2);
    v_available NUMERIC(12, 2);
    v_authorization_id UUID;
    v_order_id UUID;
    v_subscription_expires_at TIMESTAMPTZ;
    v_pin_attempts INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sign in before authorizing a payment.');
    END IF;
    IF p_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment request is missing its idempotency key.');
    END IF;
    IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 numeric digits.');
    END IF;

    SELECT id, payment_type, amount, status
      INTO v_existing
      FROM public.salary_payment_authorizations
     WHERE user_id = v_user_id
       AND request_id = p_request_id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'authorization_id', v_existing.id,
            'payment_type', v_existing.payment_type,
            'amount', v_existing.amount,
            'status', v_existing.status,
            'duplicate', true
        );
    END IF;

    SELECT id, approved_limit, pin_hash, pin_set_at, pin_failed_attempts, pin_locked_until
      INTO v_application
      FROM public.salary_applications
     WHERE user_id = v_user_id
       AND context_type = 'salary_facility'
       AND status = 'approved'
     ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND OR v_application.approved_limit IS NULL OR v_application.approved_limit <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'An approved salary facility with a positive limit is required.');
    END IF;
    IF v_application.pin_hash IS NULL OR v_application.pin_set_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Set your payment PIN before authorizing a payment.');
    END IF;
    IF v_application.pin_locked_until IS NOT NULL AND v_application.pin_locked_until > now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN entry is temporarily locked. Try again later.');
    END IF;
    IF v_application.pin_hash <> extensions.crypt(p_pin, v_application.pin_hash) THEN
        v_pin_attempts := COALESCE(v_application.pin_failed_attempts, 0) + 1;
        UPDATE public.salary_applications
           SET pin_failed_attempts = CASE WHEN v_pin_attempts >= 5 THEN 0 ELSE v_pin_attempts END,
               pin_locked_until = CASE WHEN v_pin_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
         WHERE id = v_application.id;
        RETURN jsonb_build_object(
            'success', false,
            'error', CASE WHEN v_pin_attempts >= 5
                THEN 'Too many incorrect PIN attempts. Try again in 15 minutes.'
                ELSE 'Incorrect payment PIN.' END
        );
    END IF;

    UPDATE public.salary_applications
       SET pin_failed_attempts = 0,
           pin_locked_until = NULL
     WHERE id = v_application.id;

    IF p_payment_type = 'donation' THEN
        IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999999.99 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Enter a valid donation amount.');
        END IF;
        IF p_recipient_name IS NULL OR char_length(trim(p_recipient_name)) NOT BETWEEN 1 AND 100 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Enter a valid recipient name.');
        END IF;
        v_amount := round(p_amount, 2);
    ELSIF p_payment_type = 'subscription' THEN
        IF p_tier_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Choose an available creator tier.');
        END IF;
        SELECT tier.creator_id, tier.amount, creator.display_name
          INTO v_creator_id, v_amount, v_creator_name
          FROM public.creator_tiers AS tier
          JOIN public.creator_profiles AS creator ON creator.id = tier.creator_id
         WHERE tier.id = p_tier_id
           AND tier.active
           AND creator.is_published;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'This creator subscription is no longer available.');
        END IF;
        v_subscription_expires_at := now() + interval '1 month';
    ELSIF p_payment_type = 'shop_order' THEN
        IF p_product_id IS NULL OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 20 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Choose an available item and valid quantity.');
        END IF;
        SELECT product.creator_id, product.price * p_quantity, creator.display_name
          INTO v_creator_id, v_amount, v_creator_name
          FROM public.creator_products AS product
          JOIN public.creator_profiles AS creator ON creator.id = product.creator_id
         WHERE product.id = p_product_id
           AND product.active
           AND creator.is_published;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'This item is no longer available.');
        END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Unsupported payment type.');
    END IF;

    SELECT COALESCE(sum(amount), 0)
      INTO v_outstanding
      FROM public.salary_payment_authorizations
     WHERE user_id = v_user_id
       AND status = 'authorized';

    SELECT v_outstanding + COALESCE(sum(monthly_amount), 0)
      INTO v_outstanding
      FROM public.creator_support_mandates
     WHERE supporter_id = v_user_id
       AND status = 'active';

    v_available := greatest(v_application.approved_limit - v_outstanding, 0);
    IF v_amount > v_available THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('This payment exceeds your available salary facility limit of ZMW %s.', to_char(v_available, 'FM999999999990.00')),
            'available_limit', v_available
        );
    END IF;

    INSERT INTO public.salary_payment_authorizations (
        user_id, salary_application_id, request_id, payment_type, amount, quantity,
        recipient_name, recipient_phone, note, creator_id, tier_id, product_id,
        subscription_expires_at
    )
    VALUES (
        v_user_id, v_application.id, p_request_id, p_payment_type, v_amount, COALESCE(p_quantity, 1),
        NULLIF(trim(p_recipient_name), ''), NULLIF(trim(p_recipient_phone), ''), COALESCE(p_note, ''),
        v_creator_id, p_tier_id, p_product_id, v_subscription_expires_at
    )
    RETURNING id INTO v_authorization_id;

    IF p_payment_type = 'subscription' THEN
        INSERT INTO public.creator_subscriptions (
            user_id, creator_id, tier_id, payment_authorization_id, starts_at, expires_at
        )
        VALUES (
            v_user_id, v_creator_id, p_tier_id, v_authorization_id, now(), v_subscription_expires_at
        );
    ELSIF p_payment_type = 'shop_order' THEN
        INSERT INTO public.creator_orders (
            requester_id, product_id, creator_id, quantity, status, payment_authorization_id
        )
        VALUES (
            v_user_id, p_product_id, v_creator_id, p_quantity, 'requested', v_authorization_id
        )
        RETURNING id INTO v_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'authorization_id', v_authorization_id,
        'order_id', v_order_id,
        'payment_type', p_payment_type,
        'amount', v_amount,
        'available_limit', v_available - v_amount,
        'status', 'authorized',
        'subscription_expires_at', v_subscription_expires_at,
        'message', 'Payment authorized and recorded. Settlement is not performed by this function.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_salary_payment_pin(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_salary_payment_pin(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.authorize_salary_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_salary_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_salary_payment_pin(TEXT) FROM PUBLIC, anon, authenticated;
