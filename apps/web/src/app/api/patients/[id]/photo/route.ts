import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'No file was provided.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { message: 'Unsupported image type. Use JPEG, PNG, WEBP, or GIF.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ message: 'Image is too large. Max size is 8MB.' }, { status: 400 });
  }

  const contentBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const upstreamResponse = await proxyFetch(request, new URL(`/patients/${id}/photo`, env.API_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64 }),
  });

  return relayJson(upstreamResponse);
}
