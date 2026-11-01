import React, { useState } from 'react';
import {
  Smartphone,
  Laptop,
  Sun,
  Tv,
  Bike,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Check
} from 'lucide-react';
import { evaluateCollateralValuation } from '../api';

export interface QuestionnaireData {
  category: 'SMARTPHONE' | 'LAPTOP' | 'POWER_SOLAR' | 'APPLIANCE' | 'MOTORBIKE';
  make: string;
  model: string;
  declared_purchase_price: number;
  condition: 'MINT' | 'EXCELLENT' | 'GOOD' | 'FAIR';
  functional_health: 'PERFECT_100' | 'MINOR_QUIRK' | 'DEGRADED';
  device_age: 'UNDER_6_MONTHS' | '6_TO_12_MONTHS' | '1_TO_2_YEARS' | 'OVER_2_YEARS';
  account_lock_status: 'CLEAN_UNLOCKED' | 'LOCKED';
  accessories: string[];
}

interface QuestionnaireProps {
  onValuationComplete: (data: QuestionnaireData, valuation: any) => void;
}

const POPULAR_SUGGESTIONS: Record<string, Array<{ make: string; model: string; price: number }>> = {
  SMARTPHONE: [
    { make: 'Apple', model: 'iPhone 13 128GB', price: 9800 },
    { make: 'Apple', model: 'iPhone 14 Pro 128GB', price: 14800 },
    { make: 'Apple', model: 'iPhone 12 64GB', price: 7200 },
    { make: 'Samsung', model: 'Galaxy S22 128GB', price: 9500 },
    { make: 'Samsung', model: 'Galaxy A54 128GB', price: 4800 },
  ],
  LAPTOP: [
    { make: 'Apple', model: 'MacBook Air M1 256GB', price: 13000 },
    { make: 'HP', model: 'ProBook 450 G8 Core i5', price: 6500 },
    { make: 'Dell', model: 'Latitude 5420 Core i7', price: 6800 },
  ],
  POWER_SOLAR: [
    { make: 'Luminous', model: 'Solar 3.5kVA Inverter + 200Ah Gel', price: 14500 },
    { make: 'Must', model: '5kW Hybrid Solar Inverter', price: 12800 },
    { make: 'Felicity', model: '5kWh Lithium Solar Battery', price: 19000 },
  ],
  APPLIANCE: [
    { make: 'Hisense', model: '55 inch 4K Smart TV', price: 7200 },
    { make: 'Defy', model: 'Chest Freezer 254L', price: 5800 },
    { make: 'Samsung', model: '43 inch Smart Full HD TV', price: 5200 },
  ],
  MOTORBIKE: [
    { make: 'Bajaj', model: 'Boxer 150cc', price: 18500 },
    { make: 'TVS', model: 'HLX 125cc', price: 16000 },
  ]
};

