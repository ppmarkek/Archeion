"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";

function DesktopStatus() {
  const isDesktop = React.useSyncExternalStore(
    () => () => {},
    () => Boolean(window.desktop),
    () => false,
  );

  if (!isDesktop) return null;

  return <Badge variant="accent">Electron shell</Badge>;
}

export { DesktopStatus };
