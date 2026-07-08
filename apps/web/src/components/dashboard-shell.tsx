'use client';

import Link from 'next/link';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { useCurrentUser } from '../lib/use-current-user';

const ROLE_DISPLAY_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  PRACTICE_MANAGER: 'Practice Manager',
  FRONT_DESK: 'Receptionist',
  VETERINARIAN: 'Veterinarian',
  TECHNICIAN: 'Technician',
  ASSISTANT: 'Assistant',
  CLIENT: 'Client',
};

export type DashboardRoute = '/' | '/today' | '/scheduler' | '/patients' | '/settings';

const SIDEBAR_ITEMS: ReadonlyArray<{ label: string; href?: DashboardRoute }> = [
  { href: '/', label: 'Dashboard' },
  { href: '/today', label: 'Today' },
  { href: '/scheduler', label: 'Scheduler' },
  { href: '/patients', label: 'Patients / Clients' },
  { label: 'Messages' },
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
  refreshing,
  onRefresh,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | undefined;
  userName?: string | undefined;
  roleLabel?: string | undefined;
  refreshing?: boolean | undefined;
  onRefresh?: (() => void) | undefined;
}) {
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  return (
    <header className="dashboard-header">
      <div className="dashboard-header__title">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="dashboard-header__tools">
        <div className="dashboard-header__meta" aria-label="Current date">
          {todayLabel}
        </div>
        <div className="dashboard-header__user">
          <strong>{userName}</strong>
          <span>{roleLabel}</span>
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
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user: currentUser } = useCurrentUser();

  const resolvedUserName = userName ?? currentUser?.name?.split(' ')[0];
  const resolvedRoleLabel =
    roleLabel ?? (currentUser ? (ROLE_DISPLAY_LABELS[currentUser.role] ?? currentUser.role) : undefined);

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
      <main className="dashboard-main">
        <DashboardHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          userName={resolvedUserName}
          roleLabel={resolvedRoleLabel}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
        {children}
      </main>
    </div>
  );
}
