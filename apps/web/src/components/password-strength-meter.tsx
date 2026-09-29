import { useMemo } from 'react';

export const PASSWORD_MIN_LENGTH = 10;

type Strength = 'empty' | 'too-short' | 'weak' | 'fair' | 'good' | 'strong';

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'letmein123', 'welcome123', 'iloveyou1', 'admin1234',
  'football1', 'sunshine1', 'princess1', 'abc123456', 'passw0rd', 'monkey123',
]);

const RUNS = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function hasRun(value: string, length = 3): boolean {
  const lower = value.toLowerCase();
  return RUNS.some((run) => {
    for (let i = 0; i <= run.length - length; i++) {
      const forward = run.slice(i, i + length);
      if (lower.includes(forward) || lower.includes([...forward].reverse().join(''))) return true;
    }
    return false;
  });
}

/**
 * Best-effort local heuristic, not a replacement for the server's check.
 * WorkOS is the real gate (see AuthService.ensureWorkosCredential): a hard
 * 10-character floor plus its own zxcvbn-based strength scoring, which
 * depends on a breach-password dictionary no client bundle should carry.
 * This mirrors the floor exactly and approximates the rest, so a password
 * this calls "strong" can still be rejected server-side (e.g. a long but
 * still-breached passphrase) — the server's real rejection reason is what
 * ultimately surfaces if so, not this meter.
 */
export function scorePasswordStrength(password: string): Strength {
  if (!password) return 'empty';
  if (password.length < PASSWORD_MIN_LENGTH) return 'too-short';

  let points = Math.min(4, Math.floor((password.length - PASSWORD_MIN_LENGTH) / 4));
  points += [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;

  if (COMMON_PASSWORDS.has(password.toLowerCase())) points -= 6;
  if (/(.)\1\1/.test(password)) points -= 3;
  if (hasRun(password)) points -= 3;

  if (points <= 1) return 'weak';
  if (points <= 3) return 'fair';
  if (points <= 5) return 'good';
  return 'strong';
}

const LEVEL: Record<Strength, { label: string; fill: 0 | 1 | 2 | 3 | 4; tone: 'danger' | 'warning' | 'good' | 'strong' }> = {
  'empty': { label: '', fill: 0, tone: 'danger' },
  'too-short': { label: `Use ${PASSWORD_MIN_LENGTH}+ characters`, fill: 1, tone: 'danger' },
  'weak': { label: 'Weak — avoid common words and repeats', fill: 1, tone: 'danger' },
  'fair': { label: 'Fair', fill: 2, tone: 'warning' },
  'good': { label: 'Good', fill: 3, tone: 'good' },
  'strong': { label: 'Strong', fill: 4, tone: 'strong' },
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = useMemo(() => scorePasswordStrength(password), [password]);
  if (!password) return null;
  const { label, fill, tone } = LEVEL[strength];

  return (
    <div className="password-strength" aria-live="polite">
      <div className="password-strength__bar" role="presentation">
        {[1, 2, 3, 4].map((segment) => (
          <span key={segment} className="password-strength__segment" data-filled={segment <= fill} data-tone={tone} />
        ))}
      </div>
      <p className="password-strength__label" data-tone={tone}>{label}</p>
    </div>
  );
}
