/** Handle the API's exact inactive-subscription response for existing app requests. */
export function installSubscriptionFetchHandler() {
  if (typeof window === 'undefined') return;
  const target = window as Window & { __sparkiSubscriptionFetchInstalled?: boolean };
  if (target.__sparkiSubscriptionFetchInstalled) return;
  target.__sparkiSubscriptionFetchInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    const input = args[0];
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (response.status === 402 && new URL(url, window.location.href).pathname.startsWith('/api/') && window.location.pathname !== '/billing-required') {
      const body = await response.clone().json().catch(() => null) as { code?: string } | null;
      if (body?.code === 'SUBSCRIPTION_INACTIVE') window.location.assign('/billing-required');
    }
    return response;
  };
}
