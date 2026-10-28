-- Seed Data for Instapay Ecosystem

-- 1. Default MFI Safeguard Configuration
INSERT INTO public.mfi_settings (
    id,
    mfi_name,
    max_single_loan,
    min_single_loan,
    daily_borrower_limit,
    daily_total_dispense_limit,
    government_max_loan_limit,
    government_interest_cap_pct,
    gateway_min_reserve_buffer,
    auto_approval_enabled,
    emergency_freeze_dispensing
) VALUES (
    'default',
    'Trustea Microfinance Lending Partner',
    3500.00,
    10.00,
    5000.00,
    50000.00,
    10000.00,
    12.50,
    50.00,
    true,
    false
) ON CONFLICT (id) DO UPDATE SET
    max_single_loan = EXCLUDED.max_single_loan,
    emergency_freeze_dispensing = EXCLUDED.emergency_freeze_dispensing;

-- 2. Registered Instapay Android Gateway Phone (Airtel Money Dispensing Phone)
INSERT INTO public.gateway_devices (
    id,
    device_name,
    phone_number,
    carrier,
    balance,
    status,
    battery_level,
    pin_configured,
    last_heartbeat
) VALUES (
    'gateway-airtel-01',
    'Airtel Money Dispenser Alpha (Samsung A14)',
    '+260977632373',
    'Airtel Money',
    8450.00,
    'idle',
    94,
    true,
    now()
) ON CONFLICT (id) DO UPDATE SET
    balance = EXCLUDED.balance,
    status = EXCLUDED.status,
    last_heartbeat = now();

-- 3. Seed Borrowers
INSERT INTO public.borrowers (
    id,
    full_name,
    phone_number,
    nrc_number,
    credit_limit,
    current_outstanding,
    daily_borrowed_today,
    status
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'Mwamba Chileshe',
    '0978587412',
    '348912/11/1',
    2500.00,
    150.00,
    150.00,
    'active'
),
(
    'a2222222-2222-2222-2222-222222222222',
    'Natasha Tembo',
    '0977123456',
    '512398/10/1',
    4000.00,
    0.00,
    0.00,
    'active'
),
(
    'a3333333-3333-3333-3333-333333333333',
    'Kondwani Phiri',
    '0971987654',
    '109823/52/1',
    1000.00,
    950.00,
    950.00,
    'active'
),
(
    'a4444444-4444-4444-4444-444444444444',
    'Mutale Mwape',
    '0973344556',
    '672109/44/1',
    3000.00,
    0.00,
    0.00,
    'suspended'
)
ON CONFLICT (phone_number) DO NOTHING;

-- 4. Sample Completed Loans
INSERT INTO public.instapay_loans (
    id,
    borrower_id,
    borrower_phone,
    borrower_name,
    loan_type,
    amount,
    fee_amount,
    recipient_phone,
    parsed_recipient_name,
    gateway_device_id,
    status,
    carrier_sms_reference,
    carrier_sms_text,
    created_at
) VALUES (
    'b1111111-1111-1111-1111-111111111111',
    'a1111111-1111-1111-1111-111111111111',
    '0978587412',
    'Mwamba Chileshe',
    'SEND_MONEY',
    150.00,
    3.50,
    '0978112233',
    'BRIAN BANDA',
    'gateway-airtel-01',
    'COMPLETED',
    'TXN84910284',
    'Trans. ID: TXN84910284. You have sent ZMW 150.00 to BRIAN BANDA 0978112233 on 28/10/2026 10:14. Fee: ZMW 3.50. New balance: ZMW 8450.00.',
    now() - interval '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- 5. Sample Carrier SMS Log
INSERT INTO public.carrier_sms_logs (
    id,
    gateway_device_id,
    sender,
    raw_sms,
    parsed_transaction_id,
    parsed_amount,
    parsed_recipient_or_agent,
    parsed_balance_after,
    matched_loan_id,
    verified,
    created_at
) VALUES (
    'c1111111-1111-1111-1111-111111111111',
    'gateway-airtel-01',
    'AirtelMoney',
    'Trans. ID: TXN84910284. You have sent ZMW 150.00 to BRIAN BANDA 0978112233 on 28/10/2026 10:14. Fee: ZMW 3.50. New balance: ZMW 8450.00.',
    'TXN84910284',
    150.00,
    'BRIAN BANDA (0978112233)',
    8450.00,
    'b1111111-1111-1111-1111-111111111111',
    true,
    now() - interval '2 hours'
) ON CONFLICT (id) DO NOTHING;
