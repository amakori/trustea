import React, { useState, useEffect } from 'react';
import {
  Send,
  Banknote,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  UserCheck,
  ChevronRight,
  Smartphone,
  Info,
  Lock,
  RotateCcw
} from 'lucide-react';
import {
  socket,
  submitLoanApplication,
  submitPromptConfirmation,
  fetchBorrowerData
} from './api';

export default function App() {
  const [borrowerPhone, setBorrowerPhone] = useState('0978587412');
  const [borrowerName, setBorrowerName] = useState('Mwamba Chileshe');
  const [borrowerCredit, setBorrowerCredit] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'send' | 'cashout' | 'history'>('send');
  const [amount, setAmount] = useState('150');
  const [recipientPhone, setRecipientPhone] = useState('0977123456');
  const [agentNumber, setAgentNumber] = useState('492109');

  // Application & In-Flight State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeLoan, setActiveLoan] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // USSD Confirmation Modal State
  const [promptData, setPromptData] = useState<any>(null);
  const [countdown, setCountdown] = useState(20);

  // Load borrower credit profile
  useEffect(() => {
    fetchBorrowerData(borrowerPhone).then((data) => {
      if (data) {
        setBorrowerCredit(data);
        setBorrowerName(data.full_name);
      }
    });
  }, [borrowerPhone]);

  // Socket.io Realtime Listener
  useEffect(() => {
    socket.on('ussd:confirmation_prompt', (data: any) => {
      console.log('[Customer App] Intercepted confirmation prompt received:', data);
      setPromptData(data);
      setCountdown(20);
    });

    socket.on('loan:status_changed', (payload: any) => {
      if (activeLoan && payload.loanId === activeLoan.id) {
        setActiveLoan((prev: any) => ({ ...prev, status: payload.status }));
      }
    });

    socket.on('mfi:loan_updated', (loan: any) => {
      if (activeLoan && loan.id === activeLoan.id) {
        setActiveLoan(loan);
        if (loan.status === 'COMPLETED' || loan.status === 'FAILED' || loan.status === 'CUSTOMER_CANCELLED') {
          setPromptData(null);
        }
      }
    });

    return () => {
      socket.off('ussd:confirmation_prompt');
      socket.off('loan:status_changed');
      socket.off('mfi:loan_updated');
    };
  }, [activeLoan]);

  // Countdown timer for USSD confirmation
  useEffect(() => {
    if (!promptData || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          handleDecision('CANCEL', 'Prompt timed out without confirmation.');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [promptData, countdown]);

  const handleApplyLoan = async (type: 'SEND_MONEY' | 'GET_CASH') => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setActiveLoan(null);
    setPromptData(null);

    try {
      const res = await submitLoanApplication({
        borrower_phone: borrowerPhone,
        borrower_name: borrowerName,
        amount: Number(amount),
        loan_type: type,
        recipient_phone: type === 'SEND_MONEY' ? recipientPhone : undefined,
        agent_number: type === 'GET_CASH' ? agentNumber : undefined,
      });

      if (!res.success) {
        setErrorMessage(res.message || 'Loan request declined by MFI risk rules.');
        if (res.loan) setActiveLoan(res.loan);
      } else {
        setActiveLoan(res.loan);
        socket.emit('loan:subscribe', res.loan.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit loan application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecision = async (decision: 'CONFIRM' | 'CANCEL', reason?: string) => {
    if (!activeLoan) return;
    try {
      socket.emit('customer:confirm_prompt', {
        loanId: activeLoan.id,
        decision,
        reason,
      });
      await submitPromptConfirmation({
        loanId: activeLoan.id,
        decision,
        reason,
      });
      setPromptData(null);
    } catch (err) {
      console.error('Error submitting prompt decision:', err);
    }
  };

  const remainingCredit = borrowerCredit
    ? borrowerCredit.credit_limit - borrowerCredit.current_outstanding
    : 2350.0;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-950 flex flex-col justify-between text-slate-100 font-sans shadow-2xl">
      {/* Top Header */}
      <header className="px-5 pt-6 pb-4 bg-slate-900/80 backdrop-blur border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center font-black text-white shadow-md shadow-red-900/50">
              IP
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Instapay Mobile</h1>
              <p className="text-[10px] text-slate-400">Powered by Trustea Microfinance &amp; Airtel Money</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
            Airtel Online
          </span>
        </div>

        {/* Credit Limit Banner */}
        <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-red-950/70 via-slate-900 to-slate-900 border border-red-900/50 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Available Credit Limit</span>
            <span className="text-[11px] text-red-400 font-semibold">{borrowerName}</span>
          </div>
          <div className="text-2xl font-black text-white mt-1">
            ZMW {remainingCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
            <span>Approved Limit: ZMW 2,500.00</span>
            <span className="text-emerald-400 font-bold">Instant USSD Disbursement</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 px-5 py-5 space-y-5">
        {/* Transfer Mode Toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              setActiveTab('send');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'send'
                ? 'bg-red-600 text-white shadow-md shadow-red-900/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Money (Pay)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('cashout');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'cashout'
                ? 'bg-red-600 text-white shadow-md shadow-red-900/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>Get Cash (Booth)</span>
          </button>
        </div>

        {/* SEND MONEY FORM */}
        {activeTab === 'send' && !activeLoan && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Amount to Borrow &amp; Send (ZMW)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-500 font-bold text-sm">ZMW</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-14 pr-4 py-2.5 text-base font-bold text-white focus:outline-none focus:border-red-500"
                  placeholder="150"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Recipient Airtel Mobile Number</label>
              <input
                type="text"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-white font-mono focus:outline-none focus:border-red-500"
                placeholder="0977123456"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                The seller or merchant you want to pay on location.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Disbursement Method:</span>
                <span className="font-bold text-slate-200">Airtel Money USSD (*115#)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>MFI Service Fee:</span>
                <span className="font-bold text-emerald-400">ZMW 3.50</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Confirmation Safeguard:</span>
                <span className="font-bold text-sky-400">Recipient Name Check</span>
              </div>
            </div>

            <button
              onClick={() => handleApplyLoan('SEND_MONEY')}
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 font-black text-sm text-white shadow-lg shadow-red-900/60 transition flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>Request Loan &amp; Send Money</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* GET CASH FORM */}
        {activeTab === 'cashout' && !activeLoan && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Amount to Borrow &amp; Withdraw (ZMW)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-500 font-bold text-sm">ZMW</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-14 pr-4 py-2.5 text-base font-bold text-white focus:outline-none focus:border-red-500"
                  placeholder="500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Airtel Money Agent Number</label>
              <input
                type="text"
                value={agentNumber}
                onChange={(e) => setAgentNumber(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-white font-mono focus:outline-none focus:border-red-500"
                placeholder="492109"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Found on the Airtel Money booth or kiosk banner.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Disbursement Method:</span>
                <span className="font-bold text-slate-200">Airtel Agent Cashout (*115#)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Carrier Cashout Fee:</span>
                <span className="font-bold text-amber-400">ZMW 12.50</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Agent Verification:</span>
                <span className="font-bold text-sky-400">Interactive Booth Match</span>
              </div>
            </div>

            <button
              onClick={() => handleApplyLoan('GET_CASH')}
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 font-black text-sm text-white shadow-lg shadow-red-900/60 transition flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>Request Loan &amp; Get Cash</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Error / Rejection Card */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-xs space-y-2">
            <div className="flex items-center space-x-2 text-red-400 font-bold">
              <AlertCircle className="w-4 h-4" />
              <span>Loan Request Declined</span>
            </div>
            <p className="text-red-200 leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* IN-FLIGHT LOAN STATUS CARD */}
        {activeLoan && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {activeLoan.loan_type === 'SEND_MONEY' ? 'Sending Money' : 'Withdrawing Cash'}
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                    activeLoan.status === 'COMPLETED'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : activeLoan.status === 'REJECTED' || activeLoan.status === 'CUSTOMER_CANCELLED'
                      ? 'bg-red-950 text-red-400 border border-red-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'
                  }`}
                >
                  {activeLoan.status}
                </span>
              </div>

              <div className="text-center py-2">
                <span className="text-3xl font-black text-white">ZMW {activeLoan.amount.toFixed(2)}</span>
                <p className="text-xs text-slate-400 mt-1">
                  Target:{' '}
                  <strong className="text-slate-200 font-mono">
                    {activeLoan.loan_type === 'SEND_MONEY' ? activeLoan.recipient_phone : `Agent ${activeLoan.agent_number}`}
                  </strong>
                </p>
              </div>

              {/* Live Status Description */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                {activeLoan.status === 'DISPATCHED' && (
                  <p className="flex items-center space-x-2 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    <span>Connecting to Instapay Android App...</span>
                  </p>
                )}
                {activeLoan.status === 'USSD_IN_PROGRESS' && (
                  <p className="flex items-center space-x-2 text-amber-300">
                    <Smartphone className="w-4 h-4 text-red-400 animate-pulse" />
                    <span>Android phone dialing *115# and inputting menu steps...</span>
                  </p>
                )}
                {activeLoan.status === 'AWAITING_CUSTOMER_CONFIRMATION' && (
                  <p className="text-sky-300 font-bold flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>Review recipient details in the confirmation popup below!</span>
                  </p>
                )}
                {activeLoan.status === 'CUSTOMER_CONFIRMED' && (
                  <p className="text-emerald-400 font-medium">Confirmed by you! Phone is entering 4-digit PIN...</p>
                )}
                {activeLoan.status === 'PIN_ENTERED' && (
                  <p className="text-emerald-400 font-medium">PIN submitted to Airtel network. Awaiting SMS proof...</p>
                )}
                {activeLoan.status === 'COMPLETED' && (
                  <div className="space-y-1">
                    <p className="text-emerald-400 font-bold flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Disbursement Confirmed!</span>
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Ref: {activeLoan.carrier_sms_reference || 'Airtel Verified'}
                    </p>
                  </div>
                )}
                {activeLoan.status === 'CUSTOMER_CANCELLED' && (
                  <p className="text-red-400 font-bold flex items-center space-x-1.5">
                    <XCircle className="w-4 h-4" />
                    <span>Transaction cancelled by borrower.</span>
                  </p>
                )}
              </div>

              {/* Reset Button when Done */}
              {(activeLoan.status === 'COMPLETED' || activeLoan.status === 'CUSTOMER_CANCELLED' || activeLoan.status === 'REJECTED') && (
                <button
                  onClick={() => {
                    setActiveLoan(null);
                    setPromptData(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition flex items-center justify-center space-x-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Make Another Payment</span>
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* REALTIME USSD CONFIRMATION MODAL (THE CORE USER EXPERIENCE) */}
      {/* ======================================================== */}
      {promptData && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-red-500 rounded-3xl max-w-sm w-full p-6 space-y-5 shadow-2xl shadow-red-950/80">
            {/* Header with Countdown Ring */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                <h3 className="font-black text-sm text-white uppercase tracking-wider">Confirm Recipient</h3>
              </div>
              <div className="flex items-center space-x-1 text-amber-400 font-mono font-bold text-sm bg-amber-950/60 px-2.5 py-1 rounded-full border border-amber-800">
                <Clock className="w-3.5 h-3.5" />
                <span>{countdown}s</span>
              </div>
            </div>

            {/* Recipient Verification Box */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="text-center pb-2 border-b border-slate-800/80">
                <span className="text-xs text-slate-400 uppercase font-semibold">
                  {promptData.flowType === 'SEND_MONEY' ? 'Sending To' : 'Withdrawing From'}
                </span>
                <p className="text-lg font-black text-white mt-0.5 tracking-wide">
                  {promptData.recipientName}
                </p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {promptData.flowType === 'SEND_MONEY' ? promptData.recipientPhone : `Agent ${promptData.agentNumber}`}
                </p>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Transfer Amount:</span>
                <span className="font-bold text-emerald-400 text-sm">ZMW {promptData.amount.toFixed(2)}</span>
              </div>

              {promptData.transactionFee > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Carrier Fee:</span>
                  <span className="font-bold text-amber-400">ZMW {promptData.transactionFee.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Live USSD Raw Text Banner */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 text-[10px] text-slate-400 font-mono border border-slate-800/80 leading-relaxed">
              &ldquo;{promptData.rawText}&rdquo;
            </div>

            {/* Confirmation Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => handleDecision('CANCEL', 'Borrower clicked Cancel on prompt.')}
                className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition"
              >
                Cancel Transfer
              </button>
              <button
                onClick={() => handleDecision('CONFIRM')}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-black text-white shadow-lg shadow-red-900/60 transition"
              >
                Confirm &amp; Disburse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="p-4 text-center text-[11px] text-slate-500 border-t border-slate-900">
        Instapay Microfinance Partner Network • Airtel Money Zambia (*115#)
      </footer>
    </div>
  );
}
