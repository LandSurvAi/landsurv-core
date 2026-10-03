import React, { useState, useCallback, useEffect } from 'react';
import { X, QrCode, Copy, Check, AlertCircle, Loader } from 'lucide-react';
import QRCode from 'qrcode.react';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface QRAuthProps {
  onClose?: () => void;
  onAuthSuccess?: (sessionToken: string) => void;
}

interface SessionAuthData {
  version: string;
  type: string;
  server: string;
  sessionToken: string; // Encrypted - not readable from QR code image
  sessionId: string;
  expiresIn: number;
  nonce: string;
}

/**
 * Civil 3D Connector QR Code Authentication Component
 * 
 * Security Features:
 * - API key never exposed in QR code
 * - Session token is encrypted in QR payload
 * - Tokens expire in 5 minutes (SESSION_TOKEN_EXPIRY)
 * - One-time use per scan
 * - Nonce prevents replay attacks
 * - Backend verifies: hash(apiKey + sessionId + nonce + expiresAt)
 */
export const C3DConnectorQRAuth: React.FC<QRAuthProps> = ({ onClose, onAuthSuccess }) => {
  const [qrData, setQrData] = useState<SessionAuthData | null>(null);
  const [qrCodeURL, setQrCodeURL] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const { addNotification } = useAppState();

  // Generate QR code on component mount
  useEffect(() => {
    generateQRCode();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      addNotification({ kind: 'c3d-qr', severity: 'error', title: 'QR Code', message: 'QR code expired. Please generate a new one.' });
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  /**
   * Generate secure session token and QR code
   * This calls the backend to create a temporary, non-reversible session token
   */
  const generateQRCode = useCallback(async () => {
    try {
      setLoading(true);
      setCountdown(300);

      // Get current session API key from context or localStorage
      const sessionApiKey = localStorage.getItem('landsurv_session_api_key') || 
                           localStorage.getItem('gnss_api_key') ||
                           'trial-api-key'; // Fallback to trial key

      // Call backend to generate session token
      const response = await fetch('/api/c3d/generate-qr-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
        },
        body: JSON.stringify({
          apiKey: sessionApiKey,
          clientId: generateClientId(),
          tier: localStorage.getItem('landsurv_superuser') === 'true' ? 'pro' : 'trial',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate QR code: ${response.statusText}`);
      }

      const data: SessionAuthData = await response.json();
      setQrData(data);

      // Generate QR code URL (encodes the auth data)
      const qrContent = JSON.stringify(data);
      setQrCodeURL(qrContent);

      console.log('[C3DQRAuth] QR code generated successfully');
      console.log('[C3DQRAuth] Session expires in:', data.expiresIn, 'seconds');
      console.log('[C3DQRAuth] Never expose API key - only encrypted session token in QR');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate QR code';
      addNotification({ kind: 'c3d-qr', severity: 'error', title: 'QR Code', message });
      console.error('[C3DQRAuth] Error:', message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Generate unique client ID for this device
   */
  const generateClientId = () => {
    let clientId = localStorage.getItem('landsurv_c3d_client_id');
    if (!clientId) {
      clientId = `c3d-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('landsurv_c3d_client_id', clientId);
    }
    return clientId;
  };

  /**
   * Copy QR data to clipboard (for manual entry if camera unavailable)
   */
  const copyQRData = useCallback(() => {
    if (qrData) {
      const qrJson = JSON.stringify(qrData);
      navigator.clipboard.writeText(qrJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [qrData]);

  /**
   * Format countdown timer
   */
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Security information display
   */
  const renderSecurityInfo = () => (
    <div className="mt-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
      <h4 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
        <Check size={16} />
        Security Features
      </h4>
      <ul className="text-xs text-green-300/80 space-y-1">
        <li>✓ API key never exposed in QR code</li>
        <li>✓ Session token encrypted (AES-256-GCM)</li>
        <li>✓ One-time use per scan</li>
        <li>✓ Expires in 5 minutes</li>
        <li>✓ Nonce prevents replay attacks</li>
        <li>✓ Backend verifies using cryptographic hash</li>
      </ul>
    </div>
  );

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full border border-gray-700">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Loader className="animate-spin text-cyan-400" size={24} />
            <h3 className="text-lg font-semibold">Generating QR Code...</h3>
          </div>
          <p className="text-gray-400 text-center text-sm">Creating secure session token</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg max-w-md w-full border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-gray-700 p-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <QrCode className="text-cyan-400" size={24} />
            <div>
              <h2 className="text-lg font-bold">Connect Civil 3D</h2>
              <p className="text-sm text-gray-400">Scan with your LandSurv connector</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {qrCodeURL ? (
            <>
              {/* QR Code Display */}
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg flex justify-center">
                  <QRCode
                    value={qrCodeURL}
                    size={256}
                    level="H"
                    includeMargin={true}
                    className="w-full h-auto max-w-xs"
                  />
                </div>

                {/* Timer */}
                <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                  <span className="text-sm text-gray-300">Expires in</span>
                  <span className={`font-mono font-bold ${
                    countdown < 60 ? 'text-yellow-400' : 'text-cyan-400'
                  }`}>
                    {formatTime(countdown)}
                  </span>
                </div>

                {/* Instructions */}
                <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-300 mb-2">Steps:</h4>
                  <ol className="text-xs text-blue-200/80 space-y-1">
                    <li>1. Open Civil 3D with LandsurvConnector loaded</li>
                    <li>2. Run the <code className="bg-black/30 px-1 rounded">LANDSURVCONNECT</code> command</li>
                    <li>3. Select "Scan QR Code" option</li>
                    <li>4. Scan this QR code with your Civil 3D app</li>
                    <li>5. Connection established securely!</li>
                  </ol>
                </div>

                {/* Copy Data Button */}
                <button
                  onClick={copyQRData}
                  className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm font-medium text-gray-300 hover:text-white transition flex items-center justify-center gap-2"
                >
                  <Copy size={16} />
                  {copied ? 'Copied!' : 'Copy QR Data'}
                </button>

                {/* Refresh Button */}
                <button
                  onClick={generateQRCode}
                  className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-medium text-white transition"
                >
                  Generate New QR Code
                </button>
              </div>

              {/* Security Info */}
              {renderSecurityInfo()}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-4 bg-gray-800/30">
          <p className="text-xs text-gray-400 text-center">
            Your API key is <strong>never exposed</strong> in the QR code. <br />
            Only encrypted, temporary session tokens are used.
          </p>
        </div>
      </div>
    </div>
  );
};

export default C3DConnectorQRAuth;
