"use client";

import type { ReactNode } from "react";

import { NotificationProvider } from "@/components/notifications/notification-provider";
import { AppSettingsProvider } from "@/components/settings/settings-provider";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AppSettingsProvider>
      <NotificationProvider>{children}</NotificationProvider>
    </AppSettingsProvider>
  );
}

