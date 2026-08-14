import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch } from '../../../../lib/api-proxy';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'text/plain', 'text/csv']);

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ message: 'Choose a file to attach.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: 'Attachment exceeds the 10 MB limit.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ message: 'This attachment type is not allowed.' }, { status: 400 });
  const upstream = await proxyFetch(request, new URL('/messaging/attachments', env.API_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64: Buffer.from(await file.arrayBuffer()).toString('base64') }) });
  const body: unknown = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
