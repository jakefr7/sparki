import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch } from '../../../../../lib/api-proxy';

const MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'profiles');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(request: NextRequest) {
  const auth = await proxyFetch(request, new URL('/auth/me', env.API_URL));
  if (!auth.ok) return NextResponse.json({ message: 'Authentication required.' }, { status: auth.status });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ message: 'Choose an image.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ message: 'Use a JPG, PNG, WebP, or GIF image.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: 'Profile image must be 5 MB or smaller.' }, { status: 400 });
  const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg';
  const storageKey = `${Date.now()}-${randomUUID()}.${extension}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, storageKey), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ avatarUrl: `/uploads/profiles/${storageKey}` });
}
