"use client";

import * as React from "react";

import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_APP_SETTINGS,
  LEGACY_THEME_STORAGE_KEY,
  hasUnsupportedAppSettingsVersion,
  mergeAppSettings,
  parseStoredAppSettings,
  type AppSettings,
  type NotificationSettings,
  type ThemePreference,
} from "@/lib/settings";

export type AppSettingsPatch = Partial<Omit<AppSettings, "notifications">> & {
  notifications?: Partial<NotificationSettings>;
};

export type AppSettingsUpdate = AppSettingsPatch | AppSettings | ((current: AppSettings) => AppSettingsPatch | AppSettings);

type AppSettingsContextValue = {
  settings: AppSettings;
  updateSettings: (patchOrUpdater: AppSettingsUpdate) => void;
  resetSettings: () => void;
  isReady: boolean;
};

const AppSettingsContext = React.createContext<AppSettingsContextValue | null>(null);

function cloneDefaultSettings(): AppSettings {
  return mergeAppSettings(DEFAULT_APP_SETTINGS);
}

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme !== "system") root.classList.add(theme);
}

export function AppSettingsProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [settings, setSettings] = React.useState<AppSettings>(cloneDefaultSettings);
  const [isReady, setIsReady] = React.useState(false);
  const allowPersistenceRef = React.useRef(true);

  React.useEffect(() => {
    let raw: string | null = null;
    let legacyTheme: string | null = null;

    try {
      raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
      legacyTheme = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    } catch {
      // Private browsing and restricted storage should not prevent the app from loading.
    }

    allowPersistenceRef.current = !hasUnsupportedAppSettingsVersion(raw);
    const loaded = parseStoredAppSettings(raw, legacyTheme);
    const frame = window.requestAnimationFrame(() => {
      setSettings(loaded);
      setIsReady(true);
    });

    // Keep the new versioned record available after importing the legacy preference.
    if (raw === null && (legacyTheme === "light" || legacyTheme === "dark" || legacyTheme === "system")) {
      try {
        window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(loaded));
      } catch {
        // Storage is optional; the in-memory settings remain usable.
      }
    }

    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  React.useEffect(() => {
    if (!isReady || !allowPersistenceRef.current) return;

    try {
      window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage is optional and may be unavailable in a restricted browser context.
    }
  }, [isReady, settings]);

  React.useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== APP_SETTINGS_STORAGE_KEY) return;
      allowPersistenceRef.current = !hasUnsupportedAppSettingsVersion(event.newValue);
      setSettings(parseStoredAppSettings(event.newValue));
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updateSettings = React.useCallback((patchOrUpdater: AppSettingsUpdate) => {
    allowPersistenceRef.current = true;
    setSettings((current) => {
      const next = typeof patchOrUpdater === "function" ? patchOrUpdater(current) : patchOrUpdater;
      const patchNotifications = "notifications" in next && next.notifications
        ? next.notifications
        : {};

      return mergeAppSettings({
        ...current,
        ...next,
        notifications: {
          ...current.notifications,
          ...patchNotifications,
        },
      }, current);
    });
  }, []);

  const resetSettings = React.useCallback(() => {
    allowPersistenceRef.current = true;
    setSettings(cloneDefaultSettings());
  }, []);

  const value = React.useMemo<AppSettingsContextValue>(() => ({
    settings,
    updateSettings,
    resetSettings,
    isReady,
  }), [isReady, resetSettings, settings, updateSettings]);

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsContextValue {
  const context = React.useContext(AppSettingsContext);
  if (!context) throw new Error("useAppSettings must be used inside AppSettingsProvider");
  return context;
}
