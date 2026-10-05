import { useState, useEffect, useCallback } from 'react';
import { PROVIDER_KEY_STORAGE, resolveKeyProvider, hasAnyProviderKey } from '../services/providerKeys.ts';
const USAGE_START_STORAGE = 'landsurv_usage_start';
const API_KEY_STORAGE = 'landsurv_user_api_key';
const SERVICE_KEY_STORAGE = 'landsurv_service_key';
const SERVICE_EXPIRY_STORAGE = 'landsurv_service_access_expires_at';
const SERVICE_TIMER_OVERRIDE_STORAGE = 'landsurv_service_disable_free_cycle_timer';
const CREDITS_STORAGE = 'landsurv_compute_credits';
const SUPERUSER_STORAGE = 'landsurv_superuser';
const SECRET_PASSWORD = 's3cur3s3cur3';
const DEFAULT_CYCLE_DURATION_SECONDS = 4 * 60 * 60;

interface UseUsageTimerReturn {
  elapsedTime: number;
  remainingTime: number;
  timeUntilAvailable: number;
  hasApiKey: boolean;
  hasLandSurvKey: boolean;
  hasServiceAccess: boolean;
  serviceAccessExpiresAt: string | null;
  isSuperUser: boolean;
  computeCredits: number;
  isLocked: boolean;
  isInitialized: boolean;
  unlockWithApiKey: (apiKey: string) => boolean;
  unlockWithServiceKey: (serviceKey: string) => Promise<'active' | 'expired' | 'invalid'>;
  resetTimer: () => void;
  addCredits: (amount: number) => void;
}

interface ServiceKeyVerification {
  user?: {
    keyPurpose?: string;
    serviceAccessExpiresAt?: string;
    serviceAccessActive?: boolean;
    disableFreeCycleTimer?: boolean;
  };
}

