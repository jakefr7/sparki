import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { LookupAddress } from 'node:dns';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DownloadError,
  downloadPublicFile,
  isPublicAddress,
  type DownloadOptions,
} from './inbound-media-downloader';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '198.18.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    '2001:db8::1',
    '2001::1',
    'not-an-address',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',
    '100.128.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
    '2002:0808:0808::',
  ])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('downloadPublicFile', () => {
  let server: Server;
  let port: number;
  let requests: string[] = [];
  let streamedBytes = 0;
  let streamClosedEarly = false;

  const records: Record<string, LookupAddress[]> = {
    'files.test': [{ address: '127.0.0.1', family: 4 }],
    'metadata.test': [{ address: '169.254.169.254', family: 4 }],
    'mixed.test': [
      { address: '127.0.0.1', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ],
  };
  const lookups: string[] = [];
  const lookup: NonNullable<DownloadOptions['lookup']> = (hostname, _options, callback) => {
    lookups.push(hostname);
    const addresses = records[hostname];
    if (!addresses)
      callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }), []);
    else callback(null, addresses);
  };
  // The local test server stands in for "the public internet": only its
  // address is allowed. Everything else uses the real refusal rules.
  const options = (overrides: Partial<DownloadOptions> = {}): DownloadOptions => ({
    maxBytes: 1024,
    timeoutMs: 1000,
    protocol: 'http:',
    transport: http,
    lookup,
    isAllowedAddress: (address) => address === '127.0.0.1',
    ...overrides,
  });
  const at = (path: string, host = 'files.test') => `http://${host}:${port}${path}`;

  const routes: Record<string, (request: IncomingMessage, response: ServerResponse) => void> = {
    '/small': (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'image/jpeg' });
      response.end('photo');
    },
    '/declared-too-large': (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': '5000' });
      response.end('x'.repeat(5000));
    },
    '/streamed-too-large': (_request, response) => {
      // No Content-Length: the size is only known by reading.
      response.writeHead(200, { 'Content-Type': 'image/jpeg' });
      response.on('close', () => {
        if (!response.writableEnded) streamClosedEarly = true;
      });
      let chunks = 0;
      const write = () => {
        if (response.destroyed) return;
        if (chunks === 100) {
          response.end();
          return;
        }
        chunks += 1;
        streamedBytes += 512;
        response.write('y'.repeat(512));
        setTimeout(write, 2);
      };
      write();
    },
    '/redirect-ok': (_request, response) => {
      response.writeHead(302, { Location: '/small' });
      response.end();
    },
    '/redirect-private': (_request, response) => {
      response.writeHead(302, { Location: `http://metadata.test:${port}/latest/meta-data` });
      response.end();
    },
    '/redirect-literal': (_request, response) => {
      response.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
      response.end();
    },
    '/redirect-https': (_request, response) => {
      response.writeHead(302, { Location: `https://files.test:${port}/small` });
      response.end();
    },
    '/redirect-loop': (_request, response) => {
      response.writeHead(302, { Location: '/redirect-loop' });
      response.end();
    },
    '/missing': (_request, response) => {
      response.writeHead(404);
      response.end();
    },
    '/broken': (_request, response) => {
      response.writeHead(503);
      response.end();
    },
    '/slow': () => {
      // Never answers.
    },
  };

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      requests.push(request.url ?? '');
      const route = routes[request.url ?? ''];
      if (route) route(request, response);
      else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    requests = [];
    lookups.length = 0;
    streamedBytes = 0;
    streamClosedEarly = false;
  });

  async function refusal(promise: Promise<unknown>): Promise<DownloadError> {
    const error = await promise.then(
      () => {
        throw new Error('expected the download to be refused');
      },
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(DownloadError);
    return error as DownloadError;
  }

  it('downloads a small file with its content type', async () => {
    const file = await downloadPublicFile(at('/small'), options());

    expect(file.body.toString()).toBe('photo');
    expect(file.contentType).toBe('image/jpeg');
  });

  it('refuses a file that declares itself too large without reading it', async () => {
    const error = await refusal(downloadPublicFile(at('/declared-too-large'), options()));

    expect(error.permanent).toBe(true);
    expect(error.message).toMatch(/larger than the limit/);
  });

  it('cuts the connection as soon as a streamed file passes the limit', async () => {
    const error = await refusal(downloadPublicFile(at('/streamed-too-large'), options()));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(error.permanent).toBe(true);
    // The server was stopped long before its 50 KB, not read to the end and measured.
    expect(streamClosedEarly).toBe(true);
    expect(streamedBytes).toBeLessThan(100 * 512);
  });

  it('follows a redirect to an allowed address', async () => {
    const file = await downloadPublicFile(at('/redirect-ok'), options());

    expect(file.body.toString()).toBe('photo');
    expect(requests).toEqual(['/redirect-ok', '/small']);
  });

  it('refuses a redirect to a host that resolves to a private address, without connecting to it', async () => {
    const error = await refusal(downloadPublicFile(at('/redirect-private'), options()));

    expect(error.permanent).toBe(true);
    expect(lookups).toContain('metadata.test');
    expect(requests).toEqual(['/redirect-private']);
  });

  it('refuses a redirect to a private IP address written out literally', async () => {
    const error = await refusal(downloadPublicFile(at('/redirect-literal'), options()));

    expect(error.permanent).toBe(true);
    expect(requests).toEqual(['/redirect-private'.replace('private', 'literal')]);
  });

  it('refuses a host when any of its addresses is private', async () => {
    const error = await refusal(downloadPublicFile(at('/small', 'mixed.test'), options()));

    expect(error.permanent).toBe(true);
    expect(requests).toEqual([]);
  });

  it('refuses a private IP address before any lookup or connection', async () => {
    const error = await refusal(downloadPublicFile(`http://10.0.0.1:${port}/small`, options()));

    expect(error.permanent).toBe(true);
    expect(lookups).toEqual([]);
    expect(requests).toEqual([]);
  });

  it('refuses a redirect to another protocol, endless redirects, and links with credentials', async () => {
    expect((await refusal(downloadPublicFile(at('/redirect-https'), options()))).permanent).toBe(
      true,
    );
    expect(
      (await refusal(downloadPublicFile(at('/redirect-loop'), options({ maxRedirects: 2 }))))
        .message,
    ).toMatch(/too many times/);
    expect(requests.filter((path) => path === '/redirect-loop')).toHaveLength(3);
    expect(
      (await refusal(downloadPublicFile(`http://user:secret@files.test:${port}/small`, options())))
        .permanent,
    ).toBe(true);
  });

  it('treats a missing file as permanent and a server error or timeout as worth retrying', async () => {
    expect((await refusal(downloadPublicFile(at('/missing'), options()))).permanent).toBe(true);
    expect((await refusal(downloadPublicFile(at('/broken'), options()))).permanent).toBe(false);
    const timedOut = await refusal(downloadPublicFile(at('/slow'), options({ timeoutMs: 100 })));
    expect(timedOut.permanent).toBe(false);
    expect(timedOut.message).toMatch(/timed out/);
  });

  it('accepts only HTTPS links by default', async () => {
    const error = await refusal(
      downloadPublicFile(at('/small'), {
        maxBytes: 1024,
        timeoutMs: 1000,
        lookup,
        isAllowedAddress: () => true,
      }),
    );

    expect(error.permanent).toBe(true);
    expect(requests).toEqual([]);
  });
});
