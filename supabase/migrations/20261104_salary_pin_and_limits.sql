-- ============================================================
-- Migration: Add approved_limit and payment PIN to salary_applications
-- Date: 2026-11-04
-- Purpose:
--   1. MFI operator determines and sets approved_limit (max credit/deduction limit).
--   2. User sets a 4-digit payment PIN once approved.
--   3. Secure RPCs to set and verify payment PIN.
-- ============================================================

-- Ensure pgcrypto is enabled for secure PIN hashing
create extension if not exists pgcrypto;

-- 1. Add columns to salary_applications
alter table public.salary_applications
  add column if not exists approved_limit numeric(12,2) default null,
  add column if not exists pin_hash text default null,
  add column if not exists pin_set_at timestamptz default null;

-- 2. Secure function for a user to set their payment PIN (only if approved)
create or replace function public.set_salary_payment_pin(
  p_application_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_status text;
begin
  -- Validate authenticated caller
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  -- Validate 4-digit numeric PIN
  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 numeric digits.');
  end if;

  -- Verify application belongs to user and is approved
  select status into v_status
  from public.salary_applications
  where id = p_application_id and user_id = v_user_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Application not found.');
  end if;

  if v_status != 'approved' then
    return jsonb_build_object('success', false, 'error', 'Salary application must be approved by MFI before setting a PIN.');
  end if;

  -- Update record with hashed PIN
  update public.salary_applications
  set
    pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
    pin_set_at = now()
  where id = p_application_id and user_id = v_user_id;

  return jsonb_build_object('success', true, 'message', 'Payment PIN configured successfully.');
end;
$$;

-- 3. Secure function to verify PIN for authorizing a payment / donation / subscription
create or replace function public.verify_salary_payment_pin(
  p_pin text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_app record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  -- Find the user's latest approved application with a set PIN
  select id, approved_limit, pin_hash
  into v_app
  from public.salary_applications
  where user_id = v_user_id
    and status = 'approved'
    and pin_hash is not null
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'No approved salary account with a configured PIN found.');
  end if;

  if v_app.pin_hash != extensions.crypt(p_pin, v_app.pin_hash) then
    return jsonb_build_object('success', false, 'error', 'Incorrect payment PIN.');
  end if;

  return jsonb_build_object(
    'success', true,
    'application_id', v_app.id,
    'approved_limit', v_app.approved_limit
  );
end;
$$;

-- Grant execution to authenticated users
grant execute on function public.set_salary_payment_pin(uuid, text) to authenticated;
grant execute on function public.verify_salary_payment_pin(text) to authenticated;
