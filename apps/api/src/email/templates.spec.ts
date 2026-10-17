import { describe, expect, it } from 'vitest';
import { ownerActivationEmail, signInCodeEmail, staffInvitationEmail } from './templates';

describe('shared email branding', () => {
  const emails = [
    ownerActivationEmail({ clinicName: 'Test Clinic', link: 'https://example.test/activate', expiresInDays: 7 }),
    staffInvitationEmail({ clinicName: 'Test Clinic', role: 'VETERINARIAN', link: 'https://example.test/invite', expiresInDays: 7 }),
    signInCodeEmail({ code: '123456', expiresInMinutes: 10 }),
  ];
  it.each(emails)('embeds both brand images in $subject', (email) => {
    for (const contentId of ['sparki-mark', 'sparki-wordmark']) {
      expect(email.html).toContain(`src="cid:${contentId}"`);
      const attachment = email.attachments.find((item) => item.contentId === contentId);
      expect(attachment).toBeDefined();
      expect(Buffer.from(attachment!.content, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });

  it.each(emails)('places the paw before the wordmark at the public header sizes in $subject', (email) => {
    const logos = [...email.html.matchAll(/<img src="cid:([^"]+)" width="(\d+)" height="(\d+)" alt="([^"]*)"/g)]
      .map(([, contentId, width, height, alt]) => ({ contentId, width, height, alt }));
    expect(logos).toEqual([
      { contentId: 'sparki-mark', width: '31', height: '32', alt: '' },
      { contentId: 'sparki-wordmark', width: '87', height: '34', alt: 'Sparki' },
    ]);
  });
});
