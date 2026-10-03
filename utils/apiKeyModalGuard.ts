export type ApiKeyModalSurface = {
  hostname: string;
  pageMode: 'app' | 'landing' | 'xml_sitemap';
  isCheckoutPage: boolean;
};

export function isSeoOrInfoSubdomainHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (host === 'landsurv.ai' || host === 'staging.landsurv.ai' || host.startsWith('staging.')) return false;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  return host.endsWith('.landsurv.ai');
}

export function shouldSuppressApiKeyModalForSurface(surface: ApiKeyModalSurface): boolean {
  if (surface.pageMode !== 'app') return true;
  if (surface.isCheckoutPage) return true;
  return isSeoOrInfoSubdomainHost(surface.hostname);
}
