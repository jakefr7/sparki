import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentStorageService } from './attachment-storage.service';

describe('AttachmentStorageService development storage', () => {
  let root: string;
  let storage: AttachmentStorageService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'sparki-attachments-'));
    storage = new AttachmentStorageService({ attachmentStorage: {} } as never);
    Object.defineProperty(storage, 'temporaryRoot', { value: root });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('issues opaque tenant/location-scoped keys and rejects other boundaries', () => {
    const key = storage.key('org-a', 'location-a');

    expect(key).toMatch(/^organizations\/org-a\/locations\/location-a\/messaging\/[0-9a-f-]{36}$/);
    expect(storage.belongsTo(key, 'org-a', 'location-a')).toBe(true);
    expect(storage.belongsTo(key, 'org-b', 'location-a')).toBe(false);
    expect(storage.belongsTo(key, 'org-a', 'location-b')).toBe(false);
    expect(storage.belongsTo(`${key}/../escape`, 'org-a', 'location-a')).toBe(false);
  });

  it('keeps bytes and server-side metadata private until removed', async () => {
    const key = storage.key('org-a', 'location-a');
    await storage.put(key, Buffer.from('patient result'), 'text/plain', 'result.txt');

    await expect(storage.get(key)).resolves.toMatchObject({
      body: Buffer.from('patient result'),
      contentType: 'text/plain',
      fileName: 'result.txt',
      sizeBytes: 14,
    });

    await storage.remove(key);
    await expect(storage.get(key)).rejects.toThrow();
  });
});

describe('AttachmentStorageService S3 signing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2013-05-24T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ['PUT', async (storage: AttachmentStorageService) => storage.put('test.txt', Buffer.from('Welcome to Amazon S3.'), 'text/plain', 'patient result.txt')],
    ['GET', async (storage: AttachmentStorageService) => storage.get('test.txt')],
  ])('signs %s requests with stable SigV4 headers', async (method, request) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(method === 'GET' ? 'Welcome to Amazon S3.' : null, {
      status: 200,
      headers: method === 'GET' ? { 'content-type': 'text/plain', 'content-length': '21', 'x-amz-meta-file-name': 'cGF0aWVudCByZXN1bHQudHh0' } : {},
    }));
    vi.stubGlobal('fetch', fetchMock);
    const storage = new AttachmentStorageService({ attachmentStorage: {
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-east-1',
      bucket: 'examplebucket',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    } } as never);

    await request(storage);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe('https://s3.amazonaws.com/examplebucket/test.txt');
    expect(init.method).toBe(method);
    expect(init.headers).toMatchObject({
      'x-amz-date': '20130524T000000Z',
      'x-amz-content-sha256': method === 'PUT'
        ? '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072'
        : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });
    expect((init.headers as Record<string, string>).authorization).toBe(method === 'PUT'
      ? 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-meta-file-name, Signature=2c22e0778e1a637257295e586826a5003882d6083edadeb07e0f6352580002af'
      : 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=0fcb291c4b47980ad34dd9a29532ceae67b48e45de3d6054873b430740567ec2');
  });
});
