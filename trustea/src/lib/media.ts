import { supabase } from './supabase';

const mediaApiUrl = import.meta.env.VITE_MEDIA_API_URL?.replace(/\/+$/, '');

export type MediaKind = 'avatar' | 'post-public' | 'post-supporters' | 'product-image' | 'salary-payslip';

type MediaUpload = {
  key: string;
  url?: string;
};

async function getAccessToken() {
  if (!supabase) throw new Error('Connect Supabase before uploading media.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Sign in before uploading media.');
  return data.session.access_token;
}

function getMediaApiUrl() {
  if (!mediaApiUrl) throw new Error('Cloudflare media storage is not configured.');
  return mediaApiUrl;
}

export async function uploadMedia(file: File, kind: MediaKind, creatorId?: string): Promise<MediaUpload> {
  const token = await getAccessToken();
  const form = new FormData();
  form.set('file', file);
  form.set('kind', kind);
  if (creatorId) form.set('creator_id', creatorId);

  const response = await fetch(`${getMediaApiUrl()}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const result = await response.json() as MediaUpload & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Media upload failed.');
  return result;
}

export async function resolvePrivateMedia(keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const token = await getAccessToken();
  const mediaUrls: Record<string, string> = {};
  for (let index = 0; index < keys.length; index += 100) {
    const response = await fetch(`${getMediaApiUrl()}/api/media-urls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keys: keys.slice(index, index + 100) }),
    });
    const result = await response.json() as { urls?: Record<string, string>; error?: string };
    if (!response.ok || !result.urls) throw new Error(result.error || 'Could not load protected images.');
    Object.assign(mediaUrls, result.urls);
  }
  return mediaUrls;
}
