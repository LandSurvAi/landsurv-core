/**
 * Feature Flag Service for PWA Rollout (Phase 6)
 * 
 * Manages gradual rollout of PWA features with user cohorts:
 * - INTERNAL: Staff/dev only
 * - BETA: Opt-in users
 * - GENERAL: Broad rollout
 * 
 * Environment controls:
 * - PWA_FEATURE_FLAG_MODE: 'internal' | 'beta' | 'general' | 'disabled'
 * - PWA_BETA_PERCENTAGE: 0-100 (% of users in beta)
 * - PWA_GENERAL_PERCENTAGE: 0-100 (% of users in general)
 */

export enum RolloutStage {
  DISABLED = 'disabled',         // Feature completely off
  INTERNAL = 'internal',         // Staff/dev only
  BETA = 'beta',                 // Opt-in beta users
  GENERAL = 'general',           // Broad rollout
}

export enum PwaFeature {
  // Phase 5 Platform-Specific
  ANDROID_INSTALL_OPTIMIZER = 'android_install_optimizer',
  IOS_GESTURE_GUIDE = 'ios_gesture_guide',
  DESKTOP_LAUNCHER = 'desktop_launcher',
  DEEP_LINKING = 'deep_linking',
  
  // Phase 6 Monitoring
  FEATURE_FLAG_MONITORING = 'feature_flag_monitoring',
  COHORT_ANALYTICS = 'cohort_analytics',
  ERROR_TRACKING = 'error_tracking',
}

export interface FeatureFlagConfig {
  stage: RolloutStage;
  betaPercentage: number;        // 0-100% of users
  generalPercentage: number;     // 0-100% of users
  internalUserIds?: string[];    // Known staff/dev users
  excludedUserIds?: string[];    // Blacklist specific users
  rolloutStartDate?: Date;       // When general rollout started
  rolloutCompleteDate?: Date;    // When fully rolled out
}

export interface UserCohort {
  userId: string;
  isInternal: boolean;
  isBeta: boolean;
  isGeneral: boolean;
  assignedCohort: RolloutStage;
  rolloutPercentile: number;     // 0-100 for percentage-based routing
  firstSeenDate: Date;
  lastSeenDate: Date;
}

class FeatureFlagService {
  private config: Map<PwaFeature, FeatureFlagConfig> = new Map();
  private userCohorts: Map<string, UserCohort> = new Map();
  private listeners: Set<(feature: PwaFeature, enabled: boolean) => void> = new Set();
  private metricsBuffer: Array<{feature: PwaFeature; userId: string; enabled: boolean; timestamp: Date}> = [];
  private readonly STORAGE_KEY = 'landsurv_feature_flags';
  private readonly COHORT_STORAGE_KEY = 'landsurv_user_cohort';

  constructor() {
    this.initializeFromEnvironment();
    this.loadPersistedState();
  }

  /**
   * Read environment values safely across Vite/browser and optional Node contexts.
   * Supports both VITE_* and legacy REACT_APP_* keys.
   */
  private getEnvValue(key: string): string | undefined {
    const viteKey = key.startsWith('REACT_APP_') ? key.replace('REACT_APP_', 'VITE_') : key;
    const viteEnv = (import.meta as any)?.env;
    const fromVite = viteEnv?.[viteKey] ?? viteEnv?.[key];
    const fromProcess = (globalThis as any)?.process?.env?.[key] ?? (globalThis as any)?.process?.env?.[viteKey];
    return fromVite ?? fromProcess;
  }

  /**
   * Initialize feature flag configs from environment variables
   */
  private initializeFromEnvironment() {
    const mode = (this.getEnvValue('REACT_APP_PWA_FEATURE_FLAG_MODE') || 'general') as RolloutStage;
    const betaPercentage = parseInt(this.getEnvValue('REACT_APP_PWA_BETA_PERCENTAGE') || '10', 10);
    const generalPercentage = parseInt(this.getEnvValue('REACT_APP_PWA_GENERAL_PERCENTAGE') || '100', 10);

    const defaultConfig: FeatureFlagConfig = {
      stage: mode,
      betaPercentage: Math.min(Math.max(betaPercentage, 0), 100),
      generalPercentage: Math.min(Math.max(generalPercentage, 0), 100),
      internalUserIds: this.parseEnvArray('REACT_APP_PWA_INTERNAL_USERS'),
      excludedUserIds: this.parseEnvArray('REACT_APP_PWA_EXCLUDED_USERS'),
    };

    // Initialize all Phase 5 features with same config
    Object.values(PwaFeature).forEach(feature => {
      this.config.set(feature, { ...defaultConfig });
    });

    console.log('[FeatureFlags] Initialized with mode:', mode, 'beta:', betaPercentage + '%', 'general:', generalPercentage + '%');
  }

