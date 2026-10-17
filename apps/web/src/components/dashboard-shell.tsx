'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { useCurrentUser } from '../lib/use-current-user';
import { useAuthBootstrap, type BootstrapProfile } from './auth-bootstrap';
import { ClinicApiError, clinicRequest } from '../lib/clinic-api';
import { recoverFromInvalidSession } from '../lib/session-recovery';
import { SparkiLogo } from './sparki-logo';
import type { BillingStatus } from '../lib/clinic-contracts';
import { useCommunicationNavigation } from './communication-navigation';

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

export type DashboardRoute = '/' | '/today' | '/scheduler' | '/patients' | '/messages' | '/communication' | '/inventory' | '/settings';

const SIDEBAR_ITEMS: ReadonlyArray<{ label: string; href?: DashboardRoute }> = [
  { href: '/', label: 'Dashboard' },
  { href: '/today', label: 'Today' },
  { href: '/scheduler', label: 'Scheduler' },
  { href: '/patients', label: 'Patients / Clients' },
  { href: '/communication', label: 'Client Communication' },
  { label: 'Reports' },
  { href: '/inventory', label: 'Inventory' },
  { label: 'Billing' },
  { href: '/settings', label: 'Settings' },
  { label: 'Help' },
] as const;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function weatherPresentation(code: number, isDay: boolean) {
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', label: 'Clear' };
  if (code === 1) return { icon: isDay ? '🌤️' : '🌙', label: 'Mostly clear' };
  if (code <= 3) return { icon: '☁️', label: 'Cloudy' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Foggy' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' };
  if (code >= 95) return { icon: '⛈️', label: 'Storms' };
  return { icon: '🌧️', label: 'Rain' };
}

export function SidebarNav({
  activeHref,
  collapsed,
  onToggleCollapsed,
  communicationVisible,
  communicationDisabled = false,
}: {
  activeHref: DashboardRoute;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  communicationVisible: boolean;
  communicationDisabled?: boolean;
}) {
  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar__top">
        <Link href="/" className="dashboard-sidebar__brand" aria-label="Sparki dashboard">
          <SparkiLogo kind="mark" className="dashboard-sidebar__paw" />
          <SparkiLogo className="dashboard-sidebar__wordmark" />
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
        {SIDEBAR_ITEMS.filter((item) => item.href !== '/communication' || communicationVisible).map((item) => {
          const isActive = item.href === activeHref;

          if (!item.href || (item.href === '/communication' && communicationDisabled)) {
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
  avatarUrl,
  avatarFallback,
  initialWeather,
  refreshing,
  onRefresh,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | undefined;
  userName?: string | undefined;
  avatarUrl?: string | null | undefined;
  avatarFallback?: string | undefined;
  initialWeather?: HeaderWeather | null | undefined;
  refreshing?: boolean | undefined;
  onRefresh?: (() => void) | undefined;
}) {
  // The server's clock and time zone are not the browser's, so the date and
  // time stay empty in server HTML and are filled in before the first paint.
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<HeaderWeather | null>(() => cachedHeaderWeather ?? initialWeather ?? null);
  const todayLabel = useMemo(
    () =>
      now?.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }) ?? '',
    [now],
  );
  const timeLabel = useMemo(() => now?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) ?? '', [now]);
  const weatherView = weather ? weatherPresentation(weather.code, weather.isDay) : null;

  useLayoutEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
          <div className="dashboard-header__meta" aria-label={now ? `Current date and time: ${todayLabel}, ${timeLabel}` : undefined}>
            <strong>{todayLabel}</strong><span>{timeLabel}</span>
          </div>
          <div className="dashboard-header__user">
            <span className="dashboard-header__avatar-frame" aria-hidden="true">{avatarUrl ? <img className="dashboard-header__avatar" src={avatarUrl} alt="" /> : <span>{avatarFallback ?? userName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>}</span>
            <span className="dashboard-header__user-copy"><strong>{userName}</strong></span>
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
  const communicationVisible = useCommunicationNavigation();
  const [communicationDisabled, setCommunicationDisabled] = useState(true);
  useLayoutEffect(() => {
    setCommunicationDisabled(window.location.hostname === 'staging.sparki.vet');
  }, []);
  const bootstrap = useAuthBootstrap();
  const [billing, setBilling] = useState<BillingStatus | null>(bootstrap.billing);
  const [billingError, setBillingError] = useState(false);
  useEffect(() => { let active = true; void clinicRequest<BillingStatus>('/clinic/billing').then((status) => { if (!active) return; setBilling(status); setBillingError(false); if (status.isRestricted) window.location.assign('/billing-required'); }).catch((error) => { if (!active) return; if (error instanceof ClinicApiError && error.status === 401) { void recoverFromInvalidSession(); return; } setBillingError(true); }); return () => { active = false; }; }, []);
  const { user: currentUser } = useCurrentUser();
  const [profile, setProfile] = useState<HeaderProfile | null>(bootstrap.profile);
  useLayoutEffect(() => {
    try {
      const cached = window.sessionStorage.getItem(PROFILE_CACHE_KEY);
      if (cached) setProfile(JSON.parse(cached) as HeaderProfile);
    } catch { /* Continue with server data when storage is unavailable. */ }
  }, []);
  useEffect(() => { let cancelled = false; const load = () => void fetch('/api/auth/profile', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((body: HeaderProfile | null) => { if (!cancelled && body) { setProfile(body); try { window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(body)); } catch { /* Ignore unavailable browser storage. */ } } }); load(); const refresh = () => load(); window.addEventListener('sparki:profile-updated', refresh); return () => { cancelled = true; window.removeEventListener('sparki:profile-updated', refresh); }; }, []);

  const resolvedUserName = (userName ?? profile?.displayName ?? currentUser?.name)?.trim();
  const profileInitials = profile
    ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase()
    : undefined;

  if (!billing || billing.isRestricted) return <div className="dashboard-shell__loading" role="status">{billingError && !billing ? <div><p>We couldn’t load your clinic.</p><button className="button-secondary" type="button" onClick={() => window.location.reload()}>Try again</button></div> : 'Loading your clinic…'}</div>;

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
        communicationVisible={communicationVisible}
        communicationDisabled={communicationDisabled}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <main className={workspace ? 'dashboard-main dashboard-main--workspace' : 'dashboard-main'}>
        {!workspace ? <DashboardHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          userName={resolvedUserName}
          avatarUrl={profile?.avatarUrl}
          avatarFallback={profileInitials ?? ''}
          initialWeather={bootstrap.weather}
          refreshing={refreshing}
          onRefresh={onRefresh}
        /> : null}
        {billing?.subscriptionStatus === 'PAST_DUE' && <div className="billing-banner" role="status">There’s an issue with your Sparki subscription payment. Please contact Sparki support.</div>}
        {children}
      </main>
    </div>
  );
}
