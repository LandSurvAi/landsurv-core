/**
 * Login Component - Authentication UI
 * Handles user login with JWT token-based authentication
 */

import React, { useState } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface LoginFormData {
  email: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export const LoginComponent: React.FC<{
  onLoginSuccess?: (data: LoginResponse) => void;
  onNavigate?: (path: string) => void;
}> = ({ onLoginSuccess, onNavigate }) => {
  
  // Form state
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: ''
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { addNotification } = useAppState();

  const notifyError = (message: string) => {
    addNotification({ kind: 'login', severity: 'error', title: 'Login', message });
  };
  
  // API configuration
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
  const LOGIN_ENDPOINT = `${API_BASE}/api/auth/login`;
  
  // ========================================================================
  // Form Handlers
  // ========================================================================
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const validateForm = (): boolean => {
    if (!formData.email.trim()) {
      notifyError('Email is required');
      return false;
    }
    
    if (!formData.email.includes('@')) {
      notifyError('Please enter a valid email address');
      return false;
    }
    
    if (!formData.password) {
      notifyError('Password is required');
      return false;
    }
    
    if (formData.password.length < 6) {
      notifyError('Password must be at least 6 characters');
      return false;
    }
    
    return true;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Call login API
      const response = await fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Login failed');
      }
      
      const data: LoginResponse = await response.json();
      
      // ====================================================================
      // Store tokens and user data
      // ====================================================================
      
      // Store in localStorage
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('loginTime', new Date().toISOString());
      
      // Call success callback
      if (onLoginSuccess) {
        onLoginSuccess(data);
      }
      
      // Navigate to dashboard
      if (onNavigate) {
        onNavigate('/dashboard');
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during login';
      notifyError(errorMessage);
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // ========================================================================
  // Render
  // ========================================================================
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8">
          
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome Back
            </h1>
            <p className="text-slate-400">
              Sign in to your LandSurv.ai account
            </p>
          </div>
          
          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                disabled={isLoading}
                placeholder="you@example.com"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
              />
            </div>
            
            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                disabled={isLoading}
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
              />
            </div>
            
            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 bg-slate-700 border border-slate-600 rounded focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <span className="text-slate-400">Remember me</span>
              </label>
              <button
                type="button"
                disabled={isLoading}
                className="text-blue-400 hover:text-blue-300 transition disabled:text-slate-500"
              >
                Forgot password?
              </button>
            </div>
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <span>→</span>
                </>
              )}
            </button>
          </form>
          
          {/* Divider */}
          <div className="my-6 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800 text-slate-400">
                New to LandSurv.ai?
              </span>
            </div>
          </div>
          
          {/* Register Link */}
          <button
            type="button"
            disabled={isLoading}
            className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg transition border border-slate-600"
          >
            Create Account
          </button>
          
          {/* Footer */}
          <p className="text-xs text-slate-500 text-center mt-6">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginComponent;
