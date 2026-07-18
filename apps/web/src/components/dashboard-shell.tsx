'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useCurrentUser } from '../lib/use-current-user';
import { useAuthBootstrap, type BootstrapProfile } from './auth-bootstrap';

const ROLE_DISPLAY_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  PRACTICE_MANAGER: 'Practice Manager',
  RECEPTIONIST: 'Receptionist',
  VETERINARIAN: 'Veterinarian',
  TECHNICIAN: 'Technician',
  ASSISTANT: 'Assistant',
  CLIENT: 'Client',
};

const STATUS_PRESETS = [['🟢', 'Available'], ['🩺', 'With a patient'], ['📋', 'Charting'], ['🍽️', 'At lunch'], ['🚫', 'Do not disturb']] as const;
const PROFILE_CACHE_KEY = 'sparki:user-profile';

type HeaderProfile = BootstrapProfile;

interface HeaderWeather {
  temperature: number;
  code: number;
  isDay: boolean;
  areaLabel: string;
}

// DashboardShell remounts between app routes. Keeping the last successful
// reading at module scope prevents the weather pill from blinking away while
// the next page mounts; a full browser reload still requests a fresh reading.
let cachedHeaderWeather: HeaderWeather | null = null;
let cachedAreaLabel = 'Local weather';

export type DashboardRoute = '/' | '/today' | '/scheduler' | '/patients' | '/messages' | '/communication' | '/settings';

const SIDEBAR_ITEMS: ReadonlyArray<{ label: string; href?: DashboardRoute }> = [
  { href: '/', label: 'Dashboard' },
  { href: '/today', label: 'Today' },
  { href: '/scheduler', label: 'Scheduler' },
  { href: '/patients', label: 'Patients / Clients' },
  { href: '/messages', label: 'Team Messages' },
  { href: '/communication', label: 'Client Communication' },
  { label: 'Tasks' },
  { label: 'Reports' },
  { label: 'Inventory' },
  { label: 'Billing' },
  { href: '/settings', label: 'Settings' },
  { label: 'Help' },
] as const;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function weatherPresentation(code: number, isDay: boolean) {
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', label: 'Clear' };
  if (code <= 3) return { icon: code === 1 ? '🌤️' : '☁️', label: code === 1 ? 'Mostly clear' : 'Cloudy' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Foggy' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' };
  if (code >= 95) return { icon: '⛈️', label: 'Storms' };
  return { icon: '🌧️', label: 'Rain' };
}

