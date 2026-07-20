import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface AuthContextType {
  accessToken: string | null;
  isAuthenticated: boolean;
  userRole: string | null;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

function getRoleFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.rol || null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem('access_token');
  });
  const logoutInProgress = useRef(false);

  const isAuthenticated = !!accessToken;
  const userRole = getRoleFromToken(accessToken);

  const login = useCallback((token: string, refreshToken: string) => {
    setAccessToken(token);
    localStorage.setItem('access_token', token);
    localStorage.setItem('refresh_token', refreshToken);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }, []);

  const logout = useCallback(async () => {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;

    const refreshToken = localStorage.getItem('refresh_token');
    const token = localStorage.getItem('access_token');

    // Best-effort server-side logout
    if (refreshToken && token) {
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Ignore logout errors
      }
    }

    clearSession();
    logoutInProgress.current = false;
  }, [clearSession]);

  /**
   * Wrapper de fetch que automáticamente:
   * 1. Agrega el Authorization header
   * 2. Si recibe 401, limpia la sesión y redirige al login
   */
  const authFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = localStorage.getItem('access_token');
    const headers = new Headers(init?.headers);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(input, { ...init, headers });

    if (response.status === 401) {
      clearSession();
      // Redirect to login
      window.location.href = '/app/login';
    }

    return response;
  }, [clearSession]);

  // Check token expiry on mount and periodically
  useEffect(() => {
    const checkExpiry = () => {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          clearSession();
          window.location.href = '/app/login';
        }
      } catch {
        clearSession();
      }
    };

    checkExpiry();

    // Check every 30 seconds
    const interval = setInterval(checkExpiry, 30_000);
    return () => clearInterval(interval);
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ accessToken, isAuthenticated, userRole, login, logout, authFetch }}>
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
