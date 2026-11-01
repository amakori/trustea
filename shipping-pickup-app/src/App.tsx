import React, { useState, useEffect } from 'react';
import {
  Truck,
  MapPin,
  Phone,
  Package,
  Utensils,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertCircle,
  RotateCcw,
  Plus,
  Navigation,
  FileCheck2,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import {
  socket,
  fetchShippingOrders,
  fetchShippingOrderById,
  submitShippingPickup,
  createShippingOrder
} from './api';
import { PhotoCapture, CapturedPhoto } from './components/PhotoCapture';
import { SignaturePad } from './components/SignaturePad';

export default function App() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [activeMode, setActiveMode] = useState<'ALL' | 'GOV_FOOD_DELIVERY' | 'TRUSTEA_P2P'>('GOV_FOOD_DELIVERY');
  const [loading, setLoading] = useState(true);

  // Verification Form State
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [signatureData, setSignatureData] = useState<string>('');
  const [signatoryName, setSignatoryName] = useState<string>('');
  const [riderNotes, setRiderNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<any>(null);

  // Manual / New Order Modal
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({
    mode: 'GOV_FOOD_DELIVERY',
    sender_name: 'UTH Canteen Section',
    sender_phone: '+260977223344',
    sender_location: 'UTH Nationalist Rd, Lusaka',
    sender_facility: 'Kitchen Block B',
    recipient_name: 'Banda M.',
    recipient_phone: '+260971556677',
    recipient_location: 'Civic Center, Lusaka',
    recipient_facility: 'Local Govt 3rd Floor',
    item_title: 'Lunch Pack',
    item_description: 'Double portion chicken & nshima',
    item_category: 'Food Delivery',
    declared_value: 120,
    delivery_fee: 30,
    special_instructions: 'Keep warm'
  });

  const loadOrders = async () => {
    try {
      const data = await fetchShippingOrders();
      setOrders(data);
      if (data.length > 0 && !selectedOrder) {
        // Pre-select first matching order
        const preselect = data.find((o: any) => o.mode === 'GOV_FOOD_DELIVERY') || data[0];
        selectOrder(preselect);
      }
    } catch (err) {
      console.error('Failed to load shipping orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();

    socket.on('shipping:order_updated', (updated: any) => {
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      if (selectedOrder?.id === updated.id) {
        setSelectedOrder(updated);
      }
    });

    socket.on('shipping:order_created', (newOrder: any) => {
      setOrders((prev) => [newOrder, ...prev]);
    });

    return () => {
      socket.off('shipping:order_updated');
      socket.off('shipping:order_created');
    };
  }, [selectedOrder]);

  const selectOrder = (order: any) => {
    setSelectedOrder(order);
    setPhotos(order.collected_photos || []);
    setSignatureData(order.sender_signature_data || '');
    setSignatoryName(order.sender_signatory_name || order.sender_name || '');
    setRiderNotes('');
    setErrorMessage(null);
    setSuccessReceipt(order.status === 'PICKED_UP_IN_TRANSIT' ? order : null);
  };

  const handleAddPhoto = (photo: CapturedPhoto) => {
    setPhotos((prev) => [...prev, photo]);
    setErrorMessage(null);
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmitPickup = async () => {
    if (!selectedOrder) return;
    if (photos.length === 0) {
      setErrorMessage('Please capture at least one verification photo of the package/food before proceeding.');
      return;
    }
    if (!signatureData) {
      setErrorMessage('Sender signature is required on the signature pad to confirm physical handover.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await submitShippingPickup(selectedOrder.id, {
        photos,
        signature_data: signatureData,
        signatory_name: signatoryName || selectedOrder.sender_name,
        rider_notes: riderNotes
      });

      if (res.success) {
        setSelectedOrder(res.order);
        setSuccessReceipt(res.order);
      } else {
        setErrorMessage(res.error || 'Failed to record pickup handover.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error communicating with dispatch server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createShippingOrder(newOrderForm);
      if (res.success) {
        setShowNewOrderModal(false);
        selectOrder(res.order);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (activeMode === 'ALL') return true;
    return o.mode === activeMode;
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-400 font-medium text-sm">Connecting to Trustea Shipping Dispatch...</p>
        </div>
      </div>
    );
  }

  const isFoodDelivery = selectedOrder?.mode === 'GOV_FOOD_DELIVERY';

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-950 flex flex-col justify-between text-slate-100 font-sans shadow-2xl">
      {/* Rider Header Bar */}
      <header className="px-5 pt-5 pb-4 bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center font-black text-white shadow-md shadow-sky-900/50">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Trustea Shipping Pickup</h1>
              <p className="text-[10px] text-slate-400">Rider App • Kelvin Musonda (Tuk-Tuk #14)</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>GPS Online</span>
            </span>
          </div>
        </div>

        {/* Delivery Mode Toggle Tabs */}
        <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveMode('GOV_FOOD_DELIVERY')}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
              activeMode === 'GOV_FOOD_DELIVERY'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Gov Food (UTH ➔ Civic)</span>
          </button>
          <button
            onClick={() => setActiveMode('TRUSTEA_P2P')}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
              activeMode === 'TRUSTEA_P2P'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-900/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Trustea Escrow (P2P)</span>
          </button>
        </div>

        {/* Order Selector Dropdown */}
        <div className="mt-3 flex items-center space-x-2">
          <div className="relative flex-1">
            <select
              value={selectedOrder?.id || ''}
              onChange={(e) => {
                const found = orders.find((o) => o.id === e.target.value);
                if (found) selectOrder(found);
              }}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white appearance-none pr-8 focus:outline-none focus:border-sky-500"
            >
              {filteredOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number}: {o.item_title} ({o.status === 'PICKED_UP_IN_TRANSIT' ? 'IN TRANSIT' : 'READY'})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={() => setShowNewOrderModal(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Create Custom Order"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 px-4 py-4 space-y-4">
        {selectedOrder ? (
          <>
            {/* SUCCESS / IN TRANSIT MANIFEST CARD */}
            {successReceipt ? (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-800/80 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      PICKUP CONFIRMED • IN TRANSIT
                    </span>
                    <span className="font-mono text-xs text-slate-400">{successReceipt.order_number}</span>
                  </div>

                  <div className="text-center py-2">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                    <h2 className="text-lg font-black text-white">Item Handed Over to Rider</h2>
                    <p className="text-xs text-slate-300 mt-1">
                      Signed by: <strong className="text-white">{successReceipt.sender_signatory_name}</strong>
                    </p>
                  </div>

                  {/* Captured Signature & Photos Preview */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Sender Signature</span>
                      {successReceipt.sender_signature_data && (
                        <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 max-h-20 flex items-center justify-center">
                          <img src={successReceipt.sender_signature_data} alt="Sender Signature" className="max-h-16" />
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                        Verified Photos ({successReceipt.collected_photos?.length || 0})
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {successReceipt.collected_photos?.map((p: any) => (
                          <div key={p.id} className="rounded-lg overflow-hidden border border-slate-800 aspect-video">
                            <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                      <div className="flex justify-between">
                        <span>Pickup Timestamp:</span>
                        <span className="font-mono text-slate-200">
                          {new Date(successReceipt.picked_up_at || Date.now()).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Delivery Corridor:</span>
                        <span className="text-sky-400 font-medium">UTH ➔ Civic Center (Independence Ave)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Delivery Fee:</span>
                        <span className="font-bold text-emerald-400">ZMW {successReceipt.delivery_fee?.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSuccessReceipt(null)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition flex items-center justify-center space-x-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>View / Update Inspection</span>
                  </button>
                </div>
              </div>
            ) : (
              /* ACTIVE PICKUP INSPECTION & HANDOVER FORM */
              <div className="space-y-4">
                {/* Order Details & Route Card */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        isFoodDelivery
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-red-950 text-red-400 border border-red-800'
                      }`}
                    >
                      {isFoodDelivery ? '🍱 GOV FOOD DELIVERY' : '📦 TRUSTEA ESCROW P2P'}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-400">{selectedOrder.order_number}</span>
                  </div>

                  <div>
                    <h2 className="text-base font-black text-white">{selectedOrder.item_title}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedOrder.item_description}</p>
                  </div>

                  {/* Route Corridor Visualizer */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3">
                    <div className="flex items-start space-x-2.5">
                      <div className="mt-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-950 flex-shrink-0" />
                      <div className="flex-1">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Pickup (Sender)</span>
                        <p className="font-bold text-white">{selectedOrder.sender_name}</p>
                        <p className="text-slate-400 text-[11px]">{selectedOrder.sender_location}</p>
                        {selectedOrder.sender_facility && (
                          <p className="text-emerald-400 text-[10px] font-medium">{selectedOrder.sender_facility}</p>
                        )}
                        <a
                          href={`tel:${selectedOrder.sender_phone}`}
                          className="inline-flex items-center space-x-1 text-sky-400 text-[11px] font-mono mt-1 hover:underline"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{selectedOrder.sender_phone}</span>
                        </a>
                      </div>
                    </div>

                    <div className="border-l-2 border-dashed border-slate-800 ml-1.5 pl-4 py-1 text-[10px] text-slate-500 font-mono">
                      Corridor: Independence Ave &bull; 4.8 km &bull; ~12 mins
                    </div>

                    <div className="flex items-start space-x-2.5">
                      <div className="mt-0.5 w-3 h-3 rounded-full bg-sky-500 ring-4 ring-sky-950 flex-shrink-0" />
                      <div className="flex-1">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Destination (Delivery)</span>
                        <p className="font-bold text-white">{selectedOrder.recipient_name}</p>
                        <p className="text-slate-400 text-[11px]">{selectedOrder.recipient_location}</p>
                        {selectedOrder.recipient_facility && (
                          <p className="text-sky-400 text-[10px] font-medium">{selectedOrder.recipient_facility}</p>
                        )}
                        <a
                          href={`tel:${selectedOrder.recipient_phone}`}
                          className="inline-flex items-center space-x-1 text-sky-400 text-[11px] font-mono mt-1 hover:underline"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{selectedOrder.recipient_phone}</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Handling Notes & Fee */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-400">Delivery Fee:</span>
                    <span className="font-bold text-emerald-400">ZMW {selectedOrder.delivery_fee?.toFixed(2)}</span>
                  </div>
                  {selectedOrder.special_instructions && (
                    <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-900/60 text-[11px] text-amber-200">
                      <strong>Handling:</strong> {selectedOrder.special_instructions}
                    </div>
                  )}
                </div>

                {/* STEP 1: ITEM INSPECTION PHOTOS */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <PhotoCapture
                    photos={photos}
                    onAddPhoto={handleAddPhoto}
                    onRemovePhoto={handleRemovePhoto}
                    isFoodDelivery={isFoodDelivery}
                  />
                </div>

                {/* STEP 2: SENDER DIGITAL TOUCH SIGNATURE */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <SignaturePad
                    onSignatureCapture={(dataUrl) => setSignatureData(dataUrl)}
                    senderName={selectedOrder.sender_name}
                  />

                  <div>
                    <label className="text-[11px] text-slate-400 font-bold block mb-1">Sender Signatory Name</label>
                    <input
                      type="text"
                      value={signatoryName}
                      onChange={(e) => setSignatoryName(e.target.value)}
                      placeholder={selectedOrder.sender_name}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-200 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* STEP 3: CONFIRM HANDOVER BUTTON */}
                <button
                  onClick={handleSubmitPickup}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 font-black text-sm text-white shadow-xl shadow-sky-900/60 transition flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <span>Confirm Pickup &amp; Start Transit</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center text-slate-500 text-xs">No order selected</div>
        )}
      </main>

      {/* Manual / New Order Modal */}
      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Add New Pickup Order</h3>
              <button onClick={() => setShowNewOrderModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewOrder} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Mode</label>
                <select
                  value={newOrderForm.mode}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, mode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="GOV_FOOD_DELIVERY">Gov Food Delivery (UTH ➔ Civic Center)</option>
                  <option value="TRUSTEA_P2P">Trustea Escrow P2P Delivery</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Item Title</label>
                <input
                  type="text"
                  value={newOrderForm.item_title}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, item_title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Sender Name</label>
                  <input
                    type="text"
                    value={newOrderForm.sender_name}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, sender_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Sender Phone</label>
                  <input
                    type="text"
                    value={newOrderForm.sender_phone}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, sender_phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Pickup Facility / Location</label>
                <input
                  type="text"
                  value={newOrderForm.sender_location}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, sender_location: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Recipient Name</label>
                  <input
                    type="text"
                    value={newOrderForm.recipient_name}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, recipient_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Recipient Phone</label>
                  <input
                    type="text"
                    value={newOrderForm.recipient_phone}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, recipient_phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Destination Facility / Room</label>
                <input
                  type="text"
                  value={newOrderForm.recipient_location}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, recipient_location: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 font-bold text-white transition mt-2"
              >
                Create Pre-filled Pickup
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="p-3 text-center text-[10px] text-slate-500 border-t border-slate-900">
        Trustea Shipping Dispatch • Lusaka Central Network
      </footer>
    </div>
  );
}
