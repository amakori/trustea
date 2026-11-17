# Instapay: Real-World Mobile Money Credit & Automation System

Instapay bridges microfinance lending directly into on-location, real-world commerce using Airtel Money Zambia (`*115#`).

Borrowers can borrow cash from an MFI partner on location anywhere mobile money is accepted—either to pay a merchant directly (**"Send Money"**) or to withdraw physical cash from an Airtel Money booth (**"Get Cash"**).

---

## 1. System Components

The ecosystem consists of four interconnected applications:

```
┌────────────────────────────────────────────────────────┐
│               Instapay Customer App                    │
│   (Borrower mobile PWA: "Send Money" / "Get Cash")     │
└──────────────────────────┬─────────────────────────────┘
                           │ 1. Loan Application &
                           │ 4. Recipient Confirmation
                           ▼
┌────────────────────────────────────────────────────────┐
│             Instapay Realtime Hub                      │
│   (WebSocket / Socket.IO Coordinator + MFI Backend)    │
│   - Credit Decision Engine & Safeguards                │
│   - Low-latency USSD confirmation relay (<1s)          │
│   - Airtel SMS Carrier Parser & Ledger Matcher         │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
              │ 2. Dispatches Approved     │ Syncs Live Stats,
              │    USSD Trigger            │ Settings & Audits
              ▼                            ▼
┌───────────────────────────┐  ┌─────────────────────────┐
│   Instapay Android App    │  │       MFI Software       │
│ (Airtel Dispensing Phone) │  │  (Lender Management UI) │
│ - Accessibility Service   │  │ - Credit Safeguards     │
│ - *115# Automated Dialer  │  │ - USSD Live Stepper     │
│ - Prompt Interceptor      │  │ - Killswitch Control    │
│ - 4-digit PIN Auto-entry  │  │ - SMS Ingestion Feed    │
│ - SMS Monitoring Service  │  │ - Transaction History   │
└───────────────────────────┘  └─────────────────────────┘
```

---

## 2. USSD Automation Flows (Airtel Money Zambia)

### Flow A: "Send Money" (Paying a Merchant / Seller)

1. **Borrower initiates**: Enters amount (e.g. ZMW 150) and recipient's Airtel phone number (e.g. `0977123456`) in the Customer App.
2. **MFI Safeguards Check**: The credit engine evaluates limits, statutory caps, and the Android phone's live SIM balance.
3. **Dispatch to Phone**: Realtime Hub instructs the Instapay Android App.
4. **Android Accessibility Execution**:
   - Dials `*115#`
   - Inputs `1` -> Clicks **SEND** (Send Money)
   - Inputs `1` -> Clicks **SEND** (Airtel Money)
   - Inputs `1` -> Clicks **SEND**
   - Inputs **Recipient Phone Number** -> Clicks **SEND**
   - Inputs **Amount** -> Clicks **SEND**
5. **Prompt Interception & Realtime Relay**:
   - The USSD dialog returns:
     ```
     SEND Money to [FIRSTNAME] [LASTNAME] on [PHONE]. Amount ZMW [AMOUNT].
     ```
   - The Android Accessibility Service intercepts this dialog via Regex:
     `SEND Money to\s+([A-Za-z\s]+?)\s+on\s+([0-9+]+)\.?\s*Amount\s*ZMW\s*([0-9.,]+)`
   - The phone **pauses execution** and transmits the recipient's verified name and amount to the Realtime Hub.
6. **Customer Verification**:
   - The borrower's phone displays an interactive confirmation modal with a **20-second countdown ring**.
   - Borrower confirms: *"Yes, the seller is indeed [FIRSTNAME] [LASTNAME]"*.
7. **Action Dispatch**:
   - **If Borrower Cancels** (or 20s expires): Android app clicks **CANCEL** on the dialog and releases the phone.
   - **If Borrower Confirms**: Android app injects the stored **4-digit authorization PIN** and clicks **SEND**.
