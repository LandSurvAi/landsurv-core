/**
 * Phase 4.11.6 - Biometric Authentication Service
 * 
 * Support for fingerprint, facial recognition, and WebAuthn passwordless auth
 */

/**
 * Biometric credential types
 */
export enum BiometricType {
  FINGERPRINT = 'fingerprint',
  FACE = 'face',
  IRIS = 'iris',
  VOICE = 'voice',
  WEBAUTHN = 'webauthn',
}

/**
 * Biometric credential
 */
interface BiometricCredential {
  id: string;
  userId: string;
  type: BiometricType;
  publicKey?: string;
  challengeToken?: string;
  enrollmentDate: number;
  lastUsedDate: number;
  usageCount: number;
  isActive: boolean;
  deviceId: string;
  deviceName: string;
  trustScore: number; // 0-100
}

/**
 * WebAuthn attestation object
 */
interface WebAuthnAttestation {
  fmt: string;
  attStmt: Record<string, any>;
  authData: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  transports: string[];
}

/**
 * Biometric authentication service
 */
export class BiometricAuthService {
  private biometricCredentials: Map<string, BiometricCredential[]> = new Map();
  private webAuthnChallenges: Map<string, { challenge: string; userId: string; expiry: number }> =
    new Map();
  private failedAttempts: Map<string, Array<{ timestamp: number; type: BiometricType }>> =
    new Map();

  private readonly maxFailedAttempts = 5;
  private readonly lockoutDuration = 30 * 60 * 1000; // 30 minutes
  private readonly challengeExpiry = 10 * 60 * 1000; // 10 minutes

  /**
   * Register fingerprint biometric
   */
  async registerFingerprint(
    userId: string,
    fingerprintData: {
      template: string; // Biometric template
      quality: number; // 0-100
      finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
      hand: 'left' | 'right';
      deviceId: string;
      deviceName: string;
    }
  ): Promise<{
    credentialId: string;
    success: boolean;
    trustScore: number;
  }> {
    // Validate fingerprint quality
    if (fingerprintData.quality < 75) {
      throw new Error('Fingerprint quality too low. Please try again.');
    }

    const credentialId = this.generateCredentialId();
    const credential: BiometricCredential = {
      id: credentialId,
      userId,
      type: BiometricType.FINGERPRINT,
      publicKey: this.hashBiometricTemplate(fingerprintData.template),
      enrollmentDate: Date.now(),
      lastUsedDate: Date.now(),
      usageCount: 0,
      isActive: true,
      deviceId: fingerprintData.deviceId,
      deviceName: fingerprintData.deviceName,
      trustScore: fingerprintData.quality, // Initial trust = quality
    };

    this.storeCredential(userId, credential);

    return {
      credentialId,
      success: true,
      trustScore: credential.trustScore,
    };
  }

  /**
   * Register facial recognition biometric
   */
  async registerFaceRecognition(
    userId: string,
    faceData: {
      faceDescriptor: number[]; // 128-D vector from face recognition model
      quality: number; // 0-100
      liveness: number; // Liveness detection score 0-100
      yaw: number; // Head rotation
      pitch: number;
      roll: number;
      deviceId: string;
      deviceName: string;
    }
  ): Promise<{
    credentialId: string;
    success: boolean;
    trustScore: number;
  }> {
    // Validate face quality and liveness
    if (faceData.quality < 80) {
      throw new Error('Face quality too low. Please try again.');
    }

    if (faceData.liveness < 85) {
      throw new Error('Liveness check failed. Please ensure you are in front of the camera.');
    }

    // Check head pose is reasonable (not too extreme angles)
    if (Math.abs(faceData.yaw) > 30 || Math.abs(faceData.pitch) > 30 || Math.abs(faceData.roll) > 15) {
      throw new Error('Head pose too extreme. Please face the camera directly.');
    }

    const credentialId = this.generateCredentialId();
    const trustScore = Math.min(faceData.quality, faceData.liveness); // Trust = minimum of quality and liveness

    const credential: BiometricCredential = {
      id: credentialId,
      userId,
      type: BiometricType.FACE,
      publicKey: this.hashBiometricTemplate(faceData.faceDescriptor.join(',')),
      enrollmentDate: Date.now(),
      lastUsedDate: Date.now(),
      usageCount: 0,
      isActive: true,
      deviceId: faceData.deviceId,
      deviceName: faceData.deviceName,
      trustScore,
    };

    this.storeCredential(userId, credential);

    return {
      credentialId,
      success: true,
      trustScore,
    };
  }

