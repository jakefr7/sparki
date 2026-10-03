import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import https from 'node:https';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { MAX_INBOUND_ATTACHMENT_BYTES } from './client-communication.constants';

/**
 * Why a download did not produce a file. `permanent` means trying again
 * cannot help (the address is refused, the file is too large, the link is
 * gone); otherwise a later attempt may succeed.
 */
export class DownloadError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export interface DownloadedFile {
  body: Buffer;
  contentType: string | null;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;
type Lookup = (
  hostname: string,
  options: { all: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

export interface DownloadOptions {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
  /** Seams for tests. Production always uses HTTPS, real DNS, and isPublicAddress. */
  protocol?: 'https:' | 'http:';
  transport?: { request: typeof https.request };
  lookup?: Lookup;
  isAllowedAddress?: (address: string) => boolean;
}

const IPV4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata services
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, including broadcast
];

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  return !IPV4_BLOCKED.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = ipv4ToNumber(base);
    return value >= start && value < start + size;
  });
}

/** Expands any valid IPv6 address to eight 16-bit groups. */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase();
  // A trailing dotted IPv4 part (::ffff:1.2.3.4) becomes two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const value = ipv4ToNumber(dotted[1]!);
    text = `${text.slice(0, -dotted[1]!.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head = '', tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail !== undefined && tail ? tail.split(':') : [];
  const missing = tail === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array<string>(missing).fill('0'), ...right].map((group) =>
    parseInt(group, 16),
  );
}

function embeddedIpv4(high: number, low: number): string {
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join('.');
}

function isPublicIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group))) return false;
  const [a, b, c, d, e, f, g, h] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) reach an IPv4 host.
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff)
    return isPublicIpv4(embeddedIpv4(g, h));
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0)
    return isPublicIpv4(embeddedIpv4(g, h));
  // 6to4 (2002:AABB:CCDD::) also embeds an IPv4 host.
  if (a === 0x2002) return isPublicIpv4(embeddedIpv4(b, c));
  // Only global unicast (2000::/3) is public; within it, refuse the
  // documentation range and Teredo/ORCHID/other IETF assignments.
  if ((a & 0xe000) !== 0x2000) return false;
  if (a === 0x2001 && b === 0x0db8) return false;
  if (a === 0x2001 && b < 0x0200) return false;
  return true;
}

/**
 * True only for an address on the public internet. Anything that could
 * reach this server's own network — loopback, private, link-local (cloud
 * metadata), carrier NAT, multicast, reserved, and IPv6 forms that embed one
 * of those — is refused.
 */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function parseTarget(
  raw: string,
  protocol: string,
  isAllowedAddress: (address: string) => boolean,
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DownloadError('The file link is not a valid address.', true);
  }
  if (url.protocol !== protocol)
    throw new DownloadError(
      `Only ${protocol.slice(0, -1).toUpperCase()} file links are followed.`,
      true,
    );
  if (url.username || url.password)
    throw new DownloadError('File links with credentials are refused.', true);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new DownloadError('The file link has no host.', true);
  if (isIP(host) && !isAllowedAddress(host)) {
    throw new DownloadError('The file link points to a private or reserved address.', true);
  }
  return url;
}

/**
 * Downloads one file from a link a third party supplied, without letting
 * that link reach anything but the public internet.
 *
 * - Every DNS answer is checked inside the connection's own lookup, so the
 *   address that is checked is the address that is connected to (no
 *   check-then-resolve-again gap for DNS rebinding).
 * - Redirects are followed by hand, at most `maxRedirects`, and each new
 *   target is checked the same way.
 * - The size limit is enforced while reading: the connection is cut as soon
 *   as more than `maxBytes` has arrived, whatever the server claims.
 * - A fresh connection per request (no pooled socket skips the lookup).
 */
export async function downloadPublicFile(
  rawUrl: string,
  options: DownloadOptions,
): Promise<DownloadedFile> {
  const {
    maxBytes,
    timeoutMs,
    maxRedirects = 3,
    protocol = 'https:',
    transport = https,
    lookup = dnsLookup as unknown as Lookup,
    isAllowedAddress = isPublicAddress,
  } = options;

  let url = parseTarget(rawUrl, protocol, isAllowedAddress);
  for (let redirects = 0; ; redirects += 1) {
    const outcome = await requestOnce(url, {
      maxBytes,
      timeoutMs,
      transport,
      lookup,
      isAllowedAddress,
    });
    if (outcome.kind === 'file') return outcome.file;
    if (redirects >= maxRedirects)
      throw new DownloadError('The file link redirected too many times.', true);
    url = parseTarget(new URL(outcome.location, url).toString(), protocol, isAllowedAddress);
  }
}

type Outcome = { kind: 'file'; file: DownloadedFile } | { kind: 'redirect'; location: string };

function requestOnce(
  url: URL,
  options: Required<
    Pick<DownloadOptions, 'maxBytes' | 'timeoutMs' | 'transport' | 'lookup' | 'isAllowedAddress'>
  >,
): Promise<Outcome> {
  const { maxBytes, timeoutMs, transport, lookup, isAllowedAddress } = options;
  return new Promise<Outcome>((resolve, reject) => {
    let settled = false;
    const finish = (error: DownloadError | null, outcome?: Outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        request.destroy();
        reject(error);
      } else resolve(outcome!);
    };

    const guardedLookup = (
      hostname: string,
      lookupOptions: { all?: boolean },
      callback: LookupCallback,
    ) => {
      lookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error, []);
        if (addresses.length === 0 || addresses.some(({ address }) => !isAllowedAddress(address))) {
          return callback(
            Object.assign(
              new DownloadError('The file link resolves to a private or reserved address.', true),
              {
                code: 'EADDRREFUSED',
              },
            ),
            [],
          );
        }
        if (lookupOptions.all) return callback(null, addresses);
        return callback(null, addresses[0]!.address, addresses[0]!.family);
      });
    };

    const requestOptions: RequestOptions = {
      method: 'GET',
      agent: false,
      lookup: guardedLookup as unknown as RequestOptions['lookup'],
      headers: { accept: '*/*', 'user-agent': 'Sparki' },
    };
    const request = transport.request(url, requestOptions, (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        finish(null, { kind: 'redirect', location: response.headers.location });
        return;
      }
      if (status !== 200) {
        response.resume();
        // A 4xx will not change on retry; a 5xx might.
        finish(
          new DownloadError(`The file link returned ${status}.`, status >= 400 && status < 500),
        );
        return;
      }
      if (Number(response.headers['content-length'] ?? 0) > maxBytes) {
        finish(new DownloadError('The file is larger than the limit.', true));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          finish(new DownloadError('The file is larger than the limit.', true));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const contentType = response.headers['content-type'] ?? null;
        finish(null, { kind: 'file', file: { body: Buffer.concat(chunks), contentType } });
      });
      response.on('error', (error) =>
        finish(new DownloadError(`The download failed: ${error.message}`, false)),
      );
      response.on('aborted', () => finish(new DownloadError('The download was cut off.', false)));
    });
    const timer = setTimeout(
      () => finish(new DownloadError('The download timed out.', false)),
      timeoutMs,
    );
    request.on('error', (error) => {
      finish(
        error instanceof DownloadError
          ? error
          : new DownloadError(`The download failed: ${error.message}`, false),
      );
    });
    request.end();
  });
}

/** Copies files clients send (photos, documents) from the provider's link. */
@Injectable()
export class InboundMediaDownloader {
  download(url: string): Promise<DownloadedFile> {
    return downloadPublicFile(url, {
      maxBytes: MAX_INBOUND_ATTACHMENT_BYTES,
      timeoutMs: 15_000,
      maxRedirects: 3,
    });
  }
}
