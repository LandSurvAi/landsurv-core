/**
 * Phase 4.11.6 - AI-Powered Account Recovery Service
 * 
 * Advanced account recovery using AI-powered identity verification,
 * behavior analysis, and risk assessment
 */

import crypto from 'crypto';

/**
 * User behavior profile for anomaly detection
 */
interface UserBehaviorProfile {
  userId: string;
  lastLoginLocation: {
    latitude: number;
    longitude: number;
    country: string;
    city: string;
  };
  loginFrequency: {
    hourly: number;
    daily: number;
    weekly: number;
  };
  deviceFingerprints: string[];
  browserTypes: string[];
  ipAddresses: string[];
  typicalLoginTimes: number[]; // Hours in 24h format
  lastSecurityEventTime: number;
  recoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveryAttempts: number;
}

/**
 * Risk assessment model
 */
interface RiskAssessment {
  overallRiskScore: number; // 0-100
  factors: {
    locationAnomaly: number;
    timeAnomaly: number;
    deviceAnomaly: number;
    behaviorAnomaly: number;
    frequencyAnomaly: number;
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedVerificationMethods: string[];
  confidence: number; // 0-100
}

/**
 * Security question response
 */
interface SecurityQuestionResponse {
  questionId: string;
  answer: string;
  timestamp: number;
  confidence?: number;
}

/**
 * AI Account Recovery Service
 */
export class AIAccountRecoveryService {
  private behaviorProfiles: Map<string, UserBehaviorProfile> = new Map();
  private recoveryAttemptLog: Map<string, Array<{ timestamp: number; status: string }>> = new Map();
  private riskThresholds = {
    low: 25,
    medium: 50,
    high: 75,
    critical: 90,
  };

  /**
   * Initialize or update user behavior profile
   */
  initializeUserBehaviorProfile(
    userId: string,
    initialData: Partial<UserBehaviorProfile>
  ): UserBehaviorProfile {
    const profile: UserBehaviorProfile = {
      userId,
      lastLoginLocation: initialData.lastLoginLocation || {
        latitude: 0,
        longitude: 0,
        country: '',
        city: '',
      },
      loginFrequency: initialData.loginFrequency || {
        hourly: 0,
        daily: 0,
        weekly: 0,
      },
      deviceFingerprints: initialData.deviceFingerprints || [],
      browserTypes: initialData.browserTypes || [],
      ipAddresses: initialData.ipAddresses || [],
      typicalLoginTimes: initialData.typicalLoginTimes || [],
      lastSecurityEventTime: initialData.lastSecurityEventTime || Date.now(),
      recoveryAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveryAttempts: 0,
    };

    this.behaviorProfiles.set(userId, profile);
    return profile;
  }

  /**
   * Record successful login to build behavior profile
   */
  recordSuccessfulLogin(
    userId: string,
    loginData: {
      location?: { latitude: number; longitude: number; country: string; city: string };
      deviceFingerprint: string;
      browser: string;
      ipAddress: string;
      timestamp: number;
    }
  ): void {
    let profile = this.behaviorProfiles.get(userId);

    if (!profile) {
      profile = this.initializeUserBehaviorProfile(userId, {});
    }

    // Update last login location
    if (loginData.location) {
      profile.lastLoginLocation = loginData.location;
    }

    // Add device fingerprint
    if (!profile.deviceFingerprints.includes(loginData.deviceFingerprint)) {
      profile.deviceFingerprints.push(loginData.deviceFingerprint);
    }

    // Add browser type
    if (!profile.browserTypes.includes(loginData.browser)) {
      profile.browserTypes.push(loginData.browser);
    }

    // Add IP address
    if (!profile.ipAddresses.includes(loginData.ipAddress)) {
      profile.ipAddresses.push(loginData.ipAddress);
    }

    // Record login hour
    const hour = new Date(loginData.timestamp).getHours();
    if (!profile.typicalLoginTimes.includes(hour)) {
      profile.typicalLoginTimes.push(hour);
    }

    profile.loginFrequency.hourly++;
    profile.loginFrequency.daily++;
    profile.loginFrequency.weekly++;

    this.behaviorProfiles.set(userId, profile);
  }

