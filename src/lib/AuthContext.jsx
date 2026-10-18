import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { authClient } from '@/api/authClient';
import { supabase } from '@/integrations/supabase/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState(null);

  useEffect(() => {
    let active = true;
    const loadUser = async () => {
      try {
        const currentUser = await authClient.auth.me();
        if (!active) return;
        setUser(currentUser || null);
        setIsAuthenticated(Boolean(currentUser));
        setAuthError(currentUser ? null : { type: 'auth_required', message: 'Authentication required' });
      } catch (error) {
        if (!active) return;
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_unavailable', message: error.message || 'Unable to check your session.' });
      } finally {
        if (active) {
          setIsLoadingAuth(false);
          setIsLoadingPublicSettings(false);
          setAuthChecked(true);
        }
      }
    };

    void loadUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setIsAuthenticated(Boolean(session?.user));
      setAuthError(session?.user ? null : { type: 'auth_required', message: 'Authentication required' });
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      setAuthChecked(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const checkUserAuth = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await authClient.auth.me();
      setUser(currentUser || null);
      setIsAuthenticated(Boolean(currentUser));
      setAuthError(currentUser ? null : { type: 'auth_required', message: 'Authentication required' });
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      setAuthError({
        type: 'auth_unavailable',
        message: error.message || 'Unable to check your session.'
      });
    }
  }, []);

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });
    await authClient.auth.logout(shouldRedirect ? `${window.location.origin}/login` : undefined);
  };

  const navigateToLogin = () => {
    authClient.auth.redirectToLogin(window.location.href);
  };

  const checkAppState = checkUserAuth;

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
