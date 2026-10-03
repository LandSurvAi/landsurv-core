import React, { useState, useEffect } from 'react';
import { Download, CheckCircle } from 'lucide-react';

interface ConnectorDownloadProps {
  onClose?: () => void;
}

export const ConnectorDownload: React.FC<ConnectorDownloadProps> = ({ onClose }) => {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const handleDownload = () => {
    // Direct download from Cloud Storage via our backend endpoint
    window.location.href = '/api/downloads/LandsurvConnector-v26.09.07.09.msi';
    setDownloadStarted(true);
  };

  const handleDownloadDll = () => {
    // Standalone DLL bundle (DLL + dependencies) for users who prefer NETLOAD over the MSI
    window.location.href = '/api/downloads/LandsurvConnector-v26.09.07.09-dll.zip';
    setDownloadStarted(true);
  };

  const handleBackToApp = () => {
    // If onClose is provided (in-app modal), use it
    if (onClose) {
      onClose();
      return;
    }
    // Otherwise navigate to main app (landing page usage)
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port ? ':' + window.location.port : '';
    
    let appUrl;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      appUrl = `${protocol}//localhost${port}`;
    } else {
      const domainParts = hostname.split('.');
      const mainDomain = domainParts.slice(-2).join('.');
      appUrl = `${protocol}//${mainDomain}${port}`;
    }
    window.location.href = appUrl;
  };

  // Auto-redirect after download starts
  useEffect(() => {
    if (downloadStarted) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            if (onClose) {
              onClose();
            } else {
              handleBackToApp();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [downloadStarted, onClose]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-100">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <button onClick={handleBackToApp} className="font-extrabold tracking-tighter text-gray-100">
            Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span>
          </button>
          <button
            onClick={handleBackToApp}
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            Back to App
          </button>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl text-center">
        {/* Icon */}
        <div className="mb-8 flex justify-center">
          <div className={`p-6 rounded-full border-2 ${downloadStarted ? 'bg-green-500/10 border-green-500/30' : 'bg-cyan-500/10 border-cyan-500/30'}`}>
            {downloadStarted ? (
              <CheckCircle size={64} className="text-green-400" />
            ) : (
              <Download size={64} className="text-cyan-400" />
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">
            Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span> Connector
          </h1>

          {downloadStarted ? (
            <>
              <h2 className="text-2xl font-bold mb-4 text-green-400">
                ✓ Download Started!
              </h2>
              <p className="text-lg text-gray-400 mb-6">
                Redirecting to homepage in {countdown} seconds...
              </p>
              <p className="text-gray-500 mb-4">
                Use the <span className="text-cyan-400 font-semibold">Connect C3D</span> button on the homepage to get your session token.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-4 text-gray-300">
                Civil 3D Plugin
              </h2>
              <p className="text-lg text-gray-400 mb-6">
                Connect your Civil 3D to LandSurv.ai's AI-powered surveying platform.
              </p>
            </>
          )}
        </div>

        {/* Download Button */}
        {!downloadStarted && (
          <button
            onClick={handleDownload}
            className="px-8 py-4 bg-green-600 hover:bg-green-500 rounded-lg font-semibold text-white text-lg transition flex items-center gap-3 mx-auto mb-8"
          >
            <Download size={24} />
            Download LandsurvConnector v26.09.07.09
          </button>
        )}

        {/* Advanced: DLL-only download */}
        {!downloadStarted && (
          <div className="mb-8 -mt-4">
            <button
              onClick={handleDownloadDll}
              className="text-sm text-gray-400 hover:text-cyan-300 underline underline-offset-4 transition cursor-pointer"
            >
              Advanced: download the .dll bundle (ZIP) for manual NETLOAD, no installer
            </button>
          </div>
        )}

        {/* Quick Start Instructions */}
        <div className="mb-6 rounded-2xl border border-white/[0.08] bg-slate-950/55 p-6 text-left shadow-xl shadow-black/10">
          <h3 className="text-lg font-bold mb-4 text-cyan-400">
            Quick Start
          </h3>
          <ol className="space-y-3 text-gray-300 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-cyan-500/20 border border-cyan-500 rounded-full flex items-center justify-center text-xs font-bold text-cyan-400">1</span>
              <span>Run the MSI installer (double-click the downloaded file)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-500/20 border border-green-500 rounded-full flex items-center justify-center text-xs font-bold text-green-400">2</span>
              <span>In Civil 3D: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400">NETLOAD</code> → browse to <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">C:\Program Files\LandsurvConnector\LandsurvConnector.dll</code></span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500/20 border border-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-blue-400">3</span>
              <span>On the <strong>homepage</strong>, click <span className="text-cyan-400 font-semibold">Connect C3D</span> to get your session token</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-purple-500/20 border border-purple-500 rounded-full flex items-center justify-center text-xs font-bold text-purple-400">4</span>
              <span>In Civil 3D: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400">LANDSURVCONFIG</code> → paste your token</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-orange-500/20 border border-orange-500 rounded-full flex items-center justify-center text-xs font-bold text-orange-400">5</span>
              <span>Type <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400">LANDSURVAI</code> to connect! 🎉</span>
            </li>
          </ol>
        </div>

        {/* Footer */}
        <div className="text-gray-500 text-sm">
          <p className="mb-2">Version 26.09.07.09 | 400 KB | Requires Civil 3D 2020+</p>
          <button 
            onClick={handleBackToApp}
            className="text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
          >
            ← Back to LandSurv.ai
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};
