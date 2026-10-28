import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Compass,
  LockKeyhole,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import {
  confirmFulfilmentReceipt,
  createFulfilmentTransaction,
  fetchFulfilmentConfig,
  fetchFulfilmentLocations,
  fetchFulfilmentTransaction,
  FulfilmentLocation,
  FulfilmentRecord,
  requestFulfilmentReturn,
  socket,
  submitFulfilmentCheckout,
  submitSellerResponse,
} from './api';

type LocationChoice =
  | { source: 'saved'; location_id: string }
  | { source: 'device'; latitude: number; longitude: number }
  | null;

const stages = [
  'Buyer invite',
  'Seller details',
  'MFI review',
  'Delivery',
  'Receipt',
  'Return window',
  'Settlement',
];

function money(value: number): string {
  return `ZMW ${value.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function stageIndex(status: string): number {
  if (status === 'seller_response_pending') return 0;
  if (status === 'buyer_checkout_pending') return 1;
  if (status === 'mfi_review') return 2;
  if (status === 'delivery_pending' || status === 'in_transit') return 3;
  if (status === 'delivered') return 4;
  if (status === 'return_window' || status === 'return_requested') return 5;
  return 6;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    seller_response_pending: 'Waiting for seller',
    buyer_checkout_pending: 'Your confirmation needed',
    mfi_review: 'MFI review',
    delivery_pending: 'Ready for collection',
    in_transit: 'On the way',
    delivered: 'Delivered',
    return_window: 'Return window open',
    return_requested: 'Return under review',
    settlement_due: 'Settlement in progress',
    completed: 'Transaction complete',
    returned: 'Return accepted',
    cancelled: 'Transaction cancelled',
    delivery_exception: 'Delivery needs attention',
  };
  return labels[status] || 'Loading transaction';
}

function LocationChooser({
  label,
  locations,
  choice,
  onChange,
}: {
  label: string;
  locations: FulfilmentLocation[];
  choice: LocationChoice;
  onChange: (choice: LocationChoice) => void;
}) {
  const [locationError, setLocationError] = useState('');
  const [locating, setLocating] = useState(false);

  const useDeviceLocation = () => {
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Location is not available on this device. Choose a saved location below.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ source: 'device', latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      () => {
        setLocationError('Could not access your location. Choose a saved location below.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-300">{label}</label>
      <button
        type="button"
        onClick={useDeviceLocation}
        disabled={locating}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
          choice?.source === 'device'
            ? 'border-emerald-500/60 bg-emerald-950/30 text-emerald-200'
            : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'
        }`}
      >
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800"><Compass size={17} /></span>
          <span>
            <span className="block font-semibold">{locating ? 'Finding your location…' : 'Use this device’s location'}</span>
            <span className="mt-0.5 block text-xs text-slate-400">Your precise address is shared only for fulfilment</span>
          </span>
        </span>
        {choice?.source === 'device' && <Check size={17} />}
      </button>
      {choice?.source === 'device' && (
        <p className="text-xs text-emerald-300">
          Location selected: {choice.latitude.toFixed(5)}, {choice.longitude.toFixed(5)}
        </p>
      )}
      <div>
        <label className="mb-1.5 block text-xs text-slate-400">Or choose a saved location</label>
        <select
          value={choice?.source === 'saved' ? choice.location_id : ''}
          onChange={(event) => onChange(event.target.value ? { source: 'saved', location_id: event.target.value } : null)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
        >
          <option value="">Select a saved location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>{location.label} — {location.address}</option>
          ))}
        </select>
      </div>
      {locations.length === 0 && (
        <p className="text-xs text-amber-300">No saved locations are available yet. Use device location or ask an administrator to preload fulfilment locations.</p>
      )}
      {locationError && <p role="alert" className="text-xs text-amber-300">{locationError}</p>}
    </div>
  );
}

