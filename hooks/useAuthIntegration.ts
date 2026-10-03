/**
 * Custom Auth Hooks for Component Integration
 * Provides simplified interfaces for common authentication patterns
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook for OAuth setup and management
 */
export const useOAuth = () => {
  const { getGoogleAuthUrl, getGitHubAuthUrl, linkOAuthProvider, unlinkOAuthProvider, isLoading, error } = useAuth();
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);

  const handleGoogleLogin = useCallback(async () => {
    try {
      const url = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error('Google auth failed:', err);
      throw err;
    }
  }, [getGoogleAuthUrl]);

  const handleGitHubLogin = useCallback(async () => {
    try {
      const url = await getGitHubAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error('GitHub auth failed:', err);
      throw err;
    }
  }, [getGitHubAuthUrl]);

  const linkProvider = useCallback(
    async (provider: 'google' | 'github', providerId: string, accessToken: string) => {
      try {
        await linkOAuthProvider(provider, providerId, accessToken);
        setLinkedProviders(prev => [...prev, provider]);
      } catch (err) {
        console.error(`Failed to link ${provider}:`, err);
        throw err;
      }
    },
    [linkOAuthProvider]
  );

  const unlinkProvider = useCallback(
    async (provider: 'google' | 'github') => {
      try {
        await unlinkOAuthProvider(provider);
        setLinkedProviders(prev => prev.filter(p => p !== provider));
      } catch (err) {
        console.error(`Failed to unlink ${provider}:`, err);
        throw err;
      }
    },
    [unlinkOAuthProvider]
  );

  return {
    handleGoogleLogin,
    handleGitHubLogin,
    linkProvider,
    unlinkProvider,
    linkedProviders,
    isLoading,
    error,
  };
};

/**
 * Hook for two-factor authentication
 */
export const useTwoFactorAuth = () => {
  const {
    setupTwoFactor,
    verifyTwoFactorSetup,
    disableTwoFactor,
    verifyTwoFactorCode,
    getTwoFactorStatus,
    generateBackupCodes,
    sendBackupCodesEmail,
    isLoading,
    error,
  } = useAuth();

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const enabled = await getTwoFactorStatus();
        setTwoFactorEnabled(enabled);
      } catch (err) {
        console.error('Failed to check 2FA status:', err);
      }
    };
    checkStatus();
  }, [getTwoFactorStatus]);

  const enableTwoFactor = useCallback(async () => {
    try {
      const result = await setupTwoFactor();
      return result;
    } catch (err) {
      console.error('Failed to setup 2FA:', err);
      throw err;
    }
  }, [setupTwoFactor]);

  const confirmTwoFactorSetup = useCallback(
    async (secret: string, totpCode: string, codes: string[]) => {
      try {
        await verifyTwoFactorSetup(secret, totpCode, codes);
        setTwoFactorEnabled(true);
        setBackupCodes(codes);
      } catch (err) {
        console.error('Failed to confirm 2FA:', err);
        throw err;
      }
    },
    [verifyTwoFactorSetup]
  );

  const disableTwoFactorAuth = useCallback(async () => {
    try {
      await disableTwoFactor();
      setTwoFactorEnabled(false);
      setBackupCodes([]);
    } catch (err) {
      console.error('Failed to disable 2FA:', err);
      throw err;
    }
  }, [disableTwoFactor]);

  const verifyCode = useCallback(
    async (userId: string, code: string): Promise<boolean> => {
      try {
        return await verifyTwoFactorCode(userId, code);
      } catch (err) {
        console.error('Failed to verify 2FA code:', err);
        return false;
      }
    },
    [verifyTwoFactorCode]
  );

  const refreshBackupCodes = useCallback(async () => {
    try {
      const codes = await generateBackupCodes();
      setBackupCodes(codes);
      return codes;
    } catch (err) {
      console.error('Failed to generate backup codes:', err);
      throw err;
    }
  }, [generateBackupCodes]);

  const sendCodesEmail = useCallback(async () => {
    try {
      await sendBackupCodesEmail();
    } catch (err) {
      console.error('Failed to send backup codes email:', err);
      throw err;
    }
  }, [sendBackupCodesEmail]);

  return {
    twoFactorEnabled,
    backupCodes,
    enableTwoFactor,
    confirmTwoFactorSetup,
    disableTwoFactorAuth,
    verifyCode,
    refreshBackupCodes,
    sendCodesEmail,
    isLoading,
    error,
  };
};

/**
 * Hook for password management
 */
