"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type IconMotion = "hover" | "loop" | "none" | "press";

type LineMdIconComponent = React.ComponentType<{
  "aria-hidden"?: boolean | "true" | "false";
  className?: string;
  focusable?: "false" | "true";
  height?: string;
  width?: string;
}>;

type AliveIconProps = {
  className?: string;
  icon: LineMdIconComponent;
  motion?: IconMotion;
};

const INTERACTIVE_PARENT = "button, a, label, [role='button'], [role='tab'], [data-icon-trigger]";
const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function AliveIcon({ className, icon: Icon, motion = "hover" }: AliveIconProps) {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const resetTimerRef = React.useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [replayKey, setReplayKey] = React.useState(0);
  const isHydrated = React.useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || motion === "loop" || motion === "none") return undefined;

    const trigger = host.closest<HTMLElement>(INTERACTIVE_PARENT);
    if (!trigger) return undefined;
    const replay = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);

      setReplayKey((key) => key + 1);
      setIsPlaying(true);
      resetTimerRef.current = window.setTimeout(() => {
        setIsPlaying(false);
        resetTimerRef.current = null;
      }, 1600);
    };

    if (motion === "press") {
      trigger.addEventListener("click", replay);
    } else {
      trigger.addEventListener("pointerenter", replay);
      trigger.addEventListener("focusin", replay);
    }

    return () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
      trigger.removeEventListener("click", replay);
      trigger.removeEventListener("pointerenter", replay);
      trigger.removeEventListener("focusin", replay);
    };
  }, [motion]);

  return (
    <span
      aria-hidden="true"
      className={cn("alive-icon", className)}
      data-icon-motion={motion}
      data-icon-source="line-md"
      data-icon-state={motion === "loop" || ((motion === "hover" || motion === "press") && isPlaying) ? "active" : "rest"}
      ref={hostRef}
    >
      {isHydrated ? <Icon aria-hidden="true" className="size-full" focusable="false" height="1em" key={replayKey} width="1em" /> : null}
    </span>
  );
}

export { AliveIcon };
export type { AliveIconProps, IconMotion, LineMdIconComponent };
