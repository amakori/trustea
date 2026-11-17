interface Env {
  MEDIA: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  MEDIA_SIGNING_SECRET: string;
  ALLOWED_ORIGINS: string;
}

type AuthUser = {
  id: string;
  app_metadata?: { role?: string };
};

type UploadKind = 'avatar' | 'post-public' | 'post-supporters' | 'product-image' | 'salary-payslip';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
  const origin = request.headers.get('Origin');
  if (origin && env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

function jsonResponse(request: Request, env: Env, body: unknown, status = 200): Response {
  const headers = corsHeaders(request, env);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  return !origin || env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).includes(origin);
}

async function authenticate(request: Request, env: Env): Promise<AuthUser | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: authorization,
    },
  });
  if (!response.ok) return null;
  const user = await response.json() as AuthUser;
  return user.id ? user : null;
}

function isImageValid(type: string, bytes: Uint8Array): boolean {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (type === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

function getKind(value: string | File | null): UploadKind | null {
  if (value === 'avatar' || value === 'post-public' || value === 'post-supporters'
    || value === 'product-image' || value === 'salary-payslip') return value;
  return null;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signMediaToken(key: string, userId: string, env: Env): Promise<string> {
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    key,
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  })));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.MEDIA_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload)));
  return `${payload}.${encodeBase64Url(signature)}`;
}

async function verifyMediaToken(token: string, expectedKey: string, env: Env): Promise<boolean> {
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length) return false;
  let data: { key: string; userId: string; expiresAt: number };
  try {
    data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
  } catch {
    return false;
  }
  if (data.key !== expectedKey || data.expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.MEDIA_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', cryptoKey, decodeBase64Url(signature), new TextEncoder().encode(payload));
}

