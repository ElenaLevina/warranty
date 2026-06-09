/**
 * React wiring for services and stores. The provider builds the service set and
 * the session/auth stores once; hooks expose them to screens.
 *
 * Services are injected (DI), which lets tests render screens with in-memory
 * services and a registered mechanic.
 */
import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import type { AppServices } from '../services/container';
import { createSessionStore, type SessionState, type SessionStore } from './sessionStore';
import { createAuthStore, type AuthState, type AuthStore } from './authStore';

interface StoreContextValue {
  services: AppServices;
  store: SessionStore;
  authStore: AuthStore;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({
  services,
  children,
}: {
  services: AppServices;
  children: React.ReactNode;
}): React.JSX.Element {
  const storeRef = useRef<SessionStore | null>(null);
  const authStoreRef = useRef<AuthStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createSessionStore(services);
  }
  if (!authStoreRef.current) {
    authStoreRef.current = createAuthStore(services.auth);
  }
  const value = useMemo<StoreContextValue>(
    () => ({
      services,
      store: storeRef.current as SessionStore,
      authStore: authStoreRef.current as AuthStore,
    }),
    [services],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStoreContext(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (ctx === null) {
    throw new Error('useStoreContext must be used inside StoreProvider');
  }
  return ctx;
}

export function useServices(): AppServices {
  return useStoreContext().services;
}

export function useSessionStore<T>(selector: (s: SessionState) => T): T {
  const { store } = useStoreContext();
  return useStore(store, selector);
}

/** Session actions without subscribing to state (for handlers). */
export function useSessionActions(): SessionState {
  const { store } = useStoreContext();
  return store.getState();
}

export function useAuthStore<T>(selector: (s: AuthState) => T): T {
  const { authStore } = useStoreContext();
  return useStore(authStore, selector);
}

/** Auth actions without subscribing to state (for handlers). */
export function useAuthActions(): AuthState {
  const { authStore } = useStoreContext();
  return authStore.getState();
}