  /**
   * Assess risk level for recovery attempt
   */
  assessRecoveryRisk(
    userId: string,
    recoveryAttemptData: {
      location?: { latitude: number; longitude: number; country: string; city: string };
      deviceFingerprint: string;
      browser: string;
      ipAddress: string;
      timestamp: number;
    }
  ): RiskAssessment {
    const profile = this.behaviorProfiles.get(userId);

    if (!profile) {
      // No profile = medium risk (new or unknown user)
      return {
        overallRiskScore: 50,
        factors: {
          locationAnomaly: 0,
          timeAnomaly: 0,
          deviceAnomaly: 50,
          behaviorAnomaly: 50,
          frequencyAnomaly: 0,
        },
        riskLevel: 'medium',
        recommendedVerificationMethods: ['email', 'security_questions', 'backup_codes'],
        confidence: 50,
      };
    }

    const factors = {
      locationAnomaly: this.assessLocationAnomaly(profile, recoveryAttemptData),
      timeAnomaly: this.assessTimeAnomaly(profile, recoveryAttemptData),
      deviceAnomaly: this.assessDeviceAnomaly(profile, recoveryAttemptData),
      behaviorAnomaly: this.assessBehaviorAnomaly(profile, recoveryAttemptData),
      frequencyAnomaly: this.assessFrequencyAnomaly(profile, recoveryAttemptData),
    };

    // Weighted risk calculation
    const weights = {
      locationAnomaly: 0.25,
      timeAnomaly: 0.15,
      deviceAnomaly: 0.20,
      behaviorAnomaly: 0.25,
      frequencyAnomaly: 0.15,
    };

    const overallRiskScore =
      factors.locationAnomaly * weights.locationAnomaly +
      factors.timeAnomaly * weights.timeAnomaly +
      factors.deviceAnomaly * weights.deviceAnomaly +
      factors.behaviorAnomaly * weights.behaviorAnomaly +
      factors.frequencyAnomaly * weights.frequencyAnomaly;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (overallRiskScore > this.riskThresholds.critical) {
      riskLevel = 'critical';
    } else if (overallRiskScore > this.riskThresholds.high) {
      riskLevel = 'high';
    } else if (overallRiskScore > this.riskThresholds.medium) {
      riskLevel = 'medium';
    }

    // Recommend verification methods based on risk
    const recommendedMethods = this.recommendVerificationMethods(
      riskLevel,
      factors,
      profile
    );

    // Calculate confidence in the assessment
    const confidence = this.calculateAssessmentConfidence(profile);

    return {
      overallRiskScore,
      factors,
      riskLevel,
      recommendedVerificationMethods: recommendedMethods,
      confidence,
    };
  }

  /**
   * Assess location anomaly (0-100)
   */
  private assessLocationAnomaly(
    profile: UserBehaviorProfile,
    attemptData: { location?: { latitude: number; longitude: number; country: string; city: string } }
  ): number {
    if (!attemptData.location || !profile.lastLoginLocation) {
      return 0; // No data = low anomaly
    }

    const distance = this.calculateGeoDistance(
      profile.lastLoginLocation.latitude,
      profile.lastLoginLocation.longitude,
      attemptData.location.latitude,
      attemptData.location.longitude
    );

    // Distance > 500km in < 2 hours = suspicious (impossible travel)
    if (distance > 500) return 80;
    // Distance > 1000km = highly suspicious
    if (distance > 1000) return 95;
    // Different country = moderately suspicious
    if (profile.lastLoginLocation.country !== attemptData.location.country) return 40;
    // Different city in same country = mildly suspicious
    if (profile.lastLoginLocation.city !== attemptData.location.city) return 15;

    return 5;
  }

  /**
   * Assess time anomaly (0-100)
   */
  private assessTimeAnomaly(
    profile: UserBehaviorProfile,
    attemptData: { timestamp: number }
  ): number {
    if (profile.typicalLoginTimes.length === 0) {
      return 10; // No history = low anomaly
    }

    const attemptHour = new Date(attemptData.timestamp).getHours();
    const isTypicalHour = profile.typicalLoginTimes.includes(attemptHour);

    if (!isTypicalHour) {
      // Check if adjacent hours are typical
      const adjacentHourTypical =
        profile.typicalLoginTimes.includes((attemptHour - 1 + 24) % 24) ||
        profile.typicalLoginTimes.includes((attemptHour + 1) % 24);

      if (adjacentHourTypical) return 20;
      return 60; // Unusual time
    }

    return 5;
  }

  /**
   * Assess device anomaly (0-100)
   */
  private assessDeviceAnomaly(
    profile: UserBehaviorProfile,
    attemptData: { deviceFingerprint: string; browser: string }
  ): number {
    const knownDevice = profile.deviceFingerprints.includes(attemptData.deviceFingerprint);
    const knownBrowser = profile.browserTypes.includes(attemptData.browser);

    if (knownDevice && knownBrowser) return 5;
    if (knownDevice || knownBrowser) return 25;
    if (!knownDevice && !knownBrowser) return 85; // Completely new device

    return 40;
  }

