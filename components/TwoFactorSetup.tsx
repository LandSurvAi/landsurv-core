/**
 * Two-Factor Authentication Setup Component
 * Displays TOTP secret, QR code, and backup codes
 */

import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

interface TwoFactorSetupProps {
  qrCode: string;
  secret: string;
  backupCodes: string[];
  onConfirm: (verificationCode: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
}

/**
 * Two Factor Setup Component
 */
export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({
  qrCode,
  secret,
  backupCodes,
  onConfirm,
  onCancel,
  isLoading = false,
  error
}) => {
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'scan' | 'verify' | 'backup'>('scan');
  const [backupCodesCopied, setBackupCodesCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const handleVerification = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length === 6) {
      onConfirm(verificationCode);
    }
  };

  const copyBackupCodesToClipboard = () => {
    const codes = backupCodes.join('\n');
    navigator.clipboard.writeText(codes);
    setBackupCodesCopied(true);
    setTimeout(() => setBackupCodesCopied(false), 2000);
  };

  const downloadBackupCodes = () => {
    const codes = backupCodes.join('\n');
    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(codes)}`);
    element.setAttribute('download', 'landsurv-backup-codes.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>Set Up Two-Factor Authentication</h2>
          <button className="modal-close" onClick={onCancel} disabled={isLoading}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {/* Step 1: Scan QR Code */}
          {step === 'scan' && (
            <div className="setup-step">
              <h3>Step 1: Scan QR Code</h3>
              <p>Scan this QR code with your authenticator app:</p>

              {qrCode && (
                <div className="qr-code-container">
                  <QRCode value={qrCode} level="H" size={200} />
                </div>
              )}

              <details className="secret-details">
                <summary>Can't scan? Enter manually</summary>
                <div className="secret-display">
                  <p>Secret key:</p>
                  <div className="secret-code">
                    {showSecret ? (
                      <code>{secret}</code>
                    ) : (
                      <code>{'••••••••••••••••••••••••••••••'}</code>
                    )}
                    <button
                      className="btn-toggle-visibility"
                      onClick={() => setShowSecret(!showSecret)}
                      type="button"
                    >
                      {showSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <button
                    className="btn-copy"
                    onClick={() => navigator.clipboard.writeText(secret)}
                    type="button"
                  >
                    Copy
                  </button>
                </div>
              </details>

              <div className="step-actions">
                <button
                  className="btn btn-secondary"
                  onClick={onCancel}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setStep('verify')}
                  disabled={isLoading}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Verify Code */}
          {step === 'verify' && (
            <div className="setup-step">
              <h3>Step 2: Verify Code</h3>
              <p>Enter the 6-digit code from your authenticator app:</p>

              <form onSubmit={handleVerification}>
                <div className="form-group">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    disabled={isLoading}
                    className="verification-code-input"
                  />
                </div>

                {error && (
                  <div className="error-message">
                    {error}
                  </div>
                )}

                <div className="step-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setStep('scan')}
                    disabled={isLoading}
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleVerification}
                    disabled={isLoading || verificationCode.length !== 6}
                  >
                    {isLoading ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step 3: Backup Codes */}
          {step === 'backup' && (
            <div className="setup-step">
              <h3>Step 3: Save Backup Codes</h3>
              <p className="warning-text">
                ⚠️ Save these codes in a safe place. Each code can be used once if you lose access to your authenticator app.
              </p>

              <div className="backup-codes-container">
                {backupCodes.map((code, index) => (
                  <div key={index} className="backup-code-item">
                    {code}
                  </div>
                ))}
              </div>

              <div className="backup-actions">
                <button
                  className="btn btn-secondary"
                  onClick={copyBackupCodesToClipboard}
                >
                  {backupCodesCopied ? '✓ Copied' : 'Copy All'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={downloadBackupCodes}
                >
                  Download
                </button>
              </div>

              <div className="step-actions">
                <button
                  className="btn btn-secondary"
                  onClick={onCancel}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setStep('verify')}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => onConfirm(verificationCode)}
                  disabled={isLoading}
                >
                  Complete Setup
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Styles */}
        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .modal-content {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid #eee;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 20px;
            color: #333;
          }

          .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
          }

          .modal-close:hover {
            color: #333;
          }

          .modal-body {
            padding: 20px;
          }

          .setup-step h3 {
            margin-top: 0;
            color: #333;
          }

          .setup-step p {
            color: #666;
            line-height: 1.6;
          }

          .qr-code-container {
            text-align: center;
            margin: 20px 0;
            padding: 20px;
            background-color: #f9f9f9;
            border-radius: 8px;
          }

          .secret-details {
            margin: 20px 0;
            padding: 10px;
            background-color: #f9f9f9;
            border-radius: 4px;
          }

          .secret-details summary {
            cursor: pointer;
            color: #007bff;
          }

          .secret-display {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #ddd;
          }

          .secret-code {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
          }

          .secret-code code {
            background-color: white;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
            flex: 1;
            overflow: auto;
          }

          .btn-toggle-visibility,
          .btn-copy {
            background-color: #f0f0f0;
            border: 1px solid #ddd;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          }

          .btn-toggle-visibility:hover,
          .btn-copy:hover {
            background-color: #e0e0e0;
          }

          .verification-code-input {
            width: 100%;
            padding: 12px;
            font-size: 24px;
            text-align: center;
            letter-spacing: 8px;
            border: 2px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
          }

          .verification-code-input:focus {
            outline: none;
            border-color: #007bff;
          }

          .form-group {
            margin: 20px 0;
          }

          .backup-codes-container {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin: 20px 0;
            padding: 15px;
            background-color: #f9f9f9;
            border-radius: 4px;
          }

          .backup-code-item {
            padding: 10px;
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
            text-align: center;
            word-break: break-all;
          }

          .backup-actions {
            display: flex;
            gap: 10px;
            margin: 15px 0;
          }

          .backup-actions .btn {
            flex: 1;
          }

          .step-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            justify-content: flex-end;
          }

          .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
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

          .btn-success {
            background-color: #28a745;
            color: white;
          }

          .btn-success:hover:not(:disabled) {
            background-color: #218838;
          }

          .warning-text {
            color: #d9534f;
            font-weight: bold;
            margin: 15px 0;
          }

          .error-message {
            color: #d9534f;
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            padding: 12px;
            border-radius: 4px;
            margin: 15px 0;
          }
        `}</style>
      </div>
    </div>
  );
};

export default TwoFactorSetup;
