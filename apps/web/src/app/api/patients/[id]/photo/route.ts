import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'patients');

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'No file was provided.' }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { message: 'Unsupported image type. Use JPEG, PNG, WEBP, or GIF.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ message: 'Image is too large. Max size is 8MB.' }, { status: 400 });
  }

  const filename = `${id}-${Date.now()}-${randomUUID()}.${extension}`;
  const filePath = path.join(UPLOAD_DIR, filename);

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const imageUrl = new URL(`/uploads/patients/${filename}`, request.nextUrl.origin).toString();

  const upstreamResponse = await proxyFetch(request, new URL(`/patients/${id}`, env.API_URL), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });

  if (!upstreamResponse.ok) {
    await unlink(filePath).catch(() => undefined);
  }

  return relayJson(upstreamResponse);
}
