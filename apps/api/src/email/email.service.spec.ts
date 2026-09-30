import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { EmailService } from './email.service';

const message = { to: 'owner@example.test', subject: 'Activate Sparki', html: '<p>Welcome</p>', text: 'Welcome' };

afterEach(() => vi.unstubAllGlobals());

describe('transactional email', () => {
  it('captures development messages in the local inbox', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = new EmailService({ nodeEnv: 'development', webOrigin: 'http://127.0.0.1:3000', email: { resendApiKey: undefined, from: undefined } } as AppConfigService);

    await service.send(message);

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8025/api/v1/send', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"Email":"owner@example.test"'),
    }));
  });

  it('fails instead of pretending an unconfigured deployment sent mail', async () => {
    const service = new EmailService({ nodeEnv: 'production', email: { resendApiKey: undefined, from: undefined } } as AppConfigService);
    await expect(service.send(message)).rejects.toThrow('Transactional email is not configured.');
  });

  it('reports an unavailable local inbox', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const service = new EmailService({ nodeEnv: 'development', webOrigin: 'http://127.0.0.1:3000', email: { resendApiKey: undefined, from: undefined } } as AppConfigService);
    await expect(service.send(message)).rejects.toThrow('Local email inbox is unavailable.');
  });

  it('checks the local inbox before a checkout can start', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = new EmailService({ nodeEnv: 'development', webOrigin: 'http://127.0.0.1:3000', email: { resendApiKey: undefined, from: undefined } } as AppConfigService);
    await service.assertReady();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8025/api/v1/info', expect.any(Object));
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    await expect(service.assertReady()).rejects.toThrow('Account setup email is unavailable.');
  });

  it('sends a cid inline attachment to the local inbox using Mailpit\'s PascalCase attachment shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = new EmailService({ nodeEnv: 'development', webOrigin: 'http://127.0.0.1:3000', email: { resendApiKey: undefined, from: undefined } } as AppConfigService);

    await service.send({ ...message, attachments: [{ filename: 'logo.png', content: 'BASE64DATA', contentId: 'sparki-wordmark' }] });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body);
    expect(body.Attachments).toEqual([{ Content: 'BASE64DATA', Filename: 'logo.png', ContentID: 'sparki-wordmark' }]);
  });

  it('sends a cid inline attachment to Resend using its snake_case attachment shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const service = new EmailService({ nodeEnv: 'production', email: { resendApiKey: 'test_key', from: 'Sparki <hello@sparki.vet>' } } as AppConfigService);

    await service.send({ ...message, attachments: [{ filename: 'logo.png', content: 'BASE64DATA', contentId: 'sparki-wordmark' }] });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body);
    expect(body.attachments).toEqual([{ content: 'BASE64DATA', filename: 'logo.png', content_id: 'sparki-wordmark' }]);
  });
});
