/**
 * Database Type Definitions for Phase 4.11 Enhanced Features
 * TypeScript interfaces for all new tables and relationships
 */

// ============================================
// OAuth Tables
// ============================================

export interface OAuthProvider {
  id: string;
  user_id: string;
  provider: 'google' | 'github';
  provider_id: string;
  provider_user_id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  access_token_hash: string;
  refresh_token_hash?: string;
  token_expires_at?: Date;
  connected_at: Date;
  last_used_at?: Date;
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OAuthState {
  id: string;
  state_token: string;
  provider: 'google' | 'github';
  code_challenge?: string;
  code_challenge_method?: 'S256' | 'plain';
  created_at: Date;
  expires_at: Date;
  used_at?: Date;
}

// ============================================
// 2FA Tables
// ============================================

export interface TwoFactorBackupCode {
  id: string;
  user_id: string;
  code_hash: string;
  created_at: Date;
  used_at?: Date;
  used_for_ip?: string;
}

export interface TwoFactorEvent {
  id: string;
  user_id: string;
  event_type: 'setup' | 'verification_success' | 'verification_failed' | 'backup_code_used' | 'disabled';
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error_message?: string;
  created_at: Date;
}

// ============================================
// Password Reset
// ============================================

export interface PasswordResetToken {
  id: string;
  user_id: string;
  email: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  used_at?: Date;
  ip_address?: string;
}

// ============================================
// Email Verification
// ============================================

export interface EmailVerificationToken {
  id: string;
  user_id?: string;
  email: string;
  token_hash: string;
  purpose: 'verification' | 'change_email';
  new_email?: string;
  created_at: Date;
  expires_at: Date;
  verified_at?: Date;
  ip_address?: string;
}

// ============================================
// Account Recovery
// ============================================

export interface AccountRecoveryRequest {
  id: string;
  user_id: string;
  email: string;
  recovery_method: 'email' | 'backup_code' | 'security_questions' | 'support';
  token_hash?: string;
  verified: boolean;
  verified_at?: Date;
  created_at: Date;
  expires_at: Date;
  ip_address?: string;
  user_agent?: string;
}

// ============================================
// Security Questions
// ============================================

export interface SecurityQuestion {
  id: string;
  question_text: string;
  category: 'personal' | 'family' | 'location' | 'preferences';
  difficulty: 'easy' | 'medium' | 'hard';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserSecurityAnswer {
  id: string;
  user_id: string;
  question_id: string;
  answer_hash: string;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// User Extensions (for existing users table)
// ============================================

export interface UserEnhanced {
  // Existing fields
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
  
  // 2FA fields (new)
  two_factor_enabled: boolean;
  two_factor_secret?: string;
  two_factor_verified_at?: Date;
  two_factor_method: 'totp' | 'sms';
  
  // Email verification fields (new)
  email_verified: boolean;
  email_verified_at?: Date;
  
  // Security fields (new)
  last_login_at?: Date;
  last_login_ip?: string;
  failed_login_attempts: number;
  account_locked_until?: Date;
  password_changed_at?: Date;
}

// ============================================
// Request/Response DTOs
// ============================================

export interface OAuth2TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface OAuthUserProfile {
  provider_id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'google' | 'github';
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetVerify {
  token: string;
}

export interface PasswordReset {
  token: string;
  new_password: string;
  confirm_password: string;
}

export interface EmailVerificationRequest {
  email: string;
}

export interface EmailVerificationVerify {
  token: string;
  email: string;
}

export interface TwoFactorSetupRequest {
  user_id: string;
}

export interface TwoFactorSetupVerify {
  secret: string;
  totp_code: string;
  backup_codes: string[];
}

export interface TwoFactorVerify {
  user_id: string;
  totp_code?: string;
  backup_code?: string;
}

export interface AccountRecoveryRequest {
  email: string;
}

export interface AccountRecoveryOptions {
  options: {
    id: string;
    title: string;
    description: string;
    enabled: boolean;
  }[];
}

// ============================================
// Database Query Results
// ============================================

export interface OAuthLinkResult {
  success: boolean;
  message: string;
  provider: string;
  user_id: string;
}

export interface TwoFactorSetupResult {
  success: boolean;
  secret: string;
  qr_code: string;
  backup_codes: string[];
}

export interface PasswordResetResult {
  success: boolean;
  message: string;
  email: string;
}

export interface AccountRecoveryResult {
  success: boolean;
  message: string;
  recovery_method: string;
}

// ============================================
// Audit & Analytics
// ============================================

export interface AuthAuditLog {
  id: string;
  user_id: string;
  action: string;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error?: string;
  created_at: Date;
}

export interface SecurityMetrics {
  total_users: number;
  two_factor_enabled: number;
  email_verified: number;
  account_locked: number;
  password_reset_last_24h: number;
  failed_login_attempts_last_24h: number;
}
