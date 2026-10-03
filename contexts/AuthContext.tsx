/**
 * Auth Context - Global Authentication State Management
 * Provides auth state, user data, and auth functions across the app
 * Integrated with Phase 4.11 features: 2FA, OAuth, Email Verification, Password Reset
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { apiClient } from '../services/api-client';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
}

interface AuthContextType {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Session Methods
  login: (email: string, password: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  clearError: () => void;
  refreshAccessToken: () => Promise<boolean>;
  checkAuthStatus: () => Promise<void>;

  // Phase 4.11: 2FA Methods
  setupTwoFactor: () => Promise<{ secret: string; qrCode: string; backupCodes: string[] }>;
  verifyTwoFactorSetup: (secret: string, totpCode: string, backupCodes: string[]) => Promise<void>;
  disableTwoFactor: () => Promise<void>;
  verifyTwoFactorCode: (userId: string, code: string) => Promise<boolean>;
  getTwoFactorStatus: () => Promise<boolean>;
  generateBackupCodes: () => Promise<string[]>;
  sendBackupCodesEmail: () => Promise<void>;

  // Phase 4.11: Password Reset Methods
  requestPasswordReset: (email: string) => Promise<void>;
  verifyPasswordResetToken: (token: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string, confirmPassword: string) => Promise<void>;

  // Phase 4.11: Email Verification Methods
  sendEmailVerification: (email: string) => Promise<void>;
  verifyEmailWithToken: (token: string) => Promise<void>;
  resendEmailVerification: (email: string) => Promise<void>;

  // Phase 4.11: OAuth Methods
  getGoogleAuthUrl: () => Promise<string>;
  getGitHubAuthUrl: () => Promise<string>;
  linkOAuthProvider: (provider: 'google' | 'github', providerId: string, accessToken: string) => Promise<void>;
  unlinkOAuthProvider: (provider: 'google' | 'github') => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
  
  // ========================================================================
  // Initialize from localStorage on mount
  // ========================================================================
  
  useEffect(() => {
    initializeAuth();
  }, []);
  
  const initializeAuth = () => {
    try {
      const storedAccessToken = localStorage.getItem('accessToken');
      const storedRefreshToken = localStorage.getItem('refreshToken');
      const storedUser = localStorage.getItem('user');
      
      if (storedAccessToken && storedUser) {
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (err) {
      console.error('Error initializing auth:', err);
      clearAuth();
    }
  };
  
  // ========================================================================
  // Auth Methods
  // ========================================================================
  
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Login failed');
      }
      
      const data = await response.json();
      
      // Store tokens and user
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('loginTime', new Date().toISOString());
      
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      setUser(data.user);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);
  
  const register = useCallback(async (
    firstName: string,
    lastName: string,
    email: string,
    password: string
  ) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password
        })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        
        if (response.status === 409) {
          throw new Error('Email already registered');
        }
        
        throw new Error(data.message || 'Registration failed');
      }
      
      // Registration successful but don't auto-login
      // User must login manually
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);
  
  const logout = useCallback(() => {
    clearAuth();
  }, []);
  
  const clearAuth = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTime');
    
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setError(null);
  };
  
  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    if (!refreshToken) {
      clearAuth();
      return false;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken })
      });
      
      if (!response.ok) {
        clearAuth();
        return false;
      }
      
      const data = await response.json();
      
      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
        setRefreshToken(data.refreshToken);
      }
      
      setAccessToken(data.accessToken);
      return true;
      
    } catch (err) {
      console.error('Token refresh failed:', err);
      clearAuth();
      return false;
    }
  }, [refreshToken, API_BASE]);
  
  const checkAuthStatus = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to refresh
          const refreshed = await refreshAccessToken();
          if (!refreshed) {
            clearAuth();
          }
        }
        return;
      }
      
      const userData: User = await response.json();
      updateUser(userData);
      
    } catch (err) {
      console.error('Auth status check failed:', err);
    }
  }, [accessToken, API_BASE, refreshAccessToken, updateUser]);
  
  // ========================================================================
  // Periodic token refresh
  // ========================================================================
  
  useEffect(() => {
    if (!accessToken) return;
    
    // Check auth status every 30 minutes
    const checkInterval = setInterval(() => {
      checkAuthStatus();
    }, 30 * 60 * 1000);
    
    return () => clearInterval(checkInterval);
  }, [accessToken, checkAuthStatus]);

  // ========================================================================
  // Phase 4.11: 2FA Methods
  // ========================================================================

  const setupTwoFactor = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      const result = await apiClient.setupTwoFactor();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '2FA setup failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyTwoFactorSetup = useCallback(
    async (secret: string, totpCode: string, backupCodes: string[]) => {
      setIsLoading(true);
      clearError();
      try {
        await apiClient.verifyTwoFactorSetup(secret, totpCode, backupCodes);
        // Update user state
        if (user) {
          const updated = { ...user, twoFactorEnabled: true };
          setUser(updated);
          localStorage.setItem('user', JSON.stringify(updated));
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '2FA verification failed';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const disableTwoFactor = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      await apiClient.disableTwoFactor();
      // Update user state
      if (user) {
        const updated = { ...user, twoFactorEnabled: false };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '2FA disable failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const verifyTwoFactorCode = useCallback(
    async (userId: string, code: string): Promise<boolean> => {
      setIsLoading(true);
      clearError();
      try {
        const result = await apiClient.verifyTwoFactor(userId, code);
        return result.success;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '2FA verification failed';
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const getTwoFactorStatus = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    clearError();
    try {
      const result = await apiClient.getTwoFactorStatus();
      return result.twoFactorEnabled;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get 2FA status';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateBackupCodes = useCallback(async (): Promise<string[]> => {
    setIsLoading(true);
    clearError();
    try {
      const result = await apiClient.generateBackupCodes();
      return result.backupCodes;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate backup codes';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendBackupCodesEmail = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      await apiClient.sendBackupCodesEmail();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send backup codes';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ========================================================================
  // Phase 4.11: Password Reset Methods
  // ========================================================================

  const requestPasswordReset = useCallback(async (email: string) => {
    setIsLoading(true);
    clearError();
    try {
      await apiClient.requestPasswordReset(email);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request password reset';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyPasswordResetToken = useCallback(async (token: string): Promise<string> => {
    setIsLoading(true);
    clearError();
    try {
      const result = await apiClient.verifyPasswordResetToken(token);
      if (!result.valid) {
        throw new Error('Invalid or expired token');
      }
      return result.email;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid password reset token';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetPassword = useCallback(
    async (token: string, newPassword: string, confirmPassword: string) => {
      setIsLoading(true);
      clearError();
      try {
        await apiClient.resetPassword(token, newPassword, confirmPassword);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to reset password';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // ========================================================================
  // Phase 4.11: Email Verification Methods
  // ========================================================================

  const sendEmailVerification = useCallback(async (email: string) => {
    setIsLoading(true);
    clearError();
    try {
      await apiClient.sendEmailVerification(email, user?.id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send email verification';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const verifyEmailWithToken = useCallback(async (token: string) => {
    setIsLoading(true);
    clearError();
    try {
      await apiClient.verifyEmail(token);
      // Update user state
      if (user) {
        const updated = { ...user, emailVerified: true };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to verify email';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const resendEmailVerification = useCallback(async (email: string) => {
    setIsLoading(true);
    clearError();
    try {
      await apiClient.resendEmailVerification(email, user?.id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resend email verification';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // ========================================================================
  // Phase 4.11: OAuth Methods
  // ========================================================================

  const getGoogleAuthUrl = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    clearError();
    try {
      const result = await apiClient.getGoogleAuthUrl();
      return result.authUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get Google auth URL';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getGitHubAuthUrl = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    clearError();
    try {
      const result = await apiClient.getGitHubAuthUrl();
      return result.authUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get GitHub auth URL';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const linkOAuthProvider = useCallback(
    async (provider: 'google' | 'github', providerId: string, accessToken: string) => {
      setIsLoading(true);
      clearError();
      try {
        await apiClient.linkOAuthProvider(provider, providerId, accessToken);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : `Failed to link ${provider}`;
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const unlinkOAuthProvider = useCallback(async (provider: 'google' | 'github') => {
    setIsLoading(true);
    clearError();
    try {
      await apiClient.unlinkOAuthProvider(provider);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to unlink ${provider}`;
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // ========================================================================
  // Context value
  // ========================================================================
  
  const value: AuthContextType = {
    user,
    accessToken,
    refreshToken,
    isAuthenticated: !!accessToken && !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    updateUser,
    clearError,
    refreshAccessToken,
    checkAuthStatus,
    setupTwoFactor,
    verifyTwoFactorSetup,
    disableTwoFactor,
    verifyTwoFactorCode,
    getTwoFactorStatus,
    generateBackupCodes,
    sendBackupCodesEmail,
    requestPasswordReset,
    verifyPasswordResetToken,
    resetPassword,
    sendEmailVerification,
    verifyEmailWithToken,
    resendEmailVerification,
    getGoogleAuthUrl,
    getGitHubAuthUrl,
    linkOAuthProvider,
    unlinkOAuthProvider,
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
