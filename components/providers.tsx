'use client';

import React, { createContext, useContext, useEffect, useState, startTransition } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Player, Permissions } from '@/lib/contract/types';
import { getMe, logout as apiLogout } from '@/lib/api-client';

type AuthContextType = {
  user: Player | null;
  permissions: Permissions | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  permissions: null,
  isLoading: true,
  refreshUser: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error: any) => {
              // Do not retry 401 or 403 or 404
              if (error?.status === 401 || error?.status === 403 || error?.status === 404) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: true,
            staleTime: 1000,
          },
        },
      })
  );

  const [user, setUser] = useState<Player | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const data = await getMe();
      // Update user, permissions and isLoading in one transition so a render
      // can never observe isLoading=false with a stale (still-null) user —
      // that gap previously bounced authenticated users back to /login.
      startTransition(() => {
        setUser(data.user);
        setPermissions(data.permissions);
        setIsLoading(false);
      });
    } catch {
      startTransition(() => {
        setUser(null);
        setPermissions(null);
        setIsLoading(false);
      });
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setPermissions(null);
      window.location.href = '/login';
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user, permissions, isLoading, refreshUser, logout }}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
