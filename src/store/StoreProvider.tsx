/**
 * React-обвязка стора и сервисов. Provider создаёт набор сервисов и стор один раз;
 * хуки useSessionStore/useServices дают доступ из экранов.
 *
 * В срезе сервисы тестовые/реальные передаются снаружи (DI), что позволяет
 * рендерить экраны в тестах с in-memory сервисами.
 */
import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import type { AppServices } from '../services/container';
import { createSessionStore, type SessionState, type SessionStore } from './sessionStore';

interface StoreContextValue {
  services: AppServices;
  store: SessionStore;
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
  if (!storeRef.current) {
    storeRef.current = createSessionStore(services);
  }
  const value = useMemo<StoreContextValue>(
    () => ({ services, store: storeRef.current as SessionStore }),
    [services],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStoreContext(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (ctx === null) {
    throw new Error('useStoreContext должен использоваться внутри StoreProvider');
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

/** Доступ к экшенам без подписки на стейт (для обработчиков). */
export function useSessionActions(): SessionState {
  const { store } = useStoreContext();
  return store.getState();
}