  /**
   * Parse comma-separated environment variable into array
   */
  private parseEnvArray(key: string): string[] {
    const value = this.getEnvValue(key);
    if (!value) return [];
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }

  /**
   * Load persisted feature flag state and user cohorts from localStorage
   */
  private loadPersistedState() {
    try {
      // Load user cohort from localStorage
      const cohortJson = localStorage.getItem(this.COHORT_STORAGE_KEY);
      if (cohortJson) {
        const cohort = JSON.parse(cohortJson) as UserCohort;
        // Convert date strings back to Date objects
        cohort.firstSeenDate = new Date(cohort.firstSeenDate);
        cohort.lastSeenDate = new Date(cohort.lastSeenDate);
        this.userCohorts.set(cohort.userId, cohort);
      }
    } catch (e) {
      console.warn('[FeatureFlags] Failed to load persisted state:', e);
    }
  }

  /**
   * Persist feature flag state to localStorage
   */
  private persistState(userId: string) {
    try {
      const cohort = this.userCohorts.get(userId);
      if (cohort) {
        localStorage.setItem(this.COHORT_STORAGE_KEY, JSON.stringify(cohort));
      }
    } catch (e) {
      console.warn('[FeatureFlags] Failed to persist state:', e);
    }
  }

  /**
   * Determine user's rollout cohort based on ID and percentages
   */
  private assignUserCohort(userId: string, config: FeatureFlagConfig): RolloutStage {
    // Check blacklist
    if (config.excludedUserIds?.includes(userId)) {
      return RolloutStage.DISABLED;
    }

    // Check whitelist (internal staff)
    if (config.internalUserIds?.includes(userId)) {
      return RolloutStage.INTERNAL;
    }

    // Disabled stage - no rollout
    if (config.stage === RolloutStage.DISABLED) {
      return RolloutStage.DISABLED;
    }

    // Internal stage - only whitelisted users
    if (config.stage === RolloutStage.INTERNAL) {
      return RolloutStage.DISABLED; // Only internal users above get INTERNAL
    }

    // Generate consistent percentile for this user (hash-based, stable across sessions)
    const percentile = this.getUserPercentile(userId);

    // Beta stage - percentage-based beta rollout
    if (config.stage === RolloutStage.BETA) {
      return percentile < config.betaPercentage ? RolloutStage.BETA : RolloutStage.DISABLED;
    }

    // General stage - staggered rollout
    if (config.stage === RolloutStage.GENERAL) {
      if (percentile < config.betaPercentage) {
        return RolloutStage.BETA; // Early adopters already in beta
      }
      if (percentile < config.generalPercentage) {
        return RolloutStage.GENERAL;
      }
      return RolloutStage.DISABLED;
    }

    return RolloutStage.DISABLED;
  }

  /**
   * Generate consistent percentile (0-100) for user based on ID
   * Uses simple hash to ensure same user always gets same percentile
   */
  private getUserPercentile(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 101; // 0-100 inclusive
  }

  /**
   * Get or create user cohort record
   */
  private getOrCreateUserCohort(userId: string, feature: PwaFeature): UserCohort {
    let cohort = this.userCohorts.get(userId);

    if (!cohort) {
      const config = this.config.get(feature) || this.config.get(PwaFeature.ANDROID_INSTALL_OPTIMIZER)!;
      const assignedCohort = this.assignUserCohort(userId, config);
      const percentile = this.getUserPercentile(userId);
      const now = new Date();

      cohort = {
        userId,
        isInternal: assignedCohort === RolloutStage.INTERNAL,
        isBeta: assignedCohort === RolloutStage.BETA || assignedCohort === RolloutStage.INTERNAL,
        isGeneral: assignedCohort === RolloutStage.GENERAL || assignedCohort === RolloutStage.BETA || assignedCohort === RolloutStage.INTERNAL,
        assignedCohort,
        rolloutPercentile: percentile,
        firstSeenDate: now,
        lastSeenDate: now,
      };

      this.userCohorts.set(userId, cohort);
      this.persistState(userId);

      console.log('[FeatureFlags] New user cohort:', {
        userId,
        cohort: assignedCohort,
        percentile,
      });
    } else {
      // Update last seen
      cohort.lastSeenDate = new Date();
    }

    return cohort;
  }

  /**
   * Check if a feature is enabled for a specific user
   */
  isFeatureEnabled(feature: PwaFeature, userId: string): boolean {
    try {
      const config = this.config.get(feature);
      if (!config) {
        console.warn('[FeatureFlags] Unknown feature:', feature);
        return false;
      }

      if (config.stage === RolloutStage.DISABLED) {
        return false;
      }

      const cohort = this.getOrCreateUserCohort(userId, feature);
      const enabled = cohort.assignedCohort !== RolloutStage.DISABLED;

      // Buffer metric for analytics
      this.metricsBuffer.push({
        feature,
        userId,
        enabled,
        timestamp: new Date(),
      });

      return enabled;
    } catch (e) {
      console.error('[FeatureFlags] Error checking feature:', e);
      return false;
    }
  }

