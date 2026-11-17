import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import './trustea.css';

type LocationChoice =
  | { source: 'saved'; location_id: string }
  | { source: 'device'; latitude: number; longitude: number }
  | null;

type FulfilmentLocation = {
  id: string;
  label: string;
  address: string;
};

type TrusteaRecord = {
  id: string;
  role: 'buyer' | 'seller';
  status: string;
  buyer_name?: string;
  seller_name?: string | null;
  item_description?: string | null;
  item_value?: number | null;
  insurance_rate_pct: number;
  insurance_amount?: number | null;
  salary_deduction_amount?: number | null;
  origin?: { label: string; address: string; latitude: number; longitude: number };
  destination?: { label: string; address: string; latitude: number; longitude: number };
  fleetbase_location?: { name: string; address: string; latitude: number; longitude: number } | null;
  fleetbase_order_id?: string | null;
  fleetbase_status?: string | null;
  fleetbase_tracking_url?: string | null;
  photos: string[];
  events: Array<{ id: number; event_type: string; description: string; created_at: string }>;
  driver_location?: { latitude: number; longitude: number; updated_at: string } | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  parcel_received_at?: string | null;
  return_window_ends_at?: string | null;
  seller_paid_at?: string | null;
};

type SavedTrusteaLink = { id: string; token: string; role?: 'buyer' | 'seller' };

const HUB_URL = (import.meta.env.VITE_HUB_URL || 'http://localhost:3001').replace(/\/+$/, '');
const TRUSTEA_INBOX_KEY = 'sumthin_trustea_private_links';
const stages = ['Seller details', 'Buyer checkout', 'MFI review', 'Fleetbase delivery', 'Receipt', 'Return window', 'Settlement'];

type TrusteaPhoneFactor = { phone_id: string; phone: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${HUB_URL}/api/fulfilment${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `BuySafe request failed (${response.status}).`);
  return result as T;
}

