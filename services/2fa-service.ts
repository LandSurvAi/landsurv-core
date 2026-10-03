/**
 * 2FA Service - TOTP and Backup Codes Management
 * Implements Time-based One-Time Password (TOTP) generation and validation
 * Integrated with PostgreSQL database via DatabaseClient
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { DatabaseClient } from '../database/client';
import { TwoFactorBackupCode, TwoFactorEvent, TwoFactorSetupRequest, TwoFactorVerify } from '../types/database';

/**
 * 2FA Configuration
 */
export interface TwoFactorConfig {
  window: number; // Time window for TOTP validation (default 30 seconds)
  codeLength: number; // Length of TOTP codes (default 6 digits)
  backupCodeCount: number; // Number of backup codes to generate
}

/**
 * 2FA Setup Result
 */
export interface TwoFactorSetup {
  secret: string; // Base32 encoded secret
  qrCode: string; // QR code data URL
  backupCodes: string[]; // Array of backup codes
}

/**
 * 2FA Service
 */
export class TwoFactorAuthService {
  private config: TwoFactorConfig;
  private db: DatabaseClient;

  constructor(config: Partial<TwoFactorConfig> = {}, db?: DatabaseClient) {
    this.config = {
      window: config.window || 1, // ±1 time step
      codeLength: config.codeLength || 6,
      backupCodeCount: config.backupCodeCount || 10
    };
    this.db = db || new DatabaseClient();
  }

