import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest, setAuthToken, clearAuthToken } from './api.js';

export interface User {
  userId: string;
  role: 'lawyer' | 'guardian';
  name: string;
  email?: string;
  mobile?: string;
}

interface AuthResponse {
  user: User;
  token?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginLawyer: (email: string, pass: string) => Promise<void>;
  registerLawyer: (name: string, email: string, pass: string, enrolmentId?: string) => Promise<void>;
  requestLawyerPasswordReset: (email: string) => Promise<{ devCode?: string; message: string; success: boolean }>;
  confirmLawyerPasswordReset: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  verifyGuardianOtp: (identifier: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/me');
      setUser(res.user);
    } catch {
      clearAuthToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const loginLawyer = async (email: string, pass: string) => {
    const res = await apiRequest<AuthResponse>('/api/auth/lawyer/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });
    if (res.token) {
      setAuthToken(res.token);
    }
    setUser(res.user);
  };

  const registerLawyer = async (name: string, email: string, pass: string, enrolmentId?: string) => {
    const res = await apiRequest<AuthResponse>('/api/auth/lawyer/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pass, enrolmentId })
    });
    if (res.token) {
      setAuthToken(res.token);
    }
    setUser(res.user);
  };

  const requestLawyerPasswordReset = async (email: string) => {
    const res = await apiRequest<{ success: boolean; message: string; devCode?: string }>(
      '/api/auth/lawyer/password-reset/request',
      {
        method: 'POST',
        body: JSON.stringify({ email })
      }
    );
    return res;
  };

  const confirmLawyerPasswordReset = async (email: string, code: string, newPassword: string) => {
    const res = await apiRequest<{ success: boolean; message: string }>('/api/auth/lawyer/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword })
    });
    return res;
  };

  const verifyGuardianOtp = async (identifier: string, code: string) => {
    const res = await apiRequest<AuthResponse>('/api/auth/guardian/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ identifier, code })
    });
    if (res.token) {
      setAuthToken(res.token);
    }
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAuthToken();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      loginLawyer,
      registerLawyer,
      requestLawyerPasswordReset,
      confirmLawyerPasswordReset,
      verifyGuardianOtp,
      logout,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
