ALTER TABLE public.fulfilment_transactions
    ADD COLUMN IF NOT EXISTS fleetbase_order_id TEXT,
    ADD COLUMN IF NOT EXISTS fleetbase_status TEXT,
    ADD COLUMN IF NOT EXISTS fleetbase_tracking_url TEXT,
    ADD COLUMN IF NOT EXISTS fleetbase_location JSONB,
    ADD COLUMN IF NOT EXISTS fleetbase_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fleetbase_location_handed_over_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'salary_deduction',
    ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending_mfi',
    ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.fulfilment_transactions
    DROP CONSTRAINT IF EXISTS fulfilment_transactions_status_check;

ALTER TABLE public.fulfilment_transactions
    ADD CONSTRAINT fulfilment_transactions_status_check CHECK (status IN (
        'seller_response_pending',
        'buyer_checkout_pending',
        'mfi_review',
        'delivery_pending',
        'in_transit',
        'at_fleetbase_location',
        'fleetbase_aggregation',
        'fleetbase_middle_mile',
        'final_delivery',
        'delivered',
        'return_window',
        'return_requested',
        'settlement_due',
        'completed',
        'returned',
        'cancelled',
        'delivery_exception'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS fulfilment_transactions_fleetbase_order_id_idx
    ON public.fulfilment_transactions (fleetbase_order_id)
    WHERE fleetbase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fulfilment_transactions_payment_status_idx
    ON public.fulfilment_transactions (payment_status, created_at DESC);
