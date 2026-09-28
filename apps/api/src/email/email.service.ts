import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Transactional email for owner activation and staff invitations. Follows
 * the same optional-in-dev/required-together-in-production shape as
 * AttachmentStorage (see AppConfigService) rather than AuthService's
 * fail-at-boot shape — email isn't on every request, only the onboarding
 * surface, so a misconfigured deploy should fail loudly when it tries to
 * send, not refuse to start entirely.
 *
 * Uses the Resend HTTP API directly (no SDK) to avoid a dependency for a
 * single POST. Swap this implementation, not its call sites, if Sparki ever
 * changes providers — every caller only knows about `send()`.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: AppConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.config.email.resendApiKey && this.config.email.from);
  }

  async send(message: EmailMessage): Promise<void> {
    const { resendApiKey, from } = this.config.email;

    if (!resendApiKey || !from) {
      // Dev/test fallback: never throw. Tests inject a fake EmailService to
      // capture and assert on outbound messages (see invitations.e2e-spec.ts)
      // rather than relying on this log line, which exists only for a
      // developer running `pnpm dev` locally without RESEND_API_KEY set.
      this.logger.log(`[dev email — not sent, no provider configured] to=${message.to} subject="${message.subject}"`);
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
