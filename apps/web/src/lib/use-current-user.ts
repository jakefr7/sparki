'use client';

import { useEffect, useState } from 'react';
import { useAuthBootstrap } from '../components/auth-bootstrap';

const CURRENT_USER_CACHE_KEY = 'sparki:current-user';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

interface CurrentUserState {
  user: CurrentUser | null;
  loading: boolean;
}

/** Reads the signed-in user from GET /api/auth/me (proxies to the API's
 *  AuthGuard-protected /auth/me, which is the source of truth for identity
 *  and role — this hook never derives either locally). */
export function useCurrentUser(): CurrentUserState {
  const bootstrap = useAuthBootstrap();
  const [state, setState] = useState<CurrentUserState>({ user: bootstrap.user, loading: true });

  useEffect(() => {
    let cancelled = false;

    try {
      const cached = window.sessionStorage.getItem(CURRENT_USER_CACHE_KEY);
      if (cached) setState({ user: JSON.parse(cached) as CurrentUser, loading: true });
    } catch { /* A cache failure should never block authentication. */ }

    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user: CurrentUser } | null) => {
        if (!cancelled) {
          const user = body?.user ?? null;
          setState({ user, loading: false });
          try {
            if (user) window.sessionStorage.setItem(CURRENT_USER_CACHE_KEY, JSON.stringify(user));
            else window.sessionStorage.removeItem(CURRENT_USER_CACHE_KEY);
          } catch { /* Ignore unavailable browser storage. */ }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ user: null, loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