  /**
   * Check if feature is enabled for current user (auto-detect from localStorage)
   */
  isFeatureEnabledForCurrentUser(feature: PwaFeature): boolean {
    const userId = this.getCurrentUserId();
    return this.isFeatureEnabled(feature, userId);
  }

  /**
   * Get current user ID (from API key, session, etc.)
   */
  private getCurrentUserId(): string {
    // Try to get from API key
    const apiKey = localStorage.getItem('landsurv_user_api_key');
    if (apiKey) {
      return 'user_' + apiKey.substring(0, 16);
    }

    // Fallback to device/browser ID
    let deviceId = localStorage.getItem('landsurv_device_id');
    if (!deviceId) {
      deviceId = 'device_' + this.generateDeviceId();
      localStorage.setItem('landsurv_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Generate unique device ID for anonymous users
   */
  private generateDeviceId(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 15);
    return timestamp + randomStr;
  }

  /**
   * Update feature flag configuration (admin operation)
   */
  updateFeatureConfig(feature: PwaFeature, config: Partial<FeatureFlagConfig>) {
    const existing = this.config.get(feature);
    if (existing) {
      const updated = { ...existing, ...config };
      this.config.set(feature, updated);
      console.log('[FeatureFlags] Updated config for', feature, updated);
      
      // Notify listeners
      this.notifyListeners(feature);
    }
  }

  /**
   * Set rollout stage for all PWA features
   */
  setRolloutStage(stage: RolloutStage) {
    this.config.forEach((config) => {
      config.stage = stage;
    });
    console.log('[FeatureFlags] Set global rollout stage to:', stage);
    
    // Notify all listeners
    this.config.forEach((_, feature) => {
      this.notifyListeners(feature);
    });
  }

  /**
   * Get user's current cohort
   */
  getUserCohort(userId?: string): UserCohort | null {
    const id = userId || this.getCurrentUserId();
    return this.userCohorts.get(id) || null;
  }

  /**
   * Subscribe to feature flag changes
   */
  onFeatureFlagChange(callback: (feature: PwaFeature, enabled: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of feature flag change
   */
  private notifyListeners(feature: PwaFeature) {
    const userId = this.getCurrentUserId();
    const enabled = this.isFeatureEnabled(feature, userId);
    this.listeners.forEach(listener => {
      try {
        listener(feature, enabled);
      } catch (e) {
        console.error('[FeatureFlags] Error in listener:', e);
      }
    });
  }

  /**
   * Flush metrics buffer for analytics
   */
  flushMetrics(): Array<{feature: PwaFeature; userId: string; enabled: boolean; timestamp: Date}> {
    const metrics = [...this.metricsBuffer];
    this.metricsBuffer = [];
    return metrics;
  }

  /**
   * Get comprehensive statistics for monitoring dashboard
   */
  getStatistics() {
    const stats = {
      totalUsers: this.userCohorts.size,
      cohortCounts: {
        [RolloutStage.INTERNAL]: 0,
        [RolloutStage.BETA]: 0,
        [RolloutStage.GENERAL]: 0,
        [RolloutStage.DISABLED]: 0,
      },
      currentConfig: {} as Record<PwaFeature, FeatureFlagConfig>,
      metricsBuffered: this.metricsBuffer.length,
    };

    this.userCohorts.forEach(cohort => {
      stats.cohortCounts[cohort.assignedCohort]++;
    });

    this.config.forEach((config, feature) => {
      stats.currentConfig[feature] = config;
    });

    return stats;
  }

  /**
   * Export user cohorts for analysis
   */
  exportUserCohorts(): UserCohort[] {
    return Array.from(this.userCohorts.values());
  }

  /**
   * Reset all feature flags to defaults (dev only)
   */
  reset() {
    console.warn('[FeatureFlags] RESETTING ALL FLAGS - DEV ONLY');
    this.config.clear();
    this.userCohorts.clear();
    this.metricsBuffer = [];
    this.initializeFromEnvironment();
  }
}

// Singleton instance
export const featureFlagService = new FeatureFlagService();

// Convenience exports
export const isFeatureEnabled = (feature: PwaFeature, userId?: string) => {
  if (userId) {
    return featureFlagService.isFeatureEnabled(feature, userId);
  }
  return featureFlagService.isFeatureEnabledForCurrentUser(feature);
};

export const setRolloutStage = (stage: RolloutStage) => {
  featureFlagService.setRolloutStage(stage);
};

export const getFeatureFlagStats = () => {
  return featureFlagService.getStatistics();
};
