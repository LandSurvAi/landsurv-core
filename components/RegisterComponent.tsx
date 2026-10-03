/**
 * Register Component - User Registration UI
 * Handles user account creation with validation
 */

import React, { useState } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface RegisterFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface RegisterResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export const RegisterComponent: React.FC<{
  onRegisterSuccess?: (data: RegisterResponse) => void;
  onNavigate?: (path: string) => void;
}> = ({ onRegisterSuccess, onNavigate }) => {
  
  // Form state
  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { addNotification } = useAppState();
  
  // API configuration
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
  const REGISTER_ENDPOINT = `${API_BASE}/api/auth/register`;
  
  // ========================================================================
  // Form Handlers
  // ========================================================================
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (successMessage) setSuccessMessage(null);
  };

  const notifyValidationError = (message: string) => {
    addNotification({ kind: 'register', severity: 'error', title: 'Registration', message });
  };
  
  const validateForm = (): boolean => {
    // First name validation
    if (!formData.firstName.trim()) {
      notifyValidationError('First name is required');
      return false;
    }
    
    if (formData.firstName.trim().length < 2) {
      notifyValidationError('First name must be at least 2 characters');
      return false;
    }
    
    if (formData.firstName.trim().length > 50) {
      notifyValidationError('First name cannot exceed 50 characters');
      return false;
    }
    
    // Last name validation
    if (!formData.lastName.trim()) {
      notifyValidationError('Last name is required');
      return false;
    }
    
    if (formData.lastName.trim().length < 2) {
      notifyValidationError('Last name must be at least 2 characters');
      return false;
    }
    
    if (formData.lastName.trim().length > 50) {
      notifyValidationError('Last name cannot exceed 50 characters');
      return false;
    }
    
    // Email validation
    if (!formData.email.trim()) {
      notifyValidationError('Email is required');
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      notifyValidationError('Please enter a valid email address');
      return false;
    }
    
    // Password validation
    if (!formData.password) {
      notifyValidationError('Password is required');
      return false;
    }
    
    if (formData.password.length < 8) {
      notifyValidationError('Password must be at least 8 characters');
      return false;
    }
    
    if (formData.password.length > 128) {
      notifyValidationError('Password cannot exceed 128 characters');
      return false;
    }
    
    // Check password complexity
    const hasUpperCase = /[A-Z]/.test(formData.password);
    const hasLowerCase = /[a-z]/.test(formData.password);
    const hasNumbers = /\d/.test(formData.password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password);
    
    const complexityScore = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;
    
    if (complexityScore < 3) {
      notifyValidationError('Password must contain uppercase, lowercase, numbers, and special characters');
      return false;
    }
    
    // Confirm password validation
    if (!formData.confirmPassword) {
      notifyValidationError('Please confirm your password');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      notifyValidationError('Passwords do not match');
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
    setSuccessMessage(null);
    
    try {
      // Call register API
      const response = await fetch(REGISTER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim(),
          password: formData.password
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle specific error messages from API
        if (response.status === 409) {
          throw new Error('An account with this email already exists');
        }
        
        throw new Error(errorData.message || 'Registration failed');
      }
      
      const data: RegisterResponse = await response.json();
      
      // Show success message
      setSuccessMessage(`Welcome, ${data.firstName}! Registration successful. Redirecting to login...`);
      
      // Clear form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: ''
      });
      
      // Call success callback
      if (onRegisterSuccess) {
        onRegisterSuccess(data);
      }
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        if (onNavigate) {
          onNavigate('/login');
        }
      }, 2000);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during registration';
      notifyValidationError(errorMessage);
      console.error('Registration error:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleBackToLogin = () => {
    if (onNavigate) {
      onNavigate('/login');
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
              Create Account
            </h1>
            <p className="text-slate-400">
              Join LandSurv.ai today
            </p>
          </div>
          
          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-900/20 border border-green-700 rounded-lg flex items-start gap-3">
              <div className="text-green-400 font-bold text-lg flex-shrink-0">✓</div>
              <p className="text-green-200 text-sm">{successMessage}</p>
            </div>
          )}
          
          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* First Name Field */}
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-slate-300 mb-1">
                First Name
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                disabled={isLoading}
                placeholder="John"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
              />
            </div>
            
            {/* Last Name Field */}
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-slate-300 mb-1">
                Last Name
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                disabled={isLoading}
                placeholder="Doe"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
              />
            </div>
            
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
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
              <div className="flex items-center justify-between mb-1">
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
                placeholder="••••••••••••"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
              />
              <p className="text-xs text-slate-500 mt-1">
                At least 8 characters with uppercase, lowercase, numbers, and special characters
              </p>
            </div>
            
            {/* Confirm Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
                  Confirm Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                disabled={isLoading}
                placeholder="••••••••••••"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
              />
            </div>
            
            {/* Terms & Conditions */}
            <div className="flex items-start gap-2 text-xs text-slate-400 pt-2">
              <input
                type="checkbox"
                id="terms"
                disabled={isLoading}
                required
                className="w-4 h-4 bg-slate-700 border border-slate-600 rounded focus:ring-2 focus:ring-blue-500 mt-0.5 cursor-pointer"
              />
              <label htmlFor="terms" className="cursor-pointer">
                I agree to the Terms of Service and Privacy Policy
              </label>
            </div>
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2 mt-6"
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
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
                Already have an account?
              </span>
            </div>
          </div>
          
          {/* Back to Login */}
          <button
            type="button"
            onClick={handleBackToLogin}
            disabled={isLoading}
            className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg transition border border-slate-600"
          >
            Sign In
          </button>
          
          {/* Footer */}
          <p className="text-xs text-slate-500 text-center mt-6">
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterComponent;
