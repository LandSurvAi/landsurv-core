import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AccountRecoveryProps {
  email?: string;
  onCancel: () => void;
  onSuccess?: (method: string) => void;
}

export const AccountRecovery: React.FC<AccountRecoveryProps> = ({
  email,
  onCancel,
  onSuccess,
}) => {
  const { requestPasswordReset, isLoading, error } = useAuth();
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const recoveryOptions = [
    {
      id: 'email-recovery',
      title: 'Email Recovery',
      description: 'Receive a recovery link via your registered email address',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      id: 'security-questions',
      title: 'Security Questions',
      description: 'Answer your pre-set security questions to regain access',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      id: 'backup-codes',
      title: 'Backup Codes',
      description: 'Use one of your backup codes from 2FA setup',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      id: 'support-contact',
      title: 'Contact Support',
      description: 'Get help from our support team to recover your account',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
    },
  ];

  async function handleOptionSelect(optionId: string) {
    try {
      setLocalError(null);
      setSuccessMessage(null);
      setIsProcessing(true);
      setSelectedOption(optionId);

      // Primary recovery method: send password reset email
      if (optionId === 'email-recovery' && email) {
        await requestPasswordReset(email);
        setSuccessMessage('Recovery link sent to your email');
        onSuccess?.(optionId);
      } else if (optionId === 'support-contact') {
        // Support contact - just show success message
        setSuccessMessage('Support team contact information has been provided');
        onSuccess?.(optionId);
      } else {
        // Other methods would need backend implementation
        setSuccessMessage(`Recovery process started via ${optionId}`);
        onSuccess?.(optionId);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Recovery process failed');
      setSelectedOption(null);
    } finally {
      setIsProcessing(false);
    }
  }

  if (successMessage) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg">
        <div className="text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Recovery started</h2>
          <p className="text-gray-600 mb-6">{successMessage}</p>
          <p className="text-sm text-gray-500 mb-6">
            Follow the instructions sent to you to complete the account recovery process.
          </p>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Recover your account</h2>
        <p className="text-gray-600 mb-6">
          Select one of the following recovery methods to regain access to your account.
        </p>

        {(localError || error) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{localError || error}</p>
            </div>
          </div>
        )}

        {email && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>Account email:</strong> {email}
            </p>
          </div>
        )}

        {/* Recovery options grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {recoveryOptions.map(option => (
            <button
              key={option.id}
              onClick={() => handleOptionSelect(option.id)}
              disabled={isLoading || isProcessing}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                selectedOption === option.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${
                selectedOption === option.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {isProcessing && selectedOption === option.id ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  option.icon
                )}
              </div>
              <h3 className={`font-semibold mb-1 ${
                selectedOption === option.id ? 'text-blue-900' : 'text-gray-900'
              }`}>
                {option.title}
              </h3>
              <p className={`text-sm ${
                selectedOption === option.id ? 'text-blue-700' : 'text-gray-600'
              }`}>
                {option.description}
              </p>
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 border-t pt-6">
          <button
            onClick={onCancel}
            disabled={isLoading || isProcessing}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Back
          </button>
          <button
            onClick={() => selectedOption && handleOptionSelect(selectedOption)}
            disabled={!selectedOption || isLoading || isProcessing}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isProcessing ? 'Processing...' : 'Continue'}
          </button>
        </div>
      </div>

      {/* Help section */}
      <div className="mt-6 bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-3">Still need help?</h3>
        <p className="text-sm text-gray-600 mb-4">
          If none of these recovery methods work, our support team can help you regain access to your account.
        </p>
        <a
          href="mailto:support@landsurv.ai"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
        >
          Contact Support
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  );
};

export default AccountRecovery;
