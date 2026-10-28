-- Sumthin creator pages, supporter-only posts, merchandise, and MFI-reviewed
-- recurring salary-deduction requests.

CREATE TABLE IF NOT EXISTS public.creator_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 70),
    handle TEXT NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,30}$'),
    bio TEXT NOT NULL DEFAULT '' CHECK (char_length(bio) <= 400),
    avatar_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 70),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 400),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 6000),
    image_url TEXT,
    visibility TEXT NOT NULL DEFAULT 'supporters' CHECK (visibility IN ('public', 'supporters')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
    image_url TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_support_mandates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE RESTRICT,
    tier_id UUID NOT NULL REFERENCES public.creator_tiers(id) ON DELETE RESTRICT,
    borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE RESTRICT,
    borrower_phone TEXT NOT NULL,
    monthly_amount NUMERIC(12, 2) NOT NULL CHECK (monthly_amount > 0),
    status TEXT NOT NULL DEFAULT 'pending_mfi'
        CHECK (status IN ('pending_mfi', 'approved', 'active', 'rejected', 'cancelled')),
    consent_at TIMESTAMPTZ NOT NULL,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_note TEXT,
    activated_at TIMESTAMPTZ,
    activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_support_one_open_mandate
    ON public.creator_support_mandates (supporter_id, creator_id)
    WHERE status IN ('pending_mfi', 'approved', 'active');

CREATE INDEX IF NOT EXISTS creator_support_mfi_queue
    ON public.creator_support_mandates (created_at DESC)
    WHERE status = 'pending_mfi';

CREATE TABLE IF NOT EXISTS public.creator_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.creator_products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'accepted', 'fulfilled', 'declined', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_sumthin_mfi_operator()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'mfi_operator', false);
$$;

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
    );
$$;

CREATE OR REPLACE FUNCTION public.request_creator_support(
    p_tier_id UUID,
    p_borrower_phone TEXT,
    p_consent BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_creator_id UUID;
    v_amount NUMERIC(12, 2);
    v_borrower_id UUID;
    v_mandate_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Sign in before requesting creator support.';
    END IF;
    IF p_consent IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Explicit salary-deduction consent is required.';
    END IF;
    IF p_borrower_phone IS NULL OR char_length(trim(p_borrower_phone)) NOT BETWEEN 7 AND 20 THEN
        RAISE EXCEPTION 'Enter a valid MFI-registered phone number.';
    END IF;

    SELECT tier.creator_id, tier.amount
      INTO v_creator_id, v_amount
      FROM public.creator_tiers AS tier
      JOIN public.creator_profiles AS creator ON creator.id = tier.creator_id
     WHERE tier.id = p_tier_id
       AND tier.active
       AND creator.is_published;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This creator support tier is no longer available.';
    END IF;

    SELECT borrower.id
      INTO v_borrower_id
      FROM public.borrowers AS borrower
     WHERE borrower.phone_number = trim(p_borrower_phone)
       AND borrower.status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active MFI borrower was found for that phone number.';
    END IF;

    INSERT INTO public.creator_support_mandates (
        supporter_id, creator_id, tier_id, borrower_id, borrower_phone,
        monthly_amount, status, consent_at
    )
    VALUES (
        v_user_id, v_creator_id, p_tier_id, v_borrower_id, trim(p_borrower_phone),
        v_amount, 'pending_mfi', now()
    )
    RETURNING id INTO v_mandate_id;

    RETURN v_mandate_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'You already have a pending or active support request for this creator.';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_creator_support_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_sumthin_mfi_operator() THEN
        RAISE EXCEPTION 'Only an MFI operator can review salary-deduction requests.';
    END IF;
    IF NOT (
        (OLD.status = 'pending_mfi' AND NEW.status IN ('approved', 'rejected'))
        OR (OLD.status = 'approved' AND NEW.status IN ('active', 'rejected'))
    ) THEN
        RAISE EXCEPTION 'Requests must be reviewed before payroll activation.';
    END IF;
    IF NEW.supporter_id IS DISTINCT FROM OLD.supporter_id
       OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
       OR NEW.tier_id IS DISTINCT FROM OLD.tier_id
       OR NEW.borrower_id IS DISTINCT FROM OLD.borrower_id
       OR NEW.borrower_phone IS DISTINCT FROM OLD.borrower_phone
       OR NEW.monthly_amount IS DISTINCT FROM OLD.monthly_amount
       OR NEW.consent_at IS DISTINCT FROM OLD.consent_at THEN
        RAISE EXCEPTION 'MFI review cannot change the approved request details.';
    END IF;
    IF NEW.status IN ('approved', 'rejected') THEN
        IF NEW.reviewed_by IS DISTINCT FROM auth.uid() OR NEW.reviewed_at IS NULL THEN
            RAISE EXCEPTION 'Record the reviewing MFI operator and review time.';
        END IF;
        IF NEW.activated_at IS NOT NULL OR NEW.activated_by IS NOT NULL THEN
            RAISE EXCEPTION 'Payroll activation must be recorded as a separate step.';
        END IF;
    ELSIF NEW.activated_by IS DISTINCT FROM auth.uid() OR NEW.activated_at IS NULL
          OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
          OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
          OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
        RAISE EXCEPTION 'Record payroll activation separately from MFI approval.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_creator_support_review ON public.creator_support_mandates;
CREATE TRIGGER guard_creator_support_review
    BEFORE UPDATE ON public.creator_support_mandates
    FOR EACH ROW EXECUTE FUNCTION public.guard_creator_support_review();

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_support_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published creators and owners can read profiles" ON public.creator_profiles;
CREATE POLICY "Published creators and owners can read profiles"
    ON public.creator_profiles FOR SELECT
    USING (is_published OR user_id = auth.uid() OR public.is_sumthin_mfi_operator());
DROP POLICY IF EXISTS "Users create their own creator profile" ON public.creator_profiles;
CREATE POLICY "Users create their own creator profile"
    ON public.creator_profiles FOR INSERT
    WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Owners update their creator profile" ON public.creator_profiles;
CREATE POLICY "Owners update their creator profile"
    ON public.creator_profiles FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Active tiers are public and owners can read all" ON public.creator_tiers;
CREATE POLICY "Active tiers are public and owners can read all"
    ON public.creator_tiers FOR SELECT
    USING (
        (
            active
            AND creator_id IN (
                SELECT id FROM public.creator_profiles WHERE is_published
            )
        )
        OR creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid())
        OR public.is_sumthin_mfi_operator()
    );
