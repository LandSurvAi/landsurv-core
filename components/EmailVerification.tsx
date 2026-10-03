import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface EmailVerificationProps {
  email: string;
  token?: string;
  onCancel: () => void;
  onSuccess?: () => void;
}

export const EmailVerification: React.FC<EmailVerificationProps> = ({
  email,
  token,
  onCancel,
  onSuccess,
}) => {
  const { verifyEmailWithToken, resendEmailVerification, isLoading, error } = useAuth();
  const [localError, setLocalError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);
  const maxResendAttempts = 3;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Auto-verify if token is provided (e.g., from email link)
  useEffect(() => {
    if (token && !isVerified) {
      handleVerify();
    }
  }, [token]);

  const handleVerify = async () => {
    if (!token) {
      setLocalError('No verification token provided');
      return;
    }

    try {
      setLocalError(null);
      await verifyEmailWithToken(token);
      setIsVerified(true);
      onSuccess?.();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Verification failed');
    }
  };

  const handleResend = async () => {
    if (resendAttempts >= maxResendAttempts) {
      setLocalError('Maximum resend attempts reached. Please try again later.');
      return;
    }

    try {
      setLocalError(null);
      await resendEmailVerification(email);
      setResendAttempts(prev => prev + 1);
      setResendCountdown(60);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to resend verification email');
    }
  };

  if (isVerified) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg">
        <div className="text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Email verified</h2>
          <p className="text-gray-600 mb-6">
            Thank you! Your email address has been verified successfully.
          </p>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify your email</h2>
      <p className="text-gray-600 mb-6">
        We've sent a verification link to <strong>{email}</strong>
      </p>

      {(localError || error) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{localError || error}</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-900">
          <strong>What to do:</strong>
        </p>
        <ol className="mt-2 list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Check your email inbox for a message from us</li>
          <li>Click the verification link in the email</li>
          <li>Come back here and click the button below</li>
        </ol>
      </div>

      <div className="space-y-3">
        <button
          onClick={handleVerify}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Verifying...
            </>
          ) : (
            'I\'ve verified my email'
          )}
        </button>

        <div className="border-t pt-3">
          <p className="text-sm text-gray-600 mb-3">Didn't receive the email?</p>
          <button
            onClick={handleResend}
            disabled={isLoading || resendCountdown > 0 || resendAttempts >= maxResendAttempts}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {resendCountdown > 0 ? (
              <>Resend in {resendCountdown}s</>
            ) : resendAttempts >= maxResendAttempts ? (
              'Maximum resends reached'
            ) : (
              `Resend email${resendAttempts > 0 ? ` (${resendAttempts}/${maxResendAttempts})` : ''}`
            )}
          </button>
        </div>
      </div>

      <div className="border-t mt-6 pt-4">
        <button
          onClick={onCancel}
          className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to sign up
        </button>
      </div>
    </div>
  );
};

export default EmailVerification;
