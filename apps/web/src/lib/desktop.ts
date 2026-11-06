import type { DesktopModule, LicensePlan } from '@gml/core';

export interface DesktopLicense {
  status: 'none' | 'ok' | 'invalid' | 'other-machine' | 'expired' | 'offline-expired';
  modules: DesktopModule[];
  key?: string;
  machineName: string;
  server: string;
  payload?: { plan: LicensePlan; expiresAt: string | null; offlineUntil: string; email: string };
}

interface Bridge {
  getLicense(): Promise<DesktopLicense>;
  activate(key: string): Promise<DesktopLicense>;
  deactivate(): Promise<DesktopLicense>;
  refresh(): Promise<DesktopLicense>;
  openShop(): Promise<void>;
  onLicenseChanged(cb: (l: DesktopLicense) => void): void;
  onShowLicense(cb: () => void): void;
}

/** Presente solo dentro de la aplicación de escritorio (lo inyecta preload.cjs). */
export const desktop: Bridge | undefined = (window as unknown as { gmlDesktop?: Bridge }).gmlDesktop;

let modules = new Set<DesktopModule>();
export function setDesktopModules(m: DesktopModule[]) {
  modules = new Set(m);
}
export const hasModule = (m: DesktopModule) => modules.has(m);