  /**
   * Register WebAuthn credential (FIDO2/U2F)
   */
  async registerWebAuthn(
    userId: string,
    attestation: WebAuthnAttestation,
    deviceName: string
  ): Promise<{
    credentialId: string;
    success: boolean;
    trustScore: number;
  }> {
    // Verify attestation (simplified - in production use full verification)
    if (!attestation.credentialId || !attestation.publicKey) {
      throw new Error('Invalid WebAuthn attestation');
    }

    const credentialId = this.generateCredentialId();

    const credential: BiometricCredential = {
      id: credentialId,
      userId,
      type: BiometricType.WEBAUTHN,
      publicKey: attestation.publicKey,
      enrollmentDate: Date.now(),
      lastUsedDate: Date.now(),
      usageCount: 0,
      isActive: true,
      deviceId: attestation.credentialId,
      deviceName,
      trustScore: 100, // WebAuthn is highly trusted
    };

    this.storeCredential(userId, credential);

    return {
      credentialId,
      success: true,
      trustScore: 100,
    };
  }

  /**
   * Authenticate using fingerprint
   */
  async authenticateWithFingerprint(
    userId: string,
    fingerprintData: {
      template: string;
      quality: number;
      deviceId: string;
    }
  ): Promise<{
    authenticated: boolean;
    matchScore: number;
    trustScore: number;
    credentialId?: string;
  }> {
    // Check for lockout
    if (this.isLockedOut(userId, BiometricType.FINGERPRINT)) {
      throw new Error('Too many failed attempts. Please try again later.');
    }

    const credentials = this.biometricCredentials.get(userId);
    if (!credentials || credentials.length === 0) {
      throw new Error('No fingerprint credentials registered');
    }

    // Find fingerprints on the same device
    const deviceCredentials = credentials.filter(
      (c) => c.type === BiometricType.FINGERPRINT && c.deviceId === fingerprintData.deviceId
    );

    if (deviceCredentials.length === 0) {
      this.recordFailedAttempt(userId, BiometricType.FINGERPRINT);
      return {
        authenticated: false,
        matchScore: 0,
        trustScore: 0,
      };
    }

    // Compare against enrolled fingerprints
    let bestMatch = 0;
    let bestCredential: BiometricCredential | null = null;

    // Hash the input template the same way we hash during registration
    const hashedInputTemplate = this.hashBiometricTemplate(fingerprintData.template);

    for (const credential of deviceCredentials) {
      if (!credential.isActive) continue;

      const matchScore = this.compareFingerprintTemplates(
        hashedInputTemplate,
        credential.publicKey!
      );

      if (matchScore > bestMatch) {
        bestMatch = matchScore;
        bestCredential = credential;
      }
    }

    // Fingerprint match threshold is typically 97-99%
    const isMatch = bestMatch > 0.97;

    if (isMatch && bestCredential) {
      bestCredential.lastUsedDate = Date.now();
      bestCredential.usageCount++;

      // Update trust score based on consistent usage
      bestCredential.trustScore = Math.min(
        100,
        bestCredential.trustScore + bestCredential.usageCount * 0.5
      );

      // Clear failed attempts
      this.failedAttempts.delete(userId);

      return {
        authenticated: true,
        matchScore: bestMatch,
        trustScore: bestCredential.trustScore,
        credentialId: bestCredential.id,
      };
    } else {
      this.recordFailedAttempt(userId, BiometricType.FINGERPRINT);
      return {
        authenticated: false,
        matchScore: bestMatch,
        trustScore: 0,
      };
    }
  }