DROP POLICY IF EXISTS "Creators manage their tiers" ON public.creator_tiers;
CREATE POLICY "Creators manage their tiers"
    ON public.creator_tiers FOR ALL
    USING (creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()))
    WITH CHECK (creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Public and entitled posts are readable" ON public.creator_posts;
CREATE POLICY "Public and entitled posts are readable"
    ON public.creator_posts FOR SELECT
    USING (
        (
            visibility = 'public'
            AND creator_id IN (
                SELECT id FROM public.creator_profiles WHERE is_published
            )
        )
        OR creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid())
        OR public.is_sumthin_mfi_operator()
        OR public.has_active_creator_support(creator_posts.creator_id)
    );
DROP POLICY IF EXISTS "Creators manage their posts" ON public.creator_posts;
CREATE POLICY "Creators manage their posts"
    ON public.creator_posts FOR ALL
    USING (creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()))
    WITH CHECK (creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Active products and owners are readable" ON public.creator_products;
CREATE POLICY "Active products and owners are readable"
    ON public.creator_products FOR SELECT
    USING (
        (
            active
            AND creator_id IN (
                SELECT id FROM public.creator_profiles WHERE is_published
            )
        )
        OR creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid())
        OR public.is_sumthin_mfi_operator()
    );
DROP POLICY IF EXISTS "Creators manage their products" ON public.creator_products;
CREATE POLICY "Creators manage their products"
    ON public.creator_products FOR ALL
    USING (creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()))
    WITH CHECK (creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Supporters and MFI operators read mandates" ON public.creator_support_mandates;
CREATE POLICY "Supporters and MFI operators read mandates"
    ON public.creator_support_mandates FOR SELECT
    USING (supporter_id = auth.uid() OR public.is_sumthin_mfi_operator());
DROP POLICY IF EXISTS "MFI operators review mandates" ON public.creator_support_mandates;
CREATE POLICY "MFI operators review mandates"
    ON public.creator_support_mandates FOR UPDATE
    USING (public.is_sumthin_mfi_operator())
    WITH CHECK (public.is_sumthin_mfi_operator());

DROP POLICY IF EXISTS "Order parties can read requests" ON public.creator_orders;
CREATE POLICY "Order parties can read requests"
    ON public.creator_orders FOR SELECT
    USING (
        requester_id = auth.uid()
        OR creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid())
    );
DROP POLICY IF EXISTS "Customers request active creator products" ON public.creator_orders;
CREATE POLICY "Customers request active creator products"
    ON public.creator_orders FOR INSERT
    WITH CHECK (
        requester_id = auth.uid()
        AND status = 'requested'
        AND EXISTS (
            SELECT 1 FROM public.creator_products AS product
             WHERE product.id = creator_orders.product_id
               AND product.creator_id = creator_orders.creator_id
               AND product.active
        )
    );
DROP POLICY IF EXISTS "Creators update their order requests" ON public.creator_orders;
CREATE POLICY "Creators update their order requests"
    ON public.creator_orders FOR UPDATE
    USING (creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()))
    WITH CHECK (creator_id IN (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()));

GRANT SELECT ON public.creator_profiles, public.creator_tiers, public.creator_posts, public.creator_products
    TO anon, authenticated;
GRANT INSERT, UPDATE ON public.creator_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.creator_tiers, public.creator_posts, public.creator_products
    TO authenticated;
REVOKE ALL ON public.creator_support_mandates, public.creator_orders FROM anon;
GRANT SELECT, UPDATE ON public.creator_support_mandates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.creator_orders TO authenticated;

REVOKE ALL ON FUNCTION public.is_sumthin_mfi_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_sumthin_mfi_operator() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_creator_support(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_creator_support(UUID) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.request_creator_support(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_creator_support(UUID, TEXT, BOOLEAN) TO authenticated;

-- Configure trusted MFI accounts server-side only:
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data || '{"role":"mfi_operator"}'::jsonb
-- WHERE id = '<operator-user-uuid>';
