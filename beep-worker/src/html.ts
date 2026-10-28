export interface RenderPageOptions {
  servicePhone?: string;
  initialPhone?: string;
  successMessage?: string;
  errorMessage?: string;
}

export function renderHtml(options: RenderPageOptions = {}): string {
  const { servicePhone = "0978587412", initialPhone = "", successMessage, errorMessage } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#0284c7">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Beep Service | Instant Notification</title>
  <style>
    :root {
      --primary: #0284c7;
      --primary-hover: #0369a1;
      --primary-active: #075985;
      --primary-light: #e0f2fe;
      --bg-gradient-start: #f8fafc;
      --bg-gradient-end: #f1f5f9;
      --card-bg: #ffffff;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success-bg: #ecfdf5;
      --success-border: #a7f3d0;
      --success-text: #065f46;
      --error-bg: #fef2f2;
      --error-border: #fecaca;
      --error-text: #991b1b;
      --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      --radius: 16px;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --primary: #38bdf8;
        --primary-hover: #0ea5e9;
        --primary-active: #0284c7;
        --primary-light: #082f49;
        --bg-gradient-start: #0f172a;
        --bg-gradient-end: #020617;
        --card-bg: #1e293b;
        --text-main: #f8fafc;
        --text-muted: #94a3b8;
        --border: #334155;
        --success-bg: #064e3b;
        --success-border: #047857;
        --success-text: #a7f3d0;
        --error-bg: #7f1d1d;
        --error-border: #b91c1c;
        --error-text: #fecaca;
        --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
      color: var(--text-main);
      padding: 16px;
      line-height: 1.5;
    }

    .container {
      width: 100%;
      max-width: 420px;
      background: var(--card-bg);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      border: 1px solid var(--border);
      padding: 28px 24px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .header {
      text-align: center;
      margin-bottom: 24px;
    }

    .icon-wrapper {
      width: 56px;
      height: 56px;
      margin: 0 auto 14px;
      background: var(--primary-light);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary);
      position: relative;
    }

    .icon-wrapper::after {
      content: "";
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid var(--primary);
      opacity: 0.3;
      animation: pulse 2.2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(1.25); opacity: 0; }
      100% { transform: scale(1); opacity: 0; }
    }

    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }

    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-main);
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon {
      position: absolute;
      left: 14px;
      color: var(--text-muted);
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    input[type="tel"] {
      width: 100%;
      height: 52px;
      padding: 0 42px 0 44px;
      font-size: 17px;
      font-weight: 500;
      color: var(--text-main);
      background: transparent;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      font-family: inherit;
    }

    input[type="tel"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.18);
    }

    .clear-btn {
      position: absolute;
      right: 12px;
      width: 24px;
      height: 24px;
      background: var(--border);
      border: none;
      border-radius: 50%;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1;
    }

    .clear-btn.visible {
      display: flex;
    }

    .hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
      display: flex;
      justify-content: space-between;
    }

    .btn-submit {
      width: 100%;
      height: 52px;
      border: none;
      border-radius: 12px;
      background: var(--primary);
      color: #ffffff;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
      transition: all 0.15s ease-in-out;
      user-select: none;
    }

    .btn-submit:hover:not(:disabled) {
      background: var(--primary-hover);
      box-shadow: 0 6px 16px rgba(2, 132, 199, 0.35);
      transform: translateY(-1px);
    }

    .btn-submit:active:not(:disabled) {
      background: var(--primary-active);
      transform: translateY(1px);
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.2);
    }

    .btn-submit:disabled {
      opacity: 0.65;
      cursor: not-allowed;
      transform: none;
    }

    .spinner {
      display: none;
      width: 20px;
      height: 20px;
      border: 2.5px solid rgba(255, 255, 255, 0.35);
      border-radius: 50%;
      border-top-color: #ffffff;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .alert {
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 20px;
      font-size: 14px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .alert-success {
      background: var(--success-bg);
      border: 1px solid var(--success-border);
      color: var(--success-text);
    }

    .alert-error {
      background: var(--error-bg);
      border: 1px solid var(--error-border);
      color: var(--error-text);
    }

    .alert-icon {
      flex-shrink: 0;
      margin-top: 1px;
    }

    .alert-content {
      flex: 1;
      word-break: break-word;
      white-space: pre-line;
    }

    .reset-btn {
      display: inline-block;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: underline;
      cursor: pointer;
      color: inherit;
    }

    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }

    .footer a {
      color: var(--primary);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main class="container">
    <div class="header">
      <div class="icon-wrapper" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          <path d="M14.5 2a7.5 7.5 0 0 1 7.5 7.5" opacity="0.6"/>
          <path d="M14.5 6a3.5 3.5 0 0 1 3.5 3.5" opacity="0.9"/>
        </svg>
      </div>
      <h1>Send Beep</h1>
      <p class="subtitle">Enter your phone number to trigger the Beep Service</p>
    </div>

    <!-- Alert Container -->
    <div id="alertBox" role="alert" style="${successMessage || errorMessage ? '' : 'display: none;'}" class="alert ${successMessage ? 'alert-success' : errorMessage ? 'alert-error' : ''}">
      <span class="alert-icon" id="alertIcon">
        ${successMessage ? '✓' : '⚠'}
      </span>
      <div class="alert-content">
        <div id="alertText">${successMessage || errorMessage || ''}</div>
        <span id="resetAction" class="reset-btn" onclick="resetForm()" style="${successMessage ? 'display:inline-block;' : 'display:none;'}">Send another beep</span>
      </div>
    </div>

    <!-- Mobile-First Form -->
    <form id="beepForm" method="POST" action="/submit">
      <input type="hidden" name="service_phone" id="servicePhone" value="${servicePhone}">

      <div class="form-group">
        <label for="phone">Phone Number</label>
        <div class="input-wrapper">
          <span class="input-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </span>
          <input
            type="tel"
            id="phone"
            name="phone"
            inputmode="tel"
            autocomplete="tel"
            placeholder="097 123 4567 or +260..."
            value="${initialPhone}"
            required
            autofocus
            aria-label="Phone number to beep"
          />
          <button type="button" id="clearBtn" class="clear-btn" aria-label="Clear input">&times;</button>
        </div>
        <div class="hint">
          <span>Format: 09XXXXXXXX, 07XXXXXXXX, or +260...</span>
          <span id="charCount"></span>
        </div>
      </div>

      <button type="submit" id="submitBtn" class="btn-submit">
        <div class="spinner" id="spinner" aria-hidden="true"></div>
        <span id="btnIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </span>
        <span id="btnText">Send Beep</span>
      </button>
    </form>

    <div class="footer">
      Powered by Cloudflare Workers & Supabase Edge Functions
    </div>
  </main>

  <script>
    const form = document.getElementById('beepForm');
    const phoneInput = document.getElementById('phone');
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnIcon = document.getElementById('btnIcon');
    const spinner = document.getElementById('spinner');
    const alertBox = document.getElementById('alertBox');
    const alertText = document.getElementById('alertText');
    const alertIcon = document.getElementById('alertIcon');
    const resetAction = document.getElementById('resetAction');
    const servicePhone = document.getElementById('servicePhone').value;

    function updateClearButton() {
      if (phoneInput.value.length > 0) {
        clearBtn.classList.add('visible');
      } else {
        clearBtn.classList.remove('visible');
      }
    }

    phoneInput.addEventListener('input', () => {
      updateClearButton();
      if (alertBox.classList.contains('alert-error')) {
        alertBox.style.display = 'none';
      }
    });

    clearBtn.addEventListener('click', () => {
      phoneInput.value = '';
      updateClearButton();
      phoneInput.focus();
    });

    updateClearButton();

    function showAlert(type, message, showReset = false) {
      alertBox.className = 'alert ' + (type === 'success' ? 'alert-success' : 'alert-error');
      alertIcon.textContent = type === 'success' ? '✓' : '⚠';
      alertText.textContent = message;
      resetAction.style.display = showReset ? 'inline-block' : 'none';
      alertBox.style.display = 'flex';
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function resetForm() {
      phoneInput.value = '';
      updateClearButton();
      alertBox.style.display = 'none';
      submitBtn.disabled = false;
      phoneInput.focus();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const phone = phoneInput.value.trim();
      if (!phone) {
        showAlert('error', 'Please enter a valid phone number.');
        phoneInput.focus();
        return;
      }

      // Haptic tactile feedback if available
      if ('vibrate' in navigator) {
        try { navigator.vibrate(25); } catch (_) {}
      }

      // Set Loading UI
      submitBtn.disabled = true;
      spinner.style.display = 'block';
      btnIcon.style.display = 'none';
      btnText.textContent = 'Sending Beep...';
      alertBox.style.display = 'none';

      try {
        const response = await fetch('/api/beep', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            incoming_phone: phone,
            service_phone: servicePhone
          })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showAlert('success', data.message || 'Beep successfully triggered for ' + phone + '!', true);
        } else {
          showAlert('error', data.error || data.message || 'Failed to trigger beep. Please try again.');
          submitBtn.disabled = false;
        }
      } catch (err) {
        showAlert('error', 'Network error: ' + (err.message || 'Unable to connect to server.'));
        submitBtn.disabled = false;
      } finally {
        spinner.style.display = 'none';
        btnIcon.style.display = 'inline-flex';
        btnText.textContent = 'Send Beep';
      }
    });
  </script>
</body>
</html>`;
}
