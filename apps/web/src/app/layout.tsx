import type { Metadata, Viewport } from 'next';
import sparkiMark from '../../public/brand/sparki-mark.png';
import { cookies } from 'next/headers';
import { ThemeProvider } from '../components/theme-provider';
import { AuthBootstrapProvider, type BootstrapProfile, type BootstrapWeather } from '../components/auth-bootstrap';
import type { CurrentUser } from '../lib/use-current-user';
import type { BillingStatus } from '../lib/clinic-contracts';
import { env } from '../lib/env';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '../lib/theme';
import { SESSION_COOKIE_NAME } from '../lib/auth-cookie';
import './globals.css';
import './team-messages-popovers.css';
import './profile-settings.css';
import './profile-avatar.css';
import './clinical-workspace.css';

export const metadata: Metadata = {
  title: 'Sparki',
  description: 'The veterinary practice operating system that brings patients, scheduling, clinical care, team communication, and inventory into one connected workspace.',
  icons: {
    icon: [{ url: sparkiMark.src, type: 'image/png' }],
    shortcut: [sparkiMark.src],
    apple: [sparkiMark.src],
  },
};

// Mobile Safari colors its status-bar/toolbar blend areas from this, not
// from the page content underneath — without it, those areas fall back to
// inferring from data-theme, which the script below defaults to "dark" for
// every first-time visitor (a deliberate choice for the app's own default
// look, see lib/theme.ts). That left the always-light marketing/login pages
// with black bars above and below content that's actually #f7fbfb. This is
// a static light value on purpose: Sparki's in-app theme is a user choice
// stored in localStorage, not the OS-level scheme a `media` query here
// would track, and marketing/login are light regardless of either.
export const viewport: Viewport = {
  themeColor: '#f7fbfb',
};

// Runs before paint so the stored theme applies immediately on load instead
// of flashing the default and then switching once React hydrates.
const setInitialThemeScript = `
(function () {
  try {
    var stored = window.localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark' ? stored : '${DEFAULT_THEME}';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
  }
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const authRequest: RequestInit = cookieHeader ? { headers: { cookie: cookieHeader }, cache: 'no-store' } : { cache: 'no-store' };
  // Public visitors need no clinic bootstrap requests. Session-bearing requests retain the existing API verification.
  const [meResponse, profileResponse, billingResponse] = cookieStore.has(SESSION_COOKIE_NAME) ? await Promise.all([
    fetch(new URL('/auth/me', env.API_URL), authRequest).catch(() => null),
    fetch(new URL('/auth/profile', env.API_URL), authRequest).catch(() => null),
    fetch(new URL('/clinic/billing', env.API_URL), authRequest).catch(() => null),
  ]) : [null, null, null];
  const meBody = meResponse?.ok ? await meResponse.json() as { user?: CurrentUser } : null;
  const profile = profileResponse?.ok ? await profileResponse.json() as BootstrapProfile : null;
  const billing = billingResponse?.ok ? await billingResponse.json() as BillingStatus : null;
  let weather: BootstrapWeather | null = null;
  try {
    const storedWeather = cookieStore.get('sparki_header_weather')?.value;
    if (storedWeather) weather = JSON.parse(decodeURIComponent(storedWeather)) as BootstrapWeather;
  } catch { /* Invalid or expired weather data is safely ignored. */ }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: setInitialThemeScript }} />
      </head>
      <body>
        <AuthBootstrapProvider value={{ user: meBody?.user ?? null, profile, weather, billing }}><ThemeProvider>{children}</ThemeProvider></AuthBootstrapProvider>
      </body>
    </html>
  );
}
