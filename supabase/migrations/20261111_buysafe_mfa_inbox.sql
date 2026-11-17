ALTER TABLE public.fulfilment_transactions
    ADD COLUMN IF NOT EXISTS buyer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS seller_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fulfilment_transactions_buyer_user_idx
    ON public.fulfilment_transactions (buyer_user_id, created_at DESC)
    WHERE buyer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fulfilment_transactions_seller_user_idx
    ON public.fulfilment_transactions (seller_user_id, created_at DESC)
    WHERE seller_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fulfilment_verified_phones (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_id UUID NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fulfilment_verified_phones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fulfilment_verified_phones FROM anon, authenticated;
GRANT ALL ON public.fulfilment_verified_phones TO service_role;

CREATE TABLE IF NOT EXISTS public.fulfilment_phone_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    verification_token_hash TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    verified_at TIMESTAMPTZ,
    verification_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fulfilment_phone_challenges_user_idx
    ON public.fulfilment_phone_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fulfilment_phone_challenges_verified_idx
    ON public.fulfilment_phone_challenges (user_id, verification_expires_at DESC)
    WHERE verification_token_hash IS NOT NULL;

ALTER TABLE public.fulfilment_phone_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fulfilment_phone_challenges FROM anon, authenticated;
GRANT ALL ON public.fulfilment_phone_challenges TO service_role;