export const Questionnaire: React.FC<QuestionnaireProps> = ({ onValuationComplete }) => {
  const [category, setCategory] = useState<'SMARTPHONE' | 'LAPTOP' | 'POWER_SOLAR' | 'APPLIANCE' | 'MOTORBIKE'>('SMARTPHONE');
  const [make, setMake] = useState('Apple');
  const [model, setModel] = useState('iPhone 13 128GB');
  const [declaredPrice, setDeclaredPrice] = useState(9800);
  const [condition, setCondition] = useState<'MINT' | 'EXCELLENT' | 'GOOD' | 'FAIR'>('EXCELLENT');
  const [functionalHealth, setFunctionalHealth] = useState<'PERFECT_100' | 'MINOR_QUIRK' | 'DEGRADED'>('PERFECT_100');
  const [deviceAge, setDeviceAge] = useState<'UNDER_6_MONTHS' | '6_TO_12_MONTHS' | '1_TO_2_YEARS' | 'OVER_2_YEARS'>('6_TO_12_MONTHS');
  const [accountLock, setAccountLock] = useState<'CLEAN_UNLOCKED' | 'LOCKED'>('CLEAN_UNLOCKED');
  const [accessories, setAccessories] = useState<string[]>(['box', 'charger']);

  const [evaluating, setEvaluating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleAccessory = (item: string) => {
    setAccessories((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const handleApplySuggestion = (sug: { make: string; model: string; price: number }) => {
    setMake(sug.make);
    setModel(sug.model);
    setDeclaredPrice(sug.price);
  };

  const handleRunValuation = async () => {
    if (accountLock === 'LOCKED') {
      setErrorMsg('Item has active iCloud / Google FRP Account Lock. Device must be factory clean and unlocked before appraisal.');
      return;
    }

    setEvaluating(true);
    setErrorMsg(null);

    const data: QuestionnaireData = {
      category,
      make,
      model,
      declared_purchase_price: declaredPrice,
      condition,
      functional_health: functionalHealth,
      device_age: deviceAge,
      account_lock_status: accountLock,
      accessories
    };

    try {
      const res = await evaluateCollateralValuation(data);
      if (res.success) {
        onValuationComplete(data, res);
      } else {
        setErrorMsg(res.error || 'Valuation engine calculation failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error communicating with valuation engine.');
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Category Pills */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
          Select Collateral Category
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setCategory('SMARTPHONE');
              handleApplySuggestion(POPULAR_SUGGESTIONS.SMARTPHONE[0]);
            }}
            className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center space-y-1 transition ${
              category === 'SMARTPHONE'
                ? 'bg-red-950/80 border-red-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4 text-red-500" />
            <span className="text-[10px] font-bold leading-tight">Phone / Tablet</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory('LAPTOP');
              handleApplySuggestion(POPULAR_SUGGESTIONS.LAPTOP[0]);
            }}
            className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center space-y-1 transition ${
              category === 'LAPTOP'
                ? 'bg-red-950/80 border-red-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-4 h-4 text-sky-400" />
            <span className="text-[10px] font-bold leading-tight">Laptop / PC</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory('POWER_SOLAR');
              handleApplySuggestion(POPULAR_SUGGESTIONS.POWER_SOLAR[0]);
            }}
            className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center space-y-1 transition ${
              category === 'POWER_SOLAR'
                ? 'bg-red-950/80 border-red-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-bold leading-tight">Solar / Power</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory('APPLIANCE');
              handleApplySuggestion(POPULAR_SUGGESTIONS.APPLIANCE[0]);
            }}
            className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center space-y-1 transition ${
              category === 'APPLIANCE'
                ? 'bg-red-950/80 border-red-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-bold leading-tight">Appliance / TV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory('MOTORBIKE');
              handleApplySuggestion(POPULAR_SUGGESTIONS.MOTORBIKE[0]);
            }}
            className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center space-y-1 transition ${
              category === 'MOTORBIKE'
                ? 'bg-red-950/80 border-red-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Bike className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-bold leading-tight">Motorbike</span>
          </button>
        </div>
      </div>

      {/* Popular Suggestions quick chips */}
      {POPULAR_SUGGESTIONS[category] && (
        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 font-medium">Quick Pick Benchmark Models:</span>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_SUGGESTIONS[category].map((sug, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleApplySuggestion(sug)}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium"
              >
                {sug.model}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Brand & Model Inputs */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-bold text-slate-400 block mb-1">Brand / Make</label>
          <input
            type="text"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-red-500"
            placeholder="e.g. Apple"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-400 block mb-1">Model &amp; Capacity</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-red-500"
            placeholder="e.g. iPhone 13 128GB"
          />
        </div>
      </div>

      {/* Question 1: Cosmetic Condition */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 block mb-1.5">1. Cosmetic / Physical Condition</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'MINT', label: 'Flawless / Mint', desc: 'Zero scratches or marks' },
            { id: 'EXCELLENT', label: 'Light Wear', desc: 'Clean, micro-scratches only' },
            { id: 'GOOD', label: 'Good Condition', desc: 'Minor scuffs or small marks' },
            { id: 'FAIR', label: 'Fair Condition', desc: 'Visible wear, fully intact' },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCondition(c.id as any)}
              className={`p-2.5 rounded-xl border text-left transition ${
                condition === c.id
                  ? 'bg-red-950/60 border-red-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span className="text-xs font-bold block">{c.label}</span>
              <span className="text-[10px] text-slate-500 block">{c.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Question 2: Functional Health */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 block mb-1.5">2. Operational Functionality</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFunctionalHealth('PERFECT_100')}
            className={`p-2.5 rounded-xl border text-left transition ${
              functionalHealth === 'PERFECT_100'
                ? 'bg-emerald-950/60 border-emerald-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span className="text-xs font-bold block">100% Fully Working</span>
            <span className="text-[10px] text-slate-500 block">Screen, battery, ports tested</span>
          </button>
          <button
            type="button"
            onClick={() => setFunctionalHealth('MINOR_QUIRK')}
            className={`p-2.5 rounded-xl border text-left transition ${
              functionalHealth === 'MINOR_QUIRK'
                ? 'bg-amber-950/60 border-amber-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span className="text-xs font-bold block">Minor Wear / Quirk</span>
            <span className="text-[10px] text-slate-500 block">Battery &gt;80%, operational</span>
          </button>
        </div>
      </div>

      {/* Question 3: Security & Account Lock */}
      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
        <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
          <span>3. iCloud / Google FRP Account Status</span>
          <span className="text-red-400 font-bold text-[10px]">MANDATORY</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAccountLock('CLEAN_UNLOCKED')}
            className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
              accountLock === 'CLEAN_UNLOCKED'
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Unlocked / Clean</span>
          </button>
          <button
            type="button"
            onClick={() => setAccountLock('LOCKED')}
            className={`py-2 px-3 rounded-lg border text-xs font-bold transition ${
              accountLock === 'LOCKED'
                ? 'bg-red-600 border-red-500 text-white shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span>Passcode / Locked</span>
          </button>
        </div>
      </div>

      {/* Question 4: Accessories & Extras */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 block mb-1.5">
          4. Included Accessories (Boosts Borrowing Value)
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'box', label: 'Original Box (+4%)' },
            { id: 'charger', label: 'OEM Fast Charger (+4%)' },
            { id: 'receipt', label: 'Purchase Receipt (+5%)' },
          ].map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => toggleAccessory(acc.id)}
              className={`p-2 rounded-xl border text-center text-[10px] font-bold transition ${
                accessories.includes(acc.id)
                  ? 'bg-amber-950/70 border-amber-500 text-amber-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {acc.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-200 flex items-start space-x-2">
          <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Calculate Valuation Button */}
      <button
        type="button"
        onClick={handleRunValuation}
        disabled={evaluating}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 font-black text-sm text-white shadow-xl shadow-red-950/70 transition flex items-center justify-center space-x-2"
      >
        {evaluating ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>Generate High-Adoption Valuation</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
};
