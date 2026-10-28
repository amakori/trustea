import { createHash, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'crypto';
import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from './supabaseClient';

type Role = 'buyer' | 'seller';
type LocationInput =
  | { source: 'saved'; location_id: string }
  | { source: 'device'; latitude: number; longitude: number };

class FulfilmentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function route(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

function db() {
  if (!supabaseAdmin) {
    throw new FulfilmentError(503, 'Fulfilment is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the hub.');
  }
  return supabaseAdmin;
}

function requireText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new FulfilmentError(400, `Enter a valid ${name}.`);
  }
  return value.trim();
}

function normalizePhone(value: unknown, name: string): string {
  const phone = requireText(value, name, 20);
  if (!/^\+?[0-9 ()-]{7,20}$/.test(phone) || phone.replace(/\D/g, '').length < 7) {
    throw new FulfilmentError(400, `Enter a valid ${name}.`);
  }
  return phone.replace(/[ ()-]/g, '');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function encryptionKey(): Buffer {
  const configured = process.env.FULFILMENT_TOKEN_ENCRYPTION_KEY;
  if (!configured || configured.length < 32) {
    throw new FulfilmentError(503, 'Set FULFILMENT_TOKEN_ENCRYPTION_KEY to a secret of at least 32 characters.');
  }
  return createHash('sha256').update(configured).digest();
}

function encryptToken(token: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

function decryptToken(value: string): string {
  const [nonce, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  if (!nonce || !tag || !ciphertext) throw new FulfilmentError(500, 'The transaction link could not be restored.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function equalHash(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function getPublicUrl(): string {
  return (process.env.FULFILMENT_APP_URL || 'http://localhost:3003').replace(/\/+$/, '');
}

function participantUrl(id: string, token: string): string {
  const url = new URL(`${getPublicUrl()}/fulfilment`);
  url.searchParams.set('transaction', id);
  url.searchParams.set('token', token);
  return url.toString();
}

async function queueSms(phone: string, message: string, transactionId: string, smsType: string): Promise<void> {
  const { error } = await db().from('send_sms').insert({
    recipient: phone,
    phone,
    message,
    processed: false,
    status: 'pending',
    sms_type: smsType,
    metadata: { transaction_id: transactionId }
  });
  if (error) {
    console.error('[Fulfilment] Failed to queue SMS:', error.message);
    throw new FulfilmentError(502, 'The transaction was saved, but its SMS could not be queued. Please retry.');
  }
}

async function addEvent(transactionId: string, eventType: string, description: string): Promise<void> {
  const { error } = await db().from('fulfilment_events').insert({
    transaction_id: transactionId,
    event_type: eventType,
    description
  });
  if (error) {
    console.error('[Fulfilment] Failed to save event:', error.message);
    throw new FulfilmentError(502, 'The transaction changed, but its activity could not be saved.');
  }
}

async function loadTransaction(id: string): Promise<any> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FulfilmentError(400, 'Invalid transaction link.');
  const { data, error } = await db().from('fulfilment_transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw new FulfilmentError(502, 'Could not load this transaction.');
  if (!data) throw new FulfilmentError(404, 'This transaction link is no longer available.');
  return data;
}

async function authorizeParticipant(req: Request): Promise<{ transaction: any; role: Role }> {
  const id = requireText(req.params.id, 'transaction link', 80);
  const token = requireText(req.query.token, 'private transaction link', 200);
  const transaction = await loadTransaction(id);
  const hash = tokenHash(token);
  if (equalHash(hash, transaction.buyer_token_hash)) return { transaction, role: 'buyer' };
  if (equalHash(hash, transaction.seller_token_hash)) return { transaction, role: 'seller' };
  throw new FulfilmentError(403, 'This private transaction link is invalid.');
}

async function resolveLocation(input: LocationInput): Promise<any> {
  if (!input || (input.source !== 'saved' && input.source !== 'device')) {
    throw new FulfilmentError(400, 'Choose a saved location or share your device location.');
  }
  if (input.source === 'saved') {
    if (!/^[0-9a-f-]{36}$/i.test(input.location_id)) throw new FulfilmentError(400, 'Choose a valid saved location.');
    const { data, error } = await db().from('fulfilment_locations')
      .select('id, label, address, latitude, longitude')
      .eq('id', input.location_id)
      .eq('active', true)
      .maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not load the selected saved location.');
    if (!data) throw new FulfilmentError(400, 'That saved location is no longer available.');
    return { ...data, source: 'saved' };
  }
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new FulfilmentError(400, 'Share a valid device location.');
  }
  return {
    label: 'Current device location',
    address: `Current device location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
    latitude,
    longitude,
    source: 'device'
  };
}

function safeTransaction(transaction: any, role: Role, photos: string[], events: any[]) {
  const { buyer_phone, seller_phone, buyer_name, buyer_token_hash, seller_token_hash, buyer_token_ciphertext, seller_token_ciphertext, photo_paths, ...shared } = transaction;
  return {
    ...shared,
    buyer_name: role === 'buyer' ? buyer_name : undefined,
    role,
    phone: role === 'buyer' ? buyer_phone : seller_phone,
    origin: role === 'seller' ? transaction.origin : undefined,
    destination: role === 'buyer' ? transaction.destination : undefined,
    photos,
    events
  };
}

async function transactionView(transaction: any, role: Role) {
  let photos: string[] = [];
  if (transaction.photo_paths?.length) {
    const { data, error } = await db().storage.from('fulfilment-photos')
      .createSignedUrls(transaction.photo_paths, 900);
    if (error) throw new FulfilmentError(502, 'Could not load item photos.');
    photos = (data || []).flatMap(item => item.signedUrl ? [item.signedUrl] : []);
  }
  const { data: events, error } = await db().from('fulfilment_events')
    .select('id, event_type, description, created_at')
    .eq('transaction_id', transaction.id)
    .order('created_at', { ascending: true });
  if (error) throw new FulfilmentError(502, 'Could not load transaction activity.');
  return safeTransaction(transaction, role, photos, events || []);
}

async function checkReturnWindow(transaction: any): Promise<any> {
  if (transaction.status !== 'return_window' || !transaction.return_window_ends_at ||
      new Date(transaction.return_window_ends_at).getTime() > Date.now()) return transaction;

  const now = new Date().toISOString();
  const { data, error } = await db().from('fulfilment_transactions')
    .update({ status: 'settlement_due', updated_at: now })
    .eq('id', transaction.id)
    .eq('status', 'return_window')
    .select('*')
    .maybeSingle();
  if (error) throw new FulfilmentError(502, 'Could not close the return window.');
  if (!data) return loadTransaction(transaction.id);

  await addEvent(transaction.id, 'return_window_ended', 'The 24-hour return window ended. Seller settlement and loan origination are ready for MFI review.');
  const buyerUrl = participantUrl(data.id, decryptToken(data.buyer_token_ciphertext));
  const sellerUrl = participantUrl(data.id, decryptToken(data.seller_token_ciphertext));
  await Promise.all([
    queueSms(data.buyer_phone, `The return window for transaction ${data.id.slice(0, 8)} has ended. Settlement is ready for final confirmation: ${buyerUrl}`, data.id, 'return_window_ended'),
    queueSms(data.seller_phone, `The return window for transaction ${data.id.slice(0, 8)} has ended. Settlement is ready for final confirmation: ${sellerUrl}`, data.id, 'return_window_ended')
  ]);
  return data;
}

function shipdayPhone(phone: string): string {
  if (phone.startsWith('+')) return phone;
  if (phone.startsWith('0')) return `+260${phone.slice(1)}`;
  if (phone.startsWith('260')) return `+${phone}`;
  return phone;
}

async function createShipdayOrder(transaction: any): Promise<{ orderId: string; trackingId: string | null; trackingUrl: string | null }> {
  const apiKey = process.env.SHIPDAY_API_KEY;
  if (!apiKey) throw new FulfilmentError(503, 'Shipday is not configured. Set SHIPDAY_API_KEY before approving a delivery.');
  const apiUrl = process.env.SHIPDAY_ORDERS_URL || 'https://api.shipday.com/orders';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      Authorization: `Basic ${apiKey}`
    },
    body: JSON.stringify({
      orderNumber: transaction.id,
      customerName: transaction.buyer_name,
      customerAddress: transaction.destination.address,
      customerPhoneNumber: shipdayPhone(transaction.buyer_phone),
      restaurantName: transaction.seller_name,
      restaurantAddress: transaction.origin.address,
      restaurantPhoneNumber: shipdayPhone(transaction.seller_phone),
      pickupLatitude: transaction.origin.latitude,
      pickupLongitude: transaction.origin.longitude,
      deliveryLatitude: transaction.destination.latitude,
      deliveryLongitude: transaction.destination.longitude,
      orderItem: [{ name: transaction.item_description, quantity: 1, unitPrice: Number(transaction.item_value) }],
      deliveryFee: 0,
      tax: 0,
      tips: 0,
      totalOrderCost: Number(transaction.item_value),
      paymentMethod: 'ONLINE',
      pickupInstruction: 'Collect the securely packed Trustea parcel from the seller.',
      deliveryInstruction: 'Deliver to the buyer. Do not disclose either party’s phone number.'
    })
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || payload?.success === false) {
    console.error('[Fulfilment] Shipday order creation failed:', response.status, payload);
    throw new FulfilmentError(502, 'Shipday could not accept this delivery. No delivery was marked as booked.');
  }
  const orderId = payload?.orderId ?? payload?.id;
  if (orderId === undefined || orderId === null) {
    throw new FulfilmentError(502, 'Shipday returned no order ID. The delivery was not marked as booked.');
  }
  return {
    orderId: String(orderId),
    trackingId: payload?.trackingId ? String(payload.trackingId) : null,
    trackingUrl: payload?.trackingLink || payload?.trackingUrl
      ? String(payload.trackingLink || payload.trackingUrl)
      : null
  };
}

async function participantSms(transaction: any, buyerMessage: string, sellerMessage: string, smsType: string): Promise<void> {
  const buyerUrl = participantUrl(transaction.id, decryptToken(transaction.buyer_token_ciphertext));
  const sellerUrl = participantUrl(transaction.id, decryptToken(transaction.seller_token_ciphertext));
  await Promise.all([
    queueSms(transaction.buyer_phone, `${buyerMessage} ${buyerUrl}`, transaction.id, smsType),
    queueSms(transaction.seller_phone, `${sellerMessage} ${sellerUrl}`, transaction.id, smsType)
  ]);
}

async function requireMfiOperator(req: Request): Promise<{ id: string }> {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new FulfilmentError(401, 'Sign in with an MFI operator account.');
  const { data, error } = await db().auth.getUser(match[1]);
  if (error || !data.user || data.user.app_metadata?.role !== 'mfi_operator') {
    throw new FulfilmentError(403, 'Only an authorized MFI operator can access fulfilment loans.');
  }
  return { id: data.user.id };
}

export function createFulfilmentRouter(io: SocketIOServer): Router {
  const router = Router();

  router.get('/config', route(async (_req, res) => {
    res.json({
      insurance_rate_pct: Number(process.env.FULFILMENT_INSURANCE_RATE_PCT || 2),
      return_window_hours: 24
    });
  }));

  router.get('/locations', route(async (_req, res) => {
    const { data, error } = await db().from('fulfilment_locations')
      .select('id, label, address')
      .eq('active', true)
      .order('label');
    if (error) throw new FulfilmentError(502, 'Could not load saved locations.');
    res.json(data || []);
  }));

  router.post('/transactions', route(async (req, res) => {
    const buyerName = requireText(req.body.buyer_name, 'buyer name', 100);
    const buyerPhone = normalizePhone(req.body.buyer_phone, 'buyer phone number');
    const sellerPhone = normalizePhone(req.body.seller_phone, 'seller phone number');
    const id = uuidv4();
    const buyerToken = randomBytes(32).toString('base64url');
    const sellerToken = randomBytes(32).toString('base64url');
    const insuranceRate = Number(process.env.FULFILMENT_INSURANCE_RATE_PCT || 2);
    if (!Number.isFinite(insuranceRate) || insuranceRate < 0 || insuranceRate > 100) {
      throw new FulfilmentError(503, 'The configured insurance rate is invalid.');
    }

    const record = {
      id,
      buyer_token_hash: tokenHash(buyerToken),
      seller_token_hash: tokenHash(sellerToken),
      buyer_token_ciphertext: encryptToken(buyerToken),
      seller_token_ciphertext: encryptToken(sellerToken),
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      seller_phone: sellerPhone,
      insurance_rate_pct: insuranceRate,
      status: 'seller_response_pending'
    };
    const { data, error } = await db().from('fulfilment_transactions').insert(record).select('*').single();
    if (error) {
      console.error('[Fulfilment] Could not create transaction:', error.message);
      throw new FulfilmentError(502, 'Could not create the transaction.');
    }
    await addEvent(id, 'created', 'The buyer started a private transaction and invited the seller.');
    const sellerUrl = participantUrl(id, sellerToken);
    try {
      await queueSms(sellerPhone, `A buyer has invited you to complete a Trustea transaction. Add the item details and pickup location here: ${sellerUrl}`, id, 'seller_invitation');
    } catch (error) {
      await db().from('fulfilment_transactions').delete().eq('id', id);
      throw error;
    }
    res.status(201).json({
      transaction_id: data.id,
      buyer_url: participantUrl(id, buyerToken),
      status: data.status
    });
  }));

  router.get('/transactions/:id', route(async (req, res) => {
    const { transaction: loaded, role } = await authorizeParticipant(req);
    const transaction = await checkReturnWindow(loaded);
    res.json(await transactionView(transaction, role));
  }));

  router.post('/transactions/:id/seller-response', route(async (req, res) => {
    const { transaction, role } = await authorizeParticipant(req);
    if (role !== 'seller') throw new FulfilmentError(403, 'Only the seller can add item details.');
    if (transaction.status !== 'seller_response_pending') throw new FulfilmentError(409, 'The seller response has already been submitted.');
    const sellerName = requireText(req.body.seller_name, 'seller name', 100);
    const description = requireText(req.body.description, 'item description', 500);
    const itemValue = Number(req.body.item_value);
    if (!Number.isFinite(itemValue) || itemValue <= 0 || itemValue > 1000000) {
      throw new FulfilmentError(400, 'Enter a valid item value in ZMW.');
    }
    const origin = await resolveLocation(req.body.origin as LocationInput);
    const photos = Array.isArray(req.body.photos) ? req.body.photos : [];
    if (photos.length > 4) throw new FulfilmentError(400, 'Add no more than four item photos.');

    const photoPaths: string[] = [];
    let totalPhotoBytes = 0;
    for (const photo of photos) {
      if (typeof photo !== 'string') throw new FulfilmentError(400, 'Each item photo must be an image.');
      const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(photo);
      if (!match) throw new FulfilmentError(400, 'Use JPG, PNG, or WebP item photos.');
      const buffer = Buffer.from(match[2], 'base64');
      totalPhotoBytes += buffer.length;
      if (buffer.length > 2 * 1024 * 1024 || totalPhotoBytes > 6 * 1024 * 1024) {
        throw new FulfilmentError(413, 'Item photos must be at most 2 MB each and 6 MB in total.');
      }
      const path = `${transaction.id}/${uuidv4()}.${match[1]}`;
      const { error } = await db().storage.from('fulfilment-photos').upload(path, buffer, {
        contentType: `image/${match[1]}`,
        upsert: false
      });
      if (error) {
        console.error('[Fulfilment] Photo upload failed:', error.message);
        throw new FulfilmentError(502, 'Could not securely upload an item photo.');
      }
      photoPaths.push(path);
    }

    const insurance = Math.round(itemValue * Number(transaction.insurance_rate_pct) * 100) / 10000;
    const { data, error } = await db().from('fulfilment_transactions').update({
      seller_name: sellerName,
      item_description: description,
      item_value: itemValue,
      insurance_amount: insurance,
      origin,
      photo_paths: photoPaths,
      status: 'buyer_checkout_pending',
      updated_at: new Date().toISOString()
    }).eq('id', transaction.id).eq('status', 'seller_response_pending').select('*').maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not save the seller response.');
    if (!data) throw new FulfilmentError(409, 'The transaction has already changed.');
    await addEvent(transaction.id, 'seller_responded', 'The seller added item details, declared value, photos, and pickup location.');
    const buyerUrl = participantUrl(data.id, decryptToken(data.buyer_token_ciphertext));
    await queueSms(data.buyer_phone, `The seller has responded to your Trustea transaction. Review the item and add your delivery location: ${buyerUrl}`, data.id, 'seller_responded');
    io.to(`fulfilment:${data.id}`).emit('fulfilment:updated', { transaction_id: data.id });
    res.json({ success: true, insurance_amount: insurance, transaction: await transactionView(data, role) });
  }));

  router.post('/transactions/:id/checkout', route(async (req, res) => {
    const { transaction, role } = await authorizeParticipant(req);
    if (role !== 'buyer') throw new FulfilmentError(403, 'Only the buyer can choose delivery and payment.');
    if (transaction.status !== 'buyer_checkout_pending') throw new FulfilmentError(409, 'This transaction is not waiting for buyer checkout.');
    if (req.body.salary_deduction_consent !== true) throw new FulfilmentError(400, 'Explicit salary-deduction consent is required.');
    const destination = await resolveLocation(req.body.destination as LocationInput);
    const amount = Number(req.body.salary_deduction_amount);
    const total = Number(transaction.item_value) + Number(transaction.insurance_amount);
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(total * 100)) {
      throw new FulfilmentError(400, `The salary-deduction amount must match the confirmed total of ZMW ${total.toFixed(2)}.`);
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await db().from('fulfilment_transactions').update({
      destination,
      salary_deduction_amount: amount,
      salary_deduction_consent_at: now,
      status: 'mfi_review',
      updated_at: now
    }).eq('id', transaction.id).eq('status', 'buyer_checkout_pending').select('*').maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not save the buyer checkout.');
    if (!updated) throw new FulfilmentError(409, 'The transaction has already changed.');

    const { error: loanError } = await db().from('fulfilment_loan_requests').insert({
      transaction_id: transaction.id,
      borrower_name: transaction.buyer_name,
      borrower_phone: transaction.buyer_phone,
      amount,
      consent_at: now
    });
    if (loanError) {
      await db().from('fulfilment_transactions').update({
        status: 'buyer_checkout_pending',
        destination: null,
        salary_deduction_amount: null,
        salary_deduction_consent_at: null,
        updated_at: new Date().toISOString()
      }).eq('id', transaction.id).eq('status', 'mfi_review');
      console.error('[Fulfilment] Could not create MFI loan request:', loanError.message);
      throw new FulfilmentError(502, 'Could not submit the salary-deduction request to the MFI.');
    }
    await addEvent(transaction.id, 'mfi_review', 'The buyer confirmed the delivery location and consented to salary deduction. The request is awaiting MFI review.');
    await queueSms(transaction.buyer_phone, `Your salary-deduction request for Trustea transaction ${transaction.id.slice(0, 8)} is with the MFI for review. We will message you when it is approved. ${participantUrl(transaction.id, decryptToken(transaction.buyer_token_ciphertext))}`, transaction.id, 'mfi_review');
    io.to(`fulfilment:${transaction.id}`).emit('fulfilment:updated', { transaction_id: transaction.id });
    res.json({ success: true, status: 'mfi_review' });
  }));

  router.post('/transactions/:id/receipt', route(async (req, res) => {
    const { transaction, role } = await authorizeParticipant(req);
    if (role !== 'buyer') throw new FulfilmentError(403, 'Only the buyer can confirm receipt.');
    if (transaction.status !== 'delivered') throw new FulfilmentError(409, 'Receipt can be confirmed after Shipday marks the parcel delivered.');
    const now = new Date();
    const ends = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const { data, error } = await db().from('fulfilment_transactions').update({
      status: 'return_window',
      parcel_received_at: now.toISOString(),
      return_window_ends_at: ends.toISOString(),
      updated_at: now.toISOString()
    }).eq('id', transaction.id).eq('status', 'delivered').select('*').maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not confirm parcel receipt.');
    if (!data) throw new FulfilmentError(409, 'The transaction has already changed.');
    await addEvent(transaction.id, 'parcel_received', 'The buyer confirmed receipt. The 24-hour return window has started.');
    await participantSms(
      data,
      `The buyer confirmed receipt of transaction ${data.id.slice(0, 8)}. The 24-hour return window ends ${ends.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC.`,
      `The buyer confirmed receipt of transaction ${data.id.slice(0, 8)}. The 24-hour return window ends ${ends.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC.`,
      'parcel_received'
    );
    io.to(`fulfilment:${data.id}`).emit('fulfilment:updated', { transaction_id: data.id });
    res.json({ success: true, status: data.status, return_window_ends_at: data.return_window_ends_at });
  }));

  router.post('/transactions/:id/return', route(async (req, res) => {
    const { transaction, role } = await authorizeParticipant(req);
    if (role !== 'buyer') throw new FulfilmentError(403, 'Only the buyer can request a return.');
    if (transaction.status !== 'return_window' || new Date(transaction.return_window_ends_at).getTime() <= Date.now()) {
      throw new FulfilmentError(409, 'The return window is no longer open.');
    }
    const { data, error } = await db().from('fulfilment_transactions').update({
      status: 'return_requested',
      updated_at: new Date().toISOString()
    }).eq('id', transaction.id).eq('status', 'return_window').select('*').maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not submit the return request.');
    if (!data) throw new FulfilmentError(409, 'The transaction has already changed.');
    await addEvent(transaction.id, 'return_requested', 'The buyer requested a return. Settlement is paused pending MFI review.');
    await participantSms(data, `The buyer requested a return for transaction ${data.id.slice(0, 8)}. Settlement is paused while the MFI reviews it.`, `A return was requested for transaction ${data.id.slice(0, 8)}. Settlement is paused while the MFI reviews it.`, 'return_requested');
    io.to(`fulfilment:${data.id}`).emit('fulfilment:updated', { transaction_id: data.id });
    res.json({ success: true, status: data.status });
  }));

  router.get('/mfi/loans', route(async (req, res) => {
    await requireMfiOperator(req);
    const { data: expiredWindows, error: expiryError } = await db().from('fulfilment_transactions')
      .select('*')
      .eq('status', 'return_window')
      .lte('return_window_ends_at', new Date().toISOString());
    if (expiryError) throw new FulfilmentError(502, 'Could not check fulfilment return windows.');
    for (const transaction of expiredWindows || []) await checkReturnWindow(transaction);

    const { data: loans, error } = await db().from('fulfilment_loan_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new FulfilmentError(502, 'Could not load fulfilment loan requests.');
    const ids = (loans || []).map(loan => loan.transaction_id);
    const { data: transactions, error: transactionError } = ids.length
      ? await db().from('fulfilment_transactions')
        .select('id, status, seller_name, item_description, item_value, insurance_amount, return_window_ends_at')
        .in('id', ids)
      : { data: [], error: null };
    if (transactionError) throw new FulfilmentError(502, 'Could not load the related transactions.');
    const byId = new Map((transactions || []).map(transaction => [transaction.id, transaction]));
    res.json((loans || []).flatMap(loan => {
      const transaction = byId.get(loan.transaction_id);
      return transaction ? [{ ...loan, transaction }] : [];
    }));
  }));

  router.post('/mfi/loans/:id/review', route(async (req, res) => {
    const operator = await requireMfiOperator(req);
    const decision = req.body.decision;
    if (decision !== 'approved' && decision !== 'rejected') throw new FulfilmentError(400, 'Choose approve or reject.');
    const { data: loan, error } = await db().from('fulfilment_loan_requests').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not load the loan request.');
    if (!loan || loan.status !== 'pending_mfi') throw new FulfilmentError(409, 'This MFI request has already been reviewed.');
    const transaction = await loadTransaction(loan.transaction_id);
    if (decision === 'approved') {
      if (transaction.status !== 'mfi_review') throw new FulfilmentError(409, 'This transaction is no longer awaiting MFI review.');
      const shipday = await createShipdayOrder(transaction);
      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await db().from('fulfilment_transactions').update({
        status: 'delivery_pending',
        shipday_order_id: shipday.orderId,
        shipday_tracking_id: shipday.trackingId,
        shipday_tracking_url: shipday.trackingUrl,
        shipday_status: 'ORDER_INSERTED',
        updated_at: now
      }).eq('id', transaction.id).eq('status', 'mfi_review').select('*').maybeSingle();
      if (updateError || !updated) throw new FulfilmentError(502, 'Shipday accepted the order, but the transaction could not be updated. Contact support before retrying.');
      const { error: loanUpdateError } = await db().from('fulfilment_loan_requests').update({
        status: 'approved',
        reviewed_at: now,
        reviewed_by: operator.id,
        review_note: typeof req.body.review_note === 'string' ? req.body.review_note.slice(0, 500) : null
      }).eq('id', loan.id).eq('status', 'pending_mfi');
      if (loanUpdateError) throw new FulfilmentError(502, 'Delivery was booked, but the MFI decision could not be saved.');
      await addEvent(transaction.id, 'delivery_booked', `The MFI approved the salary-deduction request and Shipday accepted order ${shipday.orderId}.`);
      await participantSms(
        updated,
        `Your salary-deduction request was approved and Shipday has accepted transaction ${updated.id.slice(0, 8)}. Tracking is available here.`,
        `Your package is approved for collection. Your payout will be ZMW ${Number(updated.item_value).toFixed(2)} after delivery and the 24-hour return window. Securely pack transaction ${updated.id.slice(0, 8)} and make it ready at your saved pickup location for Shipday collection. Tracking is available here.`,
        'delivery_booked'
      );
      io.to(`fulfilment:${updated.id}`).emit('fulfilment:updated', { transaction_id: updated.id });
      res.json({ success: true, status: 'approved' });
      return;
    }

    const reason = typeof req.body.review_note === 'string' ? req.body.review_note.trim().slice(0, 500) : '';
    const now = new Date().toISOString();
    const { error: loanUpdateError } = await db().from('fulfilment_loan_requests').update({
      status: 'rejected',
      reviewed_at: now,
      reviewed_by: operator.id,
      review_note: reason || null
    }).eq('id', loan.id).eq('status', 'pending_mfi');
    if (loanUpdateError) throw new FulfilmentError(502, 'Could not save the MFI decision.');
    const { data: updated, error: transactionUpdateError } = await db().from('fulfilment_transactions').update({
      status: 'cancelled',
      updated_at: now
    }).eq('id', transaction.id).eq('status', 'mfi_review').select('*').maybeSingle();
    if (transactionUpdateError || !updated) throw new FulfilmentError(502, 'Could not close the rejected transaction.');
    await addEvent(transaction.id, 'mfi_rejected', `The MFI declined the salary-deduction request${reason ? `: ${reason}` : '.'}`);
    await participantSms(updated, `The MFI declined the salary-deduction request for transaction ${updated.id.slice(0, 8)}. No loan was created.`, `The MFI declined transaction ${updated.id.slice(0, 8)}. No shipment is scheduled.`, 'mfi_rejected');
    io.to(`fulfilment:${updated.id}`).emit('fulfilment:updated', { transaction_id: updated.id });
    res.json({ success: true, status: 'rejected' });
  }));

  router.post('/mfi/loans/:id/return', route(async (req, res) => {
    await requireMfiOperator(req);
    const decision = req.body.decision;
    if (decision !== 'accepted' && decision !== 'declined') throw new FulfilmentError(400, 'Choose accept or decline.');
    const { data: loan, error } = await db().from('fulfilment_loan_requests').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not load the loan request.');
    if (!loan || loan.status !== 'approved') throw new FulfilmentError(409, 'This return cannot be resolved.');
    const transaction = await loadTransaction(loan.transaction_id);
    if (transaction.status !== 'return_requested') throw new FulfilmentError(409, 'This transaction has no pending return request.');
    const now = new Date().toISOString();
    const status = decision === 'accepted' ? 'returned' : 'return_window';
    const { data, error: updateError } = await db().from('fulfilment_transactions').update({
      status,
      updated_at: now
    }).eq('id', transaction.id).eq('status', 'return_requested').select('*').maybeSingle();
    if (updateError || !data) throw new FulfilmentError(502, 'Could not save the return decision.');
    if (decision === 'accepted') {
      const { error: loanError } = await db().from('fulfilment_loan_requests').update({ status: 'returned' }).eq('id', loan.id);
      if (loanError) throw new FulfilmentError(502, 'Return was recorded, but the MFI loan status could not be updated.');
    }
    await addEvent(transaction.id, decision === 'accepted' ? 'return_accepted' : 'return_declined', decision === 'accepted'
      ? 'The MFI accepted the return. Seller settlement and salary-loan origination were cancelled.'
      : 'The MFI declined the return request. The return window remains active.');
    await participantSms(
      data,
      decision === 'accepted' ? `The MFI accepted your return for transaction ${data.id.slice(0, 8)}. No salary loan will be created.` : `The MFI declined the return for transaction ${data.id.slice(0, 8)}. The return window remains active.`,
      decision === 'accepted' ? `The MFI accepted the return for transaction ${data.id.slice(0, 8)}. No seller settlement or salary loan will be created.` : `The MFI declined the return for transaction ${data.id.slice(0, 8)}. The return window remains active.`,
      decision === 'accepted' ? 'return_accepted' : 'return_declined'
    );
    io.to(`fulfilment:${data.id}`).emit('fulfilment:updated', { transaction_id: data.id });
    res.json({ success: true, status });
  }));

  router.post('/mfi/loans/:id/settle', route(async (req, res) => {
    const operator = await requireMfiOperator(req);
    const { data: loan, error } = await db().from('fulfilment_loan_requests').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not load the loan request.');
    if (!loan || loan.status !== 'approved') throw new FulfilmentError(409, 'This loan is not ready for settlement.');
    const transaction = await loadTransaction(loan.transaction_id);
    if (transaction.status !== 'settlement_due' ||
        !transaction.return_window_ends_at ||
        new Date(transaction.return_window_ends_at).getTime() > Date.now()) {
      throw new FulfilmentError(409, 'Settlement is available only after the 24-hour return window ends.');
    }

    let payoutReference = typeof req.body.payout_reference === 'string' ? req.body.payout_reference.trim() : '';
    const payoutUrl = process.env.FULFILMENT_SELLER_PAYOUT_URL;
    if (payoutUrl) {
      const response = await fetch(payoutUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.FULFILMENT_SELLER_PAYOUT_KEY
            ? { Authorization: `Bearer ${process.env.FULFILMENT_SELLER_PAYOUT_KEY}` }
            : {})
        },
        body: JSON.stringify({
          transaction_id: transaction.id,
          seller_phone: transaction.seller_phone,
          amount: Number(transaction.item_value),
          currency: 'ZMW'
        })
      });
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || !payload?.reference) {
        console.error('[Fulfilment] Seller payout failed:', response.status, payload);
        throw new FulfilmentError(502, 'The seller payout provider did not confirm payment. The loan was not originated.');
      }
      payoutReference = String(payload.reference);
    } else if (payoutReference.length < 3 || payoutReference.length > 120) {
      throw new FulfilmentError(400, 'Confirm the seller transfer and enter its payout reference before originating the loan.');
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await db().from('fulfilment_transactions').update({
      status: 'completed',
      payout_reference: payoutReference,
      seller_paid_at: now,
      updated_at: now
    }).eq('id', transaction.id).eq('status', 'settlement_due').select('*').maybeSingle();
    if (updateError || !updated) throw new FulfilmentError(409, 'This transaction has already been settled.');
    const { error: loanError } = await db().from('fulfilment_loan_requests').update({
      status: 'funded',
      payout_reference: payoutReference,
      funded_at: now,
      reviewed_by: operator.id
    }).eq('id', loan.id).eq('status', 'approved');
    if (loanError) throw new FulfilmentError(502, 'The seller was paid, but the MFI loan could not be marked as originated.');
    await addEvent(transaction.id, 'settled', `Seller payout ${payoutReference} was confirmed and the MFI salary-deduction loan was originated.`);
    await participantSms(updated, `Transaction ${updated.id.slice(0, 8)} is complete. Seller settlement is confirmed and your salary-deduction loan has been created.`, `Transaction ${updated.id.slice(0, 8)} is complete. Seller payout is confirmed.`, 'settled');
    io.to(`fulfilment:${updated.id}`).emit('fulfilment:updated', { transaction_id: updated.id });
    res.json({ success: true, status: updated.status });
  }));

  router.post('/shipday/webhook', route(async (req, res) => {
    const configuredToken = process.env.SHIPDAY_WEBHOOK_TOKEN;
    const suppliedToken = req.get('token') || '';
    if (!configuredToken) throw new FulfilmentError(503, 'Shipday webhook verification is not configured.');
    const expected = Buffer.from(configuredToken);
    const supplied = Buffer.from(suppliedToken);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new FulfilmentError(401, 'Invalid Shipday webhook token.');
    }
    const event = String(req.body?.event || '');
    if (event === 'LOCATION_UPDATE') {
      const orderId = req.body?.orderId;
      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);
      if (orderId === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new FulfilmentError(400, 'Shipday location update is missing a valid order ID or coordinates.');
      }
      const { data: transaction, error } = await db().from('fulfilment_transactions')
        .select('id, status')
        .eq('shipday_order_id', String(orderId))
        .maybeSingle();
      if (error) throw new FulfilmentError(502, 'Could not load the Shipday transaction.');
      if (!transaction) throw new FulfilmentError(404, 'No transaction matches this Shipday order.');
      if (transaction.status !== 'in_transit') {
        res.json({ success: true });
        return;
      }
      const timestamp = Number(req.body?.currentTimeStamp);
      const locationAt = Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toISOString()
        : new Date().toISOString();
      const { error: updateError } = await db().from('fulfilment_transactions').update({
        driver_location: { latitude, longitude, updated_at: locationAt },
        updated_at: new Date().toISOString()
      }).eq('id', transaction.id);
      if (updateError) throw new FulfilmentError(502, 'Could not save the driver location update.');
      io.to(`fulfilment:${transaction.id}`).emit('fulfilment:updated', { transaction_id: transaction.id });
      res.json({ success: true });
      return;
    }

    const orderNumber = req.body?.order?.orderNumber;
    if (typeof orderNumber !== 'string') throw new FulfilmentError(400, 'Shipday webhook is missing order.orderNumber.');
    const { data: transaction, error } = await db().from('fulfilment_transactions').select('*').eq('id', orderNumber).maybeSingle();
    if (error) throw new FulfilmentError(502, 'Could not load the Shipday transaction.');
    if (!transaction) throw new FulfilmentError(404, 'No transaction matches this Shipday order.');

    const shipdayStatus = String(req.body.order_status || '');
    let status = transaction.status;
    let pickedUpAt = transaction.picked_up_at;
    let deliveredAt = transaction.delivered_at;
    let notification: { buyer: string; seller: string; type: string; description: string } | null = null;
    const time = Number(req.body.timestamp);
    const eventAt = Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : new Date().toISOString();

    if (event === 'ORDER_PIKEDUP' && !transaction.picked_up_at) {
      status = 'in_transit';
      pickedUpAt = eventAt;
      notification = {
        buyer: `Shipday picked up transaction ${transaction.id.slice(0, 8)}. Follow live tracking here.`,
        seller: `Shipday picked up transaction ${transaction.id.slice(0, 8)}. Follow live tracking here.`,
        type: 'picked_up',
        description: 'The Shipday driver picked up the parcel.'
      };
    } else if (event === 'ORDER_COMPLETED' && !transaction.delivered_at) {
      status = 'delivered';
      deliveredAt = eventAt;
      notification = {
        buyer: `Shipday marked transaction ${transaction.id.slice(0, 8)} as delivered. Confirm receipt in Trustea to start your 24-hour return window.`,
        seller: `Shipday delivered transaction ${transaction.id.slice(0, 8)}. The buyer has been asked to confirm receipt.`,
        type: 'delivered',
        description: 'Shipday marked the parcel delivered. The buyer can now confirm receipt.'
      };
    } else if (event === 'ORDER_FAILED' || event === 'ORDER_INCOMPLETE' || shipdayStatus === 'FAILED_DELIVERY' || shipdayStatus === 'INCOMPLETE') {
      status = 'delivery_exception';
      notification = {
        buyer: `Shipday could not complete transaction ${transaction.id.slice(0, 8)}. Trustea support will follow up.`,
        seller: `Shipday could not complete transaction ${transaction.id.slice(0, 8)}. Trustea support will follow up.`,
        type: 'delivery_exception',
        description: 'Shipday reported a delivery exception. Settlement is paused.'
      };
    }

    const { data: updated, error: updateError } = await db().from('fulfilment_transactions').update({
      status,
      shipday_status: shipdayStatus || transaction.shipday_status,
      picked_up_at: pickedUpAt,
      delivered_at: deliveredAt,
      updated_at: new Date().toISOString()
    }).eq('id', transaction.id).select('*').single();
    if (updateError) throw new FulfilmentError(502, 'Could not save the Shipday tracking update.');
    if (notification) {
      await addEvent(transaction.id, notification.type, notification.description);
      await participantSms(updated, notification.buyer, notification.seller, notification.type);
      io.to(`fulfilment:${transaction.id}`).emit('fulfilment:updated', { transaction_id: transaction.id });
    }
    res.json({ success: true });
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof FulfilmentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('[Fulfilment] Unexpected request error:', error);
    res.status(500).json({ error: 'An unexpected fulfilment error occurred.' });
  });

  return router;
}

export function addFulfilmentSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    socket.on('fulfilment:subscribe', async (payload: { transaction_id?: unknown; token?: unknown }) => {
      try {
        if (typeof payload?.transaction_id !== 'string' || typeof payload.token !== 'string') return;
        const transaction = await loadTransaction(payload.transaction_id);
        const hash = tokenHash(payload.token);
        if (equalHash(hash, transaction.buyer_token_hash) || equalHash(hash, transaction.seller_token_hash)) {
          socket.join(`fulfilment:${transaction.id}`);
        } else {
          socket.emit('fulfilment:error', { transaction_id: payload.transaction_id, message: 'This private transaction link is invalid.' });
        }
      } catch {
        socket.emit('fulfilment:error', { transaction_id: payload?.transaction_id, message: 'Could not subscribe to transaction updates.' });
      }
    });
  });
}
