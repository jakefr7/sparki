'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CurrentUser } from '../lib/use-current-user';
import type { BillingStatus } from '../lib/clinic-contracts';
import { installSubscriptionFetchHandler } from '../lib/subscription-fetch';

installSubscriptionFetchHandler();

export interface BootstrapProfile {
  firstName: string;
  lastName: string;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  statusEmoji: string | null;
  statusText: string | null;
}

export interface BootstrapWeather {
  temperature: number;
  code: number;
  isDay: boolean;
  areaLabel: string;
}

interface AuthBootstrapValue {
  user: CurrentUser | null;
  profile: BootstrapProfile | null;
  weather: BootstrapWeather | null;
  billing: BillingStatus | null;
}

const AuthBootstrapContext = createContext<AuthBootstrapValue>({ user: null, profile: null, weather: null, billing: null });

export function AuthBootstrapProvider({ value, children }: { value: AuthBootstrapValue; children: ReactNode }) {
  return <AuthBootstrapContext.Provider value={value}>{children}</AuthBootstrapContext.Provider>;
}

export function useAuthBootstrap() {
  return useContext(AuthBootstrapContext);
}
