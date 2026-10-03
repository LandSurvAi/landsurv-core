/**
 * Email Service
 * Handles email sending for verification, password reset, and notifications
 * Supports both Gmail API (OAuth) and SMTP fallback
 * Integrated with PostgreSQL database via DatabaseClient for audit logging
 */

import nodemailer from 'nodemailer';
import { DatabaseClient } from '../database/client';

/**
 * Email Configuration
 */
export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

/**
 * Email Options
 */
export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email Service
 */
export class EmailService {
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;
  private db: DatabaseClient;
  private useGmailApi: boolean = false;
  private gmailApiService: any = null;

  constructor(config: EmailConfig, db?: DatabaseClient) {
    this.config = config;
    this.db = db || new DatabaseClient();
    
    // Check if Gmail API is configured
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        // Lazy load Gmail API service
        const { getGmailApiService } = require('../backend/src/utils/gmailApiService');
        this.gmailApiService = getGmailApiService();
        this.useGmailApi = true;
        console.log('[EMAIL] Gmail API service available, will use as primary method');
      } catch (error) {
        console.warn('[EMAIL] Gmail API not available, falling back to SMTP:', error);
      }
    }
    
    // Always set up SMTP transporter as fallback
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth
    });
  }

  /**
   * Send email - tries Gmail API first, falls back to SMTP
   * @param options Email options
   * @returns Email sending result
   */
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Try Gmail API first if available
      if (this.useGmailApi && this.gmailApiService) {
        try {
          await this.gmailApiService.sendEmail(
            options.to,
            options.subject,
            options.html,
            options.text
          );
          return {
            success: true,
            messageId: 'sent-via-gmail-api'
          };
        } catch (gmailError) {
          console.warn('[EMAIL] Gmail API failed, falling back to SMTP:', gmailError);
        }
      }

      // Fall back to SMTP
      const result = await this.transporter.sendMail({
        from: this.config.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      });

      return {
        success: true,
        messageId: result.messageId
      };
    } catch (error) {
      console.error('Email sending failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send password reset email
   * @param email User email
   * @param resetLink Password reset link
   * @param userName User name (optional)
   * @returns Email sending result
   */
  async sendPasswordResetEmail(
    email: string,
    resetLink: string,
    userName: string = 'User'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hi ${this.escapeHtml(userName)},</p>
        <p>We received a request to reset your password. Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(resetLink)}" 
             style="background-color: #007bff; color: white; padding: 12px 30px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link in your browser:
          <br/>
          <code style="background-color: #f5f5f5; padding: 10px; display: block; margin-top: 10px;">
            ${this.escapeHtml(resetLink)}
          </code>
        </p>
        <p style="color: #666; font-size: 14px;">
          This link will expire in 30 minutes.
        </p>
        <p style="color: #666; font-size: 14px;">
          If you didn't request a password reset, please ignore this email or contact support if you have concerns.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          © LandSurv.ai. All rights reserved.
        </p>
      </div>
    `;

    const text = `
      Password Reset Request

      Hi ${userName},

      We received a request to reset your password. Click the link below to reset your password:

      ${resetLink}

      This link will expire in 30 minutes.

      If you didn't request a password reset, please ignore this email or contact support if you have concerns.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Password Reset Request - LandSurv.ai',
      html,
      text
    });
  }

  /**
   * Send email verification email
   * @param email User email
   * @param verificationLink Email verification link
   * @param userName User name (optional)
   * @returns Email sending result
   */
  async sendEmailVerificationEmail(
    email: string,
    verificationLink: string,
    userName: string = 'User'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verify Your Email Address</h2>
        <p>Hi ${this.escapeHtml(userName)},</p>
        <p>Welcome to LandSurv.ai! Please verify your email address to complete your registration:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${this.escapeHtml(verificationLink)}" 
             style="background-color: #28a745; color: white; padding: 12px 30px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link in your browser:
          <br/>
          <code style="background-color: #f5f5f5; padding: 10px; display: block; margin-top: 10px;">
            ${this.escapeHtml(verificationLink)}
          </code>
        </p>
        <p style="color: #666; font-size: 14px;">
          This link will expire in 24 hours.
        </p>
        <p style="color: #666; font-size: 14px;">
          If you didn't create an account with LandSurv.ai, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          © LandSurv.ai. All rights reserved.
        </p>
      </div>
    `;

    const text = `
      Verify Your Email Address

      Hi ${userName},

      Welcome to LandSurv.ai! Please verify your email address to complete your registration:

      ${verificationLink}

      This link will expire in 24 hours.

      If you didn't create an account with LandSurv.ai, please ignore this email.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Verify Your Email - LandSurv.ai',
      html,
      text
    });
  }

  /**
   * Send 2FA backup codes email
   * @param email User email
   * @param backupCodes Array of backup codes
   * @param userName User name (optional)
   * @returns Email sending result
   */
  async sendBackupCodesEmail(
    email: string,
    backupCodes: string[],
    userName: string = 'User'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const codesHtml = backupCodes
      .map(code => `<code style="background-color: #f5f5f5; padding: 5px 10px; margin: 5px;">${code}</code>`)
      .join('<br/>');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your 2FA Backup Codes</h2>
        <p>Hi ${this.escapeHtml(userName)},</p>
        <p>Two-factor authentication has been enabled on your account. Save these backup codes in a secure location. 
           Each code can be used once to sign in if you lose access to your authenticator app:</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          ${codesHtml}
        </div>
        <p style="color: #d9534f; font-weight: bold;">⚠️ Important:</p>
        <ul style="color: #666;">
          <li>Keep these codes in a safe place</li>
          <li>Each code can only be used once</li>
          <li>Do not share these codes with anyone</li>
          <li>We cannot retrieve lost codes</li>
        </ul>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          © LandSurv.ai. All rights reserved.
        </p>
      </div>
    `;

    const text = `
      Your 2FA Backup Codes

      Hi ${userName},

      Two-factor authentication has been enabled on your account. Save these backup codes in a secure location:

      ${backupCodes.join('\n')}

      Each code can be used once to sign in if you lose access to your authenticator app.

      Important:
      - Keep these codes in a safe place
      - Each code can only be used once
      - Do not share these codes with anyone
      - We cannot retrieve lost codes
    `;

    return this.sendEmail({
      to: email,
      subject: '2FA Backup Codes - LandSurv.ai',
      html,
      text
    });
  }

  /**
   * Send account recovery email
   * @param email User email
   * @param userName User name (optional)
   * @returns Email sending result
   */
  async sendAccountRecoveryEmail(
    email: string,
    userName: string = 'User'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Account Deletion Initiated</h2>
        <p>Hi ${this.escapeHtml(userName)},</p>
        <p>Your account deletion has been initiated. Your account will be permanently deleted in 7 days.</p>
        <p style="color: #d9534f; font-weight: bold;">You can recover your account within 7 days by signing in to your account.</p>
        <p>If you did not request this action, please sign in to your account immediately and cancel the deletion.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          © LandSurv.ai. All rights reserved.
        </p>
      </div>
    `;

    const text = `
      Account Deletion Initiated

      Hi ${userName},

      Your account deletion has been initiated. Your account will be permanently deleted in 7 days.

      You can recover your account within 7 days by signing in to your account.

      If you did not request this action, please sign in to your account immediately and cancel the deletion.
    `;

    return this.sendEmail({
      to: email,
      subject: 'Account Deletion Initiated - LandSurv.ai',
      html,
      text
    });
  }

  /**
   * Create email verification token and send verification email
   * @param userId User ID
   * @param email User email
   * @param baseUrl Application base URL for verification link
   * @returns true if email sent successfully
   */
  async sendEmailVerificationWithToken(
    userId: string,
    email: string,
    baseUrl: string = 'http://localhost:5173'
  ): Promise<boolean> {
    try {
      // Generate secure token and hash
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      // Create verification token in database
      await this.db.createEmailVerificationToken(email, tokenHash, expiresAt, 'verification', userId);
      
      // Generate verification link
      const verificationUrl = new URL('/verify-email', baseUrl);
      verificationUrl.searchParams.append('token', token);
      
      // Send email
      const result = await this.sendEmailVerificationEmail(
        email,
        verificationUrl.toString(),
        'User'
      );
      
      if (result.success) {
        console.log(`Verification email sent to ${email}`);
      }
      
      return result.success;
    } catch (error) {
      console.error('Failed to send verification email:', error);
      return false;
    }
  }

  /**
   * Verify email token and update user in database
   * @param tokenHash Token hash to verify
   * @returns true if verification successful
   */
  async verifyEmailTokenInDatabase(tokenHash: string): Promise<boolean> {
    try {
      await this.db.verifyEmail(tokenHash);
      console.log(`Email verified`);
      return true;
    } catch (error) {
      console.error('Failed to verify email:', error);
      return false;
    }
  }

  /**
   * Send password reset email with token
   * @param userId User ID
   * @param email User email
   * @param baseUrl Application base URL
   * @returns true if email sent successfully
   */
  async sendPasswordResetWithToken(
    userId: string,
    email: string,
    baseUrl: string = 'http://localhost:5173'
  ): Promise<boolean> {
    try {
      // Generate reset link
      const resetUrl = new URL('/reset-password', baseUrl);
      resetUrl.searchParams.append('email', email);
      
      const result = await this.sendPasswordResetEmail(
        email,
        resetUrl.toString(),
        'User'
      );
      
      if (result.success) {
        console.log(`Password reset email sent to ${email}`);
      }
      
      return result.success;
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      return false;
    }
  }

  /**
   * Verify email service connectivity
   * @returns true if email service is working
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service verification failed:', error);
      return false;
    }
  }

  /**
   * Escape HTML special characters
   * @param text Text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

export default EmailService;
