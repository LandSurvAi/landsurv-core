/**
 * API Client Service
 * Centralized HTTP client for all backend API calls
 * Handles authentication, error handling, and request/response formatting
 */

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface RequestConfig {
  headers?: Record<string, string>;
  body?: any;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}

/**
 * API Client Service
 */
export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.loadToken();
  }

  /**
   * Load JWT token from localStorage
   */
  private loadToken(): void {
    this.token = localStorage.getItem('auth_token');
  }

  /**
   * Store JWT token in localStorage
   */
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  /**
   * Clear JWT token
   */
  clearToken(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  /**
   * Get authorization headers
   */
  private getHeaders(config?: RequestConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config?.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Make HTTP request
   */
  private async request<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = config.method || 'GET';
    const headers = this.getHeaders(config);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || error.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // ============================================
  // 2FA Endpoints
  // ============================================

  /**
   * Initiate 2FA setup
   */
  async setupTwoFactor(): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    return this.request('/auth/2fa/setup', { method: 'POST' });
  }

  /**
   * Verify and enable 2FA
   */
  async verifyTwoFactorSetup(secret: string, totpCode: string, backupCodes: string[]): Promise<{
    success: boolean;
    message: string;
    backupCodes: string[];
  }> {
    return this.request('/auth/2fa/verify-setup', {
      method: 'POST',
      body: { secret, totpCode, backupCodes },
    });
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/2fa/disable', { method: 'POST' });
  }

  /**
   * Verify TOTP or backup code during login
   */
  async verifyTwoFactor(userId: string, code: string): Promise<{
    success: boolean;
    message: string;
    isBackupCode: boolean;
  }> {
    return this.request('/auth/2fa/verify', {
      method: 'POST',
      body: { userId, code },
    });
  }

  /**
   * Get 2FA status
   */
  async getTwoFactorStatus(): Promise<{
    twoFactorEnabled: boolean;
    message: string;
  }> {
    return this.request('/auth/2fa/status', { method: 'GET' });
  }

  /**
   * Generate new backup codes
   */
  async generateBackupCodes(): Promise<{
    backupCodes: string[];
    message: string;
  }> {
    return this.request('/auth/2fa/backup-codes', { method: 'POST' });
  }

  /**
   * Send backup codes via email
   */
  async sendBackupCodesEmail(): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/auth/2fa/send-backup-codes-email', { method: 'POST' });
  }

  // ============================================
  // Password Reset Endpoints
  // ============================================

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/auth/password-reset/request', {
      method: 'POST',
      body: { email },
    });
  }

  /**
   * Verify password reset token
   */
  async verifyPasswordResetToken(token: string): Promise<{
    valid: boolean;
    email: string;
    message: string;
  }> {
    return this.request('/auth/password-reset/verify-token', {
      method: 'POST',
      body: { token },
    });
  }

  /**
   * Reset password
   */
  async resetPassword(token: string, newPassword: string, confirmPassword: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/auth/password-reset/reset', {
      method: 'POST',
      body: { token, newPassword, confirmPassword },
    });
  }

  // ============================================
  // Email Verification Endpoints
  // ============================================

  /**
   * Send email verification
   */
  async sendEmailVerification(email: string, userId?: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/auth/email-verification/send', {
      method: 'POST',
      body: { email, userId },
    });
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/auth/email-verification/verify', {
      method: 'POST',
      body: { token },
    });
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(email: string, userId?: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/auth/email-verification/resend', {
      method: 'POST',
      body: { email, userId },
    });
  }

  // ============================================
  // OAuth Endpoints
  // ============================================

  /**
   * Get Google OAuth authorization URL
   */
  async getGoogleAuthUrl(): Promise<{
    authUrl: string;
    state: string;
    message: string;
  }> {
    return this.request('/oauth/google-auth-url', { method: 'POST' });
  }

  /**
   * Get GitHub OAuth authorization URL
   */
  async getGitHubAuthUrl(): Promise<{
    authUrl: string;
    state: string;
    message: string;
  }> {
    return this.request('/oauth/github-auth-url', { method: 'POST' });
  }

  /**
   * Link OAuth provider to account
   */
  async linkOAuthProvider(
    provider: 'google' | 'github',
    providerId: string,
    accessToken: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/oauth/link-provider', {
      method: 'POST',
      body: { provider, providerId, accessToken },
    });
  }

  /**
   * Unlink OAuth provider from account
   */
  async unlinkOAuthProvider(provider: 'google' | 'github'): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/oauth/unlink-provider', {
      method: 'POST',
      body: { provider },
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

export default ApiClient;
