/**
 * Password Reset Service
 * Manages password reset token generation, validation, and cleanup
 * Integrated with PostgreSQL database via DatabaseClient
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { DatabaseClient } from '../database/client';
import { PasswordResetToken } from '../types/database';

/**
 * Password Reset Token Payload
 */
export interface ResetTokenPayload {
  userId: string;
  email: string;
  type: 'password-reset';
  iat: number;
  exp: number;
}

/**
 * Password Reset Configuration
 */
export interface ResetConfig {
  tokenExpiry: number; // Token expiry time in seconds (default 30 minutes)
  hashAlgorithm: string; // Hash algorithm for tokens
  jwtSecret: string; // JWT secret for token signing
}

/**
 * Password Reset Service
 */
export class PasswordResetService {
  private config: ResetConfig;
  private db: DatabaseClient;

  constructor(config: ResetConfig, db?: DatabaseClient) {
    this.config = {
      tokenExpiry: config.tokenExpiry || 30 * 60, // 30 minutes default
      hashAlgorithm: config.hashAlgorithm || 'sha256',
      jwtSecret: config.jwtSecret || 'your-secret-key'
    };

    if (!config.jwtSecret) {
      console.warn('Warning: JWT secret not provided, using default insecure secret');
    }

    this.db = db || new DatabaseClient();
  }

  /**
   * Generate password reset token
   * @param userId User ID
   * @param email User email
   * @returns Reset token
   */
  generateResetToken(userId: string, email: string): string {
    const payload: ResetTokenPayload = {
      userId,
      email,
      type: 'password-reset',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.tokenExpiry
    };

    const token = jwt.sign(payload, this.config.jwtSecret);
    return token;
  }

  /**
   * Verify password reset token
   * @param token Reset token to verify
   * @returns Token payload if valid, null if invalid or expired
   */
  verifyResetToken(token: string): ResetTokenPayload | null {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as ResetTokenPayload;

      // Additional type check
      if (payload.type !== 'password-reset') {
        return null;
      }

      return payload;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  /**
   * Generate reset link
   * @param token Reset token
   * @param baseUrl Application base URL
   * @returns Full reset link
   */
  generateResetLink(token: string, baseUrl: string = 'http://localhost:5173'): string {
    const resetUrl = new URL('/reset-password', baseUrl);
    resetUrl.searchParams.append('token', token);
    return resetUrl.toString();
  }

  /**
   * Validate password strength
   * @param password Password to validate
   * @returns Validation result with any errors
   */
  validatePasswordStrength(password: string): {
    valid: boolean;
    errors: string[];
    score: number;
  } {
    const errors: string[] = [];
    let score = 0;

    // Check length
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    } else if (password.length >= 12) {
      score += 1;
    }

    // Check for uppercase
    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Check for lowercase
    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Check for numbers
    if (/[0-9]/.test(password)) {
      score += 1;
    } else {
      errors.push('Password must contain at least one number');
    }

    // Check for special characters
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 1;
    } else {
      errors.push('Password must contain at least one special character');
    }

    // Check against common passwords
    const commonPasswords = [
      'password', 'password123', '123456', '12345678',
      'qwerty', 'abc123', 'letmein', 'welcome',
      'monkey', 'dragon', 'master', 'sunshine'
    ];

    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common. Please choose a more unique password');
    }

    return {
      valid: errors.length === 0,
      errors,
      score
    };
  }

  /**
   * Generate secure random token (for database storage)
   * @returns Secure random token
   */
  generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash token for database storage
   * @param token Token to hash
   * @returns Hashed token
   */
  hashToken(token: string): string {
    return crypto
      .createHash(this.config.hashAlgorithm)
      .update(token)
      .digest('hex');
  }

  /**
   * Verify token hash
   * @param token Original token
   * @param hashedToken Stored hashed token
   * @returns true if token matches
   */
  verifyTokenHash(token: string, hashedToken: string): boolean {
    const tokenHash = this.hashToken(token);
    return tokenHash === hashedToken;
  }

  /**
   * Check if token has expired
   * @param expiresAt Token expiry timestamp
   * @returns true if expired
   */
  isTokenExpired(expiresAt: Date): boolean {
    return new Date() > expiresAt;
  }

  /**
   * Get time remaining for token (seconds)
   * @param expiresAt Token expiry timestamp
   * @returns Seconds remaining, or 0 if expired
   */
  getTimeRemaining(expiresAt: Date): number {
    const now = new Date().getTime();
    const expires = new Date(expiresAt).getTime();
    const remaining = Math.max(0, Math.floor((expires - now) / 1000));
    return remaining;
  }

  /**
   * Create password reset token in database
   * @param userId User ID
   * @param email User email
   * @param ipAddress Optional IP address for logging
   * @returns Reset token
   */
  async createResetTokenInDatabase(
    userId: string,
    email: string,
    ipAddress?: string
  ): Promise<string> {
    try {
      // Generate secure token
      const token = this.generateSecureToken();
      const hashedToken = this.hashToken(token);
      const expiresAt = new Date(Date.now() + this.config.tokenExpiry * 1000);
      
      // Store in database
      await this.db.createPasswordResetToken(userId, email, hashedToken, expiresAt, ipAddress);
      
      console.log(`Password reset token created for user ${userId}`);
      return token;
    } catch (error) {
      console.error('Failed to create password reset token:', error);
      throw error;
    }
  }

  /**
   * Verify password reset token from database
   * @param token Reset token
   * @returns Token data if valid, null if invalid or expired
   */
  async verifyResetTokenInDatabase(token: string): Promise<PasswordResetToken | null> {
    try {
      const hashedToken = this.hashToken(token);
      const tokenData = await this.db.getPasswordResetToken(hashedToken);
      return tokenData;
    } catch (error) {
      console.error('Failed to verify password reset token:', error);
      return null;
    }
  }

  /**
   * Reset password in database
   * @param tokenHash Hashed token to mark as used
   * @returns true if successful
   */
  async resetPasswordInDatabase(tokenHash: string): Promise<boolean> {
    try {
      // Mark token as used
      await this.db.usePasswordResetToken(tokenHash);
      console.log(`Password reset token used`);
      return true;
    } catch (error) {
      console.error('Failed to use password reset token:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired password reset tokens
   * @returns true if successful
   */
  async cleanupExpiredTokens(): Promise<boolean> {
    try {
      await this.db.deleteExpiredPasswordResetTokens();
      console.log(`Cleaned up expired password reset tokens`);
      return true;
    } catch (error) {
      console.error('Failed to cleanup expired tokens:', error);
      return false;
    }
  }
}

export default PasswordResetService;
