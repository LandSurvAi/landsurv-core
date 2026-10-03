import { hashKey } from './hashKey';

const CONFIRMED_HASH_KEY = 'landsurv_user_api_key_confirmed_hash';
const LEGACY_CONFIRMED_KEY = 'landsurv_user_api_key_confirmed';

export async function isConfirmedForKey(key: string): Promise<boolean> {
  const storedHash = localStorage.getItem(CONFIRMED_HASH_KEY);
  if (!storedHash) return false;
  const keyHash = await hashKey(key);
  return storedHash === keyHash;
}

export async function confirmKey(key: string): Promise<void> {
  const h = await hashKey(key);
  localStorage.setItem(CONFIRMED_HASH_KEY, h);
}

export function clearConfirmed(): void {
  localStorage.removeItem(CONFIRMED_HASH_KEY);
  localStorage.removeItem(LEGACY_CONFIRMED_KEY);
}

export async function migrateLegacyConfirm(key: string): Promise<boolean> {
  const legacyConfirmed = localStorage.getItem(LEGACY_CONFIRMED_KEY);
  if (legacyConfirmed === 'true') {
    try {
      const h = await hashKey(key);
      localStorage.setItem(CONFIRMED_HASH_KEY, h);
      localStorage.removeItem(LEGACY_CONFIRMED_KEY);
      return true;
    } catch (e) {
      console.error('Failed to migrate legacy confirmation', e);
      return false;
    }
  }
  return false;
}
