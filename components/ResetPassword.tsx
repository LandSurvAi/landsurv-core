import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ResetPasswordProps {
  token: string;
  onCancel: () => void;
  onSuccess?: () => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({
  token,
  onCancel,
  onSuccess,
}) => {
  const { resetPassword, verifyPasswordResetToken, isLoading, error } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        await verifyPasswordResetToken(token);
        setIsValidatingToken(false);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Invalid or expired token');
        setIsValidatingToken(false);
      }
    };
    validateToken();
  }, [token, verifyPasswordResetToken]);

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push('At least 8 characters');
    if (!/[A-Z]/.test(pwd)) errors.push('At least one uppercase letter');
    if (!/[a-z]/.test(pwd)) errors.push('At least one lowercase letter');
    if (!/[0-9]/.test(pwd)) errors.push('At least one number');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) errors.push('At least one special character');
    return errors;
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setLocalError(null);
    const errors = validatePassword(value);
    if (value) {
      setValidationErrors(prev => ({ ...prev, password: errors.length > 0 ? errors[0] : '' }));
    } else {
      setValidationErrors(prev => ({ ...prev, password: '' }));
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConfirmPassword(value);
    setLocalError(null);
    if (value && value !== password) {
      setValidationErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
    } else {
      setValidationErrors(prev => ({ ...prev, confirmPassword: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);

    const newErrors: Record<string, string> = {};

    if (!password.trim()) {
      newErrors.password = 'Password is required';
    } else {
      const pwdErrors = validatePassword(password);
      if (pwdErrors.length > 0) {
        newErrors.password = pwdErrors[0];
      }
    }

    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setValidationErrors(newErrors);
      return;
    }

    try {
      await resetPassword(token, password, confirmPassword);
      setIsSuccess(true);
      setPassword('');
      setConfirmPassword('');
      onSuccess?.();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  if (isValidatingToken) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg text-center">
        <svg className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-gray-600">Verifying reset link...</p>
      </div>
    );
  }

  if (localError && !isSuccess) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h2>
          <p className="text-gray-600 mb-6">{localError}</p>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Request New Link
          </button>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg">
        <div className="text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Password reset successful</h2>
          <p className="text-gray-600 mb-6">
            Your password has been reset. You can now log in with your new password.
          </p>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Create new password</h2>
      <p className="text-gray-600 mb-6">
        Enter your new password below. Make sure it's strong and unique.
      </p>

      {(localError || error) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{localError || error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Password field */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter new password"
              disabled={isLoading}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed pr-10 ${
                validationErrors.password ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={!!validationErrors.password}
              aria-describedby={validationErrors.password ? 'password-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-gray-600 hover:text-gray-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.596-3.856a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {validationErrors.password && (
            <p id="password-error" className="mt-1 text-sm text-red-600">
              {validationErrors.password}
            </p>
          )}
        </div>

        {/* Confirm password field */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              placeholder="Confirm new password"
              disabled={isLoading}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed pr-10 ${
                validationErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={!!validationErrors.confirmPassword}
              aria-describedby={validationErrors.confirmPassword ? 'confirm-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-2.5 text-gray-600 hover:text-gray-700"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.596-3.856a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {validationErrors.confirmPassword && (
            <p id="confirm-error" className="mt-1 text-sm text-red-600">
              {validationErrors.confirmPassword}
            </p>
          )}
        </div>

        {/* Password requirements */}
        {password && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-medium text-blue-900 mb-2">Password requirements:</p>
            <ul className="space-y-1">
              <li className={`text-xs ${password.length >= 8 ? 'text-green-700' : 'text-gray-600'}`}>
                <span className="mr-2">{password.length >= 8 ? '✓' : '○'}</span>
                At least 8 characters
              </li>
              <li className={`text-xs ${/[A-Z]/.test(password) ? 'text-green-700' : 'text-gray-600'}`}>
                <span className="mr-2">{/[A-Z]/.test(password) ? '✓' : '○'}</span>
                One uppercase letter
              </li>
              <li className={`text-xs ${/[a-z]/.test(password) ? 'text-green-700' : 'text-gray-600'}`}>
                <span className="mr-2">{/[a-z]/.test(password) ? '✓' : '○'}</span>
                One lowercase letter
              </li>
              <li className={`text-xs ${/[0-9]/.test(password) ? 'text-green-700' : 'text-gray-600'}`}>
                <span className="mr-2">{/[0-9]/.test(password) ? '✓' : '○'}</span>
                One number
              </li>
              <li className={`text-xs ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? 'text-green-700' : 'text-gray-600'}`}>
                <span className="mr-2">{/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? '✓' : '○'}</span>
                One special character
              </li>
            </ul>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !!validationErrors.password || !!validationErrors.confirmPassword}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Resetting...
              </>
            ) : (
              'Reset Password'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ResetPassword;
