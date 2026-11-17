-- ============================================================
-- Migration: salary_applications table for sumthin
-- Created: 2026-11-01
-- Purpose: Stores salary deduction applications submitted by
--          users from the sumthin creator support or shop
--          payment flows. The MFI reviews each record and
--          updates status to 'approved' or 'rejected'.
-- ============================================================

create table if not exists public.salary_applications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- Applicant identity (as entered in the form)
  applicant_first_name  text not null,
  applicant_last_name   text not null,
  employment_number     text not null,

  -- Payslip photo stored in the 'salary-payslips' storage bucket
  payslip_url           text,

  -- What was this application for?
  context_type          text not null check (context_type in ('creator_support', 'shop_order')),
  context_ref_id        text not null,  -- tier_id or product_id
  context_label         text not null,  -- Human-readable label, e.g. "Nala Makes — Studio friend"

  -- Amount in ZMW
  amount                numeric(12,2) not null,

  -- MFI review status
  status                text not null default 'pending_mfi'
                          check (status in ('pending_mfi', 'approved', 'rejected')),

  -- MFI reviewer notes (filled in by MFI portal)
  reviewer_notes        text,
  reviewed_at           timestamptz,
  reviewed_by           uuid references auth.users(id),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.touch_salary_application()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists salary_application_updated on public.salary_applications;
create trigger salary_application_updated
  before update on public.salary_applications
  for each row execute function public.touch_salary_application();

-- Row-level security
alter table public.salary_applications enable row level security;

-- Users can see their own applications
create policy "Users can view own salary applications"
  on public.salary_applications for select
  using (auth.uid() = user_id);

-- Users can insert their own applications
create policy "Users can insert own salary applications"
  on public.salary_applications for insert
  with check (auth.uid() = user_id);

-- MFI operators can view all (role set in app_metadata)
create policy "MFI operators can view all salary applications"
  on public.salary_applications for select
  using (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'mfi_operator',
      false
    )
  );

-- MFI operators can update status and reviewer fields
create policy "MFI operators can update salary application status"
  on public.salary_applications for update
  using (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'mfi_operator',
      false
    )
  )
  with check (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'mfi_operator',
      false
    )
  );

-- Enable realtime updates so MFI dashboard receives live changes
alter publication supabase_realtime add table public.salary_applications;

-- ── Storage bucket for payslip uploads ──────────────────────
-- Run in Supabase dashboard or via supabase CLI:
--
--   insert into storage.buckets (id, name, public)
--   values ('salary-payslips', 'salary-payslips', false);
--
--   -- Allow authenticated users to upload to their own folder
--   create policy "Users upload their own payslips"
--     on storage.objects for insert
--     with check (
--       bucket_id = 'salary-payslips'
--       and auth.uid()::text = (storage.foldername(name))[2]
--     );
--
--   -- Allow MFI operators to read all payslips
--   create policy "MFI operators read payslips"
--     on storage.objects for select
--     using (
--       bucket_id = 'salary-payslips'
--       and coalesce(
--         (auth.jwt() -> 'app_metadata' ->> 'role') = 'mfi_operator',
--         false
--       )
--     );
--
--   -- Allow users to read their own payslips
--   create policy "Users read own payslips"
--     on storage.objects for select
--     using (
--       bucket_id = 'salary-payslips'
--       and auth.uid()::text = (storage.foldername(name))[2]
--     );
