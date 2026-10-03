/**
 * Phase 4.11.6 - Advanced Authentication Components
 * 
 * React components for biometric auth, AI recovery, and fraud detection
 */

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext.tsx';
import { biometricAuthService } from '@/services/biometric-auth';
import { fraudDetectionService } from '@/services/fraud-detection';
import { aiAccountRecoveryService } from '@/services/ai-account-recovery';

/**
 * BiometricAuthPanel - Component for registering and using biometric authentication
 */
export const BiometricAuthPanel: React.FC<{ userId: string; onSuccess?: () => void }> = ({
  userId,
  onSuccess,
}) => {
  const [step, setStep] = useState<'choose' | 'fingerprint' | 'face' | 'webauthn' | 'success'>('choose');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { addNotification } = useAppState();

  const handleRegisterFingerprint = useCallback(async () => {
    setIsLoading(true);

    try {
      // In production, this would integrate with device biometric APIs
      const result = await biometricAuthService.registerFingerprint(userId, {
        template: 'fingerprint-template-from-device',
        quality: 92,
        finger: 'thumb',
        hand: 'right',
        deviceId: 'device-' + Math.random(),
        deviceName: navigator.userAgent,
      });

      setSuccessMessage(`Fingerprint registered! Credential ID: ${result.credentialId}`);
      setStep('success');
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register fingerprint';
      addNotification({ kind: 'biometric-auth', severity: 'error', title: 'Biometric Auth', message });
    } finally {
      setIsLoading(false);
    }
  }, [userId, onSuccess, addNotification]);

  const handleRegisterFace = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await biometricAuthService.registerFaceRecognition(userId, {
        faceDescriptor: Array(128).fill(0.5), // Would come from face detection model
        quality: 90,
        liveness: 95,
        yaw: 5,
        pitch: 3,
        roll: 2,
        deviceId: 'device-' + Math.random(),
        deviceName: navigator.userAgent,
      });

      setSuccessMessage(`Face registered! Credential ID: ${result.credentialId}`);
      setStep('success');
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register face';
      addNotification({ kind: 'biometric-auth', severity: 'error', title: 'Biometric Auth', message });
    } finally {
      setIsLoading(false);
    }
  }, [userId, onSuccess, addNotification]);

  return (
    <div className="biometric-auth-panel">
      <h2>Biometric Authentication</h2>

      {successMessage && <div className="success-message">{successMessage}</div>}

      {step === 'choose' && (
        <div className="biometric-options">
          <button onClick={() => setStep('fingerprint')} disabled={isLoading}>
            Register Fingerprint
          </button>
          <button onClick={() => setStep('face')} disabled={isLoading}>
            Register Face Recognition
          </button>
          <button onClick={() => setStep('webauthn')} disabled={isLoading}>
            Register Security Key (WebAuthn)
          </button>
        </div>
      )}

      {step === 'fingerprint' && (
        <div className="biometric-registration">
          <p>Place your finger on the scanner</p>
          <button onClick={handleRegisterFingerprint} disabled={isLoading}>
            {isLoading ? 'Registering...' : 'Start Fingerprint Registration'}
          </button>
          <button onClick={() => setStep('choose')}>Back</button>
        </div>
      )}

      {step === 'face' && (
        <div className="biometric-registration">
          <p>Position your face in front of the camera</p>
          <button onClick={handleRegisterFace} disabled={isLoading}>
            {isLoading ? 'Registering...' : 'Start Face Registration'}
          </button>
          <button onClick={() => setStep('choose')}>Back</button>
        </div>
      )}

      {step === 'success' && (
        <div className="registration-success">
          <p>{successMessage}</p>
          <button onClick={() => setStep('choose')}>Register Another Method</button>
        </div>
      )}
    </div>
  );
};

/**
 * FraudDetectionIndicator - Shows fraud risk indicators for current session
 */
