import { io, Socket } from 'socket.io-client';

const HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:3001';

export type FulfilmentLocation = {
  id: string;
  label: string;
  address: string;
};

export type FulfilmentRecord = {
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
  photos: string[];
  events: Array<{ id: number; event_type: string; description: string; created_at: string }>;
  shipday_tracking_url?: string | null;
  shipday_status?: string | null;
  driver_location?: { latitude: number; longitude: number; updated_at: string } | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  parcel_received_at?: string | null;
  return_window_ends_at?: string | null;
  seller_paid_at?: string | null;
};

async function fulfilmentRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${HUB_URL}/api/fulfilment${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `Fulfilment request failed (${response.status}).`);
  }
  return result as T;
}

export function fetchFulfilmentConfig() {
  return fulfilmentRequest<{ insurance_rate_pct: number; return_window_hours: number }>('/config');
}

export function fetchFulfilmentLocations() {
  return fulfilmentRequest<FulfilmentLocation[]>('/locations');
}

export function createFulfilmentTransaction(payload: {
  buyer_name: string;
  buyer_phone: string;
  seller_phone: string;
}) {
  return fulfilmentRequest<{ transaction_id: string; buyer_url: string; status: string }>('/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchFulfilmentTransaction(id: string, token: string) {
  return fulfilmentRequest<FulfilmentRecord>(
    `/transactions/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
  );
}

export function submitSellerResponse(id: string, token: string, payload: {
  seller_name: string;
  description: string;
  item_value: number;
  origin: { source: 'saved'; location_id: string } | { source: 'device'; latitude: number; longitude: number };
  photos: string[];
}) {
  return fulfilmentRequest<{ success: boolean; transaction: FulfilmentRecord }>(
    `/transactions/${encodeURIComponent(id)}/seller-response?token=${encodeURIComponent(token)}`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function submitFulfilmentCheckout(id: string, token: string, payload: {
  destination: { source: 'saved'; location_id: string } | { source: 'device'; latitude: number; longitude: number };
  salary_deduction_amount: number;
  salary_deduction_consent: boolean;
}) {
  return fulfilmentRequest<{ success: boolean; status: string }>(
    `/transactions/${encodeURIComponent(id)}/checkout?token=${encodeURIComponent(token)}`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function confirmFulfilmentReceipt(id: string, token: string) {
  return fulfilmentRequest<{ success: boolean; status: string; return_window_ends_at: string }>(
    `/transactions/${encodeURIComponent(id)}/receipt?token=${encodeURIComponent(token)}`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function requestFulfilmentReturn(id: string, token: string) {
  return fulfilmentRequest<{ success: boolean; status: string }>(
    `/transactions/${encodeURIComponent(id)}/return?token=${encodeURIComponent(token)}`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export const socket: Socket = io(HUB_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
});

export async function submitLoanApplication(payload: {
  borrower_phone: string;
  borrower_name: string;
  amount: number;
  loan_type: 'SEND_MONEY' | 'GET_CASH';
  recipient_phone?: string;
  agent_number?: string;
}) {
  const res = await fetch(`${HUB_URL}/api/loan/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function submitPromptConfirmation(payload: {
  loanId: string;
  decision: 'CONFIRM' | 'CANCEL';
  reason?: string;
}) {
  const res = await fetch(`${HUB_URL}/api/loan/confirm-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchBorrowerData(phone: string) {
  const res = await fetch(`${HUB_URL}/api/mfi/borrowers`);
  const borrowers = await res.json();
  return borrowers.find((b: any) => b.phone_number === phone) || null;
}