  /**
   * Generate TOTP secret and QR code for 2FA setup
   * @param email User email for TOTP label
   * @param appName Application name
   * @returns TwoFactorSetup with secret, QR code, and backup codes
   */
  async generateTwoFactorSecret(
    email: string,
    appName: string = 'LandSurv.ai'
  ): Promise<TwoFactorSetup> {
    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `${appName} (${email})`,
      issuer: appName,
      length: 32, // 256-bit secret
    });

    if (!secret.base32) {
      throw new Error('Failed to generate TOTP secret');
    }

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    return {
      secret: secret.base32,
      qrCode,
      backupCodes
    };
  }

  /**
   * Verify TOTP code
   * @param secret Base32 encoded secret
   * @param token TOTP code to verify
   * @returns true if token is valid, false otherwise
   */
  verifyTOTPCode(secret: string, token: string): boolean {
    try {
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: this.config.window
      });

      return verified;
    } catch (error) {
      console.error('TOTP verification failed:', error);
      return false;
    }
  }

  /**
   * Generate backup codes
   * @param count Number of codes to generate
   * @returns Array of backup codes
   */
  generateBackupCodes(count: number = this.config.backupCodeCount): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      // Generate 8-byte random code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      // Format as XXXX-XXXX
      const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`;
      codes.push(formattedCode);
    }

    return codes;
  }

  /**
   * Hash backup code for storage
   * @param code Backup code to hash
   * @returns Hashed code
   */
  hashBackupCode(code: string): string {
    return crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');
  }

  /**
   * Verify backup code
   * @param code Backup code to verify
   * @param hashedCode Stored hashed code
   * @returns true if code matches
   */
  verifyBackupCode(code: string, hashedCode: string): boolean {
    const codeHash = this.hashBackupCode(code);
    return codeHash === hashedCode;
  }

  /**
   * Verify TOTP or backup code
   * @param secret TOTP secret
   * @param token Code to verify (TOTP or backup)
   * @param backupCodes Array of hashed backup codes
   * @returns { valid: boolean, isBackup: boolean }
   */
  verifyCode(
    secret: string,
    token: string,
    backupCodes: Array<{ code: string; used: boolean }>
  ): { valid: boolean; isBackup: boolean } {
    // Remove dashes and spaces for flexibility
    const cleanToken = token.replace(/[-\s]/g, '');

    // Try TOTP first
    if (cleanToken.length === 6 && /^\d+$/.test(cleanToken)) {
      if (this.verifyTOTPCode(secret, cleanToken)) {
        return { valid: true, isBackup: false };
      }
    }

    // Try backup codes
    for (const backupCode of backupCodes) {
      if (!backupCode.used && this.verifyBackupCode(cleanToken, backupCode.code)) {
        return { valid: true, isBackup: true };
      }
    }

    return { valid: false, isBackup: false };
  }

  /**
   * Generate current TOTP code (for testing/debugging)
   * @param secret Base32 encoded secret
   * @returns Current TOTP code
   */
  getCurrentTOTPCode(secret: string): string {
    try {
      const code = speakeasy.totp({
        secret,
        encoding: 'base32'
      });
      return code;
    } catch (error) {
      console.error('Failed to generate TOTP code:', error);
      return '';
    }
  }

  /**
   * Get time remaining for current TOTP code (seconds)
   * @returns Seconds remaining (0-30)
   */
  getTimeRemaining(): number {
    const now = Date.now();
    const timeStep = 30000; // 30 seconds
    return timeStep - (now % timeStep);
  }

  /**
   * Generate TOTP codes for next N time steps (for testing)
   * @param secret Base32 encoded secret
   * @param steps Number of future steps
   * @returns Array of valid codes for next N time steps
   */
  generateFutureCodesForTesting(secret: string, steps: number = 2): string[] {
    const codes: string[] = [];

    for (let i = 0; i <= steps; i++) {
      try {
        const code = speakeasy.totp({
          secret,
          encoding: 'base32',
          step: Math.floor(Date.now() / 1000 / 30) + i
        });
        codes.push(code);
      } catch (error) {
        console.error(`Failed to generate code for step ${i}:`, error);
      }
    }

    return codes;
  }

  /**
   * Enable 2FA for user - stores in database
   * @param userId User ID
   * @param secret TOTP secret
   * @param backupCodes Array of backup codes
   * @returns true if successful
   */
  async enable2FAInDatabase(
    userId: string,
    secret: string,
    backupCodes: string[]
  ): Promise<boolean> {
    try {
      // Enable 2FA in users table
      await this.db.enable2FA(userId, secret, 'totp');

      // Store backup codes
      const hashedBackupCodes = backupCodes.map(code => this.hashBackupCode(code));
      for (const hashedCode of hashedBackupCodes) {
        await this.db.createBackupCode(userId, hashedCode);
      }

      await this.logTwoFactorEvent(userId, 'setup', true, { backupCodeCount: backupCodes.length });
      console.log(`2FA enabled for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Failed to enable 2FA in database:', error);
      throw error;
    }
  }

  /**
   * Disable 2FA for user - removes from database
   * @param userId User ID
   * @returns true if successful
   */
  async disable2FAInDatabase(userId: string): Promise<boolean> {
    try {
      await this.db.disable2FA(userId);
      console.log(`2FA disabled for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Failed to disable 2FA in database:', error);
      throw error;
    }
  }

  /**
   * Get 2FA status for user
   * @param userId User ID
   * @returns Backup codes if 2FA enabled, empty array otherwise
   */
  async get2FAStatusFromDatabase(userId: string): Promise<TwoFactorBackupCode[]> {
    try {
      return await this.db.getBackupCodes(userId);
    } catch (error) {
      console.error('Failed to get 2FA status:', error);
      return [];
    }
  }

  /**
   * Log 2FA event to database
   * @param userId User ID
   * @param eventType Type of event (e.g., 'setup', 'verify', 'backup_code_used')
   * @param success Whether event was successful
   * @param details Additional event details
   */
  async logTwoFactorEvent(
    userId: string,
    eventType: string,
    success: boolean,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.logTwoFactorEvent(userId, eventType, success, details);
    } catch (error) {
      console.error('Failed to log 2FA event:', error);
    }
  }

  /**
   * Verify code and mark backup code as used if applicable
   * @param userId User ID
   * @param secret TOTP secret
   * @param token Code to verify
   * @param backupCodes Array of backup codes from database
   * @param ipAddress Optional IP address for logging
   * @returns { valid: boolean, isBackup: boolean }
   */
  async verifyCodeAndUpdateDatabase(
    userId: string,
    secret: string,
    token: string,
    backupCodes: TwoFactorBackupCode[],
    ipAddress?: string
  ): Promise<{ valid: boolean; isBackup: boolean }> {
    // Remove dashes and spaces for flexibility
    const cleanToken = token.replace(/[-\s]/g, '');

    // Try TOTP first
    if (cleanToken.length === 6 && /^\d+$/.test(cleanToken)) {
      if (this.verifyTOTPCode(secret, cleanToken)) {
        await this.logTwoFactorEvent(userId, 'verification_success', true, { method: 'totp' });
        return { valid: true, isBackup: false };
      }
    }

    // Try backup codes
    for (const backupCode of backupCodes) {
      // Check if not used and code matches
      if (!backupCode.used_at && this.verifyBackupCode(cleanToken, backupCode.code_hash)) {
        // Mark backup code as used
        try {
          await this.db.useBackupCode(userId, backupCode.code_hash, ipAddress);
          await this.logTwoFactorEvent(userId, 'backup_code_used', true, { backupCodeId: backupCode.id });
        } catch (error) {
          console.error('Failed to mark backup code as used:', error);
        }
        return { valid: true, isBackup: true };
      }
    }

    await this.logTwoFactorEvent(userId, 'verification_failed', false);
    return { valid: false, isBackup: false };
  }

  /**
   * Get new backup codes and update database
   * @param userId User ID
   * @returns Array of new backup codes
   */
  async generateNewBackupCodesInDatabase(userId: string): Promise<string[]> {
    try {
      const newCodes = this.generateBackupCodes();
      const hashedCodes = newCodes.map(code => this.hashBackupCode(code));

      for (const hashedCode of hashedCodes) {
        await this.db.createBackupCode(userId, hashedCode);
      }

      await this.logTwoFactorEvent(userId, 'backup_code_used', true, { count: newCodes.length });

      return newCodes;
    } catch (error) {
      console.error('Failed to generate new backup codes:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const twoFactorAuthService = new TwoFactorAuthService({
  window: 1,
  codeLength: 6,
  backupCodeCount: 10
});

export default TwoFactorAuthService;
