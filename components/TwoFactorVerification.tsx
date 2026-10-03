/**
 * Two-Factor Authentication Verification Component
 * Used during login to verify TOTP or backup codes
 */

import React, { useState } from 'react';

interface TwoFactorVerificationProps {
  onVerify: (code: string, isBackupCode: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
  userEmail?: string;
}

/**
 * Two Factor Verification Component
 */
export const TwoFactorVerification: React.FC<TwoFactorVerificationProps> = ({
  onVerify,
  onCancel,
  isLoading = false,
  error,
  userEmail
}) => {
  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30);

  React.useEffect(() => {
    if (!useBackupCode) {
      const interval = setInterval(() => {
        setTimeRemaining((prev) => {
          const next = prev - 1;
          return next <= 0 ? 30 : next;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [useBackupCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((useBackupCode && code.length >= 8) || (!useBackupCode && code.length === 6)) {
      onVerify(code, useBackupCode);
    }
  };

  return (
    <div className="verification-container">
      <div className="verification-card">
        {/* Header */}
        <div className="verification-header">
          <h2>Two-Factor Authentication</h2>
          <p>Enter your authentication code</p>
          {userEmail && <p className="email-hint">Signing in as {userEmail}</p>}
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="verification-form">
          {/* Tabs */}
          <div className="code-tabs">
            <button
              className={`tab ${!useBackupCode ? 'active' : ''}`}
              onClick={() => {
                setUseBackupCode(false);
                setCode('');
              }}
              type="button"
              disabled={isLoading}
            >
              Authenticator App
            </button>
            <button
              className={`tab ${useBackupCode ? 'active' : ''}`}
              onClick={() => {
                setUseBackupCode(true);
                setCode('');
              }}
              type="button"
              disabled={isLoading}
            >
              Backup Code
            </button>
          </div>

          {/* Code Input */}
          <div className="code-input-section">
            {!useBackupCode ? (
              <>
                <label htmlFor="totp-code">Enter 6-digit code:</label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  disabled={isLoading}
                  className="code-input totp-input"
                  autoFocus
                />
                <div className="time-display">
                  <div className="time-indicator">
                    <div className="time-bar" style={{ width: `${timeRemaining * 3.33}%` }}></div>
                  </div>
                  <p className="time-text">Code expires in {timeRemaining}s</p>
                </div>
              </>
            ) : (
              <>
                <label htmlFor="backup-code">Enter backup code:</label>
                <input
                  id="backup-code"
                  type="text"
                  placeholder="XXXX-XXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={isLoading}
                  className="code-input backup-input"
                  autoFocus
                />
                <p className="backup-hint">Format: XXXX-XXXX</p>
              </>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="verification-actions">
            <button
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={isLoading}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={
                isLoading ||
                (useBackupCode ? code.length < 8 : code.length !== 6)
              }
              type="submit"
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
          </div>

          {/* Help Text */}
          <p className="help-text">
            Lost access to your authenticator? You can use a backup code instead.
          </p>
        </form>
      </div>

      {/* Styles */}
      <style>{`
        .verification-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .verification-card {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          width: 100%;
          max-width: 400px;
          padding: 40px;
        }

        .verification-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .verification-header h2 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 24px;
        }

        .verification-header p {
          margin: 8px 0;
          color: #666;
        }

        .email-hint {
          color: #999;
          font-size: 14px;
        }

        .verification-form {
          width: 100%;
        }

        .code-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .tab {
          flex: 1;
          padding: 12px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          color: #666;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .tab:hover {
          color: #333;
        }

        .tab.active {
          color: #007bff;
          border-bottom-color: #007bff;
        }

        .tab:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .code-input-section {
          margin: 20px 0;
        }

        .code-input-section label {
          display: block;
          margin-bottom: 10px;
          color: #333;
          font-weight: 500;
          font-size: 14px;
        }

        .code-input {
          width: 100%;
          padding: 12px;
          font-size: 18px;
          border: 2px solid #e0e0e0;
          border-radius: 4px;
          text-align: center;
          font-family: monospace;
          transition: border-color 0.2s;
        }

        .code-input:focus {
          outline: none;
          border-color: #007bff;
        }

        .totp-input {
          letter-spacing: 4px;
          font-size: 24px;
        }

        .time-display {
          margin-top: 10px;
        }

        .time-indicator {
          height: 4px;
          background-color: #e0e0e0;
          border-radius: 2px;
          overflow: hidden;
        }

        .time-bar {
          height: 100%;
          background-color: #007bff;
          transition: width 0.1s linear;
        }

        .time-text {
          margin: 8px 0 0 0;
          font-size: 12px;
          color: #999;
          text-align: center;
        }

        .backup-hint {
          margin: 8px 0 0 0;
          font-size: 12px;
          color: #999;
        }

        .error-message {
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
          padding: 12px;
          border-radius: 4px;
          margin: 15px 0;
          font-size: 14px;
        }

        .verification-actions {
          display: flex;
          gap: 10px;
          margin-top: 30px;
        }

        .btn {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background-color: #007bff;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .btn-secondary {
          background-color: #6c757d;
          color: white;
        }

        .btn-secondary:hover:not(:disabled) {
          background-color: #545b62;
        }

        .help-text {
          text-align: center;
          color: #999;
          font-size: 12px;
          margin-top: 20px;
        }

        @media (max-width: 480px) {
          .verification-card {
            padding: 30px 20px;
          }

          .verification-header h2 {
            font-size: 20px;
          }

          .code-input {
            font-size: 16px;
          }

          .totp-input {
            font-size: 20px;
            letter-spacing: 3px;
          }
        }
      `}</style>
    </div>
  );
};

export default TwoFactorVerification;
