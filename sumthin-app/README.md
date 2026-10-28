# sumthin

A mobile-first creator community app with public creator pages, supporter-only posts, creator merchandise, and recurring salary-deduction requests reviewed in the MFI portal.

## Local setup

1. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable/anon key.
2. From the repository root, link the Supabase CLI to the same project used by the MFI software and push the migration:

   ```powershell
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. Install and start the app:

   ```powershell
   cd C:\Users\Amakori\trustea\sumthin-app
   npm install
   npm run dev
   ```

   The app runs at `http://localhost:3004`.
4. Configure the same two public Supabase values in `mfi-software/.env.local`, then restart the MFI app (`npm run dev`, port `3002`).

For a hosted Supabase project, allow the deployed Sumthin origin in **Authentication → URL Configuration → Redirect URLs**. The local Supabase config already allows `http://localhost:3004` and `http://127.0.0.1:3004`.

## MFI operator access

Supporter requests are created through the `request_creator_support` database function. It requires a signed-in user, explicit consent, an active MFI borrower, and an active creator tier. A request remains `pending_mfi`; it does not initiate a deduction or a loan.

MFI staff sign in through **Creator Deductions** in the MFI portal. Assign the trusted `app_metadata.role = mfi_operator` claim to each authorized account using a server-side Supabase Auth admin workflow. Never put this claim in user-editable metadata. Row-level security and a database trigger restrict mandate review to authorized MFI operators, and each approved/rejected request records its reviewer and review time.

Approval records authorization, but does not activate membership. After verifying the borrower's identity, consent, applicable affordability/credit limits, and setting up the deduction in the existing MFI payroll workflow, an MFI operator marks the mandate active. Only then can the supporter read gated posts. This app does not collect payments, originate loans, or execute payroll deductions.

## Data access

- Supabase Auth handles account registration and sign-in.
- RLS protects creator profiles, private posts, memberships, and order requests.
- Only public posts or supporter-only posts covered by an MFI-approved active membership are readable.
- A creator cannot read a supporter's borrower phone or financial mandate; only the supporter and authorized MFI operators can read that record.
- Shop orders are requests for creators to confirm. Sumthin does not process merchandise payments.
- With no Supabase environment configured, the app displays a clearly marked preview; account and write actions remain unavailable.