export const FraudDetectionIndicator: React.FC<{ userId: string }> = ({ userId }) => {
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const [indicators, setIndicators] = useState<string[]>([]);

  React.useEffect(() => {
    // Generate device fingerprint and check for fraud
    const fp = fraudDetectionService.generateDeviceFingerprint(userId, {
      userAgent: navigator.userAgent,
      screen: {
        width: window.innerWidth,
        height: window.innerHeight,
        colorDepth: (window as any).screen?.colorDepth || 24,
        pixelDepth: (window as any).screen?.pixelDepth || 24,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      plugins: Array.from((window.navigator as any).plugins || []).map((p: any) => p.name),
      canvas: 'canvas-fingerprint-hash', // Would be generated via canvas API
      webgl: 'webgl-fingerprint-hash', // Would be generated via WebGL
      ipAddress: '0.0.0.0', // Would come from backend
      geoLocation: {
        country: 'US',
        region: 'NY',
        city: 'New York',
        lat: 40.7128,
        lon: -74.006,
      },
    });

    const analysis = fraudDetectionService.analyzeDeviceForFraud(userId, fp);
    setRiskLevel(
      analysis.riskScore > 85
        ? 'critical'
        : analysis.riskScore > 75
          ? 'high'
          : analysis.riskScore > 50
            ? 'medium'
            : 'low'
    );
    setIndicators(analysis.indicators);
  }, [userId]);

  const riskColors = {
    low: '#4caf50',
    medium: '#ff9800',
    high: '#f44336',
    critical: '#8b0000',
  };

  return (
    <div className="fraud-detection-indicator" style={{ borderColor: riskColors[riskLevel] }}>
      <div className="risk-level" style={{ color: riskColors[riskLevel] }}>
        Risk: {riskLevel.toUpperCase()}
      </div>
      {indicators.length > 0 && (
        <div className="indicators">
          <p>Detected Issues:</p>
          <ul>
            {indicators.map((indicator) => (
              <li key={indicator}>{indicator.replace(/_/g, ' ')}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * AIRecoveryPanel - Advanced account recovery using AI-powered verification
 */
export const AIRecoveryPanel: React.FC<{ userId: string; onSuccess?: () => void }> = ({
  userId,
  onSuccess,
}) => {
  const [step, setStep] = useState<'verify-identity' | 'security-questions' | 'device-check' | 'success'>(
    'verify-identity'
  );
  const [riskAssessment, setRiskAssessment] = useState<any>(null);
  const [recoveryScore, setRecoveryScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const { addNotification } = useAppState();

  const handleVerifyIdentity = useCallback(async () => {
    setIsLoading(true);

    try {
      // Initialize behavior profile (would come from database)
      aiAccountRecoveryService.initializeUserBehaviorProfile(userId, {
        lastLoginLocation: { latitude: 40.7128, longitude: -74.006, country: 'US', city: 'NYC' },
        deviceFingerprints: [],
        typicalLoginTimes: [9, 10, 11, 14, 15],
      });

      // Assess recovery risk
      const assessment = aiAccountRecoveryService.assessRecoveryRisk(userId, {
        location: { latitude: 40.7128, longitude: -74.006, country: 'US', city: 'NYC' },
        deviceFingerprint: 'device-fp',
        browser: 'Chrome',
        ipAddress: '192.168.1.1',
        timestamp: Date.now(),
      });

      setRiskAssessment(assessment);

      if (assessment.riskLevel === 'low') {
        // Low risk - can proceed to security questions
        setStep('security-questions');
      } else if (assessment.riskLevel === 'critical') {
        // Critical risk - need manual verification
        addNotification({ kind: 'ai-recovery', severity: 'error', title: 'Account Recovery', message: 'Your account recovery requires manual verification. Please contact support.' });
      } else {
        // Medium/high risk - proceed with caution
        setStep('security-questions');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify identity';
      addNotification({ kind: 'ai-recovery', severity: 'error', title: 'Account Recovery', message });
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const handleVerifySecurityQuestions = useCallback(async () => {
    setIsLoading(true);

    try {
      // Validate security answers (in production, these come from user input)
      const responses = [
        { questionId: 'q1', answer: 'New York', timestamp: Date.now() },
        { questionId: 'q2', answer: 'Blue', timestamp: Date.now() },
      ];

      const expectedAnswers = new Map([
        ['q1', 'New York'],
        ['q2', 'Blue'],
      ]);

      const validation = aiAccountRecoveryService.validateSecurityAnswers(
        userId,
        responses,
        expectedAnswers
      );

      // Generate recovery score
      const score = aiAccountRecoveryService.generateRecoveryScore(userId, {
        riskAssessment: riskAssessment || {
          overallRiskScore: 50,
          factors: {},
          riskLevel: 'medium',
          recommendedVerificationMethods: [],
          confidence: 75,
        },
        securityAnswerMatch: validation.overallMatch,
        emailVerified: true,
        backupCodesUsed: false,
      });

      setRecoveryScore(score);

      if (score > 80) {
        // Account recovery verified
        aiAccountRecoveryService.recordRecoveryAttempt(userId, 'success');
        setStep('success');
        onSuccess?.();
      } else {
        addNotification({ kind: 'ai-recovery', severity: 'error', title: 'Account Recovery', message: 'Recovery verification failed. Please try again.' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify answers';
      addNotification({ kind: 'ai-recovery', severity: 'error', title: 'Account Recovery', message });
    } finally {
      setIsLoading(false);
    }
  }, [userId, riskAssessment, onSuccess]);

  return (
    <div className="ai-recovery-panel">
      <h2>AI-Powered Account Recovery</h2>

      {step === 'verify-identity' && (
        <div className="recovery-step">
          <h3>Verify Your Identity</h3>
          <p>We're analyzing your login pattern and device information.</p>
          <button onClick={handleVerifyIdentity} disabled={isLoading}>
            {isLoading ? 'Analyzing...' : 'Start Verification'}
          </button>

          {riskAssessment && (
            <div className="risk-details">
              <p>Risk Level: {riskAssessment.riskLevel}</p>
              <p>Confidence: {Math.round(riskAssessment.confidence)}%</p>
            </div>
          )}
        </div>
      )}

      {step === 'security-questions' && (
        <div className="recovery-step">
          <h3>Answer Security Questions</h3>
          <p>Please answer the security questions we've verified with your account.</p>
          {/* In production, render actual security questions from database */}
          <div className="security-questions">
            <div>
              <label>What is your favorite city?</label>
              <input type="text" placeholder="Enter your answer" />
            </div>
            <div>
              <label>What is your favorite color?</label>
              <input type="text" placeholder="Enter your answer" />
            </div>
          </div>
          <button onClick={handleVerifySecurityQuestions} disabled={isLoading}>
            {isLoading ? 'Verifying...' : 'Verify Answers'}
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="recovery-success">
          <h3>Account Recovery Successful</h3>
          <p>Recovery Score: {Math.round(recoveryScore)}/100</p>
          <p>Your account access has been restored.</p>
          <button onClick={() => setStep('verify-identity')}>Back</button>
        </div>
      )}
    </div>
  );
};

/**
 * BiometricLoginButton - Button to authenticate with biometric
 */
export const BiometricLoginButton: React.FC<{ onSuccess?: () => void; onError?: (error: string) => void }> = ({
  onSuccess,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleBiometricAuth = useCallback(async () => {
    setIsLoading(true);

    try {
      // In production, this would use the actual device biometric API
      const result = await biometricAuthService.authenticateWithFingerprint('user-123', {
        template: 'fingerprint-template-from-device',
        quality: 92,
        deviceId: 'device-id',
      });

      if (result.authenticated) {
        onSuccess?.();
      } else {
        onError?.('Biometric authentication failed. Please try again.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Biometric authentication failed';
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  }, [onSuccess, onError]);

  return (
    <button className="biometric-login-btn" onClick={handleBiometricAuth} disabled={isLoading}>
      {isLoading ? 'Authenticating...' : '👆 Authenticate with Fingerprint'}
    </button>
  );
};

export default {
  BiometricAuthPanel,
  FraudDetectionIndicator,
  AIRecoveryPanel,
  BiometricLoginButton,
};