export function SidebarNav({
  activeHref,
  collapsed,
  onToggleCollapsed,
}: {
  activeHref: DashboardRoute;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar__top">
        <Link href="/" className="dashboard-sidebar__brand" aria-label="Sparki dashboard">
          <span className="dashboard-sidebar__mark" aria-hidden="true">
            S
          </span>
          <span className="dashboard-sidebar__label">Sparki</span>
        </Link>
        <button
          type="button"
          className="dashboard-sidebar__toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
        >
          <span aria-hidden="true">{collapsed ? '>' : '<'}</span>
        </button>
      </div>
      <nav className="dashboard-sidebar__nav" aria-label="Primary">
        {SIDEBAR_ITEMS.map((item) => {
          const isActive = item.href === activeHref;

          if (!item.href) {
            return (
              <span
                key={item.label}
                className="dashboard-sidebar__link dashboard-sidebar__link--disabled"
                aria-disabled="true"
                title={collapsed ? item.label : undefined}
              >
                <span className="dashboard-sidebar__initial" aria-hidden="true">
                  {item.label.charAt(0)}
                </span>
                <span className="dashboard-sidebar__label">{item.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={classNames(
                'dashboard-sidebar__link',
                isActive && 'dashboard-sidebar__link--active',
              )}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
            >
              <span className="dashboard-sidebar__initial" aria-hidden="true">
                {item.label.charAt(0)}
              </span>
              <span className="dashboard-sidebar__label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function DashboardHeader({
  eyebrow,
  title,
  subtitle,
  userName = 'Clinic Team',
  roleLabel = 'Receptionist',
  avatarUrl,
  status,
  initialWeather,
  onStatusChange,
  refreshing,
  onRefresh,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | undefined;
  userName?: string | undefined;
  roleLabel?: string | undefined;
  avatarUrl?: string | null | undefined;
  status?: string | null | undefined;
  initialWeather?: HeaderWeather | null | undefined;
  onStatusChange?: ((emoji: string | null, text: string | null) => Promise<void>) | undefined;
  refreshing?: boolean | undefined;
  onRefresh?: (() => void) | undefined;
}) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<HeaderWeather | null>(() => cachedHeaderWeather ?? initialWeather ?? null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const todayLabel = useMemo(
    () =>
      now.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [now],
  );
  const timeLabel = useMemo(() => now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), [now]);
  const weatherView = weather ? weatherPresentation(weather.code, weather.isDay) : null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!statusMenuRef.current?.contains(event.target as Node)) setStatusMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [statusMenuOpen]);

  const chooseStatus = async (emoji: string | null, text: string | null) => {
    if (!onStatusChange) return;
    setStatusSaving(true);
    try {
      await onStatusChange(emoji, text);
      setStatusMenuOpen(false);
    } finally {
      setStatusSaving(false);
    }
  };

  useEffect(() => {
    if (cachedHeaderWeather) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', coords.latitude.toFixed(4));
      url.searchParams.set('longitude', coords.longitude.toFixed(4));
      url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
      url.searchParams.set('temperature_unit', 'fahrenheit');
      url.searchParams.set('timezone', 'auto');
      void fetch(url).then((response) => response.ok ? response.json() : null).then((payload: { current?: { temperature_2m?: number; weather_code?: number; is_day?: number } } | null) => {
        const current = payload?.current;
        if (current?.temperature_2m == null || current.weather_code == null) return;
        const next = { temperature: Math.round(current.temperature_2m), code: current.weather_code, isDay: current.is_day !== 0, areaLabel: cachedAreaLabel };
        cachedHeaderWeather = next;
        setWeather(next);
        try { document.cookie = `sparki_header_weather=${encodeURIComponent(JSON.stringify(next))}; Path=/; Max-Age=3600; SameSite=Lax`; } catch { /* Weather caching is optional. */ }
      }).catch(() => undefined);
      const locationUrl = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
      locationUrl.searchParams.set('latitude', coords.latitude.toFixed(5));
      locationUrl.searchParams.set('longitude', coords.longitude.toFixed(5));
      locationUrl.searchParams.set('localityLanguage', 'en');
      void fetch(locationUrl).then((response) => response.ok ? response.json() : null).then((payload: { city?: string; locality?: string; principalSubdivisionCode?: string } | null) => {
        const city = payload?.city || payload?.locality;
        if (city) {
          cachedAreaLabel = city;
          if (cachedHeaderWeather) cachedHeaderWeather = { ...cachedHeaderWeather, areaLabel: city };
          setWeather((current) => current ? { ...current, areaLabel: city } : current);
          if (cachedHeaderWeather) try { document.cookie = `sparki_header_weather=${encodeURIComponent(JSON.stringify(cachedHeaderWeather))}; Path=/; Max-Age=3600; SameSite=Lax`; } catch { /* Weather caching is optional. */ }
        }
      }).catch(() => undefined);
    }, () => undefined, { maximumAge: 15 * 60_000, timeout: 8_000 });
  }, []);

  return (
    <header className="dashboard-header">
      <div className="dashboard-header__title">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="dashboard-header__tools">
        <div className="dashboard-header__context">
          {weatherView ? <div className="dashboard-header__weather" title={`${weatherView.label} in ${weather?.areaLabel}`}><span aria-hidden="true">{weatherView.icon}</span><div><strong>{weather?.temperature}°</strong><small>{weather?.areaLabel}</small></div></div> : null}
          <div className="dashboard-header__meta" aria-label={`Current date and time: ${todayLabel}, ${timeLabel}`}>
            <strong>{todayLabel}</strong><span>{timeLabel}</span>
          </div>
          <div className="dashboard-header__user" ref={statusMenuRef}>
            <span className="dashboard-header__avatar-frame" aria-hidden="true">{avatarUrl ? <img className="dashboard-header__avatar" src={avatarUrl} alt="" /> : <span>{userName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>}</span>
            <span className="dashboard-header__user-copy"><strong>{userName}</strong><button type="button" className="dashboard-header__status-trigger" aria-haspopup="menu" aria-expanded={statusMenuOpen} onClick={() => setStatusMenuOpen((open) => !open)} disabled={!onStatusChange}><span>{status || roleLabel}</span><span aria-hidden="true">⌄</span></button></span>
            {statusMenuOpen ? <div className="dashboard-header__status-menu" role="menu" aria-label="Change status">
              <strong>Set your status</strong>
              {STATUS_PRESETS.map(([emoji, text]) => <button type="button" role="menuitem" key={text} disabled={statusSaving} onClick={() => void chooseStatus(emoji, text)}><span>{emoji}</span><span>{text}</span>{status === `${emoji} ${text}` ? <span aria-label="Current status">✓</span> : null}</button>)}
              <button type="button" role="menuitem" className="dashboard-header__status-clear" disabled={statusSaving || !status} onClick={() => void chooseStatus(null, null)}>Clear status</button>
            </div> : null}
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            className="button-secondary"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>
    </header>
  );
}

export function DashboardCard({
  className,
  children,
  ...props
}: ComponentProps<'section'> & { children: ReactNode }) {
  return (
    <section className={classNames('home-widget', className)} {...props}>
      {children}
    </section>
  );
}

export function DashboardShell({
  activeHref,
  eyebrow,
  title,
  subtitle,
  userName,
  roleLabel,
  refreshing,
  onRefresh,
  children,
  workspace = false,
}: {
  activeHref: DashboardRoute;
  eyebrow: string;
  title: string;
  subtitle?: string | undefined;
  userName?: string | undefined;
  roleLabel?: string | undefined;
  refreshing?: boolean | undefined;
  onRefresh?: (() => void) | undefined;
  children: ReactNode;
  workspace?: boolean;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const bootstrap = useAuthBootstrap();
  const { user: currentUser } = useCurrentUser();
  const [profile, setProfile] = useState<HeaderProfile | null>(bootstrap.profile);
  useLayoutEffect(() => {
    try {
      const cached = window.sessionStorage.getItem(PROFILE_CACHE_KEY);
      if (cached) setProfile(JSON.parse(cached) as HeaderProfile);
    } catch { /* Continue with server data when storage is unavailable. */ }
  }, []);
  useEffect(() => { let cancelled = false; const load = () => void fetch('/api/auth/profile', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((body: HeaderProfile | null) => { if (!cancelled && body) { setProfile(body); try { window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(body)); } catch { /* Ignore unavailable browser storage. */ } } }); load(); const refresh = () => load(); window.addEventListener('sparki:profile-updated', refresh); return () => { cancelled = true; window.removeEventListener('sparki:profile-updated', refresh); }; }, []);

  const resolvedUserName = (userName ?? profile?.displayName ?? currentUser?.name)?.trim().split(/\s+/)[0];
  const resolvedRoleLabel =
    roleLabel ?? (currentUser ? (ROLE_DISPLAY_LABELS[currentUser.role] ?? currentUser.role) : undefined);
  const updateStatus = async (statusEmoji: string | null, statusText: string | null) => {
    if (!profile) return;
    const response = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: profile.displayName || resolvedUserName || 'Clinic Team', phone: profile.phone, avatarUrl: profile.avatarUrl, statusEmoji, statusText }) });
    if (!response.ok) throw new Error('Unable to update status');
    const updated = await response.json();
    setProfile(updated);
    try { window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(updated)); } catch { /* Ignore unavailable browser storage. */ }
    window.dispatchEvent(new CustomEvent('sparki:profile-updated'));
  };

  return (
    <div
      className={
        sidebarCollapsed
          ? 'dashboard-shell dashboard-shell--sidebar-collapsed'
          : 'dashboard-shell'
      }
    >
      <SidebarNav
        activeHref={activeHref}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <main className={workspace ? 'dashboard-main dashboard-main--workspace' : 'dashboard-main'}>
        {!workspace ? <DashboardHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          userName={resolvedUserName}
          roleLabel={resolvedRoleLabel}
          avatarUrl={profile?.avatarUrl}
          status={profile?.statusEmoji ? `${profile.statusEmoji} ${profile.statusText ?? ''}` : null}
          initialWeather={bootstrap.weather}
          onStatusChange={updateStatus}
          refreshing={refreshing}
          onRefresh={onRefresh}
        /> : null}
        {children}
      </main>
    </div>
  );
}