  /**
   * Authenticate using facial recognition
   */
  async authenticateWithFace(
    userId: string,
    faceData: {
      faceDescriptor: number[];
      quality: number;
      liveness: number;
      deviceId: string;
    }
  ): Promise<{
    authenticated: boolean;
    matchScore: number;
    livenessScore: number;
    trustScore: number;
    credentialId?: string;
  }> {
    // Check for lockout
    if (this.isLockedOut(userId, BiometricType.FACE)) {
      throw new Error('Too many failed attempts. Please try again later.');
    }

    // Verify liveness
    if (faceData.liveness < 85) {
      this.recordFailedAttempt(userId, BiometricType.FACE);
      return {
        authenticated: false,
        matchScore: 0,
        livenessScore: faceData.liveness,
        trustScore: 0,
      };
    }

    const credentials = this.biometricCredentials.get(userId);
    if (!credentials || credentials.length === 0) {
      throw new Error('No face credentials registered');
    }

    // Find face credentials on the same device
    const deviceCredentials = credentials.filter(
      (c) => c.type === BiometricType.FACE && c.deviceId === faceData.deviceId
    );

    if (deviceCredentials.length === 0) {
      this.recordFailedAttempt(userId, BiometricType.FACE);
      return {
        authenticated: false,
        matchScore: 0,
        livenessScore: faceData.liveness,
        trustScore: 0,
      };
    }

    // Compare face descriptors
    let bestMatch = 0;
    let bestCredential: BiometricCredential | null = null;

    for (const credential of deviceCredentials) {
      if (!credential.isActive) continue;

      const matchScore = this.compareFaceDescriptors(
        faceData.faceDescriptor,
        credential.publicKey!
      );

      if (matchScore > bestMatch) {
        bestMatch = matchScore;
        bestCredential = credential;
      }
    }

    // Face match threshold is typically 0.6 (cosine similarity)
    const isMatch = bestMatch > 0.6;

    if (isMatch && bestCredential) {
      bestCredential.lastUsedDate = Date.now();
      bestCredential.usageCount++;

      // Update trust score
      bestCredential.trustScore = Math.min(
        100,
        bestCredential.trustScore + bestCredential.usageCount * 0.3
      );

      this.failedAttempts.delete(userId);

      return {
        authenticated: true,
        matchScore: bestMatch,
        livenessScore: faceData.liveness,
        trustScore: bestCredential.trustScore,
        credentialId: bestCredential.id,
      };
    } else {
      this.recordFailedAttempt(userId, BiometricType.FACE);
      return {
        authenticated: false,
        matchScore: bestMatch,
        livenessScore: faceData.liveness,
        trustScore: 0,
      };
    }
  }

  /**
   * Create WebAuthn registration challenge
   */
  createWebAuthnChallenge(userId: string): {
    challenge: string;
    timeout: number;
    attestation: string;
    rp: Record<string, any>;
    user: Record<string, any>;
  } {
    const challenge = this.generateChallenge();
    const challengeId = this.generateCredentialId();

    this.webAuthnChallenges.set(challengeId, {
      challenge,
      userId,
      expiry: Date.now() + this.challengeExpiry,
    });

    return {
      challenge,
      timeout: this.challengeExpiry,
      attestation: 'direct',
      rp: {
        name: 'LandSurv.ai',
        id: 'landsurv.ai',
      },
      user: {
        id: this.encodeUserId(userId),
        name: userId,
        displayName: userId,
      },
    };
  }

  /**
   * Verify WebAuthn authentication
   */
  async verifyWebAuthnAssertion(
    userId: string,
    assertion: {
      credentialId: string;
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle: string;
    }
  ): Promise<{
    authenticated: boolean;
    trustScore: number;
  }> {
    const credentials = this.biometricCredentials.get(userId);
    if (!credentials || credentials.length === 0) {
      throw new Error('No WebAuthn credentials registered');
    }

    const credential = credentials.find(
      (c) => c.type === BiometricType.WEBAUTHN && c.deviceId === assertion.credentialId
    );

    if (!credential) {
      this.recordFailedAttempt(userId, BiometricType.WEBAUTHN);
      return {
        authenticated: false,
        trustScore: 0,
      };
    }

    // Verify signature (simplified - in production use full verification)
    const isValid = this.verifyWebAuthnSignature(
      assertion.signature,
      assertion.authenticatorData,
      credential.publicKey!
    );

    if (isValid) {
      credential.lastUsedDate = Date.now();
      credential.usageCount++;
      this.failedAttempts.delete(userId);

      return {
        authenticated: true,
        trustScore: 100,
      };
    } else {
      this.recordFailedAttempt(userId, BiometricType.WEBAUTHN);
      return {
        authenticated: false,
        trustScore: 0,
      };
    }
  }

