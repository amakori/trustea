-- Migration: Instapay Core Architecture Schema
-- Description: Core tables, credit decision safeguards, USSD session state tracking, and SMS carrier logs

-- 1. Borrowers table
CREATE TABLE IF NOT EXISTS public.borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    nrc_number TEXT NOT NULL UNIQUE,
    credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 2000.00,
    current_outstanding NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    daily_borrowed_today NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blacklisted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Gateway Devices (Instapay Android App phones)
CREATE TABLE IF NOT EXISTS public.gateway_devices (
    id TEXT PRIMARY KEY, -- e.g. 'gateway-airtel-01'
    device_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    carrier TEXT NOT NULL DEFAULT 'Airtel Money',
    balance NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'offline', 'error')),
    battery_level INTEGER DEFAULT 100,
    pin_configured BOOLEAN NOT NULL DEFAULT true,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. MFI Safeguards & Configuration
CREATE TABLE IF NOT EXISTS public.mfi_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    mfi_name TEXT NOT NULL DEFAULT 'Trustea Microfinance Partners',
    max_single_loan NUMERIC(12, 2) NOT NULL DEFAULT 3000.00,
    min_single_loan NUMERIC(12, 2) NOT NULL DEFAULT 10.00,
    daily_borrower_limit NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
    daily_total_dispense_limit NUMERIC(12, 2) NOT NULL DEFAULT 50000.00,
    government_max_loan_limit NUMERIC(12, 2) NOT NULL DEFAULT 10000.00,
    government_interest_cap_pct NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
    gateway_min_reserve_buffer NUMERIC(12, 2) NOT NULL DEFAULT 50.00,
    auto_approval_enabled BOOLEAN NOT NULL DEFAULT true,
    emergency_freeze_dispensing BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Instapay Loans (Core transaction lifecycle)
CREATE TABLE IF NOT EXISTS public.instapay_loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID REFERENCES public.borrowers(id) ON DELETE SET NULL,
    borrower_phone TEXT NOT NULL,
    borrower_name TEXT NOT NULL,
    loan_type TEXT NOT NULL CHECK (loan_type IN ('SEND_MONEY', 'GET_CASH')),
    amount NUMERIC(12, 2) NOT NULL,
    fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    recipient_phone TEXT, -- for SEND_MONEY
    agent_number TEXT,    -- for GET_CASH
    parsed_recipient_name TEXT,
    gateway_device_id TEXT REFERENCES public.gateway_devices(id),
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
        'REQUESTED',
        'EVALUATING',
        'APPROVED',
        'REJECTED',
        'DISPATCHED',
        'USSD_IN_PROGRESS',
        'AWAITING_CUSTOMER_CONFIRMATION',
        'CUSTOMER_CONFIRMED',
        'CUSTOMER_CANCELLED',
        'PIN_ENTERED',
        'AWAITING_SMS',
        'COMPLETED',
        'FAILED'
    )),
    rejection_reason TEXT,
    credit_decision_details JSONB DEFAULT '{}'::jsonb,
    parsed_ussd_details JSONB DEFAULT '{}'::jsonb,
    carrier_sms_reference TEXT,
    carrier_sms_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. USSD Sessions & Live Step Execution
