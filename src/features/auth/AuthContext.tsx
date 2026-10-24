'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
}

interface SignupData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  credits: number;
  isLoading: boolean;
  signup: (data: SignupData) => Promise<{ success: boolean; error?: string }>;
  login: (data: LoginData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setCredits: (amount: number) => void;
  isAuthModalOpen: boolean;
  authModalTab: 'login' | 'signup';
  openAuthModal: (defaultTab?: 'login' | 'signup', onAuthSuccess?: () => void) => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const [authSuccessCallback, setAuthSuccessCallback] = useState<(() => void) | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setCredits(data.credits ?? 0);
      } else {
        setUser(null);
        setCredits(0);
      }
    } catch {
      setUser(null);
      setCredits(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const openAuthModal = useCallback((defaultTab: 'login' | 'signup' = 'login', onAuthSuccess?: () => void) => {
    setAuthModalTab(defaultTab);
    if (onAuthSuccess) {
      setAuthSuccessCallback(() => onAuthSuccess);
    } else {
      setAuthSuccessCallback(null);
    }
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthSuccessCallback(null);
  }, []);

  const signup = async (data: SignupData): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { success: false, error: json.error || 'Registration failed' };
      }

      setUser(json.user);
      setCredits(json.credits ?? 20);
      setIsAuthModalOpen(false);

      if (authSuccessCallback) {
        authSuccessCallback();
        setAuthSuccessCallback(null);
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error during signup',
      };
    }
  };

  const login = async (data: LoginData): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { success: false, error: json.error || 'Login failed' };
      }

      setUser(json.user);
      setCredits(json.credits ?? 0);
      setIsAuthModalOpen(false);

      if (authSuccessCallback) {
        authSuccessCallback();
        setAuthSuccessCallback(null);
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error during login',
      };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setCredits(0);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        credits,
        isLoading,
        signup,
        login,
        logout,
        refreshUser,
        setCredits,
        isAuthModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
