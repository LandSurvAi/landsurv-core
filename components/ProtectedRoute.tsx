/**
 * Protected Route - Wrapper component to guard authenticated routes
 * Requires valid authentication token to access
 */

import React from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requiredRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallback,
  requiredRoles
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }
  
  // Redirect if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        {fallback || (
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
              <div className="text-red-400 text-lg font-bold mb-2">Access Denied</div>
              <p className="text-slate-300 mb-6">
                You must be logged in to access this page.
              </p>
              <a
                href="/login"
                className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
              >
                Go to Login
              </a>
            </div>
          </div>
        )}
      </>
    );
  }
  
  // TODO: Implement role-based access control if needed
  // if (requiredRoles && requiredRoles.length > 0) {
  //   const userHasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
  //   if (!userHasRequiredRole) {
  //     return <AccessDenied />;
  //   }
  // }
  
  // Render protected content
  return <>{children}</>;
};

export default ProtectedRoute;
