import React, { createContext, useContext, useEffect, useState } from 'react';
import { authHelpers } from '../lib/supabase.jsx';

// Create Auth Context
const AuthContext = createContext({});

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth Provider Component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state
  useEffect(() => {
    // Remove plaintext registration data left by older versions.
    try {
      localStorage.removeItem('pendingUserData');
    } catch (error) {
      console.error('Error clearing legacy registration data:', error);
    }

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await authHelpers.getCurrentSession();
        if (error) throw error;
        
        setSession(session);
        setUser(session?.user || null);
      } catch (error) {
        console.error('Error getting initial session:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = authHelpers.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);
        setUser(session?.user || null);
        setLoading(false);

        // Clear any previous errors on successful auth
        if (session) {
          setError(null);

          // Sync user data if needed (for both sign in and sign up)
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session.user) {
            try {
              console.log('Auto-syncing user data for event:', event);

              const result = await authHelpers.syncUserData(session.user);
              if (!result.success) {
                console.error('Auto-sync failed:', result.error);
              } else {
                console.log('Auto-sync successful');
              }
            } catch (error) {
              console.error('Error syncing user data:', error);
            }
          }
        }
      }
    );

    // Cleanup subscription
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Sign up function
  const signUp = async (email, password, fullName = '') => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await authHelpers.signUp(email, password, fullName);

      if (error) {
        setError(error);
        return { success: false, error };
      }

      return { success: true, data };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Sign in function
  const signIn = async (email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await authHelpers.signIn(email, password);
      
      if (error) {
        setError(error);
        return { success: false, error };
      }
      
      return { success: true, data };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await authHelpers.signInWithGoogle();
      
      if (error) {
        setError(error);
        return { success: false, error };
      }
      
      return { success: true, data };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Sign out function
  const signOut = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await authHelpers.signOut();
      
      if (error) {
        setError(error);
        return { success: false, error };
      }
      
      return { success: true };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Clear error function
  const clearError = () => {
    setError(null);
  };

  // Context value
  const value = {
    user,
    session,
    loading,
    error,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    clearError,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
