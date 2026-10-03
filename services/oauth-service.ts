/**
 * OAuth Service
 * Handles OAuth 2.0 provider integration (Google, GitHub)
 * Integrated with PostgreSQL database via DatabaseClient
 */

import crypto from 'crypto';
import { DatabaseClient } from '../database/client';
import type { OAuthState as DatabaseOAuthState } from '../types/database';

/**
 * OAuth Provider Configuration
 */
export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * OAuth Configuration for all providers
 */
export interface OAuthConfig {
  google?: OAuthProviderConfig;
  github?: OAuthProviderConfig;
}

/**
 * OAuth State
 */
export interface OAuthState {
  state: string;
  provider: string;
  codeChallenge: string;
  expiresAt: Date;
}

/**
 * OAuth User Profile
 */
export interface OAuthUserProfile {
  provider: string;
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
  accessToken: string;
  refreshToken?: string;
}

/**
 * OAuth Service
 */
export class OAuthService {
  private config: OAuthConfig;
  private stateStore: Map<string, OAuthState> = new Map();
  private db: DatabaseClient;

  constructor(config: OAuthConfig, db?: DatabaseClient) {
    this.config = config;
    this.db = db || new DatabaseClient();
    this.cleanupExpiredStates();
  }

  /**
   * Generate OAuth state for PKCE flow
   * @param provider OAuth provider name
   * @returns State object with state and code challenge
   */
  generateOAuthState(provider: 'google' | 'github'): OAuthState {
    const state = crypto.randomBytes(32).toString('hex');
    const codeChallenge = crypto.randomBytes(32).toString('hex');
    
    const oauthState: OAuthState = {
      state,
      provider,
      codeChallenge,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };

    this.stateStore.set(state, oauthState);
    return oauthState;
  }

  /**
   * Verify OAuth state
   * @param state State from OAuth callback
   * @param provider Expected provider
   * @returns true if state is valid
   */
  verifyOAuthState(state: string, provider: 'google' | 'github'): boolean {
    const oauthState = this.stateStore.get(state);

    if (!oauthState) {
      return false;
    }

    // Check if expired
    if (new Date() > oauthState.expiresAt) {
      this.stateStore.delete(state);
      return false;
    }

    // Check provider matches
    if (oauthState.provider !== provider) {
      return false;
    }

    // Remove used state
    this.stateStore.delete(state);
    return true;
  }