  /**
   * Assess behavior anomaly based on recovery patterns (0-100)
   */
  private assessBehaviorAnomaly(
    profile: UserBehaviorProfile,
    _attemptData: { timestamp: number }
  ): number {
    // Check recovery attempt frequency
    if (profile.recoveryAttempts > 5) return 90; // Too many recovery attempts
    if (profile.failedRecoveryAttempts > 2) return 70; // Multiple failed attempts
    if (profile.successfulRecoveries > 1 && profile.recoveryAttempts > 2) return 50; // Repeated recoveries

    // Check time since last security event
    const timeSinceLastEvent = Date.now() - profile.lastSecurityEventTime;
    const daysAgo = timeSinceLastEvent / (1000 * 60 * 60 * 24);

    if (daysAgo < 7) return 35; // Recent security event
    if (daysAgo < 30) return 15; // Moderately recent
    if (daysAgo > 365) return 25; // Long time = more suspicious

    return 10;
  }

  /**
   * Assess frequency anomaly (0-100)
   */
  private assessFrequencyAnomaly(
    profile: UserBehaviorProfile,
    _attemptData: { timestamp: number }
  ): number {
    // High login frequency is normal
    if (profile.loginFrequency.daily > 20) return 15; // Very active user
    if (profile.loginFrequency.daily > 5) return 5; // Active user

    // Low frequency but attempting recovery = moderately suspicious
    if (profile.loginFrequency.weekly < 5) return 35;
    if (profile.loginFrequency.weekly < 1) return 60; // Never logs in

    return 10;
  }

  /**
   * Recommend verification methods based on risk assessment
   */
  private recommendVerificationMethods(
    riskLevel: string,
    _factors: Record<string, number>,
    profile: UserBehaviorProfile
  ): string[] {
    const methods: string[] = [];

    switch (riskLevel) {
      case 'critical':
        // Maximum verification
        methods.push('email');
        methods.push('security_questions');
        methods.push('backup_codes');
        methods.push('support_verification');
        break;

      case 'high':
        // Multi-factor verification
        methods.push('email');
        methods.push('security_questions');
        methods.push('backup_codes');
        break;

      case 'medium':
        // Standard verification
        methods.push('email');
        if (profile.deviceFingerprints.length > 0) {
          methods.push('security_questions');
        }
        methods.push('backup_codes');
        break;

      case 'low':
      default:
        // Basic verification
        methods.push('email');
        methods.push('backup_codes');
        break;
    }

    return methods;
  }

  /**
   * Calculate assessment confidence based on profile data quality
   */
  private calculateAssessmentConfidence(profile: UserBehaviorProfile): number {
    let confidence = 50; // Base confidence

    // More devices = more confident
    if (profile.deviceFingerprints.length > 3) confidence += 15;
    if (profile.deviceFingerprints.length > 5) confidence += 10;

    // More login history = more confident
    if (profile.loginFrequency.weekly > 10) confidence += 15;
    if (profile.loginFrequency.weekly > 20) confidence += 10;

    // Known locations = more confident
    if (profile.lastLoginLocation.country) confidence += 10;

    // Typical login times = more confident
    if (profile.typicalLoginTimes.length > 5) confidence += 10;

    return Math.min(confidence, 100);
  }

  /**
   * Calculate geographic distance using Haversine formula
   */
  private calculateGeoDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Validate security question responses with AI scoring
   */
  validateSecurityAnswers(
    userId: string,
    responses: SecurityQuestionResponse[],
    expectedAnswers: Map<string, string>
  ): {
    overallMatch: number;
    answers: Array<{ questionId: string; confidence: number; match: boolean }>;
    recommendNextStep: boolean;
  } {
    const results: Array<{ questionId: string; confidence: number; match: boolean }> = [];
    let totalConfidence = 0;

    for (const response of responses) {
      const expected = expectedAnswers.get(response.questionId);
      if (!expected) continue;

      // Fuzzy matching for security answers (handles typos, case sensitivity)
      const confidence = this.calculateAnswerConfidence(response.answer, expected);
      const match = confidence > 0.75; // 75% threshold for match

      results.push({
        questionId: response.questionId,
        confidence,
        match,
      });

      totalConfidence += confidence;
    }

    const overallMatch = responses.length > 0 ? totalConfidence / responses.length : 0;
    const recommendNextStep = overallMatch > 0.6; // Recommend next step if > 60% match

    return {
      overallMatch,
      answers: results,
      recommendNextStep,
    };
  }

