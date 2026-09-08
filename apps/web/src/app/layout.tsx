import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ThemeProvider } from '../components/theme-provider';
import { AuthBootstrapProvider, type BootstrapProfile, type BootstrapWeather } from '../components/auth-bootstrap';
import type { CurrentUser } from '../lib/use-current-user';
import { env } from '../lib/env';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '../lib/theme';
import './globals.css';
import './team-messages-popovers.css';
import './profile-settings.css';
import './profile-avatar.css';
import './clinical-workspace.css';

export const metadata: Metadata = {
  title: 'Sparki',
  description: 'Sparki engineering foundation',
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
  const [meResponse, profileResponse] = await Promise.all([
    fetch(new URL('/auth/me', env.API_URL), authRequest).catch(() => null),
    fetch(new URL('/auth/profile', env.API_URL), authRequest).catch(() => null),
  ]);
  const meBody = meResponse?.ok ? await meResponse.json() as { user?: CurrentUser } : null;
  const profile = profileResponse?.ok ? await profileResponse.json() as BootstrapProfile : null;
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
        <AuthBootstrapProvider value={{ user: meBody?.user ?? null, profile, weather }}><ThemeProvider>{children}</ThemeProvider></AuthBootstrapProvider>
      </body>
    </html>
  );
}
