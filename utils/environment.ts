export type AppEnvironment = 'staging' | 'development' | 'production';

/**
 * Determines the current runtime environment for the application.
 *
 * Rules:
 * - 'staging':
 *     - Hostname is 'staging.landsurv.ai' or begins with 'staging.'
 *     - Build-time env VITE_APP_ENV is set to 'staging'
 *     - Query parameter `?env=staging` or `?staging=true` (useful for testing/previews)
 * - 'development':
 *     - Hostname is 'localhost', '127.0.0.1', or ends with '.local'
 *     - Vite dev server mode (import.meta.env.DEV)
 *     - Query parameter `?env=dev` or `?env=local`
 * - 'production':
 *     - Default for production apex and all standard subdomain hosts
 *     - Query parameter `?env=prod` or `?env=production`
 */
export function getAppEnvironment(): AppEnvironment {
  if (typeof window !== 'undefined' && window.location) {
    const search = window.location.search;
    if (search) {
      const params = new URLSearchParams(search);
      const envParam = params.get('env')?.toLowerCase();
      const isStagingParam = params.get('staging')?.toLowerCase();

      if (envParam === 'staging' || isStagingParam === 'true' || isStagingParam === '1') {
        return 'staging';
      }
      if (envParam === 'dev' || envParam === 'development' || envParam === 'local') {
        return 'development';
      }
      if (envParam === 'prod' || envParam === 'production') {
        return 'production';
      }
    }

    const hostname = (window.location.hostname || '').toLowerCase();
    if (
      hostname === 'staging.landsurv.ai' ||
      hostname.startsWith('staging.') ||
      hostname.startsWith('staging-') ||
      hostname.includes('staging-landsurv-ai')
    ) {
      return 'staging';
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
      return 'development';
    }
    if (hostname === 'landsurv.ai' || hostname.endsWith('.landsurv.ai')) {
      return 'production';
    }
  }

  const envVar = String((import.meta as any)?.env?.VITE_APP_ENV || '').toLowerCase().trim();
  if (envVar === 'staging') {
    return 'staging';
  }
  if (envVar === 'dev' || envVar === 'development') {
    return 'development';
  }
  if (envVar === 'prod' || envVar === 'production') {
    return 'production';
  }

  if (Boolean((import.meta as any)?.env?.DEV)) {
    return 'development';
  }

  return 'production';
}

export function isStagingEnvironment(): boolean {
  return getAppEnvironment() === 'staging';
}

export function isLocalDevEnvironment(): boolean {
  return getAppEnvironment() === 'development';
}

export function isProductionEnvironment(): boolean {
  return getAppEnvironment() === 'production';
}
