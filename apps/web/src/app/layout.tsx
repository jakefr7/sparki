import type { Metadata } from 'next';
import { ThemeProvider } from '../components/theme-provider';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '../lib/theme';
import './globals.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: setInitialThemeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
