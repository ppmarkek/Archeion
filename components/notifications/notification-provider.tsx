"use client";

import * as React from "react";

import { useAppSettings } from "@/components/settings/settings-provider";
import {
  createNotificationRecord,
  getNotificationLimit,
  type NotificationInput,
  type NotificationKind,
  type NotificationRecord,
  type NotificationSettings,
} from "@/lib/notifications";

type NotificationPauseReason = "interaction" | "manual" | "visibility";

type NotificationContextValue = {
  notifications: NotificationRecord[];
  notify: (input: NotificationInput) => string | null;
  dismiss: (id: string) => void;
  clear: () => void;
  pause: (id?: string, reason?: NotificationPauseReason) => void;
  resume: (id?: string, reason?: NotificationPauseReason) => void;
};

type SettingsRecord = Record<string, unknown>;

const NotificationContext = React.createContext<NotificationContextValue | null>(null);

function asRecord(value: unknown): SettingsRecord {
  return value && typeof value === "object" ? value as SettingsRecord : {};
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Settings are intentionally read through a small compatibility adapter. This
 * lets the settings panel evolve its persisted shape without coupling the
 * transient notification model to that storage format.
 */
function readNotificationSettings(value: unknown): NotificationSettings {
  const context = asRecord(value);
  const root = asRecord(context.settings ?? value);
  const nested = asRecord(root.notifications);
  const source = Object.keys(nested).length > 0 ? nested : root;
  const durations = asRecord(source.durations ?? source.notificationDurations ?? root.notificationDurations);
  const settings: NotificationSettings = {};

  settings.enabled = asBoolean(source.enabled)
    ?? asBoolean(source.notificationsEnabled)
    ?? asBoolean(root.notificationsEnabled)
    ?? asBoolean(source.showNotifications)
    ?? asBoolean(root.showNotifications);
  for (const kind of ["success", "info", "warning", "error"] as const) {
    const enabled = asBoolean(source[`show${kind[0].toUpperCase()}${kind.slice(1)}`]);
    if (enabled !== undefined) {
      settings[`show${kind[0].toUpperCase()}${kind.slice(1)}` as "showSuccess" | "showInfo" | "showWarning" | "showError"] = enabled;
    }
  }
  settings.maxVisible = asFiniteNumber(source.maxVisible)
    ?? asFiniteNumber(source.maxVisibleNotifications)
    ?? asFiniteNumber(root.maxVisibleNotifications);
  settings.pauseOnInteraction = asBoolean(source.pauseOnInteraction)
    ?? asBoolean(source.pauseOnHover)
    ?? asBoolean(root.pauseNotificationsOnHover);

  const parsedDurations: Partial<Record<NotificationKind, number>> = {};
  for (const kind of ["success", "info", "warning", "error"] as const) {
    const duration = asFiniteNumber(durations[kind])
      ?? asFiniteNumber(source[`${kind}DurationMs`])
      ?? asFiniteNumber(root[`notification${kind[0].toUpperCase()}${kind.slice(1)}DurationMs`]);
    if (duration !== undefined) parsedDurations[kind] = duration;
  }
  if (Object.keys(parsedDurations).length > 0) settings.durations = parsedDurations;

  return settings;
}

type TimerState = {
  timeout: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  remaining: number;
  pausedReasons: Set<NotificationPauseReason>;
};

function NotificationProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const appSettings = useAppSettings();
  const notificationSettings = React.useMemo(() => readNotificationSettings(appSettings), [appSettings]);
  const notificationSettingsRef = React.useRef(notificationSettings);
  React.useEffect(() => {
    notificationSettingsRef.current = notificationSettings;
  }, [notificationSettings]);

  const [notifications, setNotifications] = React.useState<NotificationRecord[]>([]);
  const notificationsRef = React.useRef<NotificationRecord[]>([]);
  const timersRef = React.useRef(new Map<string, TimerState>());

  const replaceNotifications = React.useCallback((next: NotificationRecord[]) => {
    notificationsRef.current = next;
    setNotifications(next);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer && timer.timeout !== null) clearTimeout(timer.timeout);
    timersRef.current.delete(id);
    replaceNotifications(notificationsRef.current.filter((notification) => notification.id !== id));
  }, [replaceNotifications]);

  const schedule = React.useCallback((id: string, remainingOverride?: number) => {
    const notification = notificationsRef.current.find((item) => item.id === id);
    if (!notification || notification.persistent || notification.durationMs <= 0) return;

    const timers = timersRef.current;
    const current = timers.get(id) ?? {
      timeout: null,
      startedAt: Date.now(),
      remaining: notification.durationMs,
      pausedReasons: new Set<NotificationPauseReason>(
        typeof document !== "undefined" && document.hidden ? ["visibility"] : [],
      ),
    };
    if (remainingOverride !== undefined) current.remaining = Math.max(0, remainingOverride);
    if (current.pausedReasons.size > 0) {
      timers.set(id, current);
      return;
    }

    if (current.timeout !== null) clearTimeout(current.timeout);
    if (current.remaining <= 0) {
      timers.delete(id);
      dismiss(id);
      return;
    }

    current.startedAt = Date.now();
    current.timeout = setTimeout(() => dismiss(id), current.remaining);
    timers.set(id, current);
  }, [dismiss]);

  const pause = React.useCallback((id?: string, reason: NotificationPauseReason = "manual") => {
    const ids = id ? [id] : notificationsRef.current.map((notification) => notification.id);
    for (const notificationId of ids) {
      const notification = notificationsRef.current.find((item) => item.id === notificationId);
      if (!notification || notification.persistent || notification.durationMs <= 0) continue;
      const current = timersRef.current.get(notificationId) ?? {
        timeout: null,
        startedAt: Date.now(),
        remaining: notification.durationMs,
        pausedReasons: new Set<NotificationPauseReason>(
          typeof document !== "undefined" && document.hidden ? ["visibility"] : [],
        ),
      };
      if (current.pausedReasons.has(reason)) continue;
      if (current.timeout !== null) {
        current.remaining = Math.max(0, current.remaining - (Date.now() - current.startedAt));
        clearTimeout(current.timeout);
        current.timeout = null;
      }
      current.pausedReasons.add(reason);
      timersRef.current.set(notificationId, current);
    }
  }, []);

  const resume = React.useCallback((id?: string, reason: NotificationPauseReason = "manual") => {
    const ids = id ? [id] : notificationsRef.current.map((notification) => notification.id);
    for (const notificationId of ids) {
      const current = timersRef.current.get(notificationId);
      if (!current) {
        schedule(notificationId);
        continue;
      }
      current.pausedReasons.delete(reason);
      if (current.pausedReasons.size === 0) schedule(notificationId, current.remaining);
    }
  }, [schedule]);

  const notify = React.useCallback((input: NotificationInput) => {
    const settings = notificationSettingsRef.current;
    const showKey = `show${input.kind[0].toUpperCase()}${input.kind.slice(1)}` as "showSuccess" | "showInfo" | "showWarning" | "showError";
    if (settings.enabled === false || settings[showKey] === false) return null;

    const current = notificationsRef.current;
    const existing = input.dedupeKey
      ? current.find((notification) => notification.dedupeKey === input.dedupeKey)
      : undefined;
    const normalized = createNotificationRecord(input, settings);
    const record = existing
      ? { ...normalized, id: existing.id, createdAt: Date.now() }
      : normalized;

    if (existing) {
      const timer = timersRef.current.get(existing.id);
      if (timer && timer.timeout !== null) clearTimeout(timer.timeout);
      timersRef.current.delete(existing.id);
      const next = current.map((notification) => notification.id === existing.id ? record : notification);
      replaceNotifications(next);
      return existing.id;
    }

    const limit = getNotificationLimit(settings);
    const next = [...current, record].slice(-limit);
    for (const removed of current.slice(0, Math.max(0, current.length + 1 - limit))) {
      const timer = timersRef.current.get(removed.id);
      if (timer && timer.timeout !== null) clearTimeout(timer.timeout);
      timersRef.current.delete(removed.id);
    }
    replaceNotifications(next);
    return record.id;
  }, [replaceNotifications]);

  const clear = React.useCallback(() => {
    for (const timer of timersRef.current.values()) {
      if (timer.timeout !== null) clearTimeout(timer.timeout);
    }
    timersRef.current.clear();
    replaceNotifications([]);
  }, [replaceNotifications]);

  React.useEffect(() => {
    const liveIds = new Set(notifications.map((notification) => notification.id));
    for (const [id, timer] of timersRef.current) {
      if (!liveIds.has(id)) {
        if (timer.timeout !== null) clearTimeout(timer.timeout);
        timersRef.current.delete(id);
      }
    }
    for (const notification of notifications) {
      if (!notification.persistent && notification.durationMs > 0 && !timersRef.current.has(notification.id)) {
        schedule(notification.id);
      }
    }
  }, [notifications, schedule]);

  React.useEffect(() => {
    const limit = getNotificationLimit(notificationSettings);
    const allowed = notificationsRef.current.filter((notification) => {
      const showKey = `show${notification.kind[0].toUpperCase()}${notification.kind.slice(1)}` as "showSuccess" | "showInfo" | "showWarning" | "showError";
      return notificationSettings.enabled !== false && notificationSettings[showKey] !== false;
    });
    const next = allowed.slice(-limit);

    if (next.length !== notificationsRef.current.length) {
      const nextIds = new Set(next.map((notification) => notification.id));
      for (const removed of notificationsRef.current.filter((notification) => !nextIds.has(notification.id))) {
        const timer = timersRef.current.get(removed.id);
        if (timer && timer.timeout !== null) clearTimeout(timer.timeout);
        timersRef.current.delete(removed.id);
      }
      replaceNotifications(next);
    }
  }, [notificationSettings, replaceNotifications]);

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) pause(undefined, "visibility");
      else resume(undefined, "visibility");
    };
    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pause, resume]);

  React.useEffect(() => () => {
    for (const timer of timersRef.current.values()) {
      if (timer.timeout !== null) clearTimeout(timer.timeout);
    }
    timersRef.current.clear();
  }, []);

  const value = React.useMemo<NotificationContextValue>(() => ({
    notifications,
    notify,
    dismiss,
    clear,
    pause,
    resume,
  }), [clear, dismiss, notifications, notify, pause, resume]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

function useNotifications() {
  const context = React.useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
}

export { NotificationProvider, useNotifications };
export type { NotificationPauseReason, NotificationContextValue };
