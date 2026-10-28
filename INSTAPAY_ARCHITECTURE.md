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

### D. Instapay Android App
Open `C:\Users\Amakori\trustea\instapay-android` in Android Studio or build with `./gradlew assembleDebug`.
- Enable the **Instapay USSD Automation Service** in Android Accessibility Settings.
- Grant `CALL_PHONE` and `RECEIVE_SMS` permissions.
- Configure the 4-digit Airtel Money PIN.
- Built-in **USSD Simulator** enables full interactive testing directly on the phone or emulator.
