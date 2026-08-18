"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type IconMotion = "hover" | "loop" | "none";

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

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
const semanticControlSelector = [
  "[data-alive-icon-trigger]",
  "[data-icon-trigger]",
  "button",
  "a[href]",
  "summary",
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="treeitem"]',
  '[role="option"]',
  '[role="switch"]',
].join(",");

function AliveIcon({ className, icon: Icon, motion = "none" }: AliveIconProps) {
  const hostRef = React.useRef<HTMLSpanElement>(null);
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
    const trigger = host.closest<HTMLElement>(semanticControlSelector) ?? host;

    let validationFrame: number | null = null;

    const cancelValidation = () => {
      if (validationFrame === null) return;
      window.cancelAnimationFrame(validationFrame);
      validationFrame = null;
    };
    const validateActiveTrigger = () => {
      cancelValidation();
      validationFrame = window.requestAnimationFrame(() => {
        validationFrame = null;
        const hasVisibleFocus = trigger.matches(":focus-visible")
          || trigger.querySelector(":focus-visible") !== null;
        setIsPlaying(trigger.matches(":hover") || hasVisibleFocus);
      });
    };

    const replay = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      setReplayKey((key) => key + 1);
      setIsPlaying(true);
      validateActiveTrigger();
    };
    const stop = () => {
      validateActiveTrigger();
    };
    const replayFromFocus = () => {
      const hasVisibleFocus = trigger.matches(":focus-visible")
        || trigger.querySelector(":focus-visible") !== null;
      if (hasVisibleFocus) replay();
    };

    trigger.addEventListener("pointerenter", replay);
    trigger.addEventListener("pointerleave", stop);
    trigger.addEventListener("focusin", replayFromFocus);
    trigger.addEventListener("focusout", stop);

    return () => {
      cancelValidation();
      setIsPlaying(false);
      trigger.removeEventListener("pointerenter", replay);
      trigger.removeEventListener("pointerleave", stop);
      trigger.removeEventListener("focusin", replayFromFocus);
      trigger.removeEventListener("focusout", stop);
    };
  }, [motion]);

  return (
    <span
      aria-hidden="true"
      className={cn("alive-icon", className)}
      data-icon-motion={motion}
      data-icon-replay={replayKey}
      data-icon-source="line-md"
      data-icon-state={motion === "loop" || (motion === "hover" && isPlaying) ? "active" : "rest"}
      ref={hostRef}
    >
      {isHydrated ? <Icon aria-hidden="true" className="size-full" focusable="false" height="1em" key={replayKey} width="1em" /> : null}
    </span>
  );
}

export { AliveIcon };
export type { AliveIconProps, IconMotion, LineMdIconComponent };
