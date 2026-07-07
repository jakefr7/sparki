'use client';

import { useEffect, useState } from 'react';

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
  const [state, setState] = useState<CurrentUserState>({ user: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user: CurrentUser } | null) => {
        if (!cancelled) {
          setState({ user: body?.user ?? null, loading: false });
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
