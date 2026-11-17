CREATE TABLE IF NOT EXISTS public.creator_fulfilment_profiles (
    creator_id UUID PRIMARY KEY REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
    pickup_name TEXT NOT NULL CHECK (char_length(trim(pickup_name)) BETWEEN 1 AND 100),
    pickup_phone TEXT NOT NULL CHECK (char_length(trim(pickup_phone)) BETWEEN 7 AND 20),
    pickup_address TEXT NOT NULL CHECK (char_length(trim(pickup_address)) BETWEEN 1 AND 500),
    pickup_latitude DOUBLE PRECISION NOT NULL CHECK (pickup_latitude BETWEEN -90 AND 90),
    pickup_longitude DOUBLE PRECISION NOT NULL CHECK (pickup_longitude BETWEEN -180 AND 180),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_fulfilment_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creators manage own fulfilment profile" ON public.creator_fulfilment_profiles;
CREATE POLICY "Creators manage own fulfilment profile"
    ON public.creator_fulfilment_profiles FOR ALL
    TO authenticated
    USING (
        creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid())
        OR public.is_sumthin_mfi_operator()
    )
    WITH CHECK (
        creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid())
        OR public.is_sumthin_mfi_operator()
    );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_fulfilment_profiles TO authenticated;

ALTER TABLE public.creator_orders
    ADD COLUMN IF NOT EXISTS mfi_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mfi_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fulfilment_status TEXT NOT NULL DEFAULT 'awaiting_mfi',
    ADD COLUMN IF NOT EXISTS fleetbase_order_id TEXT,
    ADD COLUMN IF NOT EXISTS fleetbase_status TEXT,
    ADD COLUMN IF NOT EXISTS fleetbase_tracking_url TEXT,
    ADD COLUMN IF NOT EXISTS fleetbase_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS shipday_order_id TEXT,
    ADD COLUMN IF NOT EXISTS shipday_tracking_url TEXT,
    ADD COLUMN IF NOT EXISTS shipday_status TEXT,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.creator_order_deliveries (
    order_id UUID PRIMARY KEY REFERENCES public.creator_orders(id) ON DELETE CASCADE,
    recipient_name TEXT NOT NULL CHECK (char_length(trim(recipient_name)) BETWEEN 1 AND 100),
    recipient_phone TEXT NOT NULL CHECK (char_length(trim(recipient_phone)) BETWEEN 7 AND 20),
    delivery_address TEXT NOT NULL CHECK (char_length(trim(delivery_address)) BETWEEN 1 AND 500),
    delivery_latitude DOUBLE PRECISION NOT NULL CHECK (delivery_latitude BETWEEN -90 AND 90),
    delivery_longitude DOUBLE PRECISION NOT NULL CHECK (delivery_longitude BETWEEN -180 AND 180),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'creator_orders'
           AND column_name = 'delivery_name'
    ) THEN
        INSERT INTO public.creator_order_deliveries (
            order_id, recipient_name, recipient_phone, delivery_address,
            delivery_latitude, delivery_longitude
        )
        SELECT id, delivery_name, delivery_phone, delivery_address,
               delivery_latitude, delivery_longitude
          FROM public.creator_orders
         WHERE delivery_name IS NOT NULL
           AND delivery_phone IS NOT NULL
           AND delivery_address IS NOT NULL
           AND delivery_latitude IS NOT NULL
           AND delivery_longitude IS NOT NULL
        ON CONFLICT (order_id) DO NOTHING;
    END IF;
END;
$$;
DROP POLICY IF EXISTS "Buyers update own unapproved shop delivery" ON public.creator_orders;
ALTER TABLE public.creator_orders
    DROP COLUMN IF EXISTS delivery_name,
    DROP COLUMN IF EXISTS delivery_phone,
    DROP COLUMN IF EXISTS delivery_address,
    DROP COLUMN IF EXISTS delivery_latitude,
    DROP COLUMN IF EXISTS delivery_longitude;
ALTER TABLE public.creator_order_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_order_deliveries FROM PUBLIC, anon;
DROP POLICY IF EXISTS "Buyers and MFI read shop delivery details" ON public.creator_order_deliveries;
CREATE POLICY "Buyers and MFI read shop delivery details"
    ON public.creator_order_deliveries FOR SELECT
    TO authenticated
    USING (
        public.is_sumthin_mfi_operator()
        OR order_id IN (SELECT id FROM public.creator_orders WHERE requester_id = auth.uid())
    );
DROP POLICY IF EXISTS "Buyers manage own unapproved shop delivery" ON public.creator_order_deliveries;
CREATE POLICY "Buyers manage own unapproved shop delivery"
    ON public.creator_order_deliveries FOR ALL
    TO authenticated
    USING (
        order_id IN (
            SELECT id FROM public.creator_orders
             WHERE requester_id = auth.uid()
               AND payment_authorization_id IS NOT NULL
               AND status = 'requested'
               AND mfi_approved_at IS NULL
        )
    )
    WITH CHECK (
        order_id IN (
            SELECT id FROM public.creator_orders
             WHERE requester_id = auth.uid()
               AND payment_authorization_id IS NOT NULL
               AND status = 'requested'
               AND mfi_approved_at IS NULL
        )
    );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_order_deliveries TO authenticated;