CREATE TABLE IF NOT EXISTS public.ussd_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID REFERENCES public.instapay_loans(id) ON DELETE CASCADE,
    gateway_device_id TEXT REFERENCES public.gateway_devices(id),
    flow_type TEXT NOT NULL CHECK (flow_type IN ('SEND_MONEY', 'GET_CASH')),
    current_step TEXT NOT NULL DEFAULT 'INIT',
    step_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_prompt_text TEXT,
    confirmation_payload JSONB,
    customer_action TEXT CHECK (customer_action IN ('CONFIRM', 'CANCEL', 'TIMEOUT')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Carrier SMS Messages (Airtel Money SMS Ingestion)
CREATE TABLE IF NOT EXISTS public.carrier_sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_device_id TEXT REFERENCES public.gateway_devices(id),
    sender TEXT NOT NULL DEFAULT 'AirtelMoney',
    raw_sms TEXT NOT NULL,
    parsed_transaction_id TEXT,
    parsed_amount NUMERIC(12, 2),
    parsed_recipient_or_agent TEXT,
    parsed_balance_after NUMERIC(12, 2),
    matched_loan_id UUID REFERENCES public.instapay_loans(id) ON DELETE SET NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. USSD Events Audit Log
CREATE TABLE IF NOT EXISTS public.ussd_events_log (
    id BIGSERIAL PRIMARY KEY,
    loan_id UUID REFERENCES public.instapay_loans(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    step_number INTEGER,
    prompt_text TEXT,
    action_sent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Function: MFI Credit Decision & Safeguards Evaluation
CREATE OR REPLACE FUNCTION public.evaluate_loan_request(
    p_borrower_phone TEXT,
    p_amount NUMERIC,
    p_loan_type TEXT,
    p_gateway_id TEXT DEFAULT 'gateway-airtel-01'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_borrower RECORD;
    v_gateway RECORD;
    v_settings RECORD;
    v_is_eligible BOOLEAN := true;
    v_reasons TEXT[] := ARRAY[]::TEXT[];
    v_decision JSONB;
BEGIN
    -- 1. Fetch MFI Settings
    SELECT * INTO v_settings FROM public.mfi_settings WHERE id = 'default';
    IF NOT FOUND THEN
        SELECT * INTO v_settings FROM public.mfi_settings LIMIT 1;
    END IF;

    -- Safeguard 1: Emergency Freeze Dispensing Check
    IF v_settings.emergency_freeze_dispensing THEN
        v_is_eligible := false;
        v_reasons := array_append(v_reasons, 'MFI Emergency Freeze: Mobile money dispensing is temporarily halted by lender safeguards.');
    END IF;

    -- Safeguard 2: Min / Max Single Loan Limits
    IF p_amount < v_settings.min_single_loan THEN
        v_is_eligible := false;
        v_reasons := array_append(v_reasons, format('Requested amount ZMW %s is below minimum loan threshold of ZMW %s.', p_amount, v_settings.min_single_loan));
    END IF;

    IF p_amount > v_settings.max_single_loan THEN
        v_is_eligible := false;
        v_reasons := array_append(v_reasons, format('Requested amount ZMW %s exceeds MFI single loan maximum of ZMW %s.', p_amount, v_settings.max_single_loan));
    END IF;

    -- Safeguard 3: Government Statutory Limits
    IF p_amount > v_settings.government_max_loan_limit THEN
        v_is_eligible := false;
        v_reasons := array_append(v_reasons, format('Requested amount ZMW %s violates government micro-lending cap of ZMW %s.', p_amount, v_settings.government_max_loan_limit));
    END IF;

    -- Safeguard 4: Borrower Profile & Creditworthiness
    SELECT * INTO v_borrower FROM public.borrowers WHERE phone_number = p_borrower_phone;
    IF NOT FOUND THEN
        v_is_eligible := false;
        v_reasons := array_append(v_reasons, 'Borrower phone number is not registered in the MFI system.');
    ELSE
        IF v_borrower.status <> 'active' THEN
            v_is_eligible := false;
            v_reasons := array_append(v_reasons, format('Borrower status is %s. Loans cannot be granted.', v_borrower.status));
        END IF;

        IF (v_borrower.current_outstanding + p_amount) > v_borrower.credit_limit THEN
            v_is_eligible := false;
            v_reasons := array_append(v_reasons, format('Loan would exceed borrower credit limit (Limit: ZMW %s, Outstanding: ZMW %s, Requested: ZMW %s).', v_borrower.credit_limit, v_borrower.current_outstanding, p_amount));
        END IF;

        IF (v_borrower.daily_borrowed_today + p_amount) > v_settings.daily_borrower_limit THEN
            v_is_eligible := false;
            v_reasons := array_append(v_reasons, format('Loan would exceed daily borrower limit of ZMW %s.', v_settings.daily_borrower_limit));
        END IF;
    END IF;

    -- Safeguard 5: Live Gateway Phone Balance Check (Instapay Android App wallet)
    SELECT * INTO v_gateway FROM public.gateway_devices WHERE id = p_gateway_id;
    IF NOT FOUND THEN
        v_is_eligible := false;
        v_reasons := array_append(v_reasons, 'Designated Instapay Android Gateway device is not registered.');
    ELSE
        IF v_gateway.status = 'offline' THEN
            v_is_eligible := false;
            v_reasons := array_append(v_reasons, 'Instapay Android Gateway phone is offline.');
        END IF;

        IF v_gateway.balance < (p_amount + v_settings.gateway_min_reserve_buffer) THEN
            v_is_eligible := false;
            v_reasons := array_append(v_reasons, format('Insufficient funds in Instapay Gateway wallet. Available: ZMW %s, Required: ZMW %s (including ZMW %s safety buffer).', v_gateway.balance, p_amount, v_settings.gateway_min_reserve_buffer));
        END IF;
    END IF;

    v_decision := jsonb_build_object(
        'eligible', v_is_eligible,
        'reasons', v_reasons,
        'requested_amount', p_amount,
        'borrower_limit', CASE WHEN v_borrower IS NOT NULL THEN v_borrower.credit_limit ELSE 0 END,
        'gateway_balance', CASE WHEN v_gateway IS NOT NULL THEN v_gateway.balance ELSE 0 END,
        'government_cap', v_settings.government_max_loan_limit,
        'evaluated_at', now()
    );

    RETURN v_decision;
END;
$$;

-- Enable Realtime replication for Instant Socket & UI Synchronisation
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.instapay_loans;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_devices;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.carrier_sms_logs;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ussd_sessions;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.mfi_settings;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END;
$$;
