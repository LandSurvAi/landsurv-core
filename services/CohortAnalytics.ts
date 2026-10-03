/**
 * User Cohort Analytics for PWA Rollout (Phase 6)
 * 
 * Tracks user cohort membership, engagement, and conversion metrics
 * for feature flag rollout analysis.
 */

import { featureFlagService, PwaFeature, RolloutStage } from './FeatureFlags.ts';

export interface CohortMetrics {
  cohort: RolloutStage;
  totalUsers: number;
  dailyActiveUsers: number;
  engagedUsers: number;
  crashCount: number;
  errorRate: number;
  avgSessionDuration: number;
  installRate: number;
  offlineSyncRate: number;
  deeplinkClickRate: number;
  avgQueueDepth: number;
  supportTickets: number;
}

export interface UserEvent {
  userId: string;
  eventType: string;
  cohort: RolloutStage;
  timestamp: Date;
  properties?: Record<string, any>;
}

export interface CohortReport {
  reportDate: Date;
  rolloutStage: RolloutStage;
  allCohorts: CohortMetrics[];
  comparisonToBaseline: {
    cohort: RolloutStage;
    crashRateDelta: number;    // % change vs non-feature users
    engagementDelta: number;   // % change
    performanceDelta: number;  // % change in latency
  }[];
  recommendations: string[];
}

class CohortAnalytics {
  private events: UserEvent[] = [];
  private readonly MAX_EVENTS = 10000;
  private listeners: Set<(report: CohortReport) => void> = new Set();
  private readonly EVENT_STORAGE_KEY = 'landsurv_cohort_events';

  constructor() {
    this.loadPersistedEvents();
  }

  /**
   * Record user event for cohort analysis
   */
  recordEvent(userId: string, eventType: string, properties?: Record<string, any>) {
    const cohort = featureFlagService.getUserCohort(userId)?.assignedCohort;

    if (!cohort) {
      console.warn('[CohortAnalytics] User cohort not found:', userId);
      return;
    }

    const event: UserEvent = {
      userId,
      eventType,
      cohort,
      timestamp: new Date(),
      properties: properties || {},
    };

    this.events.push(event);

    // Keep only recent events
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }

