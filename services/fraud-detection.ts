/**
 * Phase 4.11.6 - Fraud Detection & Device Fingerprinting Service
 * 
 * Advanced fraud detection, device fingerprinting, and anomaly detection
 */

/**
 * Device fingerprint data
 */
interface DeviceFingerprint {
  id: string;
  userId: string;
  userAgent: string;
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  screen: {
    width: number;
    height: number;
    colorDepth: number;
    pixelDepth: number;
  };
  timezone: string;
  language: string;
  plugins: string[];
  canvas: string; // Canvas fingerprint hash
  webgl: string; // WebGL fingerprint hash
  ipAddress: string;
  asn: string; // Autonomous System Number
  isp: string;
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  createdAt: number;
  lastSeenAt: number;
  usageCount: number;
  trustScore: number;
  isSuspicious: boolean;
}

/**
 * Fraud detection rule
 */
interface FraudRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: Array<{ field: string; operator: string; value: any }>;
  actions: string[];
  riskScore: number;
}

/**
 * Transaction/activity for fraud analysis
 */
interface ActivityRecord {
  id: string;
  userId: string;
  activityType: string;
  amount?: number;
  metadata: Record<string, any>;
  deviceFingerprintId: string;
  ipAddress: string;
  timestamp: number;
  riskScore: number;
  isFlagged: boolean;
}

/**
 * Fraud Detection Service
 */
export class FraudDetectionService {
  private deviceFingerprints: Map<string, DeviceFingerprint[]> = new Map();
  private fraudRules: Map<string, FraudRule> = new Map();
  private activityRecords: Map<string, ActivityRecord[]> = new Map();
  private anomalies: Map<string, string[]> = new Map();

  private readonly maxDevicesPerUser = 10;
  private readonly suspiciousActivityThreshold = 70;
  private readonly criticalRiskThreshold = 85;

  /**
   * Generate device fingerprint
   */
  generateDeviceFingerprint(
    userId: string,
    browserData: {
      userAgent: string;
      screen: { width: number; height: number; colorDepth: number; pixelDepth: number };
      timezone: string;
      language: string;
      plugins: string[];
      canvas: string; // Canvas API fingerprint
      webgl: string; // WebGL fingerprint
      ipAddress: string;
      geoLocation: { country: string; region: string; city: string; lat: number; lon: number };
    }
  ): DeviceFingerprint {
    const fpId = this.generateFingerprintId();
    const parsedUA = this.parseUserAgent(browserData.userAgent);

    const fingerprint: DeviceFingerprint = {
      id: fpId,
      userId,
      userAgent: browserData.userAgent,
      browserName: parsedUA.browser,
      browserVersion: parsedUA.version,
      osName: parsedUA.os,
      osVersion: parsedUA.osVersion,
      deviceType: this.determineDeviceType(browserData.screen),
      screen: browserData.screen,
      timezone: browserData.timezone,
      language: browserData.language,
      plugins: browserData.plugins,
      canvas: browserData.canvas,
      webgl: browserData.webgl,
      ipAddress: browserData.ipAddress,
      asn: '', // Would be populated from IP geolocation service
      isp: '', // Would be populated from IP geolocation service
      country: browserData.geoLocation.country,
      region: browserData.geoLocation.region,
      city: browserData.geoLocation.city,
      latitude: browserData.geoLocation.lat,
      longitude: browserData.geoLocation.lon,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      usageCount: 1,
      trustScore: 50, // Initial trust score
      isSuspicious: false,
    };

    // Store device fingerprint
    if (!this.deviceFingerprints.has(userId)) {
      this.deviceFingerprints.set(userId, []);
    }

    const userDevices = this.deviceFingerprints.get(userId)!;
    
    // Check if device already exists
    const existing = userDevices.find(d => this.compareDeviceFingerprints(d, fingerprint) > 0.95);
    if (existing) {
      existing.lastSeenAt = Date.now();
      existing.usageCount++;
      existing.trustScore = Math.min(100, existing.trustScore + 2); // Increase trust
      return existing;
    }

    // Add new device (enforce max devices per user)
    if (userDevices.length >= this.maxDevicesPerUser) {
      // Remove least trusted device
      userDevices.sort((a, b) => a.trustScore - b.trustScore);
      userDevices.shift();
    }

    userDevices.push(fingerprint);
    return fingerprint;
  }

