/**
 * Profile Component - User Profile Management UI
 * Handles profile viewing, editing, and account settings
 */

import React, { useState, useEffect } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  lastLogin: string;
}

interface UpdateProfileData {
  firstName: string;
  lastName: string;
}

export const ProfileComponent: React.FC<{
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}> = ({ onLogout, onNavigate }) => {
  
  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { addNotification } = useAppState();

  const notifyError = (message: string) => {
    addNotification({ kind: 'profile', severity: 'error', title: 'Profile', message });
  };
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState<UpdateProfileData>({
    firstName: '',
    lastName: ''
  });
  
  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // API configuration
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
  const PROFILE_ENDPOINT = `${API_BASE}/api/auth/profile`;
  const UPDATE_PROFILE_ENDPOINT = `${API_BASE}/api/auth/update-profile`;
  const CHANGE_PASSWORD_ENDPOINT = `${API_BASE}/api/auth/change-password`;
  
  // ========================================================================
  // Effects
  // ========================================================================
  
  useEffect(() => {
    fetchProfile();
  }, []);
  
  // ========================================================================
  // API Handlers
  // ========================================================================
  
  const fetchProfile = async () => {
    setIsLoading(true);
    
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch(PROFILE_ENDPOINT, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error('Failed to fetch profile');
      }
      
      const data: UserProfile = await response.json();
      setProfile(data);
      setEditData({
        firstName: data.firstName,
        lastName: data.lastName
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load profile';
      notifyError(errorMessage);
      console.error('Profile fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editData.firstName.trim() || !editData.lastName.trim()) {
      notifyError('First and last names are required');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch(UPDATE_PROFILE_ENDPOINT, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          firstName: editData.firstName.trim(),
          lastName: editData.lastName.trim()
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update profile');
      }
      
      const updatedProfile: UserProfile = await response.json();
      setProfile(updatedProfile);
      setIsEditMode(false);
      setSuccessMessage('Profile updated successfully');
      
      // Update stored user data
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      user.firstName = updatedProfile.firstName;
      user.lastName = updatedProfile.lastName;
      localStorage.setItem('user', JSON.stringify(user));
      
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update profile';
      notifyError(errorMessage);
      console.error('Profile update error:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!passwordData.currentPassword) {
      notifyError('Current password is required');
      return;
    }
    
    if (!passwordData.newPassword) {
      notifyError('New password is required');
      return;
    }
    
    if (passwordData.newPassword.length < 8) {
      notifyError('New password must be at least 8 characters');
      return;
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      notifyError('New passwords do not match');
      return;
    }
    
    if (passwordData.currentPassword === passwordData.newPassword) {
      notifyError('New password must be different from current password');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch(CHANGE_PASSWORD_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to change password');
      }
      
      setSuccessMessage('Password changed successfully');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowPasswordChange(false);
      
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change password';
      notifyError(errorMessage);
      console.error('Password change error:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleLogout = () => {
    // Clear tokens and user data
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTime');
    
    // Call logout callback
    if (onLogout) {
      onLogout();
    }
    
    // Navigate to login
    if (onNavigate) {
      onNavigate('/login');
    }
  };
  
  // ========================================================================
  // Render
  // ========================================================================
  
  if (isLoading && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-300">Loading profile...</p>
        </div>
      </div>
    );
  }
  
  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <p className="text-slate-300 mb-4">Failed to load profile</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-2xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Profile</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
          >
            Logout
          </button>
        </div>
        
        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-900/20 border border-green-700 rounded-lg flex items-start gap-3">
            <div className="text-green-400 font-bold text-lg flex-shrink-0">✓</div>
            <p className="text-green-200 text-sm">{successMessage}</p>
          </div>
        )}
        
        {/* Profile Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8 mb-6">
          
          {/* Profile Header */}
          <div className="mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl font-bold text-white">
                {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white">
              {profile.firstName} {profile.lastName}
            </h2>
            <p className="text-slate-400">{profile.email}</p>
          </div>
          
          {/* Profile Info */}
          <div className="space-y-4 mb-8 pb-8 border-b border-slate-700">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400 mb-1">Member Since</p>
                <p className="text-white">
                  {new Date(profile.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Last Login</p>
                <p className="text-white">
                  {new Date(profile.lastLogin).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
          
          {/* Edit Profile Section */}
          {!isEditMode ? (
            <button
              onClick={() => setIsEditMode(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
            >
              Edit Profile
            </button>
          ) : (
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Edit Profile</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-slate-300 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={editData.firstName}
                    onChange={(e) => setEditData(prev => ({ ...prev, firstName: e.target.value }))}
                    disabled={isLoading}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-slate-300 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    value={editData.lastName}
                    onChange={(e) => setEditData(prev => ({ ...prev, lastName: e.target.value }))}
                    disabled={isLoading}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditMode(false)}
                  disabled={isLoading}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
        
        {/* Security Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8">
          
          <h3 className="text-lg font-semibold text-white mb-6">Security</h3>
          
          {!showPasswordChange ? (
            <button
              onClick={() => setShowPasswordChange(true)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition"
            >
              Change Password
            </button>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              
              {/* Current Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-300">
                    Current Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    {showCurrentPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  id="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              
              {/* New Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="newPassword" className="block text-sm font-medium text-slate-300">
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    {showNewPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  id="newPassword"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              
              {/* Confirm Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
                    Confirm New Password
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
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition"
                >
                  Change Password
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasswordChange(false)}
                  disabled={isLoading}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileComponent;
