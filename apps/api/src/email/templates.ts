import { codeBlock, emailButton, emailLayout, escapeHtml } from './email-layout';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

/** Sent from InvitationsService for the system-generated, post-checkout
 *  owner-founding invitation. */
export function ownerActivationEmail(opts: { clinicName: string; link: string; expiresInDays: number }): RenderedEmail {
  const clinicName = escapeHtml(opts.clinicName);
  const body =
    `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${'#172633'};text-align:center;">Your Sparki subscription is confirmed. Create your account to finish setting up <strong>${clinicName}</strong>.</p>` +
    emailButton('Activate your clinic', opts.link);

  return {
    subject: `Activate your Sparki clinic — ${opts.clinicName}`,
    html: emailLayout({
      preheader: `Your Sparki subscription is confirmed. Follow the link to finish setting up ${opts.clinicName}.`,
      heroTitle: 'Your clinic is ready.',
      heroSubtitle: 'One more step to get your team working in Sparki.',
      body,
      footerNote: `This link expires in ${opts.expiresInDays} days.`,
    }),
    text: `Your Sparki subscription is confirmed. Follow the link below to create your account and finish setting up ${opts.clinicName}.\n\n${opts.link}\n\nThis link expires in ${opts.expiresInDays} days.`,
  };
}

/** Sent from InvitationsService when a clinic admin invites a teammate. */
export function staffInvitationEmail(opts: {
  clinicName: string;
  invitedByName?: string | undefined;
  role: string;
  link: string;
  expiresInDays: number;
}): RenderedEmail {
  const clinicName = escapeHtml(opts.clinicName);
  const inviter = escapeHtml(opts.invitedByName ?? 'A teammate');
  const roleLabel = formatRole(opts.role);
  const body =
    `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#172633;text-align:center;">${inviter} invited you to join <strong>${clinicName}</strong> on Sparki as a ${escapeHtml(roleLabel)}.</p>` +
    emailButton('Accept invitation', opts.link);

  return {
    subject: `You're invited to join ${opts.clinicName} on Sparki`,
    html: emailLayout({
      preheader: `${opts.invitedByName ?? 'A teammate'} invited you to join ${opts.clinicName} on Sparki as a ${roleLabel}.`,
      heroTitle: "You're invited.",
      heroSubtitle: `to join <strong style="color:#172633;">${clinicName}</strong>`,
      body,
      footerNote: `This link expires in ${opts.expiresInDays} days.`,
    }),
    text: `${opts.invitedByName ?? 'A teammate'} invited you to join ${opts.clinicName} on Sparki as a ${roleLabel}.\n\n${opts.link}\n\nThis link expires in ${opts.expiresInDays} days.`,
  };
}

/** Sent from AuthService.requestEmailCode — delivers the WorkOS Magic Auth
 *  code through Sparki's own branded template instead of WorkOS's default. */
export function signInCodeEmail(opts: { code: string; expiresInMinutes: number }): RenderedEmail {
  const body =
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#172633;text-align:center;">Enter this code to sign in to Sparki.</p>` +
    codeBlock(opts.code);

  return {
    subject: `Your Sparki sign-in code: ${opts.code}`,
    html: emailLayout({
      preheader: `Your Sparki sign-in code is ${opts.code}. It expires in ${opts.expiresInMinutes} minutes.`,
      heroTitle: 'Sign in to Sparki.',
      body,
      footerNote: `This code expires in ${opts.expiresInMinutes} minutes. If you didn't request this, you can ignore this email.`,
    }),
    text: `Your Sparki sign-in code is: ${opts.code}\n\nThis code expires in ${opts.expiresInMinutes} minutes. If you didn't request this, you can ignore this email.`,
  };
}