8. **Carrier SMS Verification**:
   - AirtelMoney delivers an incoming confirmation SMS:
     `Trans. ID: TXN49201948. You have sent ZMW 150.00 to CHANDA MULENGA 0977123456 on 28/10/2026. Fee: ZMW 3.50. New balance: ZMW 8300.00.`
   - Android `InstapaySmsReceiver` intercepts the SMS, forwards it to the backend, updates the MFI dashboard, and provides the borrower with a digital receipt.

---

### Flow B: "Get Cash" (Withdrawing Cash at an Airtel Agent Booth)

1. **Borrower initiates**: Enters amount (e.g. ZMW 500) and the booth's **Agent Number** (e.g. `492109`).
2. **MFI Safeguards Check**: Verifies borrower credit limit and that phone balance >= amount + buffer.
3. **Android Accessibility Execution**:
   - Dials `*115#`
   - Inputs `2` -> Clicks **SEND** (Withdraw Cash)
   - Inputs `1` -> Clicks **SEND** (From Agent)
   - Inputs **Amount** -> Clicks **SEND**
4. **Prompt Interception**:
   - Dialog displays:
     ```
     WITHDRAW ZMW [AMOUNT] from [ENTERED_NUMBER] [FIRSTNAME] [LASTNAME] transaction fee ZMW [TRANSACTION_AMOUNT]
     ```
   - Android regex extracts: Amount, Agent Number, Agent Name, and Transaction Fee.
   - Realtime modal pops up on Customer App.
5. **Borrower Confirms**:
   - Borrower verifies booth agent name and fee.
   - On Confirm -> Android phone inputs stored 4-digit withdraw PIN -> Clicks **SEND**.
6. **Cash Collection**:
   - Borrower receives instant confirmation to collect physical cash from the agent.

---

## 3. MFI Credit Decision Engine & Safeguard Controls

Before the live dispensing phone is commanded, five safeguards must pass:

1. **Emergency Freeze Kill Switch**: Master toggle allowing MFI risk officers to instantly freeze all mobile money dispensing if an anomaly is detected.
2. **Single Loan Limits**: Enforces minimum (e.g. ZMW 10) and maximum single loan size (e.g. ZMW 3,500).
3. **Government Statutory Caps**: Enforces statutory lending ceilings (e.g. ZMW 10,000) and interest caps (15%).
4. **Borrower Creditworthiness & Daily Cap**: Validates that `current_debt + requested_amount <= borrower_credit_limit` and `daily_borrowed + requested_amount <= daily_borrower_cap`.
5. **Dispensing Phone Wallet Liquidity Buffer**: Ensures the Airtel SIM card has enough liquid funds:
   $$\text{Wallet Balance} \ge \text{Loan Amount} + \text{MFI Reserve Buffer (e.g. ZMW 50)}$$

---

## 4. Running the Applications

### A. Realtime Hub & Coordinator
```powershell
cd C:\Users\Amakori\trustea\instapay-realtime-hub
npm start
# Server listens on port 3001
```

### B. MFI Software (Lender Management Portal)
```powershell
cd C:\Users\Amakori\trustea\mfi-software
npm run dev
# Portal accessible at http://localhost:3002
```

### C. Instapay Customer App (Borrower Web/PWA)
```powershell
cd C:\Users\Amakori\trustea\instapay-customer-app
npm run dev
# Customer App accessible at http://localhost:3003
```

### D. Shipping Pickup Mobile Web App (Rider / Courier Portal)
```powershell
cd C:\Users\Amakori\trustea\shipping-pickup-app
npm run dev
# Rider Web App accessible at http://localhost:3004
```

### E. Collateral Pickup Mobile Web App (Appraisal & Onboarding Agent)
```powershell
cd C:\Users\Amakori\trustea\collateral-pickup-app
npm run dev
# Collateral Agent App accessible at http://localhost:3005
```

### F. Instapay Android App
Open `C:\Users\Amakori\trustea\instapay-android` in Android Studio or build with `./gradlew assembleDebug`.
- Enable the **Instapay USSD Automation Service** in Android Accessibility Settings.
- Grant `CALL_PHONE` and `RECEIVE_SMS` permissions.
- Configure the 4-digit Airtel Money PIN.
- Built-in **USSD Simulator** enables full interactive testing directly on the phone or emulator.

