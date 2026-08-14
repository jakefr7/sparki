import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'text/plain', 'text/csv']);
export interface StoredAttachment { body: Buffer; contentType: string; sizeBytes: number; fileName: string }

@Injectable()
export class AttachmentStorageService {
  private readonly config;
  private readonly temporaryRoot = path.join(process.cwd(), '.tmp', 'messaging-attachments');
  constructor(config: AppConfigService) { this.config = config.attachmentStorage; }

  key(organizationId: string, locationId: string): string {
    return `organizations/${organizationId}/locations/${locationId}/messaging/${randomUUID()}`;
  }

  clinicalKey(organizationId: string, locationId: string): string {
    return `organizations/${organizationId}/locations/${locationId}/clinical/${randomUUID()}`;
  }

  clinicalBelongsTo(key: string, organizationId: string, locationId: string): boolean {
    return key.startsWith(`organizations/${organizationId}/locations/${locationId}/clinical/`) && !key.includes('..');
  }

  belongsTo(key: string, organizationId: string, locationId: string): boolean {
    return key.startsWith(`organizations/${organizationId}/locations/${locationId}/messaging/`) && !key.includes('..');
  }

  async put(key: string, body: Buffer, contentType: string, fileName: string): Promise<void> {
    if (this.config.endpoint) { await this.s3('PUT', key, body, contentType, fileName); return; }
    const target = path.join(this.temporaryRoot, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, { flag: 'wx' });
    await writeFile(`${target}.meta`, JSON.stringify({ contentType, sizeBytes: body.length, fileName }), { flag: 'wx' });
  }

  async get(key: string): Promise<StoredAttachment> {
    if (this.config.endpoint) {
      const response = await this.s3('GET', key);
      const encodedName = response.headers.get('x-amz-meta-file-name');
      return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'application/octet-stream', sizeBytes: Number(response.headers.get('content-length') ?? 0), fileName: encodedName ? Buffer.from(encodedName, 'base64url').toString('utf8') : 'attachment' };
    }
    const target = path.join(this.temporaryRoot, key);
    const [body, raw] = await Promise.all([readFile(target), readFile(`${target}.meta`, 'utf8')]);
    const metadata = JSON.parse(raw) as { contentType: string; sizeBytes: number; fileName: string };
    return { body, ...metadata };
  }

  async remove(key: string): Promise<void> {
    if (this.config.endpoint) { await this.s3('DELETE', key); return; }
    const target = path.join(this.temporaryRoot, key);
    await Promise.all([rm(target, { force: true }), rm(`${target}.meta`, { force: true })]);
  }

  private async s3(method: string, key: string, body: Uint8Array = new Uint8Array(), contentType?: string, fileName?: string): Promise<Response> {
    const { endpoint, region, bucket, accessKeyId, secretAccessKey } = this.config;
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) throw new Error('Attachment storage is not configured.');
    const base = new URL(endpoint);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const canonicalPath = `/${encodeURIComponent(bucket)}/${encodedKey}`;
    const url = new URL(canonicalPath, base);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const encodedName = fileName ? Buffer.from(fileName).toString('base64url') : undefined;
    const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n${encodedName ? `x-amz-meta-file-name:${encodedName}\n` : ''}`;
    const signedHeaders = `host;x-amz-content-sha256;x-amz-date${encodedName ? ';x-amz-meta-file-name' : ''}`;
    const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${date}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const hmac = (secret: Buffer | string, value: string) => createHmac('sha256', secret).update(value).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const headers: Record<string, string> = { 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
    if (contentType) headers['content-type'] = contentType;
    if (encodedName) headers['x-amz-meta-file-name'] = encodedName;
    const response = await fetch(url, { method, headers, ...(method === 'PUT' ? { body } : {}) });
    if (!response.ok) throw new Error(`Attachment object storage returned ${response.status}.`);
    return response;
  }
}
