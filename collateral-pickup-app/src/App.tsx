import React, { useState, useEffect } from 'react';
import {
  Shield,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Sparkles,
  MessageSquare,
  Lock,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Clock,
  UserCheck,
  Zap,
  Building2
} from 'lucide-react';
import {
  socket,
  fetchCollateralPickups,
  createCollateralAppraisal,
  executeCollateralPickup
} from './api';
import { Questionnaire, QuestionnaireData } from './components/Questionnaire';
import { PhotoCapture, CollateralPhoto } from './components/PhotoCapture';
import { SignaturePad } from './components/SignaturePad';

export default function App() {
  const [pickups, setPickups] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'APPRAISE_NEW' | 'PICKUP_QUEUE'>('APPRAISE_NEW');
  const [loading, setLoading] = useState(true);

  // Appraisal State
  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireData | null>(null);
  const [valuationResult, setValuationResult] = useState<any>(null);

  // Borrower details
  const [borrowerName, setBorrowerName] = useState('Natasha Tembo');
  const [borrowerPhone, setBorrowerPhone] = useState('0977123456');
  const [borrowerNrc, setBorrowerNrc] = useState('512398/10/1');
  const [borrowerAddress, setBorrowerAddress] = useState('House 12, Kabwata Site & Service, Lusaka');

  // Inspection Photos & Signature
  const [photos, setPhotos] = useState<CollateralPhoto[]>([]);
  const [signatureData, setSignatureData] = useState<string>('');
  const [riderNotes, setRiderNotes] = useState('');

  // Execution State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activationReceipt, setActivationReceipt] = useState<any>(null);

  // Selected item from queue
  const [selectedPickup, setSelectedPickup] = useState<any>(null);

  const loadData = async () => {
    try {
      const data = await fetchCollateralPickups();
      setPickups(data);
      if (data.length > 0 && !selectedPickup) {
        setSelectedPickup(data[0]);
      }
    } catch (err) {
      console.error('Failed to load collateral pickups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    socket.on('collateral:pickup_completed', (payload: any) => {
      setPickups((prev) => prev.map((p) => (p.id === payload.collateral.id ? payload.collateral : p)));
    });

    socket.on('collateral:created', (newCol: any) => {
      setPickups((prev) => [newCol, ...prev]);
    });

    return () => {
      socket.off('collateral:pickup_completed');
      socket.off('collateral:created');
    };
  }, []);

  const handleValuationComplete = (data: QuestionnaireData, valuation: any) => {
    setQuestionnaireData(data);
    setValuationResult(valuation);
    setErrorMessage(null);
  };

  const handleSelectFromQueue = (item: any) => {
    setSelectedPickup(item);
    setQuestionnaireData({
      category: item.item_category,
      make: item.item_make,
      model: item.item_model,
      declared_purchase_price: item.estimated_fmv,
      condition: item.questionnaire_responses?.condition || 'EXCELLENT',
      functional_health: item.questionnaire_responses?.functional_health || 'PERFECT_100',
      device_age: item.questionnaire_responses?.device_age || '6_TO_12_MONTHS',
      account_lock_status: 'CLEAN_UNLOCKED',
      accessories: item.questionnaire_responses?.accessories || ['box', 'charger']
    });
    setValuationResult({
      fmv: item.estimated_fmv,
      condition_grade: item.condition_grade,
      ltv_pct: item.loan_to_value_pct,
      approved_credit_limit: item.approved_credit_limit,
      mfi_headroom_margin: item.mfi_headroom_margin
    });
    setBorrowerName(item.borrower_name);
    setBorrowerPhone(item.borrower_phone);
    setBorrowerNrc(item.borrower_nrc || '512398/10/1');
    setBorrowerAddress(item.borrower_address || 'Lusaka, Zambia');
    setPhotos(item.inspection_photos || []);
    setSignatureData(item.borrower_signature_data || '');
    setActiveTab('APPRAISE_NEW');
  };

  const handleValidateAndActivate = async () => {
    if (!valuationResult) {
      setErrorMessage('Please complete item valuation questionnaire first.');
      return;
    }
    if (photos.length === 0) {
      setErrorMessage('Please capture at least 1 inspection photo (Screen On / Condition / IMEI).');
      return;
    }
    if (!signatureData) {
      setErrorMessage('Borrower digital signature is required to confirm physical handover under custody.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let targetId = selectedPickup?.id;

      // If new item, create record first
      if (!targetId || targetId.startsWith('new-')) {
        const createRes = await createCollateralAppraisal({
          borrower_name: borrowerName,
          borrower_phone: borrowerPhone,
          borrower_nrc: borrowerNrc,
          borrower_address: borrowerAddress,
          item_category: questionnaireData?.category,
          item_make: questionnaireData?.make,
          item_model: questionnaireData?.model,
          declared_purchase_price: questionnaireData?.declared_purchase_price,
          condition: questionnaireData?.condition,
          functional_health: questionnaireData?.functional_health,
          device_age: questionnaireData?.device_age,
          account_lock_status: questionnaireData?.account_lock_status,
          accessories: questionnaireData?.accessories
        });
        targetId = createRes.item.id;
      }

      // Execute handover & activate InstaPay
      const res = await executeCollateralPickup(targetId, {
        photos,
        signature_data: signatureData,
        rider_notes: riderNotes
      });

      if (res.success) {
        setActivationReceipt(res);
      } else {
        setErrorMessage(res.error || 'Failed to activate InstaPay credit limit.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error communicating with MFI collateral backend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAll = () => {
    setValuationResult(null);
    setQuestionnaireData(null);
    setPhotos([]);
    setSignatureData('');
    setActivationReceipt(null);
    setSelectedPickup(null);
    setErrorMessage(null);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-500 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-400 font-medium text-sm">Loading Collateral Valuation Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-950 flex flex-col justify-between text-slate-100 font-sans shadow-2xl">
      {/* Top Header */}
      <header className="px-5 pt-5 pb-4 bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center font-black text-white shadow-md shadow-red-900/50">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Trustea Collateral Pickup</h1>
              <p className="text-[10px] text-slate-400">Automated Valuation &bull; Instant InstaPay Onboarding</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800 flex items-center space-x-1">
            <Zap className="w-3 h-3 text-red-400" />
            <span>InstaPay Ready</span>
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('APPRAISE_NEW')}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'APPRAISE_NEW'
                ? 'bg-red-600 text-white shadow-md shadow-red-900/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Appraise &amp; Activate</span>
          </button>
          <button
            onClick={() => setActiveTab('PICKUP_QUEUE')}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'PICKUP_QUEUE'
                ? 'bg-slate-800 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pickup Queue ({pickups.length})</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 px-4 py-4 space-y-4">
        {/* VIEW 1: SUCCESS INSTAPAY ACTIVATION RECEIPT */}
        {activationReceipt ? (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-800/80 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  INSTAPAY ACTIVE &bull; COLLATERAL SECURED
                </span>
                <span className="font-mono text-xs text-slate-400">{activationReceipt.collateral.collateral_code}</span>
              </div>

              <div className="text-center py-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                <h2 className="text-xl font-black text-white">
                  ZMW {activationReceipt.collateral.approved_credit_limit.toFixed(2)}
                </h2>
                <p className="text-xs text-emerald-300 font-bold mt-0.5">Instant InstaPay Credit Limit Activated!</p>
                <p className="text-[11px] text-slate-300 mt-1">
                  Borrower: <strong className="text-white">{activationReceipt.borrower.full_name}</strong> ({activationReceipt.borrower.phone_number})
                </p>
              </div>

              {/* SMS Notification Banner */}
              <div className="p-3 rounded-xl bg-slate-950 border border-purple-800/60 text-xs space-y-2">
                <div className="flex items-center space-x-1.5 text-purple-400 font-bold">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>SMS Dispatched to Borrower's Phone</span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-purple-200">
                  &ldquo;{activationReceipt.smsMessage}&rdquo;
                </div>
              </div>

              {/* One-Tap Open InstaPay Button */}
              <a
                href={activationReceipt.collateral.instapay_activation_url || 'http://localhost:3003'}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 font-black text-xs text-white shadow-lg shadow-red-900/60 transition flex items-center justify-center space-x-2"
              >
                <span>Launch InstaPay Customer App</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              {/* Handover Details */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Pledged Collateral:</span>
                  <span className="font-bold text-white">
                    {activationReceipt.collateral.item_make} {activationReceipt.collateral.item_model}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Condition Grade:</span>
                  <span className="font-bold text-amber-400">{activationReceipt.collateral.condition_grade}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fair Market Value:</span>
                  <span className="text-slate-300">ZMW {activationReceipt.collateral.estimated_fmv.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">MFI Vault Headroom:</span>
                  <span className="font-mono text-emerald-400">
                    +ZMW {activationReceipt.collateral.mfi_headroom_margin.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                onClick={resetAll}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition flex items-center justify-center space-x-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Process Another Collateral</span>
              </button>
            </div>
          </div>
        ) : activeTab === 'PICKUP_QUEUE' ? (
          /* VIEW 2: PICKUP QUEUE */
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Pending Collateral Pickups ({pickups.length})
            </h2>
            {pickups.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelectFromQueue(item)}
                className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                    {item.condition_grade} &bull; {item.status}
                  </span>
                  <span className="font-mono text-xs text-slate-400">{item.collateral_code}</span>
                </div>

                <div>
                  <h3 className="font-black text-white text-sm">
                    {item.item_make} {item.item_model}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Borrower: <strong className="text-slate-200">{item.borrower_name}</strong> ({item.borrower_phone})
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Instant Loan Line</span>
                    <span className="font-bold text-emerald-400 text-sm">
                      ZMW {item.approved_credit_limit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-red-400 text-xs font-bold">
                    <span>Inspect &amp; Pickup</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* VIEW 3: APPRAISE NEW COLLATERAL & ACTIVATE */
          <div className="space-y-4">
            {/* Step 1: Questionnaire */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">STEP 1</span>
                <span className="text-xs text-slate-400 font-medium">Item Details &amp; Condition</span>
              </div>
              <Questionnaire onValuationComplete={handleValuationComplete} />
            </div>

            {/* Step 2: Automated Valuation Result Card */}
            {valuationResult && (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-red-950/60 via-slate-900 to-slate-900 border-2 border-red-500 shadow-xl space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-600 text-white">
                    AUTOMATED VALUATION RESULT
                  </span>
                  <span className="text-xs font-bold text-amber-400 font-mono">
                    {valuationResult.condition_grade} ({valuationResult.ltv_pct}% LTV)
                  </span>
                </div>

                <div className="text-center py-1">
                  <span className="text-xs text-slate-400 uppercase font-semibold">
                    Approved InstaPay Credit Limit
                  </span>
                  <div className="text-3xl font-black text-emerald-400 mt-1">
                    ZMW {valuationResult.approved_credit_limit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Market Value: <strong>ZMW {valuationResult.fmv.toFixed(2)}</strong>
                  </p>
                </div>

                {/* Overarching Objective Explanation Card */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-2">
                  <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>High Adoption Borrowing Power + MFI Headroom</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    This automated appraisal grants <strong className="text-white">{valuationResult.ltv_pct}% LTV</strong>{' '}
                    to maximize borrower adoption, while maintaining a{' '}
                    <strong className="text-emerald-400">
                      ZMW {valuationResult.mfi_headroom_margin.toFixed(2)} safety headroom
                    </strong>{' '}
                    for the MFI collateral management vault.
                  </p>
                </div>

                {/* Step 3: Borrower Contact Information */}
                <div className="pt-2 border-t border-slate-800 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    STEP 2: BORROWER CONTACT FOR INSTAPAY SMS
                  </span>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Full Name</label>
                      <input
                        type="text"
                        value={borrowerName}
                        onChange={(e) => setBorrowerName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Mobile Phone (Airtel)</label>
                      <input
                        type="text"
                        value={borrowerPhone}
                        onChange={(e) => setBorrowerPhone(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">NRC Number</label>
                      <input
                        type="text"
                        value={borrowerNrc}
                        onChange={(e) => setBorrowerNrc(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Physical Address</label>
                      <input
                        type="text"
                        value={borrowerAddress}
                        onChange={(e) => setBorrowerAddress(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 4: Physical Inspection Photos */}
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    STEP 3: RIDER INSPECTION PHOTOS
                  </span>
                  <PhotoCapture
                    photos={photos}
                    onAddPhoto={(p) => setPhotos((prev) => [...prev, p])}
                    onRemovePhoto={(id) => setPhotos((prev) => prev.filter((p) => p.id !== id))}
                    itemCategory={questionnaireData?.category || 'SMARTPHONE'}
                  />
                </div>

                {/* Step 5: Borrower Handover Signature */}
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    STEP 4: BORROWER CUSTODY SIGNATURE
                  </span>
                  <SignaturePad onSignatureCapture={(sig) => setSignatureData(sig)} borrowerName={borrowerName} />
                </div>

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-200 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Submit and Activate InstaPay */}
                <button
                  type="button"
                  onClick={handleValidateAndActivate}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-amber-600 hover:opacity-95 font-black text-sm text-white shadow-xl shadow-red-950/80 transition flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <span>Validate &amp; Activate InstaPay Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-3 text-center text-[10px] text-slate-500 border-t border-slate-900">
        Trustea Collateral Management &bull; Linked with InstaPay MFI Core
      </footer>
    </div>
  );
}
