# Beep Worker

A lightweight, mobile-first Cloudflare Worker with a single phone number input box and action button to collect a phone number and trigger the Supabase `beepService` edge function located in `supabase/functions/beepService`.

---

## ✨ Features

- **Ultra-lightweight & Zero CDN Dependencies**: Pure HTML5/CSS3/Vanilla JS embedded directly in the Worker response (< 10 KB). Fast loads even on slow 2G/3G mobile networks.
- **Mobile-First UX**:
  - Full-screen thumb-friendly interface with viewport-fit cover support.
  - Large touch targets (52px height) for easy one-handed mobile typing.
  - Phone-specific input (`inputmode="tel"`, `autocomplete="tel"`) triggering the numeric dialpad on iOS and Android.
  - Input clear button `(✕)` and tactile active-press micro-animations.
  - Modern card aesthetic with dark/light mode automatically matching system preferences.
- **Instant Interactive Feedback**:
  - Asynchronous form submission via `fetch()` without full-page reloads.
  - Visual loading state with a spinner and disabled button preventing double-submissions.
  - Success banner showing response messages from `beepService`.
  - Error banner with retry button.
- **Graceful Fallback**:
  - Supports standard HTML form `POST` if JavaScript is disabled.
- **API Endpoint**:
  - `POST /api/beep` accepts JSON `{ "incoming_phone": "...", "service_phone": "..." }` with full CORS support.

---

## 🛠️ Configuration

Configuration is managed in `wrangler.toml` or Cloudflare Secrets:

| Variable | Description | Default |
|---|---|---|
| `SUPABASE_URL` | Base URL of your Supabase project | `https://wspdjsoukzbinyvptqkv.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Anon Key | Configured in `wrangler.toml` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Optional)* Service role key if needed | None |
| `DEFAULT_SERVICE_PHONE` | Default BAQ service phone number | `0978587412` |

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Local Development
Run the local dev server using Wrangler:
```bash
npm run dev
# or: npx wrangler dev
```
Open `http://localhost:8787` on your mobile browser or emulator.

### 3. Deploy to Cloudflare
```bash
npm run deploy
# or: npx wrangler deploy
```

---

## 📡 API Usage

### Send a Beep
```bash
curl -X POST https://<your-worker-subdomain>.workers.dev/api/beep \
  -H "Content-Type: application/json" \
  -d '{
    "incoming_phone": "0971234567",
    "service_phone": "0978587412"
  }'
```

### Response
```json
{
  "success": true,
  "message": "Welcome to [organization] BAQ...",
  "data": { ... }
}
```
