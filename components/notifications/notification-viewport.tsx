"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useAppSettings } from "@/components/settings/settings-provider";
import { ErrorIcon, InfoIcon, WarningIcon, CheckIcon, CloseIcon } from "@/components/vault/vault-icons";
import { useNotifications } from "@/components/notifications/notification-provider";
import type { NotificationKind } from "@/lib/notifications";
import { cn } from "@/lib/utils";

type NotificationViewportProps = {
  className?: string;
  style?: React.CSSProperties;
};

const iconByKind = {
  success: CheckIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: ErrorIcon,
} satisfies Record<NotificationKind, React.ComponentType<{ className?: string }>>;

const cardStyles: Record<NotificationKind, string> = {
  success: "border-emerald-500/30",
  info: "border-primary/25",
  warning: "border-amber-500/35",
  error: "border-destructive/40",
};

const iconStyles: Record<NotificationKind, string> = {
  success: "text-emerald-600 dark:text-emerald-300",
  info: "text-primary",
  warning: "text-amber-600 dark:text-amber-300",
  error: "text-destructive",
};

function getPauseOnInteraction(value: unknown) {
  if (!value || typeof value !== "object") return true;
  const context = value as Record<string, unknown>;
  const root = context.settings && typeof context.settings === "object"
    ? context.settings as Record<string, unknown>
    : context;
  const nested = root.notifications && typeof root.notifications === "object"
    ? root.notifications as Record<string, unknown>
    : undefined;
  return (typeof nested?.pauseOnInteraction === "boolean" ? nested.pauseOnInteraction : undefined)
    ?? (typeof nested?.pauseOnHover === "boolean" ? nested.pauseOnHover : undefined)
    ?? (typeof root.pauseNotificationsOnHover === "boolean" ? root.pauseNotificationsOnHover : true);
}

function NotificationViewport({ className, style }: NotificationViewportProps) {
  const { notifications, dismiss, pause, resume } = useNotifications();
  const appSettings = useAppSettings();
  const pauseOnInteraction = getPauseOnInteraction(appSettings);
  const reduceMotion = useReducedMotion() ?? false;

  React.useEffect(() => {
    if (!pauseOnInteraction) resume(undefined, "interaction");
    return () => resume(undefined, "interaction");
  }, [pauseOnInteraction, resume]);

  return (
    <div
      aria-label="Уведомления"
      className={cn(
        "pointer-events-none fixed bottom-4 left-4 right-4 z-40 flex flex-col items-end gap-2 sm:left-auto sm:w-[min(24rem,calc(100vw-2rem))]",
        className,
      )}
      style={style}
    >
      <AnimatePresence initial={false}>
        {notifications.map((notification) => {
          const StatusIcon = iconByKind[notification.kind];
          const isError = notification.kind === "error";
          const interactionHandlers = pauseOnInteraction
            ? {
                onPointerEnter: () => pause(notification.id, "interaction"),
                onPointerLeave: () => resume(notification.id, "interaction"),
                onFocus: () => pause(notification.id, "interaction"),
                onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) resume(notification.id, "interaction");
                },
              }
            : undefined;

          return (
            <motion.div
              key={notification.id}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-popover/95 px-3 py-3 text-popover-foreground shadow-md shadow-black/10 backdrop-blur-md",
                cardStyles[notification.kind],
              )}
              exit={{ opacity: 0, y: -4 }}
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              role={isError ? "alert" : "status"}
              transition={{ duration: reduceMotion ? 0 : 0.17, ease: [0.16, 1, 0.3, 1] }}
              aria-live={isError ? "assertive" : "polite"}
              {...interactionHandlers}
            >
              <StatusIcon className={cn("mt-0.5 size-5 shrink-0", iconStyles[notification.kind])} />
              <div className="min-w-0 flex-1 text-sm leading-5">
                {notification.title ? <p className="font-medium">{notification.title}</p> : null}
                <p className={notification.title ? "text-current/80" : "font-medium"}>{notification.message}</p>
              </div>
              <button
                aria-label="Закрыть уведомление"
                className="-mr-1 -mt-1 inline-grid size-8 shrink-0 place-items-center rounded-md text-current/65 transition-colors hover:bg-black/5 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
                onClick={() => dismiss(notification.id)}
                type="button"
              >
                <CloseIcon className="size-4" motion="hover" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export { NotificationViewport };
export type { NotificationViewportProps };