  /**
   * Calculate confidence for security answer using fuzzy matching
   */
  private calculateAnswerConfidence(answer: string, expected: string): number {
    const normalizedAnswer = answer.toLowerCase().trim();
    const normalizedExpected = expected.toLowerCase().trim();

    // Exact match
    if (normalizedAnswer === normalizedExpected) return 1.0;

    // Levenshtein distance for typos
    const distance = this.levenshteinDistance(normalizedAnswer, normalizedExpected);
    const maxLength = Math.max(normalizedAnswer.length, normalizedExpected.length);
    const similarity = 1 - distance / maxLength;

    // Adjust threshold: allow up to 2 character differences for longer answers
    if (similarity > 0.8) return similarity;

    return Math.max(0, similarity - 0.1);
  }

  /**
   * Calculate Levenshtein distance for fuzzy string matching
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Generate AI-powered recovery score (0-100)
   * Higher score = higher likelihood of account being legitimately owned
   */
  generateRecoveryScore(
    userId: string,
    verificationResults: {
      riskAssessment: RiskAssessment;
      securityAnswerMatch: number;
      emailVerified: boolean;
      backupCodesUsed: boolean;
    }
  ): number {
    let score = 50; // Base score

    // Risk assessment factor
    const riskFactor = Math.max(0, 100 - verificationResults.riskAssessment.overallRiskScore);
    score += riskFactor * 0.2;

    // Security answer factor
    score += verificationResults.securityAnswerMatch * 0.3;

    // Email verification bonus
    if (verificationResults.emailVerified) score += 15;

    // Backup code bonus
    if (verificationResults.backupCodesUsed) score += 10;

    // Confidence factor from risk assessment
    score += verificationResults.riskAssessment.confidence * 0.1;

    return Math.min(score, 100);
  }

  /**
   * Record recovery attempt for pattern analysis
   */
  recordRecoveryAttempt(
    userId: string,
    status: 'started' | 'success' | 'failed' | 'cancelled'
  ): void {
    if (!this.recoveryAttemptLog.has(userId)) {
      this.recoveryAttemptLog.set(userId, []);
    }

    const log = this.recoveryAttemptLog.get(userId)!;
    log.push({
      timestamp: Date.now(),
      status,
    });

    // Update profile
    const profile = this.behaviorProfiles.get(userId);
    if (profile) {
      profile.recoveryAttempts++;
      if (status === 'success') {
        profile.successfulRecoveries++;
      } else if (status === 'failed') {
        profile.failedRecoveryAttempts++;
      }
      profile.lastSecurityEventTime = Date.now();
    }
  }

  /**
   * Generate device fingerprint from browser data
   */
  generateDeviceFingerprint(browserData: {
    userAgent: string;
    language: string;
    timezone: string;
    screen: { width: number; height: number; colorDepth: number };
    plugins: string[];
  }): string {
    const fingerprintData = JSON.stringify(browserData);
    return crypto.createHash('sha256').update(fingerprintData).digest('hex');
  }

  /**
   * Detect if recovery attempt looks like automated attack
   */
  detectAutomatedAttack(userId: string): {
    isLikelyAttack: boolean;
    indicators: string[];
    confidenceScore: number;
  } {
    const log = this.recoveryAttemptLog.get(userId);
    if (!log || log.length === 0) {
      return { isLikelyAttack: false, indicators: [], confidenceScore: 0 };
    }

    const indicators: string[] = [];
    let confidenceScore = 0;

    // Check for rapid-fire recovery attempts
    const recentAttempts = log.filter((a) => Date.now() - a.timestamp < 60 * 60 * 1000); // Last hour
    if (recentAttempts.length > 10) {
      indicators.push('excessive_recovery_attempts');
      confidenceScore += 35;
    }

    // Check for many failed attempts
    const failedAttempts = recentAttempts.filter((a) => a.status === 'failed');
    if (failedAttempts.length > 5) {
      indicators.push('multiple_failed_attempts');
      confidenceScore += 25;
    }

    // Check for rapid attempt pattern (less than 5 seconds apart)
    for (let i = 1; i < recentAttempts.length; i++) {
      if (recentAttempts[i].timestamp - recentAttempts[i - 1].timestamp < 5000) {
        indicators.push('rapid_fire_pattern');
        confidenceScore += 20;
        break;
      }
    }

    const isLikelyAttack = confidenceScore > 50;

    return {
      isLikelyAttack,
      indicators,
      confidenceScore: Math.min(confidenceScore, 100),
    };
  }
}

export const aiAccountRecoveryService = new AIAccountRecoveryService();
