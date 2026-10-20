import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ message: 'Choose an image.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ message: 'Use a JPG, PNG, WebP, or GIF image.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: 'Profile image must be 5 MB or smaller.' }, { status: 400 });
  return relayJson(await proxyFetch(request, new URL('/auth/profile/avatar', env.API_URL), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64: Buffer.from(await file.arrayBuffer()).toString('base64') }),
  }));
}

export async function DELETE(request: NextRequest) {
  return relayJson(await proxyFetch(request, new URL('/auth/profile/avatar', env.API_URL), { method: 'DELETE' }));
}
