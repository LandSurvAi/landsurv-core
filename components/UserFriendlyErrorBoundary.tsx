// UserFriendlyErrorBoundary.tsx
// Catches React errors and shows user-friendly refresh instructions

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { errorLogger } from '../utils/errorLogger';
import { emitError } from '../utils/errorReporting';
import { getRefreshInstructions, getShortRefreshInstruction } from '../utils/browserDetection';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
  showErrorConsole: boolean;
}

class UserFriendlyErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: undefined,
      showErrorConsole: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error console silently
    errorLogger.logError({
      type: 'error',
      message: `React Error: ${error.message}`,
      stack: error.stack,
      details: {
        componentStack: errorInfo.componentStack,
      }
    });

    // Best-effort mirror to the unified reporter. For a top-level crash the
    // notification provider has unmounted, so this is a no-op there; it still
    // covers any nested/partial boundary usage without breaking the fallback.
    try {
      emitError({
        title: 'Something went wrong',
        message: error.message,
        kind: 'react-crash',
        dedupeKey: 'react-crash',
        error,
        skipLog: true,
      });
    } catch {
      // Never let mirroring interfere with the crash screen.
    }
  }

  handleShowErrorConsole = () => {
    this.setState({ showErrorConsole: true });
  };

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const refreshInstructions = getRefreshInstructions();
      const shortInstruction = getShortRefreshInstruction();

      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full p-8 border border-gray-700">
            {/* Icon */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-500/20 mb-4">
                <span className="text-5xl">⚠️</span>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Something Went Wrong
              </h1>
              <p className="text-gray-400">
                Don't worry — this is usually a quick fix!
              </p>
            </div>

            {/* Main Instructions */}
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-blue-300 mb-3 flex items-center gap-2">
                🔄 Quick Fix
              </h2>
              <p className="text-gray-300 text-lg font-medium mb-4">
                {shortInstruction}
              </p>
              <div className="bg-gray-900/50 rounded p-4 mb-4">
                <p className="text-sm text-gray-400 whitespace-pre-line">
                  {refreshInstructions}
                </p>
              </div>
              <button
                onClick={this.handleRefresh}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                🔄 Refresh Page Now
              </button>
            </div>

            {/* Why This Happens */}
            <details className="mb-6">
              <summary className="text-gray-400 cursor-pointer hover:text-gray-300 text-sm">
                Why did this happen?
              </summary>
              <div className="mt-3 text-sm text-gray-400 space-y-2 pl-4">
                <p>• The app may have been updated recently</p>
                <p>• Your browser might be using cached (old) files</p>
                <p>• A temporary network issue occurred</p>
                <p className="pt-2 text-gray-500">
                  A hard refresh forces your browser to download the latest version
                </p>
              </div>
            </details>

            {/* Error Console Link */}
            <div className="border-t border-gray-700 pt-6">
              <button
                onClick={this.handleShowErrorConsole}
                className="text-sm text-gray-500 hover:text-gray-400 underline"
              >
                🐛 View technical error details
              </button>
            </div>

            {/* Error Console Modal */}
            {this.state.showErrorConsole && (
              <div className="fixed inset-0 bg-black/80 z-[10001] flex items-center justify-center p-4">
                <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-white">Technical Error Details</h3>
                    <button
                      onClick={() => this.setState({ showErrorConsole: false })}
                      className="text-gray-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="bg-gray-800 rounded p-4 font-mono text-xs text-red-400 overflow-x-auto">
                    <p className="mb-2 font-bold">Error Message:</p>
                    <p className="mb-4">{this.state.errorMessage}</p>
                    <p className="text-gray-500 text-xs">
                      For more detailed logs, access the Error Console from the Help menu after refreshing.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(this.state.errorMessage || '');
                      alert('Error copied to clipboard');
                    }}
                    className="mt-4 text-sm text-blue-400 hover:text-blue-300"
                  >
                    📋 Copy error message
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default UserFriendlyErrorBoundary;