  /**
   * Analyze device fingerprint for fraud indicators
   */
  analyzeDeviceForFraud(
    userId: string,
    fingerprint: DeviceFingerprint
  ): {
    riskScore: number;
    indicators: string[];
    recommendation: 'allow' | 'challenge' | 'block';
  } {
    const indicators: string[] = [];
    let riskScore = 0;

    // Check if device is known
    const userDevices = this.deviceFingerprints.get(userId) || [];
    const knownDevice = userDevices.some((d) => this.compareDeviceFingerprints(d, fingerprint) > 0.95);

    if (!knownDevice && userDevices.length > 0) {
      indicators.push('new_device');
      riskScore += 20;
    }

    // Check for suspicious characteristics
    if (this.isProxyOrVPN(fingerprint.ipAddress)) {
      indicators.push('proxy_vpn_detected');
      riskScore += 30;
    }

    if (this.isTorExit(fingerprint.ipAddress)) {
      indicators.push('tor_exit_node');
      riskScore += 50;
    }

    if (this.isDatacenter(fingerprint.ipAddress)) {
      indicators.push('datacenter_ip');
      riskScore += 35;
    }

    // Check for browser inconsistencies
    if (this.hasBrowserAnomaly(fingerprint)) {
      indicators.push('browser_anomaly');
      riskScore += 15;
    }

    // Check for geographic inconsistencies
    const geoRisk = this.assessGeographicRisk(userId, fingerprint);
    if (geoRisk.isAnomaly) {
      indicators.push('geographic_anomaly');
      riskScore += geoRisk.riskScore;
    }

    // Check for multiple rapid logins from different locations
    const rapidLoginRisk = this.assessRapidLoginRisk(userId);
    if (rapidLoginRisk.isRisky) {
      indicators.push('rapid_multi_location_login');
      riskScore += rapidLoginRisk.riskScore;
    }

    // Determine recommendation
    let recommendation: 'allow' | 'challenge' | 'block' = 'allow';
    if (riskScore > this.criticalRiskThreshold) {
      recommendation = 'block';
    } else if (riskScore > this.suspiciousActivityThreshold) {
      recommendation = 'challenge';
    }

    return {
      riskScore: Math.min(riskScore, 100),
      indicators,
      recommendation,
    };
  }

  /**
   * Register and apply fraud detection rules
   */
  registerFraudRule(rule: FraudRule): void {
    this.fraudRules.set(rule.id, rule);
  }

  /**
   * Evaluate activity against all fraud rules
   */
  evaluateActivityAgainstRules(
    activity: ActivityRecord
  ): {
    triggeredRules: FraudRule[];
    totalRiskScore: number;
    recommendation: 'allow' | 'challenge' | 'block';
  } {
    const triggeredRules: FraudRule[] = [];
    let totalRiskScore = 0;

    for (const rule of this.fraudRules.values()) {
      if (!rule.enabled) continue;

      if (this.evaluateRuleConditions(rule, activity)) {
        triggeredRules.push(rule);
        totalRiskScore += rule.riskScore;
      }
    }

    // Sort by priority
    triggeredRules.sort((a, b) => b.priority - a.priority);

    // Determine recommendation
    let recommendation: 'allow' | 'challenge' | 'block' = 'allow';
    if (totalRiskScore > this.criticalRiskThreshold) {
      recommendation = 'block';
    } else if (totalRiskScore > this.suspiciousActivityThreshold) {
      recommendation = 'challenge';
    }

    return {
      triggeredRules,
      totalRiskScore: Math.min(totalRiskScore, 100),
      recommendation,
    };
  }

  /**
   * Record activity for pattern analysis
   */
  recordActivity(activity: ActivityRecord): void {
    if (!this.activityRecords.has(activity.userId)) {
      this.activityRecords.set(activity.userId, []);
    }

    this.activityRecords.get(activity.userId)!.push(activity);

    // Clean up old records (keep last 30 days)
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filtered = this.activityRecords
      .get(activity.userId)!
      .filter((a) => a.timestamp > cutoff);
    this.activityRecords.set(activity.userId, filtered);
  }

