export const APP_SETTINGS_VERSION = 1 as const;
export const APP_SETTINGS_STORAGE_KEY = "archeion-settings-v1";
export const LEGACY_THEME_STORAGE_KEY = "archeion-theme";

export type ThemePreference = "light" | "dark" | "system";

export type NotificationSettings = {
  enabled: boolean;
  showSuccess: boolean;
  showInfo: boolean;
  showWarning: boolean;
  showError: boolean;
  successDurationMs: number;
  infoDurationMs: number;
  warningDurationMs: number;
  pauseOnHover: boolean;
  maxVisible: number;
};

export type AppSettings = {
  version: typeof APP_SETTINGS_VERSION;
  theme: ThemePreference;
  notifications: NotificationSettings;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: APP_SETTINGS_VERSION,
  theme: "system",
  notifications: {
    enabled: true,
    showSuccess: true,
    showInfo: true,
    showWarning: true,
    showError: true,
    successDurationMs: 3500,
    infoDurationMs: 5000,
    warningDurationMs: 8000,
    pauseOnHover: true,
    maxVisible: 3,
  },
};

const durationLimits = {
  successDurationMs: { min: 0, max: 120_000 },
  infoDurationMs: { min: 0, max: 120_000 },
  warningDurationMs: { min: 0, max: 120_000 },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readDuration(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(max, Math.max(min, value)));
}

function readMaxVisible(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(10, Math.max(1, value)));
}

/**
 * Merge untrusted persisted data into the known settings shape.
 * Unknown fields are ignored and invalid fields retain their defaults.
 */
export function mergeAppSettings(value: unknown, fallback: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const source = isRecord(value) ? value : {};
  const sourceNotifications = isRecord(source.notifications) ? source.notifications : {};
  const fallbackNotifications = fallback.notifications;
  const version = source.version === APP_SETTINGS_VERSION || source.version === undefined
    ? APP_SETTINGS_VERSION
    : fallback.version;
  const theme: ThemePreference = source.theme === "light" || source.theme === "dark" || source.theme === "system"
    ? source.theme
    : fallback.theme;

  return {
    version,
    theme,
    notifications: {
      enabled: readBoolean(sourceNotifications.enabled, fallbackNotifications.enabled),
      showSuccess: readBoolean(sourceNotifications.showSuccess, fallbackNotifications.showSuccess),
      showInfo: readBoolean(sourceNotifications.showInfo, fallbackNotifications.showInfo),
      showWarning: readBoolean(sourceNotifications.showWarning, fallbackNotifications.showWarning),
      showError: readBoolean(sourceNotifications.showError, fallbackNotifications.showError),
      successDurationMs: readDuration(
        sourceNotifications.successDurationMs,
        fallbackNotifications.successDurationMs,
        durationLimits.successDurationMs.min,
        durationLimits.successDurationMs.max,
      ),
      infoDurationMs: readDuration(
        sourceNotifications.infoDurationMs,
        fallbackNotifications.infoDurationMs,
        durationLimits.infoDurationMs.min,
        durationLimits.infoDurationMs.max,
      ),
      warningDurationMs: readDuration(
        sourceNotifications.warningDurationMs,
        fallbackNotifications.warningDurationMs,
        durationLimits.warningDurationMs.min,
        durationLimits.warningDurationMs.max,
      ),
      pauseOnHover: readBoolean(sourceNotifications.pauseOnHover, fallbackNotifications.pauseOnHover),
      maxVisible: readMaxVisible(sourceNotifications.maxVisible, fallbackNotifications.maxVisible),
    },
  };
}

function parseStoredJson(raw: string | null | undefined): unknown {
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Unknown versions need an explicit migration. Treating them as v1 could both
 * misread future fields and overwrite data created by a newer application.
 */
export function hasUnsupportedAppSettingsVersion(raw: string | null | undefined) {
  const parsed = parseStoredJson(raw);
  return isRecord(parsed)
    && parsed.version !== undefined
    && parsed.version !== APP_SETTINGS_VERSION;
}

/** Parse a JSON settings value without allowing malformed storage to escape. */
export function parseStoredAppSettings(
  raw: string | null | undefined,
  legacyTheme?: string | null | undefined,
): AppSettings {
  const parsed = parseStoredJson(raw);

  const fallback = mergeAppSettings(undefined);
  if (isRecord(parsed)) {
    if (parsed.version !== undefined && parsed.version !== APP_SETTINGS_VERSION) return fallback;
    return mergeAppSettings(parsed, fallback);
  }

  if (legacyTheme === "light" || legacyTheme === "dark" || legacyTheme === "system") {
    return mergeAppSettings({ theme: legacyTheme }, fallback);
  }

  return fallback;
}

/** A descriptive alias for callers that need an explicitly safe parser. */
export const safeParseAppSettings = parseStoredAppSettings;
