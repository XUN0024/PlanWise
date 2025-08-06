import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authHelpers } from '../lib/supabase.jsx';

const UserProfile = () => {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  const [userSettings, setUserSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        
        // Fetch user profile
        const { data: profileData, error: profileError } = await authHelpers.getUserProfile(user.id);
        if (profileError) {
          console.error('Profile fetch error:', profileError);
        } else {
          setUserProfile(profileData);
        }

        // Fetch user settings
        const { data: settingsData, error: settingsError } = await authHelpers.getUserSettings(user.id);
        if (settingsError) {
          console.error('Settings fetch error:', settingsError);
        } else {
          setUserSettings(settingsData);
        }

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-red-600">
          <h3 className="font-medium">Error loading profile</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">User Profile</h2>
      
      {/* Auth User Info */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-800 mb-3">Authentication Info</h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-gray-600">User ID:</span>
            <span className="text-sm text-gray-900 font-mono">{user?.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm font-medium text-gray-600">Email:</span>
            <span className="text-sm text-gray-900">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm font-medium text-gray-600">Email Verified:</span>
            <span className={`text-sm ${user?.email_confirmed_at ? 'text-green-600' : 'text-red-600'}`}>
              {user?.email_confirmed_at ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm font-medium text-gray-600">Created:</span>
            <span className="text-sm text-gray-900">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Database Profile Info */}
      {userProfile && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Profile Data (from users table)</h3>
          <div className="bg-blue-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">Full Name:</span>
              <span className="text-sm text-gray-900">{userProfile.full_name || 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">Email (stored):</span>
              <span className="text-sm text-gray-900">{userProfile.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">Password (stored):</span>
              <span className="text-sm text-gray-900">
                {userProfile.password ? '••••••••' : 'Not stored'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">Avatar:</span>
              <span className="text-sm text-gray-900">
                {userProfile.avatar_url ? 'Set' : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">Profile Created:</span>
              <span className="text-sm text-gray-900">
                {new Date(userProfile.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* User Settings */}
      {userSettings && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Settings</h3>
          <div className="bg-green-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">Dark Mode:</span>
              <span className="text-sm text-gray-900">
                {userSettings.dark_mode ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">Language:</span>
              <span className="text-sm text-gray-900">{userSettings.language}</span>
            </div>
          </div>
        </div>
      )}

      {/* Database Status */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-medium text-gray-800 mb-3">Database Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className={`w-4 h-4 rounded-full mx-auto mb-2 ${userProfile ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <p className="text-sm text-gray-600">Users Table</p>
            <p className="text-xs text-gray-500">{userProfile ? 'Connected' : 'No Data'}</p>
          </div>
          <div className="text-center">
            <div className={`w-4 h-4 rounded-full mx-auto mb-2 ${userSettings ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <p className="text-sm text-gray-600">Settings Table</p>
            <p className="text-xs text-gray-500">{userSettings ? 'Connected' : 'No Data'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