  /**
   * Detect anomalies in user activity patterns
   */
  detectAnomalies(userId: string): {
    anomalies: string[];
    anomalyScore: number;
    affectedActivities: string[];
  } {
    const activities = this.activityRecords.get(userId) || [];
    if (activities.length < 5) {
      return { anomalies: [], anomalyScore: 0, affectedActivities: [] };
    }

    const anomalies: string[] = [];
    const affectedActivities: string[] = [];
    let anomalyScore = 0;

    // Detect amount anomalies
    if (activities.some((a) => a.amount)) {
      const amounts = activities
        .filter((a) => a.amount)
        .map((a) => a.amount!)
        .sort((a, b) => a - b);

      const q1 = amounts[Math.floor(amounts.length * 0.25)];
      const q3 = amounts[Math.floor(amounts.length * 0.75)];
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      const outliers = activities.filter(
        (a) => a.amount && (a.amount < lowerBound || a.amount > upperBound)
      );

      if (outliers.length > 0) {
        anomalies.push('unusual_transaction_amount');
        anomalyScore += 25;
        affectedActivities.push(...outliers.map((a) => a.id));
      }
    }

    // Detect time pattern anomalies
    const timeDifferences = [];
    for (let i = 1; i < activities.length; i++) {
      timeDifferences.push(activities[i].timestamp - activities[i - 1].timestamp);
    }

    const avgTimeDiff = timeDifferences.reduce((a, b) => a + b, 0) / timeDifferences.length;
    const rapidActivities = activities.filter(
      (_, i) =>
        i < activities.length - 1 &&
        activities[i + 1].timestamp - activities[i].timestamp < avgTimeDiff / 3
    );

    if (rapidActivities.length > 0) {
      anomalies.push('rapid_activity_sequence');
      anomalyScore += 20;
      affectedActivities.push(...rapidActivities.map((a) => a.id));
    }

    // Detect device anomalies
    const devices = new Set(activities.map((a) => a.deviceFingerprintId));
    if (devices.size > 5) {
      anomalies.push('multiple_device_usage');
      anomalyScore += 15;
    }

    return {
      anomalies,
      anomalyScore: Math.min(anomalyScore, 100),
      affectedActivities,
    };
  }

  /**
   * Get device trust score and history
   */
  getDeviceTrustScore(userId: string, deviceId: string): {
    trustScore: number;
    usageCount: number;
    lastSeenAt: number;
    isSuspicious: boolean;
  } {
    const devices = this.deviceFingerprints.get(userId) || [];
    const device = devices.find((d) => d.id === deviceId);

    if (!device) {
      return { trustScore: 0, usageCount: 0, lastSeenAt: 0, isSuspicious: true };
    }

    return {
      trustScore: device.trustScore,
      usageCount: device.usageCount,
      lastSeenAt: device.lastSeenAt,
      isSuspicious: device.isSuspicious,
    };
  }

  /**
   * Mark device as trusted
   */
  markDeviceAsTrusted(userId: string, deviceId: string): void {
    const devices = this.deviceFingerprints.get(userId) || [];
    const device = devices.find((d) => d.id === deviceId);

    if (device) {
      device.trustScore = Math.min(100, device.trustScore + 30);
      device.isSuspicious = false;
    }
  }

  /**
   * Mark device as suspicious
   */
  markDeviceAsSuspicious(userId: string, deviceId: string): void {
    const devices = this.deviceFingerprints.get(userId) || [];
    const device = devices.find((d) => d.id === deviceId);

    if (device) {
      device.trustScore = Math.max(0, device.trustScore - 50);
      device.isSuspicious = true;
    }
  }

  /**
   * Private: Compare device fingerprints (similarity 0-1)
   */
  private compareDeviceFingerprints(fp1: DeviceFingerprint, fp2: DeviceFingerprint): number {
    let matches = 0;
    let total = 0;

    // User agent
    if (fp1.userAgent === fp2.userAgent) matches++;
    total++;

    // OS
    if (fp1.osName === fp2.osName && fp1.osVersion === fp2.osVersion) matches++;
    total++;

    // Browser
    if (fp1.browserName === fp2.browserName) matches++;
    total++;

    // Screen
    if (fp1.screen.width === fp2.screen.width && fp1.screen.height === fp2.screen.height)
      matches++;
    total++;

    // Timezone
    if (fp1.timezone === fp2.timezone) matches++;
    total++;

    // Language
    if (fp1.language === fp2.language) matches++;
    total++;

    return matches / total;
  }