    // Auto-flush every 100 events
    if (this.events.length % 100 === 0) {
      this.persistEvents();
    }
  }

  /**
   * Load persisted events from localStorage
   */
  private loadPersistedEvents() {
    try {
      const stored = localStorage.getItem(this.EVENT_STORAGE_KEY);
      if (stored) {
        const events = JSON.parse(stored);
        this.events = events.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
      }
    } catch (e) {
      console.warn('[CohortAnalytics] Failed to load events:', e);
    }
  }

  /**
   * Persist events to localStorage
   */
  private persistEvents() {
    try {
      localStorage.setItem(this.EVENT_STORAGE_KEY, JSON.stringify(this.events));
    } catch (e) {
      console.warn('[CohortAnalytics] Failed to persist events:', e);
    }
  }

  /**
   * Calculate metrics for a specific cohort
   */
  private calculateCohortMetrics(cohort: RolloutStage): CohortMetrics {
    const cohortEvents = this.events.filter(e => e.cohort === cohort);

    if (cohortEvents.length === 0) {
      return {
        cohort,
        totalUsers: 0,
        dailyActiveUsers: 0,
        engagedUsers: 0,
        crashCount: 0,
        errorRate: 0,
        avgSessionDuration: 0,
        installRate: 0,
        offlineSyncRate: 0,
        deeplinkClickRate: 0,
        avgQueueDepth: 0,
        supportTickets: 0,
      };
    }

    // Get unique users
    const uniqueUsers = new Set(cohortEvents.map(e => e.userId));
    const totalUsers = uniqueUsers.size;

    // Daily active users (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyUsers = new Set(
      cohortEvents
        .filter(e => e.timestamp > oneDayAgo)
        .map(e => e.userId)
    );

    // Engaged users (5+ events)
    const engagedUsers = Array.from(uniqueUsers).filter(uid => {
      const userEvents = cohortEvents.filter(e => e.userId === uid);
      return userEvents.length >= 5;
    }).length;

    // Crash and error events
    const crashes = cohortEvents.filter(e => e.eventType === 'pwa_crash').length;
    const errors = cohortEvents.filter(e => e.eventType === 'pwa_error').length;
    const errorRate = cohortEvents.length > 0 ? (errors / cohortEvents.length) * 100 : 0;

    // Session duration (from events)
    const sessionEvents = cohortEvents.filter(e => e.eventType === 'pwa_session_start' || e.eventType === 'pwa_session_end');
    const avgSessionDuration = sessionEvents.length > 0
      ? sessionEvents.reduce((sum, e) => sum + (e.properties?.duration || 0), 0) / (sessionEvents.length / 2)
      : 0;

    // Install rate
    const installEvents = cohortEvents.filter(e => e.eventType === 'pwa_install_completed').length;
    const installRate = totalUsers > 0 ? (installEvents / totalUsers) * 100 : 0;

    // Offline sync rate
    const syncEvents = cohortEvents.filter(e => e.eventType === 'pwa_sync_success').length;
    const syncAttempts = cohortEvents.filter(e => 
      e.eventType === 'pwa_sync_success' || e.eventType === 'pwa_sync_failed'
    ).length;
    const offlineSyncRate = syncAttempts > 0 ? (syncEvents / syncAttempts) * 100 : 0;

    // Deep link clicks
    const deeplinkEvents = cohortEvents.filter(e => e.eventType === 'pwa_deeplink_clicked').length;
    const deeplinkClickRate = cohortEvents.length > 0 ? (deeplinkEvents / cohortEvents.length) * 100 : 0;

    // Queue depth (from properties)
    const queueDepthEvents = cohortEvents.filter(e => e.properties?.queueDepth !== undefined);
    const avgQueueDepth = queueDepthEvents.length > 0
      ? queueDepthEvents.reduce((sum, e) => sum + e.properties!.queueDepth!, 0) / queueDepthEvents.length
      : 0;

    // Support tickets (from properties)
    const supportTickets = cohortEvents
      .filter(e => e.eventType === 'pwa_support_ticket')
      .reduce((sum, e) => sum + (e.properties?.ticketCount || 1), 0);

    return {
      cohort,
      totalUsers,
      dailyActiveUsers: dailyUsers.size,
      engagedUsers,
      crashCount: crashes,
      errorRate,
      avgSessionDuration,
      installRate,
      offlineSyncRate,
      deeplinkClickRate,
      avgQueueDepth,
      supportTickets,
    };
  }

  /**
   * Generate comprehensive cohort report
   */
  generateReport(): CohortReport {
    const stages = [RolloutStage.INTERNAL, RolloutStage.BETA, RolloutStage.GENERAL, RolloutStage.DISABLED];
    const allCohorts = stages.map(stage => this.calculateCohortMetrics(stage));

    // Compare to baseline (DISABLED cohort)
    const baselineMetrics = allCohorts.find(m => m.cohort === RolloutStage.DISABLED);
    const comparisonToBaseline = allCohorts
      .filter(m => m.cohort !== RolloutStage.DISABLED && m.totalUsers > 0)
      .map(metrics => {
        const baseline = baselineMetrics;
        if (!baseline || baseline.totalUsers === 0) {
          return {
            cohort: metrics.cohort,
            crashRateDelta: 0,
            engagementDelta: 0,
            performanceDelta: 0,
          };
        }

        const crashRateDelta = ((metrics.crashCount - baseline.crashCount) / Math.max(baseline.crashCount, 1)) * 100;
        const baselineEngagementRate = (baseline.engagedUsers / baseline.totalUsers) * 100;
        const metricsEngagementRate = (metrics.engagedUsers / metrics.totalUsers) * 100;
        const engagementDelta = metricsEngagementRate - baselineEngagementRate;

        return {
          cohort: metrics.cohort,
          crashRateDelta,
          engagementDelta,
          performanceDelta: 0, // Placeholder
        };
      });

    // Generate recommendations
    const recommendations = this.generateRecommendations(allCohorts, comparisonToBaseline);

    return {
      reportDate: new Date(),
      rolloutStage: featureFlagService.getStatistics().currentConfig[PwaFeature.ANDROID_INSTALL_OPTIMIZER]?.stage || RolloutStage.DISABLED,
      allCohorts,
      comparisonToBaseline,
      recommendations,
    };
  }

  /**
   * Generate rollout recommendations based on metrics
   */
  private generateRecommendations(
    cohorts: CohortMetrics[],
    comparisons: Array<{ cohort: RolloutStage; crashRateDelta: number; engagementDelta: number; performanceDelta: number }>
  ): string[] {
    const recommendations: string[] = [];

    // Check each cohort tier
    comparisons.forEach(comp => {
      const metrics = cohorts.find(m => m.cohort === comp.cohort);
      if (!metrics) return;

      // Check crash rate
      if (comp.crashRateDelta > 50) {
        recommendations.push(`⚠️ HALT: ${comp.cohort} cohort crash rate increased ${comp.crashRateDelta.toFixed(1)}% - investigate before expanding`);
      } else if (comp.crashRateDelta > 10) {
        recommendations.push(`⚠️ WARN: ${comp.cohort} cohort crash rate up ${comp.crashRateDelta.toFixed(1)}% - monitor closely`);
      }

      // Check error rate
      if (metrics.errorRate > 5) {
        recommendations.push(`⚠️ WARN: ${comp.cohort} cohort error rate ${metrics.errorRate.toFixed(1)}% - above 5% threshold`);
      }

      // Check engagement
      if (comp.engagementDelta < -20) {
        recommendations.push(`⚠️ WARN: ${comp.cohort} cohort engagement down ${Math.abs(comp.engagementDelta).toFixed(1)}%`);
      } else if (comp.engagementDelta > 20) {
        recommendations.push(`✓ GOOD: ${comp.cohort} cohort engagement up ${comp.engagementDelta.toFixed(1)}% - feature resonating with users`);
      }

      // Check install rate
      if (metrics.installRate > 30) {
        recommendations.push(`✓ GOOD: ${comp.cohort} cohort install rate ${metrics.installRate.toFixed(1)}% - strong adoption`);
      } else if (metrics.installRate > 10) {
        recommendations.push(`○ FAIR: ${comp.cohort} cohort install rate ${metrics.installRate.toFixed(1)}% - OK but not exceptional`);
      }

      // Check sync rate
      if (metrics.offlineSyncRate > 95) {
        recommendations.push(`✓ GOOD: ${comp.cohort} cohort sync reliability ${metrics.offlineSyncRate.toFixed(1)}% - solid offline support`);
      } else if (metrics.offlineSyncRate < 80) {
        recommendations.push(`⚠️ WARN: ${comp.cohort} cohort sync rate ${metrics.offlineSyncRate.toFixed(1)}% - below 80% threshold`);
      }

      // Check support tickets
      if (metrics.supportTickets > 5) {
        recommendations.push(`⚠️ WARN: ${comp.cohort} cohort support tickets: ${metrics.supportTickets} - investigate issues`);
      }
    });

    // Overall recommendation
    const internalMetrics = cohorts.find(m => m.cohort === RolloutStage.INTERNAL);
    if (internalMetrics && internalMetrics.crashCount === 0 && internalMetrics.errorRate < 1) {
      recommendations.unshift(`✓ READY: Internal testing passed - safe to expand to beta`);
    }

    if (recommendations.length === 0) {
      recommendations.push(`○ MONITORING: All metrics within acceptable ranges - continue monitoring`);
    }

    return recommendations;
  }

  /**
   * Subscribe to report generation
   */
  onReportGenerated(callback: (report: CohortReport) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Flush events for server-side analytics
   */
  flushEventsToAnalytics(): UserEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  /**
   * Export all cohort data for analysis
   */
  exportData() {
    return {
      events: this.events,
      report: this.generateReport(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset all analytics (dev only)
   */
  reset() {
    console.warn('[CohortAnalytics] RESETTING ALL ANALYTICS - DEV ONLY');
    this.events = [];
    localStorage.removeItem(this.EVENT_STORAGE_KEY);
  }
}

// Singleton instance
export const cohortAnalytics = new CohortAnalytics();

// Convenience exports
export const recordCohortEvent = (userId: string, eventType: string, properties?: Record<string, any>) => {
  cohortAnalytics.recordEvent(userId, eventType, properties);
};

export const getCohortReport = () => {
  return cohortAnalytics.generateReport();
};

export const exportCohortData = () => {
  return cohortAnalytics.exportData();
};

// Helper: Track common PWA events with user ID from feature flags
export const trackPwaEventWithCohort = (eventType: string, properties?: Record<string, any>) => {
  const userCohort = featureFlagService.getUserCohort();
  if (userCohort) {
    recordCohortEvent(userCohort.userId, eventType, properties);
  }
};
