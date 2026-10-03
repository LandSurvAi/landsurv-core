import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface SocialLoginButtonsProps {
  onGoogleSuccess?: (url: string) => void;
  onGitHubSuccess?: (url: string) => void;
  onError?: (error: string) => void;
  dividerText?: string;
}

export const SocialLoginButtons: React.FC<SocialLoginButtonsProps> = ({
  onGoogleSuccess,
  onGitHubSuccess,
  onError,
  dividerText = 'Or continue with',
}) => {
  const { getGoogleAuthUrl, getGitHubAuthUrl, isLoading, error } = useAuth();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleGoogleClick = async () => {
    try {
      setLocalError(null);
      const authUrl = await getGoogleAuthUrl();
      if (onGoogleSuccess) {
        onGoogleSuccess(authUrl);
      } else {
        // Default: redirect to auth URL
        window.location.href = authUrl;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Google login failed';
      setLocalError(errorMsg);
      onError?.(errorMsg);
    }
  };

  const handleGitHubClick = async () => {
    try {
      setLocalError(null);
      const authUrl = await getGitHubAuthUrl();
      if (onGitHubSuccess) {
        onGitHubSuccess(authUrl);
      } else {
        // Default: redirect to auth URL
        window.location.href = authUrl;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'GitHub login failed';
      setLocalError(errorMsg);
      onError?.(errorMsg);
    }
  };

  return (
    <div className="w-full">
      {/* Divider with text */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500 font-medium">{dividerText}</span>
        </div>
      </div>

      {/* Error message */}
      {(localError || error) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-700">{localError || error}</p>
        </div>
      )}

      {/* Social buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Google button */}
        <button
          onClick={handleGoogleClick}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-gray-700"
          aria-label="Sign in with Google"
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          <span className="hidden sm:inline">Google</span>
        </button>

        {/* GitHub button */}
        <button
          onClick={handleGitHubClick}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-gray-700"
          aria-label="Sign in with GitHub"
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.868-.013-1.703-2.782.603-3.369-1.343-3.369-1.343-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.544 2.914 1.186.092-.923.35-1.544.637-1.9-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.817c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.137 18.195 20 14.44 20 10.017 20 4.484 15.522 0 10 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span className="hidden sm:inline">GitHub</span>
        </button>
      </div>

      {/* Alternative text */}
      <p className="mt-4 text-center text-sm text-gray-500">
        Each provider will create a new account if you don't already have one
      </p>
    </div>
  );
};

export default SocialLoginButtons;
