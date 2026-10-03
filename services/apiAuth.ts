export function getStoredUserApiKey(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage.getItem('landsurv_user_api_key');
}

export function withOptionalUserApiKeyHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const apiKey = getStoredUserApiKey();
  if (!apiKey) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${apiKey}`,
  };
}

export interface ApiKeyEntitlements {
  accessProfile?: 'standard' | 'restricted';
  deniedFeatures?: string[];
  permissions?: string[];
}

export async function fetchApiKeyEntitlements(apiKey: string): Promise<ApiKeyEntitlements | null> {
  if (!apiKey) {
    return null;
  }

  const response = await fetch('/api/auth/verify', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => null);
  return data?.user ? {
    accessProfile: data.user.accessProfile,
    deniedFeatures: Array.isArray(data.user.deniedFeatures) ? data.user.deniedFeatures : undefined,
    permissions: Array.isArray(data.user.permissions) ? data.user.permissions : undefined,
  } : null;
}