async function hasCreatorAccess(
  user: AuthUser,
  creatorIds: string[],
  authorization: string,
  env: Env,
): Promise<Set<string>> {
  const owned = new Set<string>();
  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, '');
  const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization };
  const ids = [...new Set(creatorIds)];
  if (!ids.length) return owned;

  const ownResponse = await fetch(
    `${supabaseUrl}/rest/v1/creator_profiles?select=id&user_id=eq.${encodeURIComponent(user.id)}&id=in.(${ids.map(encodeURIComponent).join(',')})`,
    { headers },
  );
  if (ownResponse.ok) {
    for (const row of await ownResponse.json() as Array<{ id: string }>) owned.add(row.id);
  }

  const availableIds = ids.filter((id) => !owned.has(id));
  if (!availableIds.length) return owned;
  const idFilter = `in.(${availableIds.map(encodeURIComponent).join(',')})`;
  const [mandateResponse, subscriptionResponse] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/creator_support_mandates?select=creator_id&supporter_id=eq.${encodeURIComponent(user.id)}&status=eq.active&creator_id=${idFilter}`, { headers }),
    fetch(`${supabaseUrl}/rest/v1/creator_subscriptions?select=creator_id&user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&creator_id=${idFilter}`, { headers }),
  ]);
  if (!mandateResponse.ok || !subscriptionResponse.ok) throw new Error('Could not verify access to supporter images.');
  for (const row of await mandateResponse.json() as Array<{ creator_id: string }>) owned.add(row.creator_id);
  for (const row of await subscriptionResponse.json() as Array<{ creator_id: string }>) owned.add(row.creator_id);
  return owned;
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const user = await authenticate(request, env);
  if (!user) return jsonResponse(request, env, { error: 'Sign in before uploading media.' }, 401);
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_FILE_SIZE + 32 * 1024) return jsonResponse(request, env, { error: 'Files must be 10 MB or smaller.' }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse(request, env, { error: 'Choose a valid file to upload.' }, 400);
  }
  const file = form.get('file');
  const kind = getKind(form.get('kind'));
  if (!(file instanceof File) || !kind) return jsonResponse(request, env, { error: 'Choose a supported file and upload type.' }, 400);
  if (file.size === 0 || file.size > MAX_FILE_SIZE) return jsonResponse(request, env, { error: 'Files must be between 1 byte and 10 MB.' }, 413);

  const isPayslip = kind === 'salary-payslip';
  const extension = IMAGE_TYPES.get(file.type);
  const pdf = isPayslip && file.type === 'application/pdf';
  if ((!extension && !pdf) || (!isPayslip && !extension)) {
    return jsonResponse(request, env, { error: 'Use a JPG, PNG or WebP image. Payslips may also be PDF.' }, 415);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension && !isImageValid(file.type, bytes)) return jsonResponse(request, env, { error: 'The file contents do not match a supported image format.' }, 415);
  if (pdf && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return jsonResponse(request, env, { error: 'The file contents are not a valid PDF.' }, 415);

  const creatorId = form.get('creator_id');
  if (kind === 'post-supporters') {
    if (typeof creatorId !== 'string' || !/^[0-9a-f-]{36}$/i.test(creatorId)) {
      return jsonResponse(request, env, { error: 'A valid creator profile is required for supporter-only images.' }, 400);
    }
    const authHeader = request.headers.get('Authorization')!;
    const ownerResponse = await fetch(
      `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/creator_profiles?select=id&user_id=eq.${encodeURIComponent(user.id)}&id=eq.${encodeURIComponent(creatorId)}`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader } },
    );
    if (!ownerResponse.ok) return jsonResponse(request, env, { error: 'Could not verify the creator profile.' }, 502);
    const owners = await ownerResponse.json() as Array<{ id: string }>;
    if (!owners.some((owner) => owner.id === creatorId)) {
      return jsonResponse(request, env, { error: 'Only the creator can upload supporter-only images.' }, 403);
    }
  }

  const name = crypto.randomUUID();
  const key = isPayslip
    ? `private/payslips/${user.id}/${name}.${pdf ? 'pdf' : extension}`
    : kind === 'post-supporters'
      ? `private/posts/${user.id}/${creatorId}/${name}.${extension}`
      : `public/${user.id}/${kind}/${name}.${extension}`;
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      ownerId: user.id,
      kind,
      ...(kind === 'post-supporters' && typeof creatorId === 'string' ? { creatorId } : {}),
    },
  });
  return jsonResponse(request, env, {
    key,
    url: extension && kind !== 'post-supporters' ? `${new URL(request.url).origin}/media/${key}` : undefined,
  }, 201);
}

async function handleMediaUrls(request: Request, env: Env): Promise<Response> {
  const user = await authenticate(request, env);
  if (!user) return jsonResponse(request, env, { error: 'Sign in to view protected images.' }, 401);
  let body: { keys?: unknown };
  try {
    body = await request.json() as { keys?: unknown };
  } catch {
    return jsonResponse(request, env, { error: 'Invalid media request.' }, 400);
  }
  if (!Array.isArray(body.keys) || body.keys.length > 100 || body.keys.some((key) => typeof key !== 'string')) {
    return jsonResponse(request, env, { error: 'Provide up to 100 valid media keys.' }, 400);
  }
  const keys = [...new Set(body.keys as string[])];
  if (keys.some((key) => !/^private\/posts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key))) {
    return jsonResponse(request, env, { error: 'Only supporter-post image keys can be resolved here.' }, 400);
  }
  const objects = await Promise.all(keys.map((key) => env.MEDIA.head(key)));
  if (objects.some((object) => !object)) return jsonResponse(request, env, { error: 'One or more images could not be found.' }, 404);
  if (objects.some((object) => object!.customMetadata?.kind !== 'post-supporters')) {
    return jsonResponse(request, env, { error: 'One or more files are not supporter images.' }, 400);
  }
  const creatorIds = objects.map((object) => object!.customMetadata?.creatorId || '');
  if (creatorIds.some((id) => !id)) return jsonResponse(request, env, { error: 'An image is missing its access metadata.' }, 500);

  const access = await hasCreatorAccess(user, creatorIds, request.headers.get('Authorization')!, env);
  const urls: Record<string, string> = {};
  for (let index = 0; index < keys.length; index += 1) {
    const object = objects[index]!;
    const creatorId = object.customMetadata?.creatorId;
    if (object.customMetadata?.ownerId !== user.id && (!creatorId || !access.has(creatorId))) continue;
    const token = await signMediaToken(keys[index], user.id, env);
    urls[keys[index]] = `${new URL(request.url).origin}/media/${keys[index]}?token=${encodeURIComponent(token)}`;
  }
  return jsonResponse(request, env, { urls });
}

async function handleMedia(request: Request, url: URL, env: Env): Promise<Response> {
  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice('/media/'.length));
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!key.startsWith('public/') && !key.startsWith('private/posts/')) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  if (key.startsWith('private/')) {
    const token = url.searchParams.get('token') || '';
    if (!await verifyMediaToken(token, key, env)) return new Response('Not found', { status: 404 });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Cache-Control', key.startsWith('private/') ? 'private, no-store' : 'public, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);
  const cors = corsHeaders(request, env);
  cors.forEach((value, name) => headers.set(name, value));
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}

async function handlePrivateDownload(request: Request, env: Env): Promise<Response> {
  const user = await authenticate(request, env);
  if (!user) return jsonResponse(request, env, { error: 'Sign in to view this document.' }, 401);
  let key: string;
  try {
    const path = new URL(request.url).pathname;
    key = path.startsWith('/api/payslips/')
      ? `private/payslips/${decodeURIComponent(path.slice('/api/payslips/'.length))}`
      : decodeURIComponent(path.slice('/api/private/'.length));
  } catch {
    return jsonResponse(request, env, { error: 'Invalid document key.' }, 400);
  }
  if (!/^private\/payslips\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i.test(key)) {
    return jsonResponse(request, env, { error: 'Invalid document key.' }, 404);
  }
  const object = await env.MEDIA.get(key);
  if (!object) return jsonResponse(request, env, { error: 'Document not found.' }, 404);
  if (object.customMetadata?.ownerId !== user.id && user.app_metadata?.role !== 'mfi_operator') {
    return jsonResponse(request, env, { error: 'You are not allowed to view this document.' }, 403);
  }
  const headers = corsHeaders(request, env);
  object.writeHttpMetadata(headers);
  headers.set('Content-Disposition', 'inline');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!isAllowedOrigin(request, env)) return jsonResponse(request, env, { error: 'Origin not allowed.' }, 403);

    if (request.method === 'POST' && url.pathname === '/api/upload') return handleUpload(request, env);
    if (request.method === 'POST' && url.pathname === '/api/media-urls') return handleMediaUrls(request, env);
    if (request.method === 'GET' && (url.pathname.startsWith('/api/private/') || url.pathname.startsWith('/api/payslips/'))) {
      return handlePrivateDownload(request, env);
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/media/')) {
      return handleMedia(request, url, env);
    }
    return jsonResponse(request, env, { error: 'Not found.' }, 404);
  },
};
