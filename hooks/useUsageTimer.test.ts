import { renderHook, act } from '@testing-library/react';
import { useUsageTimer } from './useUsageTimer';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('useUsageTimer Hook', () => {
  const CREDITS_STORAGE = 'landsurv_compute_credits';
  const API_KEY_STORAGE = 'landsurv_user_api_key';
  const SECRET_PASSWORD = 's3cur3s3cur3';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    localStorage.clear();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('Credit Management', () => {
    it('should initialize with zero credits', () => {
      const { result } = renderHook(() => useUsageTimer());
      expect(result.current.computeCredits).toBe(0);
    });

    it('should load credits from localStorage on mount', () => {
      localStorage.setItem(CREDITS_STORAGE, '5000');
      const { result } = renderHook(() => useUsageTimer());
      expect(result.current.computeCredits).toBe(5000);
    });

    it('should add credits and update localStorage', () => {
      const { result } = renderHook(() => useUsageTimer());
      
      act(() => {
        result.current.addCredits(1000);
      });

      expect(result.current.computeCredits).toBe(1000);
      expect(localStorage.getItem(CREDITS_STORAGE)).toBe('1000');
    });

    it('should accumulate credits on multiple add calls', () => {
      const { result, rerender } = renderHook(() => useUsageTimer());
      
      act(() => {
        result.current.addCredits(1000);
      });
      rerender();
      expect(result.current.computeCredits).toBe(1000);

      act(() => {
        result.current.addCredits(5000);
      });
      rerender();
      expect(result.current.computeCredits).toBe(6000);

      act(() => {
        result.current.addCredits(10000);
      });
      rerender();
      expect(result.current.computeCredits).toBe(16000);
    });

    it('does not expose deprecated deductCredits API', () => {
      const { result } = renderHook(() => useUsageTimer());
      expect((result.current as any).deductCredits).toBeUndefined();
    });

    it('should preserve credits when entering superuser mode', () => {
      localStorage.setItem(CREDITS_STORAGE, '5000');
      const { result } = renderHook(() => useUsageTimer());

      act(() => {
        result.current.unlockWithApiKey(SECRET_PASSWORD);
      });

      expect(result.current.computeCredits).toBe(5000);
      expect(localStorage.getItem(CREDITS_STORAGE)).toBe('5000');
      expect(result.current.isSuperUser).toBe(true);
    });
  });

  describe('Superuser Mode', () => {
    it('should set superuser flag when correct password is entered', () => {
      const { result } = renderHook(() => useUsageTimer());
      
      act(() => {
        const success = result.current.unlockWithApiKey(SECRET_PASSWORD);
        expect(success).toBe(true);
      });

      expect(result.current.isSuperUser).toBe(true);
      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });

    it('should save superuser flag to localStorage', () => {
      const { result } = renderHook(() => useUsageTimer());
      
      act(() => {
        result.current.unlockWithApiKey(SECRET_PASSWORD);
      });

      expect(localStorage.getItem('landsurv_superuser')).toBe('true');
    });

    it('should persist superuser status across re-renders', () => {
      localStorage.setItem('landsurv_superuser', 'true');
      const { result } = renderHook(() => useUsageTimer());
      
      expect(result.current.isSuperUser).toBe(true);
      expect(result.current.hasApiKey).toBe(true);
    });
  });

  describe('API Key Management', () => {
    it('should accept valid API key and unlock', () => {
      const { result } = renderHook(() => useUsageTimer());
      
      act(() => {
        const success = result.current.unlockWithApiKey('AIzaSyB4yXTAj_CewqA4m5HfNZ9wREJjbeXp_Rw');
        expect(success).toBe(true);
      });

      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.isLocked).toBe(false);
      expect(result.current.isSuperUser).toBe(false);
    });

    it('should reject API key that is too short', () => {
      const { result } = renderHook(() => useUsageTimer());
      
      act(() => {
        const success = result.current.unlockWithApiKey('short');
        expect(success).toBe(false);
      });

      expect(result.current.hasApiKey).toBe(false);
    });

    it('should store API key in localStorage', () => {
      const { result } = renderHook(() => useUsageTimer());
      const testKey = 'AIzaSyB4yXTAj_CewqA4m5HfNZ9wREJjbeXp_Rw';
      
      act(() => {
        result.current.unlockWithApiKey(testKey);
      });

      expect(localStorage.getItem(API_KEY_STORAGE)).toBe(testKey);
    });

    it('should load API key from localStorage on mount', () => {
      const testKey = 'AIzaSyB4yXTAj_CewqA4m5HfNZ9wREJjbeXp_Rw';
      localStorage.setItem(API_KEY_STORAGE, testKey);
      const { result } = renderHook(() => useUsageTimer());

      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });
  });

  describe('Multi-Provider Key Routing', () => {
    it('routes OpenAI keys to the OpenAI slot, leaving the Google slot untouched', () => {
      localStorage.setItem(API_KEY_STORAGE, 'AIzaSyB4yXTAj_CewqA4m5HfNZ9wREJjbeXp_Rw');
      const { result } = renderHook(() => useUsageTimer());
      const openaiKey = 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa';

      act(() => {
        expect(result.current.unlockWithApiKey(openaiKey)).toBe(true);
      });

      expect(localStorage.getItem('landsurv_openai_api_key')).toBe(openaiKey);
      expect(localStorage.getItem(API_KEY_STORAGE)).toBe('AIzaSyB4yXTAj_CewqA4m5HfNZ9wREJjbeXp_Rw');
      expect(result.current.hasApiKey).toBe(true);
    });

    it('routes xAI keys to the xAI slot', () => {
      const { result } = renderHook(() => useUsageTimer());
      const xaiKey = 'xai-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      act(() => {
        expect(result.current.unlockWithApiKey(xaiKey)).toBe(true);
      });

      expect(localStorage.getItem('landsurv_xai_api_key')).toBe(xaiKey);
      expect(localStorage.getItem(API_KEY_STORAGE)).toBeNull();
    });

    it('routes Anthropic keys to the Anthropic slot', () => {
      const { result } = renderHook(() => useUsageTimer());
      const anthropicKey = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaa';

      act(() => {
        expect(result.current.unlockWithApiKey(anthropicKey)).toBe(true);
      });

      expect(localStorage.getItem('landsurv_anthropic_api_key')).toBe(anthropicKey);
      expect(localStorage.getItem(API_KEY_STORAGE)).toBeNull();
    });

    it('keeps LandSurv lsa_ keys in the legacy slot', () => {
      const { result } = renderHook(() => useUsageTimer());
      const lsaKey = 'lsa_abc123def456abc123def456abc123';

      act(() => {
        expect(result.current.unlockWithApiKey(lsaKey)).toBe(true);
      });

      expect(localStorage.getItem(API_KEY_STORAGE)).toBe(lsaKey);
    });

    it('treats unrecognized long keys as Google keys (legacy behavior)', () => {
      const { result } = renderHook(() => useUsageTimer());
      const unknownKey = 'abcdef0123456789abcdef0123456789';

      act(() => {
        expect(result.current.unlockWithApiKey(unknownKey)).toBe(true);
      });

      expect(localStorage.getItem(API_KEY_STORAGE)).toBe(unknownKey);
    });

    it('unlocks when only a third-party provider key exists on mount', () => {
      localStorage.setItem('landsurv_openai_api_key', 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa');
      const { result } = renderHook(() => useUsageTimer());

      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });

    it('resetTimer clears third-party provider keys too', () => {
      localStorage.setItem(API_KEY_STORAGE, 'AIzaSyB4yXTAj_CewqA4m5HfNZ9wREJjbeXp_Rw');
      localStorage.setItem('landsurv_openai_api_key', 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa');
      localStorage.setItem('landsurv_xai_api_key', 'xai-aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      localStorage.setItem('landsurv_anthropic_api_key', 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaa');
      const { result } = renderHook(() => useUsageTimer());

      act(() => {
        result.current.resetTimer();
      });

      expect(localStorage.getItem(API_KEY_STORAGE)).toBeNull();
      expect(localStorage.getItem('landsurv_openai_api_key')).toBeNull();
      expect(localStorage.getItem('landsurv_xai_api_key')).toBeNull();
      expect(localStorage.getItem('landsurv_anthropic_api_key')).toBeNull();
      expect(result.current.hasApiKey).toBe(false);
    });
  });

  describe('Initial State Persistence', () => {
    it('should restore full state from localStorage on mount', () => {
      const testKey = 'AIzaSyB4yXTAj_CewqA4m5HfNZ9wREJjbeXp_Rw';
      localStorage.setItem(API_KEY_STORAGE, testKey);
      localStorage.setItem(CREDITS_STORAGE, '7500');
      
      const { result } = renderHook(() => useUsageTimer());
      
      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.computeCredits).toBe(7500);
      expect(result.current.isSuperUser).toBe(false);
    });

    it('should handle mixed state (API key and credits)', () => {
      localStorage.setItem(API_KEY_STORAGE, 'test-key-longer-than-20-chars-minimum');
      localStorage.setItem(CREDITS_STORAGE, '2500');
      
      const { result } = renderHook(() => useUsageTimer());
      
      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.computeCredits).toBe(2500);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset API key and timer but preserve credits', () => {
      localStorage.setItem(API_KEY_STORAGE, 'test-key-longer-than-20-chars-minimum');
      localStorage.setItem(CREDITS_STORAGE, '5000');
      const { result } = renderHook(() => useUsageTimer());
      
      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.computeCredits).toBe(5000);

      act(() => {
        result.current.resetTimer();
      });

      expect(result.current.hasApiKey).toBe(false);
      expect(localStorage.getItem(API_KEY_STORAGE)).toBeNull();
      expect(localStorage.getItem('landsurv_superuser')).toBeNull();
      // Credits should be preserved
      expect(localStorage.getItem(CREDITS_STORAGE)).toBe('5000');
    });
  });
});
