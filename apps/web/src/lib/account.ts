import { useCallback, useEffect, useState } from 'react';
import type { CreditBundle, DesktopModule, LicensePlan } from '@gml/core';
import { api } from './api';
import { setDevMode } from './credits';

export interface Me {
  user: { id: number; email: string; name: string; credits: number };
  admin: boolean;
  licenses: {
    key: string;
    modules: DesktopModule[];
    plan: LicensePlan;
    expiresAt: string | null;
    revoked: boolean;
    createdAt: string;
    activations: { machineId: string; machineName: string; lastSeen: string }[];
  }[];
}

export interface Catalog {
  bundles: CreditBundle[];
  paymentsEnabled: boolean;
  maxActivations: number;
  offlineDays: number;
}

/**
 * Estado de la cuenta. Si no hay servidor (web abierta con iniciar-web.bat) `online` es
 * false y la aplicación funciona en modo desarrollo sin cobrar.
 */
export function useAccount() {
  const [online, setOnline] = useState<boolean | undefined>(undefined);
  const [catalog, setCatalog] = useState<Catalog>();
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/api/me'));
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setCatalog(await api<Catalog>('/api/catalog'));
        setOnline(true);
        setDevMode(false);
        await refresh();
      } catch {
        setOnline(false);
        setDevMode(true);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    const onBalance = (e: Event) => {
      const credits = (e as CustomEvent<number>).detail;
      setMe((m) => (m ? { ...m, user: { ...m.user, credits } } : m));
    };
    window.addEventListener('gml-balance', onBalance);
    return () => window.removeEventListener('gml-balance', onBalance);
  }, []);

  return { online, catalog, me, setMe, refresh };
}

export type Account = ReturnType<typeof useAccount>;
