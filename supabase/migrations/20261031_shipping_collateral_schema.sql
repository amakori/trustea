-- Migration: Shipping Pickup and Collateral Pickup Integration
-- Description: Supports shipping pickup orders (Trustea P2P & UTH-to-Civic Center gov food delivery) 
-- and collateral appraisal, pickup, and instant InstaPay line activation.

-- 1. Shipping Pickup Orders Table
CREATE TABLE IF NOT EXISTS public.shipping_pickup_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    mode TEXT NOT NULL CHECK (mode IN ('TRUSTEA_P2P', 'GOV_FOOD_DELIVERY')),
    status TEXT NOT NULL DEFAULT 'READY_FOR_PICKUP' CHECK (status IN (
        'READY_FOR_PICKUP',
        'RIDER_ARRIVED',
        'PICKED_UP_IN_TRANSIT',
        'DELIVERED',
        'CANCELLED'
    )),
    sender_name TEXT NOT NULL,
    sender_phone TEXT NOT NULL,
    sender_location TEXT NOT NULL,
    sender_facility TEXT, -- e.g. "UTH Main Kitchen & Canteen, Nationalist Rd"
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    recipient_location TEXT NOT NULL,
    recipient_facility TEXT, -- e.g. "Lusaka Civic Center, Ministry of Local Govt, 3rd Floor"
    item_title TEXT NOT NULL,
    item_description TEXT,
    item_category TEXT NOT NULL, -- e.g. "Hot Lunch / Diet Meal", "Electronics", "Documents"
    declared_value NUMERIC(12, 2) DEFAULT 0.00,
    delivery_fee NUMERIC(12, 2) DEFAULT 35.00,
    special_instructions TEXT,
    rider_id TEXT DEFAULT 'rider-lusaka-01',
    rider_name TEXT DEFAULT 'Kelvin Musonda (Tuk-Tuk Express)',
    rider_phone TEXT DEFAULT '+260979456789',
    collected_photos JSONB DEFAULT '[]'::jsonb, -- Array of photo URLs / base64 captures
    sender_signature_data TEXT, -- Base64 digital canvas signature data URI
    sender_signatory_name TEXT,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Pledged Collateral Appraisals & Pickups Table
CREATE TABLE IF NOT EXISTS public.collateral_pickups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collateral_code TEXT NOT NULL UNIQUE,
    borrower_id UUID REFERENCES public.borrowers(id) ON DELETE SET NULL,
    borrower_name TEXT NOT NULL,
    borrower_phone TEXT NOT NULL,
    borrower_nrc TEXT,
    borrower_address TEXT NOT NULL,
    item_category TEXT NOT NULL, -- SMARTPHONE, LAPTOP, POWER_SOLAR, APPLIANCE, MOTORBIKE, TOOLS
    item_make TEXT NOT NULL,
    item_model TEXT NOT NULL,
    questionnaire_responses JSONB NOT NULL DEFAULT '{}'::jsonb,
    estimated_fmv NUMERIC(12, 2) NOT NULL, -- Fair Market Value (ZMW)
    condition_grade TEXT NOT NULL, -- Grade A+, Grade A, Grade B, Grade C
    loan_to_value_pct NUMERIC(5, 2) NOT NULL, -- e.g. 70.00%
    approved_credit_limit NUMERIC(12, 2) NOT NULL, -- Max value for borrower adoption
    mfi_headroom_margin NUMERIC(12, 2) NOT NULL, -- Safety cushion for collateral management
    status TEXT NOT NULL DEFAULT 'PENDING_PICKUP' CHECK (status IN (
        'VALUATION_COMPLETED',
        'PENDING_PICKUP',
        'RIDER_INSPECTING',
        'ACCEPTED_AND_TRANSIT',
        'IN_MFI_VAULT',
        'REJECTED'
    )),
    rider_id TEXT DEFAULT 'rider-lusaka-01',
    rider_name TEXT DEFAULT 'Kelvin Musonda (Tuk-Tuk Express)',
    inspection_photos JSONB DEFAULT '[]'::jsonb,
    borrower_signature_data TEXT, -- Digital signature acknowledging handover
    handover_at TIMESTAMPTZ,
    instapay_account_activated BOOLEAN NOT NULL DEFAULT false,
    instapay_sms_sent BOOLEAN NOT NULL DEFAULT false,
    instapay_sms_text TEXT,
    instapay_activation_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Realtime for Shipping and Collateral tables
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shipping_pickup_orders;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.collateral_pickups;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END;
$$;
