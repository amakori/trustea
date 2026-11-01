import { io, Socket } from 'socket.io-client';

const HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:3001';

export const socket: Socket = io(HUB_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
});

export async function fetchShippingOrders(mode?: string) {
  const url = mode ? `${HUB_URL}/api/shipping/orders?mode=${mode}` : `${HUB_URL}/api/shipping/orders`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchShippingOrderById(id: string) {
  const res = await fetch(`${HUB_URL}/api/shipping/orders/${id}`);
  if (!res.ok) throw new Error('Order not found');
  return res.json();
}

export async function createShippingOrder(orderData: any) {
  const res = await fetch(`${HUB_URL}/api/shipping/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData),
  });
  return res.json();
}

export async function submitShippingPickup(orderId: string, payload: {
  photos: Array<{ id: string; url: string; label: string; timestamp: string }>;
  signature_data: string;
  signatory_name: string;
  rider_notes?: string;
}) {
  const res = await fetch(`${HUB_URL}/api/shipping/orders/${orderId}/pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}
