# Trustea

A mobile-first creator community app with public creator pages, supporter-only posts, creator merchandise, and recurring salary-deduction requests reviewed in the MFI portal.

Creator profiles show their active shop products. Creators can share their profile from the public profile or Creator Studio; each product can also be shared with a profile-nested purchase link. Sharing uses the device's native share sheet when available and otherwise copies the link for posting in social media or comments.

## Local setup

1. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable/anon key. Set `VITE_HUB_URL` to the realtime hub URL for BuySafe transactions.
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

For a hosted Supabase project, allow the deployed Trustea origin in **Authentication → URL Configuration → Redirect URLs**. The local Supabase config already allows `http://localhost:3004` and `http://127.0.0.1:3004`.

## Cloudflare R2 media

Creator avatars, post images, product images, and salary payslips upload through the `worker/` Cloudflare Worker and are stored in the private `sumthin-media` R2 bucket. Image pickers support selecting a file or taking a photo on camera-enabled devices. Supporter-only post images and payslips remain private; the Worker verifies support access or MFI operator status before delivery.

This applies to new uploads. Existing Supabase payslips and previously saved external image URLs are not bulk-copied by deployment; legacy payslips remain readable through the MFI portal.

1. Create the R2 bucket and deploy the Worker:

   ```powershell
   cd C:\Users\Amakori\trustea\sumthin-app\worker
   npm install
   npx wrangler r2 bucket create sumthin-media
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_ANON_KEY
   npx wrangler secret put MEDIA_SIGNING_SECRET
   npx wrangler deploy
   ```

   Use the same Supabase project as Trustea. Generate a long random value for `MEDIA_SIGNING_SECRET`. Add the production Trustea and MFI app origins to `ALLOWED_ORIGINS` in `worker/wrangler.toml` before deploying.
2. Set `VITE_MEDIA_API_URL` to the deployed Worker URL in Trustea's `.env.local` and in `mfi-software/.env.local`, then restart/rebuild each app.
3. Keep the R2 bucket private; the Worker provides public delivery for public creator images and authenticated, temporary delivery for protected images/documents.

## MFI operator access

Supporter requests are created through the `request_creator_support` database function. It requires a signed-in user, explicit consent, an active MFI borrower, and an active creator tier. A request remains `pending_mfi`; it does not initiate a deduction or a loan.

MFI staff sign in through **Creator Deductions** in the MFI portal. Assign the trusted `app_metadata.role = mfi_operator` claim to each authorized account using a server-side Supabase Auth admin workflow. Never put this claim in user-editable metadata. Row-level security and a database trigger restrict mandate review to authorized MFI operators, and each approved/rejected request records its reviewer and review time.

Approval records authorization, but does not activate membership. After verifying the borrower's identity, consent, applicable affordability/credit limits, and setting up the deduction in the existing MFI payroll workflow, an MFI operator marks the mandate active. Only then can the supporter read gated posts. Trustea records payment authorizations and reserves facility limits; it does not transfer funds, originate loans, or execute payroll deductions.

One-time donations, creator subscriptions, and shop purchases are recorded as salary payment authorizations after the customer confirms with their payment PIN. They appear in **Sumthin Payments** in the MFI portal, separate from salary applications and recurring creator-deduction requests. Authorizations reserve the customer's facility limit but do not transfer funds. An MFI operator records settlement only after completing the transfer, or voids an unsuccessful authorization.

Physical shop purchases also collect the buyer's delivery contact and address/location. Buyer delivery details are stored separately from creator orders and are accessible only to the buyer and MFI/service workflows, not creators. Creators configure a private pickup contact and location in Creator Studio. Apply `supabase/migrations/20261108_sumthin_shop_fulfilment.sql` and `supabase/migrations/20261110_sumthin_shop_returns.sql`; MFI operators then review **Shop Fulfilment** and approve eligible orders. The hub sends the creator pickup and buyer dropoff to Fleetbase for complete delivery at every distance. Shipday and distance-based routing are excluded from launch. Configure Fleetbase to fulfil the supplied pickup/dropoff and send lifecycle webhooks to the existing Fleetbase webhook URL. Webhooks update the Trustea **Orders** tab; MFI staff record creator payout only after Fleetbase confirms delivery.

Buyers can request a return within 24 hours after Fleetbase confirms delivery. Trustea records the reason and sends the request to MFI for review in **Shop Fulfilment**. MFI can approve or decline the request and leave a note for the buyer. This decision records the review only; it does not automatically refund, reverse a payout, or arrange a return shipment. Configure `VITE_HUB_URL` in the MFI app and `FLEETBASE_API_KEY` on `instapay-realtime-hub`; never expose the Fleetbase key in a browser.

## BuySafe transactions

The **BuySafe** tab in Trustea contains the private transaction flow: a buyer invites a seller by SMS; the seller submits item details, photos, declared value, and pickup location; the buyer chooses delivery and consents to the salary-deduction request; MFI reviews the request; and the participants follow Fleetbase delivery, buyer receipt confirmation, the 24-hour return window, and final settlement status. The tab's internal inbox loads buyer and seller requests across devices from Supabase. Since Supabase Phone MFA enrollment is disabled for this project, BuySafe uses its own SMS phone verification through the hub's existing SMS queue. A phone number must be verified before an account can start a transaction or link a request; the verified number is then fixed to that Trustea account. This account-level verification persists across navigation, devices, and sign-ins. Authenticated requests are authorized against the saved verified-phone record, so SMS verification is only needed during initial setup. Existing browser-only links are imported after phone verification and a participant phone match. Participant tokens remain encrypted by the hub and are returned only to the signed-in, phone-verified account.

Configure the existing SMS queue/provider and `FULFILMENT_TOKEN_ENCRYPTION_KEY` on the hub. Apply `supabase/migrations/20261111_buysafe_mfa_inbox.sql` along with the other migrations. Set Trustea's `VITE_HUB_URL` to the deployed realtime hub URL. Set the hub's non-secret `SUMTHIN_APP_URL` to the deployed Trustea origin so seller invitation and transaction-status SMS links open the Trustea BuySafe tab. The hub needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for this flow, plus the existing Fleetbase credentials and webhook configuration. Keep server secrets out of Trustea.

Anyone holding an unclaimed participant link can open that participant's transaction. Keep SMS links private; linking a request to a Trustea account additionally requires a fresh code sent to the transaction's participant phone.

## Data access

- Supabase Auth handles account registration and sign-in.
- RLS protects creator profiles, private posts, memberships, and order requests.
- Only public posts or supporter-only posts covered by an MFI-approved active membership are readable.
- A creator cannot read a supporter's borrower phone or financial mandate; only the supporter and authorized MFI operators can read that record.
- Shop order addresses and creator pickup details are only shared with authorized MFI operators and the Fleetbase fulfilment integration after MFI approval.
- With no Supabase environment configured, the app displays a clearly marked preview; account and write actions remain unavailable.