function fetchTransaction(id: string, token: string) {
  return request<TrusteaRecord>(`/transactions/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
}

function money(value: number) {
  return `ZMW ${Number(value).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    seller_response_pending: 'Waiting for seller',
    buyer_checkout_pending: 'Buyer confirmation needed',
    mfi_review: 'MFI review',
    delivery_pending: 'Fleetbase preparing delivery',
    in_transit: 'In transit',
    at_fleetbase_location: 'At Fleetbase location',
    fleetbase_aggregation: 'Fleetbase aggregation',
    fleetbase_middle_mile: 'Fleetbase middle mile',
    final_delivery: 'Final delivery',
    delivered: 'Delivered',
    return_window: 'Return window open',
    return_requested: 'Return under review',
    settlement_due: 'Settlement in progress',
    completed: 'Transaction complete',
    returned: 'Return accepted',
    cancelled: 'Transaction cancelled',
    delivery_exception: 'Delivery needs attention',
  };
  return labels[status] || status.replace(/_/g, ' ');
}

function progressIndex(status: string) {
  if (status === 'seller_response_pending') return 0;
  if (status === 'buyer_checkout_pending') return 1;
  if (status === 'mfi_review') return 2;
  if (['delivery_pending', 'in_transit', 'at_fleetbase_location', 'fleetbase_aggregation', 'fleetbase_middle_mile', 'final_delivery'].includes(status)) return 3;
  if (status === 'delivered') return 4;
  if (status === 'return_window' || status === 'return_requested') return 5;
  return 6;
}

function LocationChooser({
  title,
  locations,
  value,
  onChange,
}: {
  title: string;
  locations: FulfilmentLocation[];
  value: LocationChoice;
  onChange: (choice: LocationChoice) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const locate = () => {
    if (!navigator.geolocation) {
      setError('Location is unavailable. Select a saved location instead.');
      return;
    }
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ source: 'device', latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Could not access your location. Check browser permissions or select a saved location.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  return <div className="trustea-location">
    <label>{title}</label>
    <button type="button" className={`trustea-location-choice ${value?.source === 'device' ? 'selected' : ''}`} onClick={locate} disabled={locating}>
      <MapPin size={17} /> {locating ? 'Finding location…' : 'Use this device’s location'}
    </button>
    {value?.source === 'device' && <p className="trustea-muted">Selected coordinates: {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</p>}
    <select
      value={value?.source === 'saved' ? value.location_id : ''}
      onChange={(event) => onChange(event.target.value ? { source: 'saved', location_id: event.target.value } : null)}
    >
      <option value="">Or select a saved location</option>
      {locations.map((location) => <option key={location.id} value={location.id}>{location.label} — {location.address}</option>)}
    </select>
    {locations.length === 0 && <p className="trustea-muted">No saved locations are configured. Use device location.</p>}
    {error && <p className="trustea-error-text">{error}</p>}
  </div>;
}

export default function TrusteaPage({ user, onLogin }: { user: User | null; onLogin: () => boolean }) {
  const query = new URLSearchParams(window.location.search);
  const [transactionId, setTransactionId] = useState(query.get('transaction') || '');
  const [token, setToken] = useState(query.get('token') || '');
  const [transaction, setTransaction] = useState<TrusteaRecord | null>(null);
  const [savedLinks, setSavedLinks] = useState<SavedTrusteaLink[]>([]);
  const [inboxTransactions, setInboxTransactions] = useState<Record<string, TrusteaRecord | null>>({});
  const [inboxReady, setInboxReady] = useState(false);
  const [phoneFactorId, setPhoneFactorId] = useState('');
  const [phoneFactorPhone, setPhoneFactorPhone] = useState('');
  const [phoneEntry, setPhoneEntry] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneChallengeId, setPhoneChallengeId] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityWorking, setSecurityWorking] = useState(false);
  const [locations, setLocations] = useState<FulfilmentLocation[]>([]);
  const [insuranceRate, setInsuranceRate] = useState(2);
  const [loading, setLoading] = useState(Boolean(query.get('transaction') && query.get('token')));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [description, setDescription] = useState('');
  const [itemValue, setItemValue] = useState('');
  const [origin, setOrigin] = useState<LocationChoice>(null);
  const [destination, setDestination] = useState<LocationChoice>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [salaryConsent, setSalaryConsent] = useState(false);
  const [resumeLink, setResumeLink] = useState('');

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('Sign in again to continue.');
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!transactionId || !token) return;
    setTransaction(await fetchTransaction(transactionId, token));
  }, [transactionId, token]);

  useEffect(() => {
    let active = true;
    setPhoneVerified(false);
    setPhoneFactorId('');
    setPhoneFactorPhone('');
    setPhoneEntry('');
    setPhoneChallengeId('');
    setPhoneCode('');
    setSavedLinks([]);
    setInboxTransactions({});
    setInboxReady(false);
    if (!user || !supabase) {
      setSecurityLoading(false);
      return () => { active = false; };
    }

    setSecurityLoading(true);
    const loadPhoneFactor = async () => {
      const factor = await request<TrusteaPhoneFactor | null>('/phone-factor', {
        headers: await authHeaders(),
      });
      if (active && factor) {
        setPhoneFactorId(factor.phone_id);
        setPhoneFactorPhone(factor.phone);
        setPhoneEntry(factor.phone);
        setPhoneVerified(true);
      } else if (active) {
        setPhoneEntry(user.phone || '');
      }
    };
    void loadPhoneFactor().catch((cause: Error) => {
      if (active) setError(`Could not check your BuySafe phone verification: ${cause.message}`);
    }).finally(() => {
      if (active) setSecurityLoading(false);
    });
    return () => { active = false; };
  }, [authHeaders, user?.id]);

  useEffect(() => {
    if (!phoneVerified || !phoneFactorId || !user || !supabase) {
      setSavedLinks([]);
      setInboxReady(false);
      return;
    }
    let active = true;
    const loadAccountInbox = async () => {
      const headers = await authHeaders();

      const legacyLinks: SavedTrusteaLink[] = [];
      try {
        const saved = JSON.parse(localStorage.getItem(TRUSTEA_INBOX_KEY) || '[]') as SavedTrusteaLink[];
        if (!Array.isArray(saved) || saved.some((link) =>
          !link || typeof link.id !== 'string' || typeof link.token !== 'string')) {
          throw new Error('Saved BuySafe links are invalid.');
        }
        legacyLinks.push(...saved);
      } catch (cause) {
        setError(cause instanceof Error ? `Could not import old BuySafe links: ${cause.message}` : 'Could not import old BuySafe links.');
      }
      const currentId = query.get('transaction');
      const currentToken = query.get('token');
      if (currentId && currentToken) legacyLinks.push({ id: currentId, token: currentToken });
      const uniqueLinks = legacyLinks.filter((link, index, all) =>
        all.findIndex((candidate) => candidate.id === link.id && candidate.token === link.token) === index);
      const failedLinks: SavedTrusteaLink[] = uniqueLinks.slice(100);
      for (const link of uniqueLinks.slice(0, 100)) {
        try {
          await request(`/transactions/${encodeURIComponent(link.id)}/link`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ token: link.token }),
          });
        } catch {
          failedLinks.push(link);
        }
      }
      if (uniqueLinks.length > 0) {
        if (failedLinks.length) {
          localStorage.setItem(TRUSTEA_INBOX_KEY, JSON.stringify(failedLinks));
          setError(`${failedLinks.length} old BuySafe link${failedLinks.length === 1 ? '' : 's'} could not be linked to this phone. They remain saved in this browser.`);
        } else {
          localStorage.removeItem(TRUSTEA_INBOX_KEY);
        }
      }

      const links = await request<SavedTrusteaLink[]>('/transactions/inbox', {
        headers,
      });
      if (active) {
        setSavedLinks(links);
        setInboxReady(true);
      }
    };
    void loadAccountInbox().catch((cause: Error) => {
      if (active) setError(`Could not load your saved BuySafe requests: ${cause.message}`);
    });
    return () => { active = false; };
  }, [authHeaders, phoneVerified, phoneFactorId, user?.id]);

  useEffect(() => {
    if (!inboxReady || savedLinks.length === 0) return;
    let active = true;
    const loadInbox = async () => {
      const results = await Promise.all(savedLinks.map(async (link) => {
        try {
          return [link.id, await fetchTransaction(link.id, link.token)] as const;
        } catch {
          return [link.id, null] as const;
        }
      }));
      if (active) setInboxTransactions(Object.fromEntries(results));
    };
    void loadInbox();
    const timer = window.setInterval(() => { void loadInbox(); }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [inboxReady, savedLinks]);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<{ insurance_rate_pct: number }>('/config'),
      request<FulfilmentLocation[]>('/locations'),
    ]).then(([config, savedLocations]) => {
      if (!active) return;
      setInsuranceRate(config.insurance_rate_pct);
      setLocations(savedLocations);
    }).catch((cause: Error) => {
      if (active) setError(cause.message);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!transactionId || !token) {
      setTransaction(null);
      setLoading(false);
      return;
    }
    let active = true;
    const load = () => fetchTransaction(transactionId, token)
      .then((record) => { if (active) { setTransaction(record); setError(''); } })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    setLoading(true);
    void load();
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [transactionId, token]);

  const updateLink = (id: string, accessToken: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('transaction', id);
    url.searchParams.set('token', accessToken);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setWorking(true);
    setError('');
    setNotice('');
    try {
      await action();
      try {
        await refresh();
      } catch (refreshError) {
        setError(refreshError instanceof Error ? `Action saved, but the latest status could not be loaded: ${refreshError.message}` : 'Action saved, but the latest status could not be loaded.');
      }
      setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
    } finally {
      setWorking(false);
    }
  };

  const sendPhoneCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!supabase || !user) {
      onLogin();
      return;
    }
    setSecurityWorking(true);
    setError('');
    setNotice('');
    try {
      const phone = (phoneFactorId ? phoneFactorPhone : phoneEntry).trim().replace(/[ ()-]/g, '');
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        throw new Error('Enter your phone in international format, for example +260XXXXXXXXX.');
      }
      const challenge = await request<{ challenge_id: string; phone: string }>('/phone-factor/challenge', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ phone }),
      });
      setPhoneChallengeId(challenge.challenge_id);
      setPhoneFactorPhone(challenge.phone);
      setPhoneEntry(challenge.phone);
      setNotice(`A verification code was sent to ${challenge.phone}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the BuySafe verification code.');
    } finally {
      setSecurityWorking(false);
    }
  };

  const verifyPhoneCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !phoneChallengeId) return;
    setSecurityWorking(true);
    setError('');
    setNotice('');
    try {
      const code = phoneCode.trim();
      if (!code) throw new Error('Enter the verification code sent to your phone.');
      const verified = await request<TrusteaPhoneFactor>('/phone-factor/verify', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ challenge_id: phoneChallengeId, code }),
      });
      setPhoneFactorId(verified.phone_id);
      setPhoneFactorPhone(verified.phone);
      setPhoneVerified(true);
      setPhoneCode('');
      setNotice('Phone verified and saved to your Trustea account.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That verification code could not be confirmed.');
    } finally {
      setSecurityWorking(false);
    }
  };

  const beginTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !supabase || !phoneVerified) {
      setError('Sign in and verify your phone before starting a BuySafe transaction.');
      return;
    }
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const created = await request<{ transaction_id: string; buyer_url: string }>('/transactions', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          buyer_name: buyerName,
          seller_phone: sellerPhone,
        }),
      });
      const buyerToken = new URL(created.buyer_url).searchParams.get('token');
      if (!buyerToken) throw new Error('BuySafe created the transaction but returned no buyer access link.');
      setSavedLinks((previous) => [{ id: created.transaction_id, token: buyerToken }, ...previous.filter((link) => link.id !== created.transaction_id)]);
      setInboxReady(true);
      updateLink(created.transaction_id, buyerToken);
      setTransactionId(created.transaction_id);
      setToken(buyerToken);
      setTransaction(await fetchTransaction(created.transaction_id, buyerToken));
      setNotice('The transaction is saved to your BuySafe inbox, and the seller has been invited by SMS.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not invite the seller.');
    } finally {
      setWorking(false);
    }
  };

  const resumeTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const supplied = new URL(resumeLink.trim(), window.location.origin);
      const id = supplied.searchParams.get('transaction');
      const accessToken = supplied.searchParams.get('token');
      if (!id || !accessToken) throw new Error('Paste a complete private BuySafe transaction link.');
      setError('');
      setNotice('');
      updateLink(id, accessToken);
      setTransactionId(id);
      setToken(accessToken);
      if (user && supabase && phoneVerified) {
        await request(`/transactions/${encodeURIComponent(id)}/link`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ token: accessToken }),
        });
        const inbox = await request<SavedTrusteaLink[]>('/transactions/inbox', {
          headers: await authHeaders(),
        });
        setSavedLinks(inbox);
        setInboxReady(true);
        setNotice('This request is linked to your verified account and saved in your BuySafe inbox.');
      } else {
        setNotice('Request opened. Verify your account’s phone number to save it to your BuySafe inbox.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid private BuySafe link.');
    }
  };

  const submitSeller = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!origin) {
      setError('Choose a pickup location using device location or a saved location.');
      return;
    }
    await runAction(() => request(`/transactions/${encodeURIComponent(transactionId)}/seller-response?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify({ seller_name: sellerName, description, item_value: Number(itemValue), origin, photos }),
    }), 'Item details sent to the buyer.');
  };

  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!destination) {
      setError('Choose a delivery location using device location or a saved location.');
      return;
    }
    const total = Number(transaction?.item_value || 0) + Number(transaction?.insurance_amount || 0);
    await runAction(() => request(`/transactions/${encodeURIComponent(transactionId)}/checkout?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify({ destination, salary_deduction_amount: total, salary_deduction_consent: salaryConsent }),
    }), 'Your request is with the MFI for review. We’ll message you when it is approved.');
  };

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (files.length + photos.length > 4) {
      setError('Choose up to four photos.');
      input.value = '';
      return;
    }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setError('Photos must be JPG, PNG, or WebP images no larger than 2 MB each.');
      input.value = '';
      return;
    }
    try {
      const readImage = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
      });
      const selectedPhotos = await Promise.all(files.map(readImage));
      setPhotos((previous) => [...previous, ...selectedPhotos]);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load item photos.');
    }
    input.value = '';
  };

  const shareBuyerLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice('The private participant link was copied. Share it only with the intended transaction party.');
      setError('');
    } catch {
      setError('Could not copy the private link. Copy it from your browser address bar.');
    }
  };

  const total = Number(transaction?.item_value || 0) + Number(transaction?.insurance_amount || 0);
  const isNew = !transactionId || !token;
  const isSeller = transaction?.role === 'seller';
  const isDelivery = ['delivery_pending', 'in_transit', 'at_fleetbase_location', 'fleetbase_aggregation', 'fleetbase_middle_mile', 'final_delivery'].includes(transaction?.status || '');
  const showInbox = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('transaction');
    url.searchParams.delete('token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setTransactionId('');
    setToken('');
    setTransaction(null);
    setLoading(false);
    setError('');
    setNotice('');
  };
  const selectTransaction = (link: SavedTrusteaLink) => {
    setError('');
    setNotice('');
    setTransaction(null);
    setLoading(true);
    updateLink(link.id, link.token);
    setTransactionId(link.id);
    setToken(link.token);
  };
  return <div className="page-wrap trustea-page">
    <div className="page-title-block">
      <div className="eyebrow">BUYSAFE · PRIVATE TRANSACTIONS</div>
      <h1>Trade with confidence.</h1>
      <p>BuySafe coordinates item details, MFI-reviewed salary deduction, Fleetbase delivery and the return window. Your contact details stay private.</p>
    </div>
    {error && <div className="trustea-message error" role="alert">{error}</div>}
    {notice && <div className="trustea-message success" role="status"><CheckCircle2 size={17} />{notice}</div>}

    {loading && <div className="trustea-card trustea-loading"><RefreshCw size={17} />Loading your private transaction…</div>}
    {isNew && !user && <section className="trustea-card trustea-security">
      <h2>Sign in to use BuySafe</h2>
      <p className="trustea-muted">Sign in to verify your phone by SMS and keep your BuySafe requests in your account inbox.</p>
      <button className="button button-dark" type="button" onClick={onLogin}>Log in <ArrowRight size={15} /></button>
    </section>}
    {isNew && user && securityLoading && <div className="trustea-card trustea-loading"><RefreshCw size={17} />Checking your verified phone…</div>}
    {user && !securityLoading && !phoneVerified && <div className="trustea-card trustea-security">
      <h2>Verify your phone</h2>
      <p className="trustea-muted">BuySafe sends a one-time code to verify and save a phone number to your Trustea account. Your verified status stays with this account across devices and sign-ins.</p>
      {!phoneChallengeId && <form onSubmit={sendPhoneCode}>
        {!phoneFactorId
          ? <label>Phone number<input type="tel" value={phoneEntry} onChange={(event) => setPhoneEntry(event.target.value)} placeholder="+260XXXXXXXXX" autoComplete="tel" required /></label>
          : <p className="trustea-muted">Code destination: {phoneFactorPhone || 'your verified phone'}</p>}
        <button className="button button-dark" disabled={securityWorking}>{securityWorking ? 'Sending code…' : phoneFactorId ? 'Send verification code' : 'Set up phone and send code'} <ArrowRight size={15} /></button>
      </form>}
      {phoneChallengeId && <form onSubmit={verifyPhoneCode}>
        <p className="trustea-muted">Enter the code sent to {phoneFactorPhone || 'your verified phone'}.</p>
        <label>SMS verification code<input inputMode="numeric" autoComplete="one-time-code" value={phoneCode} onChange={(event) => setPhoneCode(event.target.value)} maxLength={12} required /></label>
        <div className="trustea-fields two">
          <button className="button button-dark" disabled={securityWorking}>{securityWorking ? 'Verifying…' : 'Verify phone'} <CheckCircle2 size={15} /></button>
          <button className="button button-outline" type="button" disabled={securityWorking} onClick={() => void sendPhoneCode()}>Resend code</button>
        </div>
      </form>}
    </div>}
    {user && phoneVerified && !inboxReady && <div className="trustea-card trustea-loading"><RefreshCw size={17} />Loading your secure BuySafe inbox…</div>}
    {user && phoneVerified && inboxReady && <section className="trustea-card trustea-inbox">
      <div className="trustea-inbox-heading"><div><h2>My BuySafe requests</h2><p className="trustea-muted">Your requests are saved to your Trustea account and available across devices.</p></div><span className="trustea-inbox-count">{savedLinks.length}</span></div>
      {savedLinks.length === 0 && <p className="trustea-muted">No linked BuySafe requests yet. Start a protected transaction or open a private link to add one.</p>}
      <div className="trustea-inbox-list">{savedLinks.map((link) => {
        const record = inboxTransactions[link.id];
        const current = transactionId === link.id && token === link.token;
        return <article className={`trustea-inbox-item ${current ? 'selected' : ''}`} key={link.id}>
          <button type="button" className="trustea-inbox-open" onClick={() => selectTransaction(link)}>
            <strong>{record?.item_description || `Request ${link.id.slice(0, 8).toUpperCase()}`}</strong>
            <span>{record ? `${record.role === 'buyer' ? 'Buying' : 'Selling'} · ${statusLabel(record.status)}` : Object.prototype.hasOwnProperty.call(inboxTransactions, link.id) ? 'Could not load this request; reopen its private link to retry.' : 'Checking request status…'}</span>
          </button>
        </article>;
      })}</div>
      <p className="trustea-muted trustea-inbox-note">Participant access tokens are encrypted by the Trustea service and are returned only to your signed-in account after you verify its phone number. Opening a browser link does not cancel the transaction.</p>
    </section>}
    {isNew && !loading && <div className="trustea-grid">
      {user && phoneVerified && <form className="trustea-card" onSubmit={beginTransaction}>
        <h2>Start a protected transaction</h2>
        <p className="trustea-muted">Invite the seller by SMS. They’ll enter item information and a pickup location using their private link.</p>
        <div className="trustea-fields two">
          <label>Your name<input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} maxLength={100} required /></label>
          {phoneFactorPhone && <p className="trustea-muted">Verified phone: {phoneFactorPhone}</p>}
        </div>
        <label>Seller’s mobile number<input type="tel" value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} maxLength={20} required /></label>
        <button className="button button-dark" disabled={working}>{working ? 'Creating private link…' : 'Invite seller'} <ArrowRight size={15} /></button>
        <p className="trustea-muted">The seller does not receive your phone number or delivery address.</p>
      </form>}
      <form className="trustea-card" onSubmit={resumeTransaction}>
        <h2>Open an existing transaction</h2>
        <p className="trustea-muted">Use the private link sent by BuySafe SMS. Sign in and verify your account’s phone number once to add requests to your persistent inbox.</p>
        <label>Private transaction link<input value={resumeLink} onChange={(event) => setResumeLink(event.target.value)} placeholder="Paste your BuySafe link" required /></label>
        <button className="button button-outline">Open transaction <ArrowRight size={15} /></button>
        <div className="trustea-privacy"><ShieldCheck size={18} />Anyone with the private link can access that participant’s transaction. Keep it confidential.</div>
      </form>
    </div>}

    {transaction && !loading && <div className="trustea-grid">
      <section className="trustea-main">
        <article className="trustea-card trustea-order-head">
          <div><span className="trustea-muted">Transaction reference</span><strong>{transaction.id.slice(0, 8).toUpperCase()}</strong></div>
          <span className="trustea-status">{statusLabel(transaction.status)}</span>
          {!isSeller && <button className="trustea-icon-button" type="button" onClick={() => void shareBuyerLink()} aria-label="Copy private buyer link"><Copy size={16} /></button>}
          <button className="trustea-icon-button" type="button" onClick={showInbox} aria-label="Show all BuySafe requests"><ArrowRight size={16} /></button>
        </article>

        {isSeller && transaction.status === 'seller_response_pending' && <form className="trustea-card trustea-form" onSubmit={submitSeller}>
          <h2>Add item details</h2>
          <p className="trustea-muted">The buyer will review the declared value, description and photos before confirming.</p>
          <label>Your name<input value={sellerName} onChange={(event) => setSellerName(event.target.value)} maxLength={100} required /></label>
          <label>Item description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} required /></label>
          <label>Declared item value (ZMW)<input type="number" min="0.01" max="1000000" step="0.01" value={itemValue} onChange={(event) => setItemValue(event.target.value)} required /></label>
          <div className="trustea-total-row"><span>Provisional insurance · {insuranceRate}%</span><strong>{money((Number(itemValue) || 0) * insuranceRate / 100)}</strong></div>
          <label className="trustea-upload"><Camera size={17} /> Add item photos (up to 4, 2 MB each)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void addPhotos(event)} /></label>
          {photos.length > 0 && <div className="trustea-photos">{photos.map((photo, index) => <div key={`${index}-${photo.slice(0, 16)}`}><img src={photo} alt={`Item ${index + 1}`} /><button type="button" onClick={() => setPhotos((previous) => previous.filter((_, photoIndex) => photoIndex !== index))}>Remove</button></div>)}</div>}
          <LocationChooser title="Pickup location" locations={locations} value={origin} onChange={setOrigin} />
          <button className="button button-dark" disabled={working}>{working ? 'Sending details…' : 'Send item details to buyer'} <ArrowRight size={15} /></button>
        </form>}

        {!isSeller && transaction.status === 'buyer_checkout_pending' && <form className="trustea-card trustea-form" onSubmit={submitCheckout}>
          <h2>Review and confirm</h2>
          <ItemSummary transaction={transaction} total={total} />
          <LocationChooser title="Delivery location" locations={locations} value={destination} onChange={setDestination} />
          <div className="trustea-privacy"><ShieldCheck size={18} /><span>The MFI reviews your salary-deduction request before delivery. No loan is originated until the 24-hour return window ends and seller payout is confirmed.</span></div>
          <label className="trustea-consent"><input type="checkbox" checked={salaryConsent} onChange={(event) => setSalaryConsent(event.target.checked)} /><span>I authorize the MFI to review a salary-deduction request for <strong>{money(total)}</strong>, including the item value and insurance.</span></label>
          <button className="button button-dark" disabled={working || !salaryConsent}>{working ? 'Sending to MFI…' : 'Confirm amount and request MFI review'} <ArrowRight size={15} /></button>
        </form>}

        {transaction.status === 'seller_response_pending' && !isSeller && <WaitingCard title="Waiting for seller" description="The seller has been invited by SMS. We’ll update this page when item details are ready." />}
        {transaction.status === 'buyer_checkout_pending' && isSeller && <WaitingCard title="Waiting for buyer" description="The buyer is reviewing the item and choosing the delivery location. Your contact details stay private." />}
        {transaction.status === 'mfi_review' && <WaitingCard title="MFI review in progress" description="The MFI is reviewing the salary-deduction request. After approval, Fleetbase arranges delivery directly from seller to buyer." />}
        {isDelivery && <section className="trustea-card">
          <h2><Truck size={18} /> {statusLabel(transaction.status)}</h2>
          <p className="trustea-muted">Fleetbase manages the full delivery at all distances.</p>
          <div className="trustea-tracking">
            <p><MapPin size={15} /> Pickup: {transaction.origin?.label || 'Seller location'}</p>
            {transaction.fleetbase_location && <p><MapPin size={15} /> Fleetbase: {transaction.fleetbase_location.name}</p>}
            <p><MapPin size={15} /> Destination: {transaction.destination?.label || 'Buyer location'}</p>
            {transaction.picked_up_at && <p>Picked up {new Date(transaction.picked_up_at).toLocaleString()}</p>}
            {transaction.delivered_at && <p>Delivered {new Date(transaction.delivered_at).toLocaleString()}</p>}
            {transaction.driver_location && <a href={`https://maps.google.com/?q=${transaction.driver_location.latitude},${transaction.driver_location.longitude}`} target="_blank" rel="noreferrer">View driver location <ExternalLink size={13} /></a>}
          </div>
          {transaction.fleetbase_tracking_url && <a className="button button-outline" href={transaction.fleetbase_tracking_url} target="_blank" rel="noreferrer">Track with Fleetbase <ExternalLink size={14} /></a>}
        </section>}
        {transaction.status === 'delivered' && <section className="trustea-card trustea-callout">
          <h2><CheckCircle2 size={19} /> Fleetbase delivered the parcel</h2>
          <p className="trustea-muted">Confirm receipt to start the 24-hour return window.</p>
          {!isSeller
            ? <button className="button button-dark" disabled={working} onClick={() => void runAction(() => request(`/transactions/${encodeURIComponent(transactionId)}/receipt?token=${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({}) }), 'Receipt confirmed. Your 24-hour return window has started.')}>{working ? 'Confirming…' : 'I received the parcel'}</button>
            : <p className="trustea-muted">The buyer has been asked to confirm receipt.</p>}
        </section>}
        {(transaction.status === 'return_window' || transaction.status === 'return_requested') && <section className="trustea-card trustea-callout amber">
          <h2><Clock3 size={19} /> {transaction.status === 'return_requested' ? 'Return request under MFI review' : '24-hour return window is open'}</h2>
          <p className="trustea-muted">{transaction.return_window_ends_at ? `Window ends ${new Date(transaction.return_window_ends_at).toLocaleString()}.` : 'The return window is active.'}</p>
          {!isSeller && transaction.status === 'return_window' && <button className="button button-outline" disabled={working} onClick={() => void runAction(() => request(`/transactions/${encodeURIComponent(transactionId)}/return?token=${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({}) }), 'Your return request was sent to the MFI. Settlement is paused.')}>{working ? 'Sending…' : 'Request a return'}</button>}
          {isSeller && <p className="trustea-muted">Seller settlement is paused until this window ends or MFI resolves a return request.</p>}
        </section>}
        {transaction.status === 'settlement_due' && <WaitingCard title="Final settlement pending" description="The return window ended. An MFI operator will confirm seller payout and originate the salary-deduction loan." />}
        {transaction.status === 'completed' && <WaitingCard title="Transaction complete" description={isSeller ? 'Your payout was confirmed.' : 'Seller payout and your salary-deduction loan are confirmed.'} />}
        {transaction.status === 'returned' && <WaitingCard title="Return accepted" description="The MFI accepted the return. No seller settlement or salary-deduction loan was created." />}
        {transaction.status === 'cancelled' && <WaitingCard title="Transaction cancelled" description="No delivery or salary-deduction loan was created." />}
        {transaction.status === 'delivery_exception' && <WaitingCard title="Delivery needs attention" description="Fleetbase reported a delivery issue. Settlement is paused while BuySafe follows up." />}
        <section className="trustea-card">
          <h2>Transaction activity</h2>
          {transaction.events.length ? <ol className="trustea-events">{transaction.events.map((event) => <li key={event.id}><span /><div><p>{event.description}</p><time>{new Date(event.created_at).toLocaleString()}</time></div></li>)}</ol> : <p className="trustea-muted">Activity will appear here as your transaction progresses.</p>}
        </section>
      </section>

      <aside className="trustea-aside">
        <section className="trustea-card"><h2><Package size={17} /> Item summary</h2>{transaction.item_description ? <ItemSummary transaction={transaction} total={total} /> : <p className="trustea-muted">Item details will appear when the seller responds.</p>}</section>
        <section className="trustea-card"><h2>Progress</h2><ol className="trustea-progress">{stages.map((stage, index) => {
          const current = progressIndex(transaction.status);
          const complete = index < current || transaction.status === 'completed';
          return <li key={stage} className={complete ? 'complete' : index === current ? 'current' : ''}><span>{complete ? '✓' : index + 1}</span>{stage}</li>;
        })}</ol></section>
        <section className="trustea-card trustea-share"><h2>Private transaction link</h2><p className="trustea-muted">This link grants access to the current buyer or seller view. Keep it private.</p><button className="button button-outline" onClick={() => void shareBuyerLink()}><Copy size={14} /> Copy current link</button><button className="button button-outline" onClick={showInbox}>All requests <ArrowRight size={14} /></button></section>
      </aside>
    </div>}
  </div>;
}

function ItemSummary({ transaction, total }: { transaction: TrusteaRecord; total: number }) {
  return <div className="trustea-item-summary">
    <p>{transaction.item_description}</p>
    {transaction.seller_name && <span>From {transaction.seller_name}</span>}
    {transaction.photos.length > 0 && <div className="trustea-photos">{transaction.photos.map((photo, index) => <img key={photo} src={photo} alt={`Item photo ${index + 1}`} />)}</div>}
    <div className="trustea-total-row"><span>Declared value</span><strong>{money(Number(transaction.item_value || 0))}</strong></div>
    <div className="trustea-total-row"><span>Insurance ({transaction.insurance_rate_pct}%)</span><strong>{money(Number(transaction.insurance_amount || 0))}</strong></div>
    <div className="trustea-total-row total"><span>Total salary deduction</span><strong>{money(total)}</strong></div>
  </div>;
}

function WaitingCard({ title, description }: { title: string; description: string }) {
  return <section className="trustea-card trustea-waiting"><Clock3 size={19} /><div><h2>{title}</h2><p className="trustea-muted">{description}</p></div></section>;
}