---

## 5. Shipping Pickup Mobile Web App (`shipping-pickup-app`, Port 3004)

Rider-first mobile web application designed for on-the-road couriers and delivery riders in Lusaka.

### Key Capabilities:
1. **Pre-filled Data Ingestion**:
   - **Backend Route Mode (Gov Food Delivery)**: Tailored for government workers ordering meals between **UTH (University Teaching Hospital, Nationalist Rd)** and **Civic Center (Independence Ave)** in Lusaka. Automatically pre-populates dispatch kitchen unit, recipient directorate/floor, delivery fee (ZMW 30), and transit instructions ("Keep warm, fragile container").
   - **Trustea Escrow Mode (P2P)**: Pre-fills order details generated by mutual agreement between buyer and seller from the Trustea marketplace or manual entry.
2. **Inspection & Proof of Pickup**:
   - **Item Confirmation Photos**: Multi-photo capture with camera file picker and one-click synthetic photo generator for local browser simulation.
   - **Sender Digital Signature Pad**: Touch/mouse HTML5 canvas capture for sender verification prior to handover into transit custody.
3. **Transit Manifest**: Generates verifiable digital pickup manifest and broadcasts order status `PICKED_UP_IN_TRANSIT` to the Realtime Hub and MFI Dashboard via Socket.IO.

---

## 6. Collateral Pickup Mobile Web App (`collateral-pickup-app`, Port 3005)

Onboarding and physical collateral custody app designed for mobile loan appraisal agents and couriers.

### Key Capabilities:
1. **Dynamic Valuation Questionnaire**:
   - Categorized appraisal trees: **Smartphones**, **Laptops**, **Solar/Power Inverters**, **Home Appliances**, **Motorbikes**.
   - Physical condition assessment (Grade A+ Pristine to Grade C Heavy Wear), operational power/screen test, and verification of zero activation locks (clean iCloud, clean Google FRP, verified clean IMEI/Serial).
   - Instant accessory value boosts (+ZMW 200–500 for original charger, box, proof of purchase receipt).
2. **High-Adoption Borrower Valuation Model with MFI Headroom**:
   - In Zambia, predatory pawnshops only offer 30%–40% LTV. To drive high adoption, the engine provides an aggressive **70%–75% Loan-To-Value (LTV)** on fair market value (FMV).
   - Simultaneously calculates and enforces safe liquidation headroom (25%–30%) ensuring the MFI can liquidate the pledged collateral at auction without capital loss in the event of borrower default.
3. **Instant InstaPay Account Creation & SMS Deep-Link**:
   - Physical custody pickup acts as the instant credit unlock:
     - Inspection photos collected (Screen On, Housing/Sides, Serial Number/IMEI).
     - Borrower signs digital custody transfer agreement on canvas.
     - On completion, backend immediately creates or updates the borrower's record in MFI Software with the approved `credit_limit`.
     - An automated SMS notification is dispatched to the borrower's phone containing a direct link to transacting in InstaPay:
       ```
       Trustea InstaPay: Your collateral [ITEM_TITLE] is verified! Instant credit line of ZMW [APPROVED_LIMIT] is now ACTIVE. Tap to Send Money or Get Cash immediately: http://localhost:3003?phone=[PHONE]&activated=collateral
       ```

---

## 7. MFI Software Pickups & Vault Dashboard Integration

The MFI Software (`mfi-software`, Port 3002) is upgraded with two real-time monitoring sections:
1. **Shipping Pickups Queue**: Real-time overview of active food delivery and escrow shipping orders, live transit status, sender signatures, and photo inspection records.
2. **Collateral Vault & InstaPay Activations**: Full inventory of pledged collateral assets, calculated FMV, approved credit limits, safe liquidation headroom buffers, borrower signatures, and instant InstaPay activation status.

---

## 8. Trustea Fulfilment

The customer app's `/fulfilment` page lets the buyer invite a seller using SMS. Each party receives a separate, unguessable private link. The seller supplies the item description, declared value, photos and pickup location; the buyer confirms the final destination and consents to an MFI salary-deduction review. Insurance is provisionally calculated at 2% of the declared value and can be changed through `FULFILMENT_INSURANCE_RATE_PCT`.

