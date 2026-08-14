import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../lib/env';
import { proxyFetch } from '../../../lib/api-proxy';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ message: 'Choose a PDF, JPG, or PNG file.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: 'Attachment exceeds the 25 MB limit.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ message: 'Only PDF, JPG/JPEG, and PNG files are allowed.' }, { status: 400 });
  const payload = { patientId: form.get('patientId') || undefined, visitId: form.get('visitId') || undefined, label: form.get('label') || undefined, replacesAttachmentId: form.get('replacesAttachmentId') || undefined, correctionReason: form.get('correctionReason') || undefined, fileName: file.name, mimeType: file.type, contentBase64: Buffer.from(await file.arrayBuffer()).toString('base64') };
  const upstream = await proxyFetch(request, new URL('/clinical-attachments', env.API_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
