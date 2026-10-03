/**
 * useComputeCredits Hook
 * Handles compute credit purchases and billing
 */

import { useState } from 'react';
import { executeCheckoutRecaptcha } from '../utils/recaptcha';

interface ComputeAvailability {
  available: boolean;
  unitsRemaining: number;
  shortage?: number;
  suggestedCreditPackage?: '1K' | '5K' | '10K';
}

interface OperationResult {
  success: boolean;
  unitsRemaining: number;
  overageCharged?: number;
  nextBillingDate?: string;
}

export interface BillingCheckoutSelection {
  creditPackage?: '1K' | '5K' | '10K';
  servicePlan?: '1M' | '3M' | '6M' | '1Y';
}

function buildIdempotencyKey(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `credits_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildBillingHeaders(userId: string, userEmail?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': userId,
    'x-user-email': userEmail || '',
  };
  const serviceKey = typeof localStorage === 'undefined' ? null : localStorage.getItem('landsurv_service_key');
  if (serviceKey) headers.Authorization = `Bearer ${serviceKey}`;
  return headers;
}

export const useComputeCredits = (userId: string, userEmail?: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check if user has sufficient compute units for operation
   */
  const checkAvailability = async (operationType: string, customUnits?: number): Promise<ComputeAvailability | null> => {
    if (!userId) {
      setError('User ID required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/check-compute-availability', {
        method: 'POST',
        headers: buildBillingHeaders(userId, userEmail),
        body: JSON.stringify({ operationType, requiredUnits: customUnits }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data as ComputeAvailability;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check compute availability';
      setError(message);
      console.error('Compute availability check error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Record an operation and deduct compute units
   */
  const recordOperation = async (operationType: string, customUnits?: number): Promise<OperationResult | null> => {
    if (!userId) {
      setError('User ID required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/record-operation', {
        method: 'POST',
        headers: buildBillingHeaders(userId, userEmail),
        body: JSON.stringify({ operationType, customUnits }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data as OperationResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record operation';
      setError(message);
      console.error('Record operation error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Initiate credit purchase checkout
   */
  const purchaseCredits = async (
    creditPackage: '1K' | '5K' | '10K',
    successUrl?: string,
    cancelUrl?: string
  ): Promise<{ sessionId: string; checkoutUrl: string } | null> => {
    if (!userId) {
      setError('User ID required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const idempotencyKey = buildIdempotencyKey();
      const recaptchaToken = await executeCheckoutRecaptcha();
      const response = await fetch('/api/billing/purchase-bundle', {
        method: 'POST',
        headers: {
          ...buildBillingHeaders(userId, userEmail),
          'x-idempotency-key': idempotencyKey,
          'x-recaptcha-token': recaptchaToken,
        },
        body: JSON.stringify({ userId, customerEmail: userEmail, creditPackage, successUrl, cancelUrl }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (typeof data.url === 'string' && typeof data.sessionId === 'string') {
        return { sessionId: data.sessionId, checkoutUrl: data.url };
      }

      if (typeof data.checkoutUrl === 'string' && typeof data.sessionId === 'string') {
        return { sessionId: data.sessionId, checkoutUrl: data.checkoutUrl };
      }

      throw new Error('Checkout URL missing from billing response');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to purchase credits';
      setError(message);
      console.error('Purchase credits error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const purchaseService = async (
    servicePlan: '1M' | '3M' | '6M' | '1Y',
    successUrl?: string,
    cancelUrl?: string
  ): Promise<{ sessionId: string; checkoutUrl: string } | null> => {
    if (!userId || !userEmail) {
      setError('A signed customer email is required');
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const recaptchaToken = await executeCheckoutRecaptcha();
      const response = await fetch('/api/billing/purchase-bundle', {
        method: 'POST',
        headers: {
          ...buildBillingHeaders(userId, userEmail),
          'x-idempotency-key': buildIdempotencyKey(),
          'x-recaptcha-token': recaptchaToken,
        },
        body: JSON.stringify({ userId, customerEmail: userEmail, servicePlan, successUrl, cancelUrl }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (typeof data.url !== 'string' || typeof data.sessionId !== 'string') {
        throw new Error('Checkout URL missing from billing response');
      }
      return { sessionId: data.sessionId, checkoutUrl: data.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to purchase service access';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const purchaseCheckout = async (
    selection: BillingCheckoutSelection,
    successUrl?: string,
    cancelUrl?: string
  ): Promise<{ sessionId: string; checkoutUrl: string } | null> => {
    if (!userId) {
      setError('User ID required');
      return null;
    }
    if (!selection.creditPackage && !selection.servicePlan) {
      setError('Select service access or compute credits');
      return null;
    }
    if (selection.servicePlan && !userEmail) {
      setError('A signed customer email is required');
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const recaptchaToken = await executeCheckoutRecaptcha();
      const response = await fetch('/api/billing/purchase-bundle', {
        method: 'POST',
        headers: {
          ...buildBillingHeaders(userId, userEmail),
          'x-idempotency-key': buildIdempotencyKey(),
          'x-recaptcha-token': recaptchaToken,
        },
        body: JSON.stringify({
          ...selection,
          userId,
          customerEmail: userEmail,
          successUrl,
          cancelUrl,
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.error || `Checkout failed (HTTP ${response.status})`);
      }
      const data = await response.json();
      if (typeof data.url !== 'string' || typeof data.sessionId !== 'string') {
        throw new Error('Checkout URL missing from billing response');
      }
      return { sessionId: data.sessionId, checkoutUrl: data.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Clear error state
   */
  const clearError = () => setError(null);

  return {
    checkAvailability,
    recordOperation,
    purchaseCredits,
    purchaseService,
    purchaseCheckout,
    loading,
    error,
    clearError,
  };
};

export default useComputeCredits;
