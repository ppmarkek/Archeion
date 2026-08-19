/**
 * The transient notification model is deliberately independent from storage.
 * Notifications describe what is happening in the current UI session and are
 * not part of the user's Vault data.
 */

type NotificationKind = "success" | "info" | "warning" | "error";

type NotificationInput = {
  kind: NotificationKind;
  title?: string;
  message: string;
  durationMs?: number;
  persistent?: boolean;
  dedupeKey?: string;
};

type NotificationRecord = Omit<NotificationInput, "durationMs" | "persistent"> & {
  id: string;
  createdAt: number;
  durationMs: number;
  persistent: boolean;
};

type NotificationDurations = Partial<Record<NotificationKind, number>>;

type NotificationSettings = {
  enabled?: boolean;
  showSuccess?: boolean;
  showInfo?: boolean;
  showWarning?: boolean;
  showError?: boolean;
  maxVisible?: number;
  pauseOnInteraction?: boolean;
  durations?: NotificationDurations;
};

const DEFAULT_NOTIFICATION_DURATIONS: Record<NotificationKind, number> = {
  success: 3_500,
  info: 5_000,
  warning: 8_000,
  error: 0,
};

const MAX_NOTIFICATION_LIMIT = 3;

function getNotificationDuration(kind: NotificationKind, settings?: NotificationSettings, override?: number) {
  if (typeof override === "number" && Number.isFinite(override)) return Math.max(0, override);
  const configured = settings?.durations?.[kind];
  if (typeof configured === "number" && Number.isFinite(configured)) return Math.max(0, configured);
  return DEFAULT_NOTIFICATION_DURATIONS[kind];
}

function getNotificationLimit(settings?: NotificationSettings) {
  const configured = settings?.maxVisible;
  if (typeof configured !== "number" || !Number.isFinite(configured)) return MAX_NOTIFICATION_LIMIT;
  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(1, Math.floor(configured)));
}

function createNotificationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createNotificationRecord(
  input: NotificationInput,
  settings?: NotificationSettings,
  now = Date.now(),
): NotificationRecord {
  const durationMs = getNotificationDuration(input.kind, settings, input.durationMs);
  return {
    ...input,
    id: createNotificationId(),
    createdAt: now,
    durationMs,
    persistent: input.persistent ?? (input.kind === "error" || durationMs === 0),
  };
}

export {
  DEFAULT_NOTIFICATION_DURATIONS,
  MAX_NOTIFICATION_LIMIT,
  createNotificationId,
  createNotificationRecord,
  getNotificationDuration,
  getNotificationLimit,
};
export type {
  NotificationDurations,
  NotificationInput,
  NotificationKind,
  NotificationRecord,
  NotificationSettings,
};
