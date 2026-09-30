import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content. */
  content: string;
  /**
   * When set, the attachment is embedded inline rather than shown as a
   * download — reference it in the HTML as `<img src="cid:VALUE">`. Both
   * Resend and Mailpit's HTTP send API support this; a `data:` URI does
   * not work as a substitute — Gmail's web/mobile client specifically
   * blocks inline base64 images in received mail (unlike Apple Mail,
   * Outlook, etc.), so an image that renders in every other client and in
   * Mailpit's local preview can still show broken in the one client this
   * app is tested against most.
   */
  contentId?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

/**
 * Transactional email for owner activation and staff invitations. Resend
 * delivers real mail when configured. In local development, Mailpit captures
 * messages in a loopback-only inbox so activation links can be tested without
 * sending to real addresses. A missing transport must never look like a
 * successful send.
 *
 * Uses the Resend HTTP API directly (no SDK) to avoid a dependency for a
 * single POST. Swap this implementation, not its call sites, if Sparki ever
 * changes providers — every caller only knows about `send()`.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: AppConfigService) {}

  private get useLocalInbox(): boolean {
    if (this.config.nodeEnv !== 'development') return false;
    try {
      return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(this.config.webOrigin).hostname);
    } catch {
      return false;
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.config.email.resendApiKey && this.config.email.from) || this.useLocalInbox;
  }

  async assertReady(): Promise<void> {
    if (this.config.email.resendApiKey && this.config.email.from) return;
    if (!this.useLocalInbox) {
      throw new ServiceUnavailableException({ code: 'EMAIL_UNAVAILABLE', message: 'Account setup email is unavailable.' });
    }
    try {
      const response = await fetch('http://127.0.0.1:8025/api/v1/info', { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch {
      // The user can retry checkout after starting the local inbox.
    }
    throw new ServiceUnavailableException({ code: 'EMAIL_UNAVAILABLE', message: 'Account setup email is unavailable.' });
  }

  async send(message: EmailMessage): Promise<void> {
    const { resendApiKey, from } = this.config.email;

    if (!resendApiKey || !from) {
      if (!this.useLocalInbox) {
        throw new ServiceUnavailableException('Transactional email is not configured.');
      }
      let response: Response;
      try {
        response = await fetch('http://127.0.0.1:8025/api/v1/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            From: { Email: 'onboarding@sparki.local', Name: 'Sparki' },
            To: [{ Email: message.to }],
            Subject: message.subject,
            HTML: message.html,
            Text: message.text,
            ...(message.attachments
              ? {
                  Attachments: message.attachments.map((attachment) => ({
                    Content: attachment.content,
                    Filename: attachment.filename,
                    ...(attachment.contentId ? { ContentID: attachment.contentId } : {}),
                  })),
                }
              : {}),
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new ServiceUnavailableException('Local email inbox is unavailable. Start Mailpit with docker compose up -d mailpit.');
      }
      if (!response.ok) {
        throw new ServiceUnavailableException('Local email inbox could not accept the message.');
      }
      this.logger.log(`Captured development email for ${message.to} in Mailpit.`);
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.attachments
          ? {
              attachments: message.attachments.map((attachment) => ({
                content: attachment.content,
                filename: attachment.filename,
                ...(attachment.contentId ? { content_id: attachment.contentId } : {}),
              })),
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Failed to send email via Resend (${response.status}): ${body.slice(0, 200)}`,
      );
    }
  }
}
