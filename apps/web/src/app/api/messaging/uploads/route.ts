import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch } from '../../../../lib/api-proxy';

const MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'messaging');

export async function POST(request: NextRequest) {
  const auth = await proxyFetch(request, new URL('/auth/me', env.API_URL));
  if (!auth.ok) return NextResponse.json({ message: 'Authentication required.' }, { status: auth.status });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ message: 'Choose a file to attach.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: 'Attachment exceeds the 10 MB limit.' }, { status: 400 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120) || 'attachment';
  const storageKey = `${Date.now()}-${randomUUID()}-${safeName}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, storageKey), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, storageKey, href: new URL(`/uploads/messaging/${storageKey}`, request.nextUrl.origin).toString() });
}