  /**
   * Generate Google OAuth authorization URL
   * @param state OAuth state
   * @returns Authorization URL
   */
  generateGoogleAuthUrl(state: string): string {
    const config = this.config.google;
    if (!config) {
      throw new Error('Google OAuth not configured');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Generate GitHub OAuth authorization URL
   * @param state OAuth state
   * @returns Authorization URL
   */
  generateGitHubAuthUrl(state: string): string {
    const config = this.config.github;
    if (!config) {
      throw new Error('GitHub OAuth not configured');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'user:email',
      state,
      allow_signup: 'true'
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token (Google)
   * @param code Authorization code
   * @returns Access token response
   */
  async exchangeGoogleCode(code: string): Promise<any> {
    const config = this.config.google;
    if (!config) {
      throw new Error('Google OAuth not configured');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri
    });

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Google token exchange failed:', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for access token (GitHub)
   * @param code Authorization code
   * @returns Access token response
   */
  async exchangeGitHubCode(code: string): Promise<any> {
    const config = this.config.github;
    if (!config) {
      throw new Error('GitHub OAuth not configured');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri
    });

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('GitHub token exchange failed:', error);
      throw error;
    }
  }

  /**
   * Get Google user profile
   * @param accessToken Google access token
   * @returns User profile
   */
  async getGoogleUserProfile(accessToken: string): Promise<OAuthUserProfile> {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.statusText}`);
      }

      const data: any = await response.json();

      return {
        provider: 'google',
        providerId: data.id,
        email: data.email,
        name: data.name,
        avatar: data.picture,
        accessToken
      };
    } catch (error) {
      console.error('Failed to get Google profile:', error);
      throw error;
    }
  }

  /**
   * Get GitHub user profile
   * @param accessToken GitHub access token
   * @returns User profile
   */
  async getGitHubUserProfile(accessToken: string): Promise<OAuthUserProfile> {
    try {
      // Get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!userResponse.ok) {
        throw new Error(`Failed to fetch user profile: ${userResponse.statusText}`);
      }

      const userData: any = await userResponse.json();

      // Get email if not in main response
      let email = userData.email;
      if (!email) {
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (emailResponse.ok) {
          const emails: any[] = await emailResponse.json();
          const primaryEmail = emails.find((e: any) => e.primary);
          email = primaryEmail?.email || emails[0]?.email;
        }
      }

      return {
        provider: 'github',
        providerId: userData.id.toString(),
        email: email || '',
        name: userData.name || userData.login,
        avatar: userData.avatar_url,
        accessToken
      };
    } catch (error) {
      console.error('Failed to get GitHub profile:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired states
   */
  private cleanupExpiredStates(): void {
    const now = new Date();
    for (const [state, oauthState] of this.stateStore.entries()) {
      if (now > oauthState.expiresAt) {
        this.stateStore.delete(state);
      }
    }

    // Run cleanup every 5 minutes
    setTimeout(() => this.cleanupExpiredStates(), 5 * 60 * 1000);
  }

  /**
   * Store OAuth state in database
   * @param provider OAuth provider name
   * @returns State value for OAuth flow
   */
  async storeOAuthStateInDatabase(provider: 'google' | 'github'): Promise<string> {
    try {
      const state = crypto.randomBytes(32).toString('hex');
      const codeChallenge = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const oauthState = {
        state_token: state,
        provider,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256' as const,
        expires_at: expiresAt
      };

      await this.db.createOAuthState(oauthState);
      console.log(`OAuth state created for provider: ${provider}`);
      
      return state;
    } catch (error) {
      console.error('Failed to store OAuth state:', error);
      throw error;
    }
  }

  /**
   * Verify OAuth state from database
   * @param state OAuth state
   * @param provider Expected provider
   * @returns true if state is valid
   */
  async verifyOAuthStateFromDatabase(state: string, provider: 'google' | 'github'): Promise<boolean> {
    try {
      return await this.db.verifyOAuthState(state, provider);
    } catch (error) {
      console.error('Failed to verify OAuth state:', error);
      return false;
    }
  }

  /**
   * Store OAuth provider connection
   * @param userId User ID
   * @param provider Provider name
   * @param providerId Provider user ID
   * @param email User email from provider
   * @param name User name from provider
   * @param avatar Avatar URL from provider
   * @param accessTokenHash Hashed access token
   * @param refreshTokenHash Optional hashed refresh token
   * @returns true if successful
   */
  async storeOAuthProviderInDatabase(
    userId: string,
    provider: 'google' | 'github',
    providerId: string,
    email: string,
    name: string,
    avatar?: string,
    accessTokenHash?: string,
    refreshTokenHash?: string
  ): Promise<boolean> {
    try {
      const oauthProvider = {
        user_id: userId,
        provider,
        provider_id: provider,
        provider_user_id: providerId,
        email,
        name,
        avatar_url: avatar,
        access_token_hash: accessTokenHash,
        refresh_token_hash: refreshTokenHash,
        token_expires_at: null,
        is_primary: false,
        connected_at: new Date()
      };

      await this.db.createOAuthProvider(oauthProvider);
      console.log(`OAuth provider ${provider} linked for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Failed to store OAuth provider:', error);
      throw error;
    }
  }

  /**
   * Get OAuth provider connection
   * @param userId User ID
   * @param provider Provider name
   * @returns OAuth provider info if exists
   */
  async getOAuthProviderFromDatabase(
    userId: string,
    provider: 'google' | 'github'
  ): Promise<any> {
    try {
      return await this.db.getOAuthProvider(userId, provider);
    } catch (error) {
      console.error('Failed to get OAuth provider:', error);
      return null;
    }
  }

  /**
   * Get all OAuth providers for user
   * @param userId User ID
   * @returns Array of linked OAuth providers
   */
  async getUserOAuthProviders(userId: string): Promise<any[]> {
    try {
      return await this.db.getOAuthProvidersByUserId(userId);
    } catch (error) {
      console.error('Failed to get user OAuth providers:', error);
      return [];
    }
  }

  /**
   * Hash access token for storage
   * @param token Access token to hash
   * @returns Hashed token
   */
  hashAccessToken(token: string): string {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }
}

export default OAuthService;