  /**
   * Private: Evaluate rule conditions
   */
  private evaluateRuleConditions(rule: FraudRule, activity: ActivityRecord): boolean {
    return rule.conditions.every((condition) => {
      const value = (activity.metadata as any)[condition.field];

      switch (condition.operator) {
        case 'equals':
          return value === condition.value;
        case 'greater_than':
          return value > condition.value;
        case 'less_than':
          return value < condition.value;
        case 'contains':
          return String(value).includes(condition.value);
        case 'in':
          return condition.value.includes(value);
        default:
          return false;
      }
    });
  }

  /**
   * Private: Determine device type
   */
  private determineDeviceType(
    screen: { width: number; height: number }
  ): 'mobile' | 'tablet' | 'desktop' {
    const { width, height } = screen;
    const minDim = Math.min(width, height);

    if (minDim < 600) return 'mobile';
    if (minDim < 1024) return 'tablet';
    return 'desktop';
  }

  /**
   * Private: Parse user agent
   */
  private parseUserAgent(userAgent: string): {
    browser: string;
    version: string;
    os: string;
    osVersion: string;
  } {
    // Simplified parsing - in production use proper library
    const browserMatch = userAgent.match(/Chrome|Firefox|Safari|Edge/i);
    const osMatch = userAgent.match(/Windows|Mac|Linux|Android|iOS/i);

    return {
      browser: browserMatch?.[0] || 'Unknown',
      version: '1.0',
      os: osMatch?.[0] || 'Unknown',
      osVersion: '1.0',
    };
  }

  /**
   * Private: Check if IP is proxy/VPN
   */
  private isProxyOrVPN(_ipAddress: string): boolean {
    // In production, integrate with IP reputation service
    return false;
  }

  /**
   * Private: Check if IP is Tor exit node
   */
  private isTorExit(_ipAddress: string): boolean {
    // In production, check against Tor exit node list
    return false;
  }

  /**
   * Private: Check if IP is datacenter
   */
  private isDatacenter(_ipAddress: string): boolean {
    // In production, check against datacenter IP ranges
    return false;
  }

  /**
   * Private: Check for browser anomalies
   */
  private hasBrowserAnomaly(fingerprint: DeviceFingerprint): boolean {
    // Check for headless browser indicators
    if (fingerprint.userAgent.toLowerCase().includes('headless')) return true;

    // Check for suspicious plugin combinations
    if (fingerprint.plugins.length === 0 && fingerprint.deviceType !== 'mobile') return true;

    return false;
  }

  /**
   * Private: Assess geographic risk
   */
  private assessGeographicRisk(
    userId: string,
    fingerprint: DeviceFingerprint
  ): { isAnomaly: boolean; riskScore: number } {
    const activities = this.activityRecords.get(userId) || [];
    if (activities.length < 2) {
      return { isAnomaly: false, riskScore: 0 };
    }

    const lastActivity = activities[activities.length - 1];

    // This would store location with each activity record
    // For now, return simplified result
    return { isAnomaly: false, riskScore: 0 };
  }

  /**
   * Private: Assess rapid login risk
   */
  private assessRapidLoginRisk(userId: string): { isRisky: boolean; riskScore: number } {
    const activities = this.activityRecords.get(userId) || [];
    const recentActivities = activities.filter(
      (a) => Date.now() - a.timestamp < 60 * 60 * 1000 // Last hour
    );

    // Check for multiple locations in short time
    const locations = new Set(recentActivities.map((a) => `${a.metadata.city}-${a.metadata.country}`));

    if (locations.size > 2 && recentActivities.length > 2) {
      return { isRisky: true, riskScore: 40 };
    }

    return { isRisky: false, riskScore: 0 };
  }

  /**
   * Private: Generate fingerprint ID
   */
  private generateFingerprintId(): string {
    return 'fp_' + Math.random().toString(36).substring(2, 15);
  }
}

export const fraudDetectionService = new FraudDetectionService();
