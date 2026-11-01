import { io, Socket } from 'socket.io-client';

const HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:3001';

export const socket: Socket = io(HUB_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
});

export async function fetchCollateralPickups() {
  const res = await fetch(`${HUB_URL}/api/collateral/pickups`);
  return res.json();
}

export async function fetchCollateralById(id: string) {
  const res = await fetch(`${HUB_URL}/api/collateral/pickups/${id}`);
  if (!res.ok) throw new Error('Collateral item not found');
  return res.json();
}

export async function evaluateCollateralValuation(payload: any) {
  const res = await fetch(`${HUB_URL}/api/collateral/valuate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function createCollateralAppraisal(payload: any) {
  const res = await fetch(`${HUB_URL}/api/collateral/appraisal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function executeCollateralPickup(id: string, payload: {
  photos: Array<{ id: string; url: string; label: string; timestamp: string }>;
  signature_data: string;
  rider_notes?: string;
}) {
  const res = await fetch(`${HUB_URL}/api/collateral/pickups/${id}/pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}