  /**
   * List all biometric credentials for a user
   */
  listBiometricCredentials(userId: string): BiometricCredential[] {
    return (
      this.biometricCredentials.get(userId)?.map((c) => ({
        ...c,
        publicKey: undefined, // Never expose public key
      })) || []
    );
  }

  /**
   * Remove a biometric credential
   */
  removeBiometricCredential(userId: string, credentialId: string): boolean {
    const credentials = this.biometricCredentials.get(userId);
    if (!credentials) return false;

    const index = credentials.findIndex((c) => c.id === credentialId);
    if (index === -1) return false;

    credentials.splice(index, 1);
    return true;
  }

  /**
   * Private helper: Store credential
   */
  private storeCredential(userId: string, credential: BiometricCredential): void {
    if (!this.biometricCredentials.has(userId)) {
      this.biometricCredentials.set(userId, []);
    }
    this.biometricCredentials.get(userId)!.push(credential);
  }

  /**
   * Private helper: Check if user is locked out
   */
  private isLockedOut(userId: string, type: BiometricType): boolean {
    const attempts = this.failedAttempts.get(userId) || [];
    const recentFailures = attempts.filter(
      (a) => a.type === type && Date.now() - a.timestamp < this.lockoutDuration
    );

    return recentFailures.length >= this.maxFailedAttempts;
  }

  /**
   * Private helper: Record failed attempt
   */
  private recordFailedAttempt(userId: string, type: BiometricType): void {
    if (!this.failedAttempts.has(userId)) {
      this.failedAttempts.set(userId, []);
    }

    this.failedAttempts.get(userId)!.push({
      timestamp: Date.now(),
      type,
    });

    // Clean up old attempts
    const attempts = this.failedAttempts.get(userId)!;
    const cutoff = Date.now() - this.lockoutDuration;
    const filtered = attempts.filter((a) => a.timestamp > cutoff);
    this.failedAttempts.set(userId, filtered);
  }

  /**
   * Private helper: Generate credential ID
   */
  private generateCredentialId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Private helper: Generate WebAuthn challenge
   */
  private generateChallenge(): string {
    return Buffer.from(Math.random().toString()).toString('base64').substring(0, 32);
  }

  /**
   * Private helper: Hash biometric template
   */
  private hashBiometricTemplate(template: string): string {
    // In production, use proper hashing and never store raw templates
    return Buffer.from(template).toString('base64');
  }

  /**
   * Private helper: Compare fingerprint templates
   */
  private compareFingerprintTemplates(template1: string, template2: string): number {
    // Simplified comparison - in production use proper fingerprint matching algorithm
    // This should use MinutiaeMatching or similar
    const hash1 = template1.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const hash2 = template2.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

    const diff = Math.abs(hash1 - hash2);
    return Math.max(0, 1 - diff / Math.max(hash1, hash2, 1));
  }

  /**
   * Private helper: Compare face descriptors using cosine similarity
   */
  private compareFaceDescriptors(descriptor1: number[], descriptorStr: string): number {
    const descriptor2 = descriptorStr
      .split(',')
      .map((v) => parseFloat(v))
      .filter((v) => !isNaN(v));

    if (descriptor1.length !== descriptor2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < descriptor1.length; i++) {
      dotProduct += descriptor1[i] * descriptor2[i];
      norm1 += descriptor1[i] * descriptor1[i];
      norm2 += descriptor2[i] * descriptor2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Private helper: Verify WebAuthn signature
   */
  private verifyWebAuthnSignature(_signature: string, _data: string, _publicKey: string): boolean {
    // Simplified - in production use proper WebAuthn signature verification
    return true;
  }

  /**
   * Private helper: Encode user ID for WebAuthn
   */
  private encodeUserId(userId: string): string {
    return Buffer.from(userId).toString('base64');
  }
}

export const biometricAuthService = new BiometricAuthService();