export const usePasswordManagement = () => {
  const {
    requestPasswordReset,
    verifyPasswordResetToken,
    resetPassword,
    isLoading,
    error,
  } = useAuth();

  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState<string | null>(null);

  const requestReset = useCallback(async (email: string) => {
    try {
      await requestPasswordReset(email);
      setResetEmail(email);
    } catch (err) {
      console.error('Failed to request password reset:', err);
      throw err;
    }
  }, [requestPasswordReset]);

  const verifyToken = useCallback(async (token: string) => {
    try {
      const email = await verifyPasswordResetToken(token);
      setResetToken(token);
      setResetEmail(email);
      return email;
    } catch (err) {
      console.error('Failed to verify reset token:', err);
      throw err;
    }
  }, [verifyPasswordResetToken]);

  const changePassword = useCallback(
    async (newPassword: string, confirmPassword: string) => {
      if (!resetToken) {
        throw new Error('No reset token available');
      }
      try {
        await resetPassword(resetToken, newPassword, confirmPassword);
        setResetToken(null);
        setResetEmail(null);
      } catch (err) {
        console.error('Failed to reset password:', err);
        throw err;
      }
    },
    [resetPassword, resetToken]
  );

  return {
    requestReset,
    verifyToken,
    changePassword,
    resetToken,
    resetEmail,
    isLoading,
    error,
  };
};

/**
 * Hook for email verification
 */
export const useEmailVerification = () => {
  const {
    sendEmailVerification,
    verifyEmailWithToken,
    resendEmailVerification,
    user,
    isLoading,
    error,
  } = useAuth();

  const [verificationEmail, setVerificationEmail] = useState<string | null>(user?.email || null);
  const [isVerified, setIsVerified] = useState(user?.emailVerified || false);
  const [resendAttempts, setResendAttempts] = useState(0);

  const sendVerification = useCallback(async (email: string) => {
    try {
      await sendEmailVerification(email);
      setVerificationEmail(email);
    } catch (err) {
      console.error('Failed to send verification email:', err);
      throw err;
    }
  }, [sendEmailVerification]);

  const verifyEmail = useCallback(async (token: string) => {
    try {
      await verifyEmailWithToken(token);
      setIsVerified(true);
    } catch (err) {
      console.error('Failed to verify email:', err);
      throw err;
    }
  }, [verifyEmailWithToken]);

  const resendVerification = useCallback(
    async (email: string) => {
      if (resendAttempts >= 3) {
        throw new Error('Maximum verification attempts reached');
      }
      try {
        await resendEmailVerification(email);
        setResendAttempts(prev => prev + 1);
      } catch (err) {
        console.error('Failed to resend verification email:', err);
        throw err;
      }
    },
    [resendEmailVerification, resendAttempts]
  );

  return {
    sendVerification,
    verifyEmail,
    resendVerification,
    verificationEmail,
    isVerified,
    resendAttempts,
    isLoading,
    error,
  };
};

/**
 * Hook for account recovery
 */
export const useAccountRecovery = () => {
  const { requestPasswordReset, isLoading, error } = useAuth();
  const [recoveryMethod, setRecoveryMethod] = useState<string | null>(null);
  const [recoveryStarted, setRecoveryStarted] = useState(false);

  const startEmailRecovery = useCallback(async (email: string) => {
    try {
      await requestPasswordReset(email);
      setRecoveryMethod('email');
      setRecoveryStarted(true);
    } catch (err) {
      console.error('Failed to start email recovery:', err);
      throw err;
    }
  }, [requestPasswordReset]);

  const startSecurityQuestionsRecovery = useCallback(() => {
    setRecoveryMethod('security-questions');
    setRecoveryStarted(true);
  }, []);

  const startBackupCodeRecovery = useCallback(() => {
    setRecoveryMethod('backup-codes');
    setRecoveryStarted(true);
  }, []);

  const startSupportRecovery = useCallback(() => {
    setRecoveryMethod('support');
    setRecoveryStarted(true);
  }, []);

  const resetRecovery = useCallback(() => {
    setRecoveryMethod(null);
    setRecoveryStarted(false);
  }, []);

  return {
    startEmailRecovery,
    startSecurityQuestionsRecovery,
    startBackupCodeRecovery,
    startSupportRecovery,
    resetRecovery,
    recoveryMethod,
    recoveryStarted,
    isLoading,
    error,
  };
};

export default {
  useOAuth,
  useTwoFactorAuth,
  usePasswordManagement,
  useEmailVerification,
  useAccountRecovery,
};