export default function Fulfilment() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const [transactionId, setTransactionId] = useState(query.get('transaction') || '');
  const [token, setToken] = useState(query.get('token') || '');
  const [transaction, setTransaction] = useState<FulfilmentRecord | null>(null);
  const [locations, setLocations] = useState<FulfilmentLocation[]>([]);
  const [insuranceRate, setInsuranceRate] = useState(2);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [description, setDescription] = useState('');
  const [itemValue, setItemValue] = useState('');
  const [origin, setOrigin] = useState<LocationChoice>(null);
  const [destination, setDestination] = useState<LocationChoice>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [salaryConsent, setSalaryConsent] = useState(false);

  const refresh = useCallback(async () => {
    if (!transactionId || !token) return;
    const next = await fetchFulfilmentTransaction(transactionId, token);
    setTransaction(next);
  }, [transactionId, token]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchFulfilmentConfig(), fetchFulfilmentLocations()])
      .then(([config, savedLocations]) => {
        if (!active) return;
        setInsuranceRate(config.insurance_rate_pct);
        setLocations(savedLocations);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!transactionId || !token) return;
    let active = true;
    setLoading(true);
    const load = () => fetchFulfilmentTransaction(transactionId, token)
      .then((record) => { if (active) { setTransaction(record); setError(''); } })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    load();
    socket.emit('fulfilment:subscribe', { transaction_id: transactionId, token });
    const onUpdated = (event: { transaction_id?: string }) => {
      if (event.transaction_id === transactionId) void load();
    };
    const onSocketError = (event: { transaction_id?: string; message?: string }) => {
      if (event.transaction_id === transactionId) setError(event.message || 'Live updates are unavailable.');
    };
    socket.on('fulfilment:updated', onUpdated);
    socket.on('fulfilment:error', onSocketError);
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
      socket.off('fulfilment:updated', onUpdated);
      socket.off('fulfilment:error', onSocketError);
    };
  }, [transactionId, token]);

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    setWorking(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
    } finally {
      setWorking(false);
    }
  };

  const beginTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAction(async () => {
      const result = await createFulfilmentTransaction({
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        seller_phone: sellerPhone,
      });
      const link = new URL(result.buyer_url);
      setTransactionId(result.transaction_id);
      setToken(link.searchParams.get('token') || '');
      window.history.replaceState({}, '', `${link.pathname}${link.search}`);
    }, 'Your private transaction is ready. We’ve invited the seller by SMS.');
  };

  const submitSeller = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!origin) {
      setError('Choose a pickup location using device location or a saved location.');
      return;
    }
    await runAction(() => submitSellerResponse(transactionId, token, {
      seller_name: sellerName,
      description,
      item_value: Number(itemValue),
      origin,
      photos,
    }), 'Item details sent to the buyer.');
  };

  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!destination) {
      setError('Choose a delivery location using device location or a saved location.');
      return;
    }
    const total = Number(transaction?.item_value || 0) + Number(transaction?.insurance_amount || 0);
    await runAction(() => submitFulfilmentCheckout(transactionId, token, {
      destination,
      salary_deduction_amount: total,
      salary_deduction_consent: salaryConsent,
    }), 'Your request is with the MFI for review. We’ll message you when it is approved.');
  };

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    setError('');
    const files = Array.from(event.target.files || []);
    if (files.length + photos.length > 4) {
      setError('Choose up to four photos.');
      event.target.value = '';
      return;
    }
    if (files.some((file) => !file.type.startsWith('image/') || file.size > 2 * 1024 * 1024)) {
      setError('Photos must be images no larger than 2 MB each.');
      event.target.value = '';
      return;
    }
    try {
      const selected = await Promise.all(files.map(readImage));
      setPhotos((previous) => [...previous, ...selected]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load a photo.');
    }
    event.target.value = '';
  };

  const total = Number(transaction?.item_value || 0) + Number(transaction?.insurance_amount || 0);
  const isNew = !transactionId || !token;
  const isSeller = transaction?.role === 'seller';

  return (
    <div className="min-h-screen bg-[#07110f] text-slate-100">
      <header className="border-b border-white/10 bg-[#07110f]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <a href="/" className="flex items-center gap-3 text-white no-underline">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-400 text-slate-950"><Package size={20} /></span>
            <span><span className="block text-sm font-bold tracking-wide">Trustea</span><span className="block text-xs text-slate-400">Transaction concierge</span></span>
          </a>
          <span className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-200">
            <LockKeyhole size={13} /> Private transaction
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-12">
        <section>
          <a href="/" className="mb-7 inline-flex items-center gap-2 text-xs text-slate-400 no-underline hover:text-white">
            <ArrowLeft size={14} /> Back to Instapay
          </a>
          <div className="mb-8 max-w-2xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">A safer way to trade</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              Buy with confidence.<br /><span className="text-emerald-300">We’ll handle the handoff.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
              The buyer starts the transaction. Your phone numbers stay private while Trustea coordinates payment, delivery and the return window.
            </p>
          </div>

          {error && <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
          {notice && <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"><CheckCircle2 size={17} />{notice}</div>}

          {loading && <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-300"><RefreshCw className="animate-spin" size={17} />Loading your private transaction…</div>}

          {isNew && !loading && (
            <form onSubmit={beginTransaction} className="max-w-2xl space-y-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
              <div>
                <h2 className="text-lg font-semibold text-white">Start a transaction</h2>
                <p className="mt-1 text-sm text-slate-400">Enter the seller’s number. We’ll text them a private link to add the item details.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-300">Your name
                  <input required maxLength={100} value={buyerName} onChange={(event) => setBuyerName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="Name" />
                </label>
                <label className="text-xs font-semibold text-slate-300">Your mobile number
                  <input required type="tel" maxLength={20} value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="+260 97 000 0000" />
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-300">Seller’s mobile number
                <input required type="tel" maxLength={20} value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="+260 97 000 0000" />
              </label>
              <button disabled={working} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60">
                {working ? 'Creating private link…' : 'Invite seller'} <ArrowRight size={17} />
              </button>
              <p className="text-center text-xs leading-5 text-slate-500">The seller receives only the link needed to respond. They won’t see your phone number or delivery address.</p>
            </form>
          )}

          {transaction && !loading && (
            <div className="max-w-2xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div><p className="text-xs text-slate-400">Transaction reference</p><p className="mt-1 font-mono text-sm text-white">{transaction.id.slice(0, 8).toUpperCase()}</p></div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">{statusLabel(transaction.status)}</span>
              </div>

              {isSeller && transaction.status === 'seller_response_pending' && (
                <form onSubmit={submitSeller} className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
                  <div><h2 className="text-lg font-semibold">Add item details</h2><p className="mt-1 text-sm text-slate-400">The buyer will review your description, declared value and photos before confirming.</p></div>
                  <label className="block text-xs font-semibold text-slate-300">Your name
                    <input required maxLength={100} value={sellerName} onChange={(event) => setSellerName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="Name" />
                  </label>
                  <label className="block text-xs font-semibold text-slate-300">Item description
                    <textarea required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="Describe the item and its condition" />
                  </label>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Declared item value (ZMW)
                      <input required type="number" min="0.01" step="0.01" value={itemValue} onChange={(event) => setItemValue(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="0.00" />
                    </label>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-xs">
                      <span className="text-slate-400">Provisional parcel insurance · {insuranceRate}%</span>
                      <strong className="text-emerald-200">{money((Number(itemValue) || 0) * insuranceRate / 100)}</strong>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-300">Item photos (up to 4)</label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-4 text-sm text-slate-300 hover:border-emerald-500">
                      <Camera size={17} /> Add photos
                      <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
                    </label>
                    {photos.length > 0 && <div className="mt-3 grid grid-cols-4 gap-2">{photos.map((photo, index) => <img key={index} src={photo} alt={`Item ${index + 1}`} className="aspect-square rounded-lg object-cover" />)}</div>}
                    <p className="mt-2 text-xs text-slate-500">Images are stored privately and shown only to the transaction parties.</p>
                  </div>
                  <LocationChooser label="Pickup location" locations={locations} choice={origin} onChange={setOrigin} />
                  <button disabled={working} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60">
                    {working ? 'Sending details…' : 'Send item details to buyer'} <ArrowRight size={17} />
                  </button>
                </form>
              )}

              {!isSeller && transaction.status === 'buyer_checkout_pending' && (
                <form onSubmit={submitCheckout} className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
                  <div><h2 className="text-lg font-semibold">Review and confirm</h2><p className="mt-1 text-sm text-slate-400">Check the item and choose where Shipday should deliver it.</p></div>
                  <ItemSummary transaction={transaction} total={total} />
                  <LocationChooser label="Delivery location" locations={locations} choice={destination} onChange={setDestination} />
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={19} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">Salary deduction through the MFI</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">The request covers the seller’s declared value and the provisional insurance premium. The MFI reviews it before a parcel is dispatched.</p>
                        <p className="mt-3 text-lg font-bold text-emerald-200">{money(total)}</p>
                      </div>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-300">
                    <input type="checkbox" checked={salaryConsent} onChange={(event) => setSalaryConsent(event.target.checked)} className="mt-0.5 accent-emerald-400" />
                    <span>I authorize the MFI to review a salary-deduction loan request for <strong className="text-white">{money(total)}</strong>. I understand no loan is originated until the 24-hour return window ends and the seller’s payout is confirmed.</span>
                  </label>
                  <button disabled={working || !salaryConsent} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">
                    {working ? 'Sending to MFI…' : 'Confirm amount and request MFI review'} <ArrowRight size={17} />
                  </button>
                </form>
              )}

              {transaction.status === 'seller_response_pending' && !isSeller && <WaitingCard title="Waiting for seller" description="We’ve sent the seller a private link. You’ll receive an SMS as soon as the item details are ready." icon={<Clock3 />} />}
              {transaction.status === 'buyer_checkout_pending' && isSeller && <WaitingCard title="Waiting for buyer" description="The buyer is reviewing the item and choosing a delivery location. Your contact details remain private." icon={<Clock3 />} />}
              {transaction.status === 'mfi_review' && <WaitingCard title="MFI review in progress" description="The MFI is reviewing the salary-deduction request. Shipday is not booked until the MFI approves it." icon={<ShieldCheck />} />}
              {(transaction.status === 'delivery_pending' || transaction.status === 'in_transit') && (
                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
                  <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-300/10 text-emerald-300"><Truck size={20} /></span><div><h2 className="font-semibold">{transaction.status === 'in_transit' ? 'Your parcel is on the way' : 'Delivery is arranged'}</h2><p className="mt-1 text-xs text-slate-400">Tracking updates refresh automatically for both parties.</p></div></div>
                  <TrackingSummary transaction={transaction} />
                  {transaction.shipday_tracking_url && <a href={transaction.shipday_tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-200 no-underline hover:text-emerald-100">Open Shipday tracking <ArrowRight size={15} /></a>}
                </div>
              )}
              {transaction.status === 'delivered' && (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.05] p-5 sm:p-7">
                  <div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-300" size={22} /><div><h2 className="font-semibold">Shipday marked this parcel delivered</h2><p className="mt-1 text-sm text-slate-400">Confirm that you have the item to start your 24-hour return window.</p></div></div>
                  {!isSeller && <button onClick={() => void runAction(() => confirmFulfilmentReceipt(transactionId, token), 'Receipt confirmed. Your 24-hour return window has started.')} disabled={working} className="mt-5 w-full rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{working ? 'Confirming…' : 'I received the parcel'}</button>}
                  {isSeller && <p className="mt-5 text-xs text-slate-400">The buyer has been asked to confirm receipt. Settlement waits for the return window to end.</p>}
                </div>
              )}
              {(transaction.status === 'return_window' || transaction.status === 'return_requested') && (
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5 sm:p-7">
                  <div className="flex items-center gap-3"><Clock3 className="text-amber-200" size={21} /><div><h2 className="font-semibold">{transaction.status === 'return_requested' ? 'Return request under MFI review' : '24-hour return window is open'}</h2><p className="mt-1 text-sm text-slate-400">{transaction.return_window_ends_at ? `Ends ${new Date(transaction.return_window_ends_at).toLocaleString()}` : 'Return window active'}</p></div></div>
                  {!isSeller && transaction.status === 'return_window' && <button onClick={() => void runAction(() => requestFulfilmentReturn(transactionId, token), 'Your return request was sent to the MFI. Settlement is paused.')} disabled={working} className="mt-5 rounded-xl border border-amber-200/30 px-4 py-2.5 text-sm font-semibold text-amber-100 disabled:opacity-50">{working ? 'Sending…' : 'Request a return'}</button>}
                  {isSeller && <p className="mt-4 text-xs text-slate-400">Seller settlement is paused until the return window closes or the MFI resolves a return request.</p>}
                </div>
              )}
              {transaction.status === 'settlement_due' && <WaitingCard title="Final settlement is pending" description="The return window ended. An MFI operator will confirm the seller payout and originate the salary-deduction loan." icon={<Clock3 />} />}
              {transaction.status === 'completed' && <WaitingCard title="Transaction complete" description={isSeller ? 'Your payout was confirmed.' : 'The seller payout and your salary-deduction loan are confirmed.'} icon={<CheckCircle2 />} />}
              {transaction.status === 'returned' && <WaitingCard title="Return accepted" description="The MFI accepted the return. No seller settlement or salary-deduction loan was created." icon={<CheckCircle2 />} />}
              {transaction.status === 'cancelled' && <WaitingCard title="Transaction cancelled" description="No delivery or salary-deduction loan was created." icon={<CheckCircle2 />} />}
              {transaction.status === 'delivery_exception' && <WaitingCard title="Delivery needs attention" description="Shipday reported a delivery issue. Settlement is paused while Trustea follows up." icon={<Truck />} />}

              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Transaction activity</h2><span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live</span></div>
                <ol className="space-y-4">
                  {transaction.events.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
                      <div><p className="text-xs text-slate-300">{event.description}</p><time className="mt-1 block text-[10px] text-slate-500">{new Date(event.created_at).toLocaleString()}</time></div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5 lg:pt-12">
          {transaction ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-4 flex items-center gap-2"><Package size={17} className="text-emerald-300" /><h2 className="text-sm font-semibold">Item summary</h2></div>
                {transaction.item_description ? <ItemSummary transaction={transaction} total={total} /> : <p className="text-sm text-slate-500">Item details will appear when the seller responds.</p>}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h2 className="mb-4 text-sm font-semibold">Fulfilment progress</h2>
                <ol className="space-y-3">
                  {stages.map((stage, index) => {
                    const current = stageIndex(transaction.status);
                    const complete = index < current || transaction.status === 'completed';
                    return <li key={stage} className="flex items-center gap-3">
                      <span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${complete ? 'bg-emerald-300 text-slate-950' : index === current ? 'border border-emerald-300 text-emerald-200' : 'border border-slate-700 text-slate-500'}`}>{complete ? <Check size={12} /> : index + 1}</span>
                      <span className={`text-xs ${complete || index === current ? 'text-slate-200' : 'text-slate-500'}`}>{stage}</span>
                    </li>;
                  })}
                </ol>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-sm font-semibold">How it works</h2>
              <ol className="mt-4 space-y-4 text-xs leading-5 text-slate-400">
                <li className="flex gap-3"><span className="font-bold text-emerald-300">01</span> You invite the seller using their mobile number.</li>
                <li className="flex gap-3"><span className="font-bold text-emerald-300">02</span> They share the item, declared value and pickup location.</li>
                <li className="flex gap-3"><span className="font-bold text-emerald-300">03</span> You confirm the delivery location and MFI review.</li>
                <li className="flex gap-3"><span className="font-bold text-emerald-300">04</span> Shipday tracks the package; you get 24 hours to request a return.</li>
              </ol>
            </div>
          )}
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-5">
            <div className="flex items-center gap-2 text-emerald-200"><LockKeyhole size={15} /><h2 className="text-xs font-bold">Your details stay private</h2></div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Only Trustea and the delivery partner receive the information needed to complete this transaction. Personal contact numbers are not shown to the other party.</p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function ItemSummary({ transaction, total }: { transaction: FulfilmentRecord; total: number }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">{transaction.item_description}</p>
        {transaction.seller_name && <p className="mt-1 text-xs text-slate-400">From {transaction.seller_name}</p>}
      </div>
      {transaction.photos.length > 0 && <div className="grid grid-cols-3 gap-2">{transaction.photos.map((photo, index) => <img key={index} src={photo} alt={`Item photo ${index + 1}`} className="aspect-square rounded-lg object-cover" />)}</div>}
      <div className="space-y-2 border-t border-white/10 pt-3 text-xs">
        <div className="flex justify-between gap-3"><span className="text-slate-400">Declared value</span><span>{money(Number(transaction.item_value || 0))}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-400">Provisional insurance ({transaction.insurance_rate_pct}%)</span><span>{money(Number(transaction.insurance_amount || 0))}</span></div>
        <div className="flex justify-between gap-3 border-t border-white/10 pt-2 text-sm font-bold"><span>Total salary deduction</span><span className="text-emerald-200">{money(total)}</span></div>
      </div>
    </div>
  );
}

function TrackingSummary({ transaction }: { transaction: FulfilmentRecord }) {
  const driverLocation = transaction.driver_location;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-slate-900/80 p-3"><p className="text-[11px] text-slate-500">Pickup</p><p className="mt-1 flex items-start gap-2 text-xs text-slate-200"><MapPin size={14} className="mt-0.5 shrink-0 text-emerald-300" />{transaction.origin?.label || 'Seller location'}</p></div>
      <div className="rounded-xl bg-slate-900/80 p-3"><p className="text-[11px] text-slate-500">Destination</p><p className="mt-1 flex items-start gap-2 text-xs text-slate-200"><MapPin size={14} className="mt-0.5 shrink-0 text-emerald-300" />{transaction.destination?.label || 'Buyer location'}</p></div>
      {driverLocation && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-3 sm:col-span-2">
        <p className="text-[11px] font-semibold text-emerald-200">Live driver location</p>
        <a
          href={`https://maps.google.com/?q=${driverLocation.latitude},${driverLocation.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-slate-200 no-underline hover:text-white"
        >
          <MapPin size={13} /> View on map
        </a>
        <p className="mt-1 text-[10px] text-slate-500">Updated {new Date(driverLocation.updated_at).toLocaleTimeString()}</p>
      </div>}
      {transaction.picked_up_at && <p className="text-xs text-slate-400">Picked up {new Date(transaction.picked_up_at).toLocaleString()}</p>}
      {transaction.delivered_at && <p className="text-xs text-slate-400">Delivered {new Date(transaction.delivered_at).toLocaleString()}</p>}
    </div>
  );
}

function WaitingCard({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
      <span className="mt-0.5 text-emerald-300">{icon}</span>
      <div><h2 className="font-semibold text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{description}</p></div>
    </div>
  );
}
