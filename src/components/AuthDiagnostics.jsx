import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase.jsx';

const AuthDiagnostics = () => {
  const { user, session } = useAuth();
  const [diagnostics, setDiagnostics] = useState({});
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    const results = {};

    try {
      // Test 1: Check auth session
      results.authSession = {
        hasSession: !!session,
        hasUser: !!user,
        userId: user?.id || 'None',
        email: user?.email || 'None',
        emailConfirmed: user?.email_confirmed_at ? 'Yes' : 'No',
        userMetadata: user?.user_metadata || {}
      };

      // Test 2: Check database connection
      try {
        const { data, error } = await supabase.from('users').select('count').limit(1);
        results.databaseConnection = {
          success: !error,
          error: error?.message || null
        };
      } catch (err) {
        results.databaseConnection = {
          success: false,
          error: err.message
        };
      }

      // Test 3: Check if user exists in users table
      if (user?.id) {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          results.userInDatabase = {
            exists: !!data,
            data: data,
            error: error?.message || null
          };
        } catch (err) {
          results.userInDatabase = {
            exists: false,
            data: null,
            error: err.message
          };
        }
      }

      // Test 4: Check if settings exist
      if (user?.id) {
        try {
          const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          results.settingsInDatabase = {
            exists: !!data,
            data: data,
            error: error?.message || null
          };
        } catch (err) {
          results.settingsInDatabase = {
            exists: false,
            data: null,
            error: err.message
          };
        }
      }

      // Test 5: Check RLS policies
      if (user?.id) {
        try {
          // Try to insert a test record to check permissions
          const { error } = await supabase
            .from('users')
            .insert([{
              id: user.id,
              full_name: 'Test',
              email: user.email,
              created_at: new Date().toISOString()
            }]);

          results.rlsPermissions = {
            canInsert: !error || error.code === '23505', // 23505 is unique violation, which means insert would work
            error: error?.message || null,
            errorCode: error?.code || null
          };
        } catch (err) {
          results.rlsPermissions = {
            canInsert: false,
            error: err.message,
            errorCode: err.code
          };
        }
      }

    } catch (error) {
      results.generalError = error.message;
    }

    setDiagnostics(results);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      runDiagnostics();
    }
  }, [user]);

  const DiagnosticItem = ({ title, result, children }) => (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900">{title}</h4>
        <div className={`w-3 h-3 rounded-full ${
          result?.success !== false && result?.exists !== false && result?.canInsert !== false
            ? 'bg-green-500' 
            : 'bg-red-500'
        }`}></div>
      </div>
      {children}
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Authentication Diagnostics</h2>
        <button
          onClick={runDiagnostics}
          disabled={loading || !user}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Diagnostics'}
        </button>
      </div>

      {Object.keys(diagnostics).length > 0 && (
        <div className="space-y-4">
          <DiagnosticItem title="Auth Session" result={diagnostics.authSession}>
            <div className="text-sm space-y-1">
              <p><strong>Has Session:</strong> {diagnostics.authSession?.hasSession ? 'Yes' : 'No'}</p>
              <p><strong>Has User:</strong> {diagnostics.authSession?.hasUser ? 'Yes' : 'No'}</p>
              <p><strong>User ID:</strong> {diagnostics.authSession?.userId}</p>
              <p><strong>Email:</strong> {diagnostics.authSession?.email}</p>
              <p><strong>Email Confirmed:</strong> {diagnostics.authSession?.emailConfirmed}</p>
            </div>
          </DiagnosticItem>

          <DiagnosticItem title="Database Connection" result={diagnostics.databaseConnection}>
            <div className="text-sm">
              {diagnostics.databaseConnection?.success ? (
                <p className="text-green-600">✅ Database connection successful</p>
              ) : (
                <p className="text-red-600">❌ Database connection failed: {diagnostics.databaseConnection?.error}</p>
              )}
            </div>
          </DiagnosticItem>

          {diagnostics.userInDatabase && (
            <DiagnosticItem title="User in Database" result={diagnostics.userInDatabase}>
              <div className="text-sm">
                {diagnostics.userInDatabase?.exists ? (
                  <div>
                    <p className="text-green-600">✅ User exists in database</p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-blue-600">View Data</summary>
                      <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                        {JSON.stringify(diagnostics.userInDatabase.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <p className="text-red-600">❌ User not found in database: {diagnostics.userInDatabase?.error}</p>
                )}
              </div>
            </DiagnosticItem>
          )}

          {diagnostics.settingsInDatabase && (
            <DiagnosticItem title="Settings in Database" result={diagnostics.settingsInDatabase}>
              <div className="text-sm">
                {diagnostics.settingsInDatabase?.exists ? (
                  <p className="text-green-600">✅ Settings exist in database</p>
                ) : (
                  <p className="text-red-600">❌ Settings not found in database: {diagnostics.settingsInDatabase?.error}</p>
                )}
              </div>
            </DiagnosticItem>
          )}

          {diagnostics.rlsPermissions && (
            <DiagnosticItem title="RLS Permissions" result={diagnostics.rlsPermissions}>
              <div className="text-sm">
                {diagnostics.rlsPermissions?.canInsert ? (
                  <p className="text-green-600">✅ Can insert data (RLS permissions OK)</p>
                ) : (
                  <p className="text-red-600">❌ Cannot insert data: {diagnostics.rlsPermissions?.error} (Code: {diagnostics.rlsPermissions?.errorCode})</p>
                )}
              </div>
            </DiagnosticItem>
          )}

        </div>
      )}
    </div>
  );
};

export default AuthDiagnostics;
