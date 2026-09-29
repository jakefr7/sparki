/**
 * Shared HTML primitives for Sparki's transactional email — one visual
 * system (wordmark, card, hero, button, footer) reused by every email
 * Sparki sends, so a clinic recognizes Sparki mail on sight. Colors mirror
 * the web app's light-theme palette (apps/web/src/app/globals.css: the
 * `--accent`/login-brand teal), not any client's own branding.
 *
 * Table-based layout and inlined styles are deliberate, not legacy habit —
 * this is what survives Outlook/Gmail/Apple Mail's inconsistent CSS support.
 */

import { SPARKI_WORDMARK_PNG_BASE64 } from './sparki-logo-base64';

const COLOR = {
  text: '#172633',
  textMuted: '#667586',
  border: '#dde7e9',
  surface: '#ffffff',
  background: '#f4f6f8',
  accent: '#176f69',
  accentSoft: '#eef7f7',
} as const;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function emailButton(label: string, href: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0;">
    <tr>
      <td>
        <a href="${href}" style="display:block;text-align:center;background:${COLOR.accent};background-color:${COLOR.accent};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:14px 18px;border-radius:10px;border:1px solid ${COLOR.accent};">${label}</a>
      </td>
    </tr>
  </table>`;
}

/** A large, letter-spaced code display for one-time sign-in codes. */
export function codeBlock(code: string): string {
  const groups = code.match(/.{1,3}/g)?.join(' – ') ?? code;
  return `<div style="margin:0 0 24px;padding:20px;text-align:center;background:${COLOR.accentSoft};border:1px solid ${COLOR.border};border-radius:12px;">
    <div style="font-size:32px;line-height:1;font-weight:700;letter-spacing:0.15em;color:${COLOR.text};font-family:'SF Mono',SFMono-Regular,Consolas,monospace;">${escapeHtml(groups)}</div>
  </div>`;
}

export function emailLayout(opts: {
  preheader?: string;
  heroTitle: string;
  heroSubtitle?: string;
  body: string;
  footerNote?: string;
}): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : '';

  const heroSubtitle = opts.heroSubtitle
    ? `<div style="font-size:15px;line-height:1.55;color:${COLOR.textMuted};">${opts.heroSubtitle}</div>`
    : '';

  const footerNote = opts.footerNote
    ? `<div style="font-size:12px;line-height:1.5;color:${COLOR.textMuted};text-align:center;margin-top:20px;">${opts.footerNote}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
</head>
<body bgcolor="${COLOR.background}" style="margin:0;padding:0;background:${COLOR.background};background-color:${COLOR.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${COLOR.text};">
${preheader}
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLOR.background}" style="background:${COLOR.background};background-color:${COLOR.background};padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

        <!-- Wordmark — inlined base64 (see sparki-logo-base64.ts for why:
             a URL pointing at a local dev server is unreachable from
             Gmail's own image-fetching infrastructure). Same proportions
             as sparki-logo.tsx's "wordmark" kind (34px tall, here at 2x). -->
        <tr>
          <td style="padding-bottom:24px;text-align:center;">
            <img src="data:image/png;base64,${SPARKI_WORDMARK_PNG_BASE64}" width="87" height="34" alt="Sparki" style="display:inline-block;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>

        <!-- Main Card -->
        <tr>
          <td bgcolor="${COLOR.surface}" style="background:${COLOR.surface};background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;padding:32px;">

            <div style="text-align:center;margin-bottom:24px;">
              <div style="font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${COLOR.text};margin-bottom:10px;">${opts.heroTitle}</div>
              ${heroSubtitle}
            </div>

            ${opts.body}

            ${footerNote}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="text-align:center;padding:20px 12px 0;">
            <div style="font-size:12px;color:${COLOR.textMuted};">Sent by <span style="color:${COLOR.text};font-weight:600;">Sparki</span> — your connected clinic</div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
