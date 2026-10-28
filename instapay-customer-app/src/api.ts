import { io, Socket } from 'socket.io-client';

const HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:3001';

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
