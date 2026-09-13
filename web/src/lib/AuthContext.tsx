'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (passcode: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'reef_access_token';
const DEFAULT_PASSCODE = process.env.NEXT_PUBLIC_APP_PASSCODE || 'reef1234';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(STORAGE_KEY);
      if (token === 'granted') {
        setIsAuthenticated(true);
      }
      setIsReady(true);
    }
  }, []);

  const login = (passcode: string): boolean => {
    if (passcode === DEFAULT_PASSCODE) {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, 'granted');
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  if (!isReady) {
    return null; // Brief hydration check
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