Fleetbase is the sole delivery provider for launch and handles each fulfilment from seller pickup to buyer dropoff regardless of distance. After the MFI approves the salary-deduction request, the hub creates a Fleetbase order with the seller pickup and buyer destination as the pickup/dropoff. The hub does not select a local or intercity route and does not create Shipday jobs. Authenticated Fleetbase webhooks mirror Fleetbase order and delivery status updates into the customer tracking view. The buyer confirms final receipt to start the 24-hour return window. A return request pauses settlement for MFI review. After the window, an MFI operator confirms the seller payout (or a configured payout provider returns a reference) before the salary-deduction loan is marked as originated.

### Configuration

1. Apply `supabase/migrations/20261030_trustea_fulfilment.sql`, then `supabase/migrations/20261103_fleetbase_fulfilment.sql`.
2. Populate `public.fulfilment_locations` with active saved locations and coordinates for users who cannot share device location.
3. Configure the hub using `instapay-realtime-hub/.env.example`. `SUPABASE_SERVICE_ROLE_KEY` and a private `FULFILMENT_TOKEN_ENCRYPTION_KEY` are required; never expose either to a browser.
4. Configure Fleetbase in Fly secrets: `FLEETBASE_API_KEY` (server-side only) and, if needed, `FLEETBASE_ORDERS_URL` (defaults to `https://api.fleetbase.io/v1/orders`). Generate the Fleetbase API key from **Developers → API Keys**. Never put this key in a browser app. Validate that the configured Fleetbase instance accepts the order request schema before enabling MFI approvals.
5. In Fleetbase, configure the Trustea order workflow to handle the supplied seller pickup and buyer dropoff directly for all distances. Do not configure Shipday jobs or a distance-based branch for launch. Ensure Fleetbase order status reflects pickup, transit, delivery, and exceptions.
6. Register `https://<hub-host>/api/fulfilment/fleetbase/webhook?token=<FLEETBASE_WEBHOOK_TOKEN>` in **Developers → Webhooks** and subscribe to order lifecycle and delivery status changes. Use a long random `FLEETBASE_WEBHOOK_TOKEN`; Fleetbase sends the documented `event` and `data` JSON webhook envelope using POST. An authenticated GET to the callback URL is only an endpoint check and does not process a delivery event. The callback is idempotent and ignores older event timestamps. Shipday is excluded from the launch flow.
7. Set `FULFILMENT_APP_URL` to the customer app's public origin. Set `FULFILMENT_SELLER_PAYOUT_URL` only when a payout service is available; otherwise the MFI operator must enter the confirmed payout reference at settlement.
8. Configure `VITE_HUB_URL` in the customer and MFI apps. MFI loan review requires an authenticated user with the trusted `app_metadata.role = mfi_operator` claim.

### Sumthin creator shop delivery

Sumthin shop purchases use the same Fleetbase API key and Fleetbase webhook endpoint. Apply `supabase/migrations/20261108_sumthin_shop_fulfilment.sql`. Creators save a private pickup contact/address/location; buyers provide the delivery contact/address/location at checkout. Buyer delivery details are stored in `creator_order_deliveries`, separate from `creator_orders`, and RLS permits access only to the buyer and MFI operators; service workflows use the server-side service role. When MFI approves, the hub sends a Fleetbase order with the creator pickup and buyer dropoff directly, regardless of distance. Fleetbase handles the complete delivery; no distance classification, Shipday job, or Shipday webhook is used for launch. Preserve `metadata.sumthin_creator_order_id` in Fleetbase webhook events. The Fleetbase webhook updates the creator order's delivery state and Fleetbase tracking URL. MFI staff can record creator payout after Fleetbase reports delivery; an undelivered shop payment cannot be settled.

SMS notifications are queued in `public.send_sms` with `phone`, `recipient`, `message`, `processed`, `status`, `sms_type`, and transaction metadata. Item photos are stored in the private `fulfilment-photos` bucket and served with short-lived signed URLs.