export const useUsageTimer = (
  cycleDurationSeconds = DEFAULT_CYCLE_DURATION_SECONDS
): UseUsageTimerReturn => {
  const safeCycleDuration = Math.max(1, Math.floor(cycleDurationSeconds));
  const totalCycleSeconds = safeCycleDuration * 2;
  const [elapsedTime, setElapsedTime] = useState(0);
  const [cycleLocked, setCycleLocked] = useState(false);
  const [remainingTime, setRemainingTime] = useState(safeCycleDuration);
  const [timeUntilAvailable, setTimeUntilAvailable] = useState(0);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasLandSurvKey, setHasLandSurvKey] = useState(false);
  const [hasServiceAccess, setHasServiceAccess] = useState(false);
  const [serviceAccessExpiresAt, setServiceAccessExpiresAt] = useState<string | null>(null);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [computeCredits, setComputeCredits] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const updateCycle = useCallback(() => {
    let startTimestamp = Number(localStorage.getItem(USAGE_START_STORAGE));
    if (!Number.isFinite(startTimestamp) || startTimestamp <= 0 || startTimestamp > Date.now()) {
      startTimestamp = Date.now();
      localStorage.setItem(USAGE_START_STORAGE, String(startTimestamp));
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTimestamp) / 1000));
    const positionInCycle = elapsedSeconds % totalCycleSeconds;
    const locked = positionInCycle >= safeCycleDuration;

    setElapsedTime(elapsedSeconds);
    setCycleLocked(locked);
    setRemainingTime(locked ? 0 : safeCycleDuration - positionInCycle);
    setTimeUntilAvailable(locked ? totalCycleSeconds - positionInCycle : 0);
  }, [safeCycleDuration, totalCycleSeconds]);

  const applyCachedServiceAccess = useCallback(() => {
    const expiresAt = localStorage.getItem(SERVICE_EXPIRY_STORAGE);
    const disableFreeCycleTimer = localStorage.getItem(SERVICE_TIMER_OVERRIDE_STORAGE) === 'true';
    const storedServiceKey = localStorage.getItem(SERVICE_KEY_STORAGE);
    const storedApiKey = localStorage.getItem(API_KEY_STORAGE);
    const hasLsaKey = Boolean(storedServiceKey?.startsWith('lsa_') || storedApiKey?.startsWith('lsa_'));
    const isUnexpired = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
    const active = disableFreeCycleTimer || isUnexpired || hasLsaKey;
    setServiceAccessExpiresAt(expiresAt);
    setHasServiceAccess(active);
    if (hasLsaKey) {
      setHasLandSurvKey(true);
    }
  }, []);

  const verifyServiceKey = useCallback(async (serviceKey: string): Promise<'active' | 'expired' | 'invalid'> => {
    try {
      const response = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${serviceKey}` },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setHasLandSurvKey(false);
          return 'invalid';
        }
        // In case of non-fatal server responses or offline mode, preserve local lsa_ enabling key
        if (serviceKey.startsWith('lsa_')) {
          setHasLandSurvKey(true);
          setHasServiceAccess(true);
          return 'active';
        }
        setHasLandSurvKey(false);
        return 'invalid';
      }
      const verification = await response.json() as ServiceKeyVerification;
      const user = verification.user;
      const disableFreeCycleTimer = user?.disableFreeCycleTimer === true;

      const expiresAt = user?.serviceAccessExpiresAt || (user as any)?.expiresAt;
      const isExpired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
      const isActive = !isExpired && (
        user?.serviceAccessActive === true ||
        disableFreeCycleTimer ||
        user?.keyPurpose === 'service' ||
        serviceKey.startsWith('lsa_')
      );

      if (isExpired) {
        setHasLandSurvKey(true);
        setHasServiceAccess(false);
        return 'expired';
      }

      localStorage.setItem(SERVICE_KEY_STORAGE, serviceKey);
      if (expiresAt) {
        localStorage.setItem(SERVICE_EXPIRY_STORAGE, expiresAt);
      } else {
        localStorage.removeItem(SERVICE_EXPIRY_STORAGE);
      }
      localStorage.setItem(SERVICE_TIMER_OVERRIDE_STORAGE, 'true');

      setServiceAccessExpiresAt(expiresAt || null);
      setHasServiceAccess(isActive);
      setHasLandSurvKey(true);
      return isActive ? 'active' : 'expired';
    } catch {
      if (serviceKey.startsWith('lsa_')) {
        setHasLandSurvKey(true);
        setHasServiceAccess(true);
        return 'active';
      }
      setHasLandSurvKey(false);
      return 'invalid';
    }
  }, []);

  useEffect(() => {
    const loadState = () => {
      const storedApiKey = localStorage.getItem(API_KEY_STORAGE);
      const storedSuperUser = localStorage.getItem(SUPERUSER_STORAGE);
      const storedCredits = Number(localStorage.getItem(CREDITS_STORAGE) || 0);
      setComputeCredits(Number.isFinite(storedCredits) ? storedCredits : 0);
      setIsSuperUser(storedSuperUser === 'true');
      setHasApiKey(storedSuperUser === 'true' || Boolean(storedApiKey?.trim()) || hasAnyProviderKey());
      applyCachedServiceAccess();
      updateCycle();
      setIsInitialized(true);

      const storedServiceKey = localStorage.getItem(SERVICE_KEY_STORAGE) || (storedApiKey?.startsWith('lsa_') ? storedApiKey : null);
      setHasLandSurvKey(Boolean(storedServiceKey || storedApiKey?.startsWith('lsa_')));
      if (storedServiceKey) void verifyServiceKey(storedServiceKey);
    };

    loadState();
    const handleStorageChange = () => loadState();
    const handleVisibilityChange = () => {
      if (!document.hidden) loadState();
    };

    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applyCachedServiceAccess, updateCycle, verifyServiceKey]);

  useEffect(() => {
    updateCycle();
    const interval = window.setInterval(() => {
      updateCycle();
      applyCachedServiceAccess();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [applyCachedServiceAccess, updateCycle]);

  const unlockWithApiKey = useCallback((apiKey: string): boolean => {
    const trimmedKey = apiKey.trim();

    if (trimmedKey === SECRET_PASSWORD) {
      setHasApiKey(true);
      setIsSuperUser(true);
      localStorage.setItem(SUPERUSER_STORAGE, 'true');
      localStorage.removeItem(API_KEY_STORAGE);
      return true;
    }

    if (trimmedKey.length < 20) {
      return false;
    }

    // Route the key to its provider's storage slot. LandSurv (lsa_) and
    // Google (AIza) keys keep the legacy shared slot; OpenAI/xAI/Anthropic
    // keys get their own slots so several provider keys can coexist.
    const provider = resolveKeyProvider(trimmedKey);
    const slot = provider === 'landsurv' ? API_KEY_STORAGE : PROVIDER_KEY_STORAGE[provider];
    localStorage.setItem(slot, trimmedKey);
    localStorage.removeItem(SUPERUSER_STORAGE);
    setHasApiKey(true);
    setIsSuperUser(false);
    if (trimmedKey.startsWith('lsa_')) {
      setHasLandSurvKey(true);
      void verifyServiceKey(trimmedKey);
    }
    return true;
  }, [verifyServiceKey]);

  const unlockWithServiceKey = useCallback(async (serviceKey: string): Promise<'active' | 'expired' | 'invalid'> => {
    const trimmedKey = serviceKey.trim();
    if (!trimmedKey.startsWith('lsa_') || trimmedKey.length < 20) return 'invalid';
    return verifyServiceKey(trimmedKey);
  }, [verifyServiceKey]);

  const resetTimer = useCallback(() => {
    localStorage.setItem(USAGE_START_STORAGE, String(Date.now()));
    localStorage.removeItem(API_KEY_STORAGE);
    localStorage.removeItem(PROVIDER_KEY_STORAGE.openai);
    localStorage.removeItem(PROVIDER_KEY_STORAGE.xai);
    localStorage.removeItem(PROVIDER_KEY_STORAGE.anthropic);
    localStorage.removeItem(SERVICE_KEY_STORAGE);
    localStorage.removeItem(SERVICE_EXPIRY_STORAGE);
    localStorage.removeItem(SERVICE_TIMER_OVERRIDE_STORAGE);
    localStorage.removeItem(SUPERUSER_STORAGE);
    setElapsedTime(0);
    setCycleLocked(false);
    setRemainingTime(safeCycleDuration);
    setTimeUntilAvailable(0);
    setHasApiKey(false);
    setHasLandSurvKey(false);
    setHasServiceAccess(false);
    setServiceAccessExpiresAt(null);
    setIsSuperUser(false);
  }, [safeCycleDuration]);

  const addCredits = useCallback((amount: number) => {
    const newTotal = computeCredits + amount;
    setComputeCredits(newTotal);
    localStorage.setItem(CREDITS_STORAGE, newTotal.toString());
  }, [computeCredits]);

  return {
    hasApiKey,
    hasLandSurvKey,
    hasServiceAccess,
    serviceAccessExpiresAt,
    isSuperUser,
    computeCredits,
    elapsedTime,
    remainingTime,
    timeUntilAvailable,
    isInitialized,
    isLocked: !isSuperUser && !hasServiceAccess && cycleLocked,
    unlockWithApiKey,
    unlockWithServiceKey,
    resetTimer,
    addCredits,
  };
};