ALTER TABLE public.creator_orders
    DROP CONSTRAINT IF EXISTS creator_orders_fulfilment_status_check;
ALTER TABLE public.creator_orders
    ADD CONSTRAINT creator_orders_fulfilment_status_check CHECK (fulfilment_status IN (
        'awaiting_mfi',
        'delivery_pending',
        'in_transit',
        'at_fleetbase_location',
        'fleetbase_aggregation',
        'fleetbase_middle_mile',
        'final_delivery',
        'delivered',
        'delivery_exception'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS creator_orders_fleetbase_order_id_idx
    ON public.creator_orders (fleetbase_order_id)
    WHERE fleetbase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS creator_orders_fulfilment_status_idx
    ON public.creator_orders (fulfilment_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_creator_order_fulfilment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.role() = 'service_role' OR public.is_sumthin_mfi_operator() THEN
        RETURN NEW;
    END IF;
    IF OLD.payment_authorization_id IS NOT NULL THEN
        IF OLD.requester_id IS DISTINCT FROM auth.uid()
           OR OLD.status <> 'requested'
           OR NEW.status <> 'requested'
           OR NEW.id IS DISTINCT FROM OLD.id
           OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
           OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
           OR NEW.product_id IS DISTINCT FROM OLD.product_id
           OR NEW.quantity IS DISTINCT FROM OLD.quantity
           OR NEW.payment_authorization_id IS DISTINCT FROM OLD.payment_authorization_id
           OR NEW.mfi_approved_at IS DISTINCT FROM OLD.mfi_approved_at
           OR NEW.mfi_approved_by IS DISTINCT FROM OLD.mfi_approved_by
           OR NEW.fulfilment_status IS DISTINCT FROM OLD.fulfilment_status
           OR NEW.fleetbase_order_id IS DISTINCT FROM OLD.fleetbase_order_id
           OR NEW.fleetbase_status IS DISTINCT FROM OLD.fleetbase_status
           OR NEW.fleetbase_tracking_url IS DISTINCT FROM OLD.fleetbase_tracking_url
           OR NEW.fleetbase_updated_at IS DISTINCT FROM OLD.fleetbase_updated_at
           OR NEW.shipday_order_id IS DISTINCT FROM OLD.shipday_order_id
           OR NEW.shipday_tracking_url IS DISTINCT FROM OLD.shipday_tracking_url
           OR NEW.shipday_status IS DISTINCT FROM OLD.shipday_status
           OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Only the buyer may update delivery details before MFI approval.';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
       OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.payment_authorization_id IS DISTINCT FROM OLD.payment_authorization_id
       OR NEW.mfi_approved_at IS DISTINCT FROM OLD.mfi_approved_at
       OR NEW.mfi_approved_by IS DISTINCT FROM OLD.mfi_approved_by
       OR NEW.fulfilment_status IS DISTINCT FROM OLD.fulfilment_status
       OR NEW.fleetbase_order_id IS DISTINCT FROM OLD.fleetbase_order_id
       OR NEW.fleetbase_status IS DISTINCT FROM OLD.fleetbase_status
       OR NEW.fleetbase_tracking_url IS DISTINCT FROM OLD.fleetbase_tracking_url
       OR NEW.fleetbase_updated_at IS DISTINCT FROM OLD.fleetbase_updated_at
       OR NEW.shipday_order_id IS DISTINCT FROM OLD.shipday_order_id
       OR NEW.shipday_tracking_url IS DISTINCT FROM OLD.shipday_tracking_url
       OR NEW.shipday_status IS DISTINCT FROM OLD.shipday_status
       OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Only the creator order response may be updated by the creator.';
    END IF;
    IF OLD.status <> 'requested' OR NEW.status NOT IN ('accepted', 'declined') THEN
        RAISE EXCEPTION 'Only a pending unpaid order can be accepted or declined.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_creator_order_fulfilment ON public.creator_orders;
CREATE TRIGGER guard_creator_order_fulfilment
    BEFORE UPDATE ON public.creator_orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_creator_order_fulfilment();
REVOKE ALL ON FUNCTION public.guard_creator_order_fulfilment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.require_creator_shop_checkout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.payment_authorization_id IS NOT NULL
       AND current_setting('sumthin.shop_checkout', true) IS DISTINCT FROM 'verified' THEN
        RAISE EXCEPTION 'Paid shop orders must be created with verified delivery details.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_creator_shop_checkout ON public.creator_orders;
CREATE TRIGGER require_creator_shop_checkout
    BEFORE INSERT ON public.creator_orders
    FOR EACH ROW EXECUTE FUNCTION public.require_creator_shop_checkout();
REVOKE ALL ON FUNCTION public.require_creator_shop_checkout() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.authorize_creator_shop_order(
    p_request_id UUID,
    p_pin TEXT,
    p_product_id UUID,
    p_quantity INTEGER,
    p_delivery_name TEXT,
    p_delivery_phone TEXT,
    p_delivery_address TEXT,
    p_delivery_latitude DOUBLE PRECISION,
    p_delivery_longitude DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_payment JSONB;
    v_authorization_id UUID;
    v_order_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sign in before placing a shop order.');
    END IF;
    IF p_delivery_name IS NULL OR char_length(trim(p_delivery_name)) NOT BETWEEN 1 AND 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Enter a valid delivery recipient name.');
    END IF;
    IF p_delivery_phone IS NULL OR char_length(trim(p_delivery_phone)) NOT BETWEEN 7 AND 20
       OR trim(p_delivery_phone) !~ '^\+?[0-9 ()-]+$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Enter a valid delivery phone number.');
    END IF;
    IF p_delivery_address IS NULL OR char_length(trim(p_delivery_address)) NOT BETWEEN 1 AND 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Enter a complete delivery address.');
    END IF;
    IF p_delivery_latitude IS NULL OR p_delivery_latitude NOT BETWEEN -90 AND 90
       OR p_delivery_longitude IS NULL OR p_delivery_longitude NOT BETWEEN -180 AND 180 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Set the delivery location using your device location.');
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM public.creator_products AS product
          JOIN public.creator_profiles AS creator ON creator.id = product.creator_id
          JOIN public.creator_fulfilment_profiles AS fulfilment ON fulfilment.creator_id = creator.id
         WHERE product.id = p_product_id
           AND product.active
           AND creator.is_published
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This item or its creator pickup details are unavailable.');
    END IF;

    PERFORM set_config('sumthin.shop_checkout', 'verified', true);
    v_payment := public.authorize_salary_payment(
        p_request_id,
        'shop_order',
        p_pin,
        NULL,
        NULL,
        NULL,
        '',
        NULL,
        p_product_id,
        p_quantity
    );
    PERFORM set_config('sumthin.shop_checkout', '', true);
    IF COALESCE((v_payment ->> 'success')::BOOLEAN, false) IS NOT TRUE THEN
        RETURN v_payment;
    END IF;
    IF v_payment ->> 'payment_type' IS DISTINCT FROM 'shop_order' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This payment request was already used for a different payment type.');
    END IF;

    v_authorization_id := (v_payment ->> 'authorization_id')::UUID;
    SELECT id
      INTO v_order_id
      FROM public.creator_orders
     WHERE payment_authorization_id = v_authorization_id
       AND requester_id = v_user_id
       AND status = 'requested'
       AND mfi_approved_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The shop order could not be prepared for delivery.';
    END IF;
    INSERT INTO public.creator_order_deliveries (
        order_id, recipient_name, recipient_phone, delivery_address,
        delivery_latitude, delivery_longitude, updated_at
    )
    VALUES (
        v_order_id, trim(p_delivery_name), trim(p_delivery_phone), trim(p_delivery_address),
        p_delivery_latitude, p_delivery_longitude, now()
    )
    ON CONFLICT (order_id) DO UPDATE
       SET recipient_name = EXCLUDED.recipient_name,
           recipient_phone = EXCLUDED.recipient_phone,
           delivery_address = EXCLUDED.delivery_address,
           delivery_latitude = EXCLUDED.delivery_latitude,
           delivery_longitude = EXCLUDED.delivery_longitude,
           updated_at = now();

    RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_creator_shop_order(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_creator_shop_order(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

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
    v_order RECORD;
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

    IF v_payment_type = 'shop_order' THEN
        SELECT id, status, mfi_approved_at, fleetbase_order_id, fulfilment_status
          INTO v_order
          FROM public.creator_orders
         WHERE payment_authorization_id = p_authorization_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'The shop order could not be found.');
        END IF;

        IF p_status = 'settled' AND v_order.fulfilment_status <> 'delivered' THEN
            RETURN jsonb_build_object('success', false, 'error', 'A shop order can be settled after Fleetbase confirms delivery.');
        END IF;
        IF p_status = 'voided' AND (v_order.mfi_approved_at IS NOT NULL OR v_order.fleetbase_order_id IS NOT NULL) THEN
            RETURN jsonb_build_object('success', false, 'error', 'A shop order approved for Fleetbase fulfilment cannot be voided here.');
        END IF;
    END IF;

    IF p_status = 'settled' THEN
        UPDATE public.salary_payment_authorizations
           SET status = 'settled',
               settled_at = now(),
               settled_by = auth.uid()
         WHERE id = p_authorization_id
           AND status = 'authorized';
        IF v_payment_type = 'shop_order' THEN
            UPDATE public.creator_orders
               SET status = 'fulfilled'
             WHERE id = v_order.id
               AND status = 'accepted';
        END IF;
    ELSE
        UPDATE public.salary_payment_authorizations
           SET status = 'voided',
               voided_at = now(),
               voided_by = auth.uid()
         WHERE id = p_authorization_id
           AND status = 'authorized';
        IF v_payment_type = 'shop_order' THEN
            UPDATE public.creator_orders
               SET status = 'cancelled'
             WHERE id = v_order.id
               AND status = 'requested';
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_salary_payment_authorization(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_salary_payment_authorization(UUID, TEXT) TO authenticated;
