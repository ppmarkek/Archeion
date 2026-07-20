"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type BorderBeamProps = {
  className?: string;
  duration?: number;
  size?: number;
  delay?: number;
};

function BorderBeam({ className, duration = 6, size = 90, delay = 0 }: BorderBeamProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("border-beam absolute", className)}
      style={{
        "--beam-duration": `${duration}s`,
        "--beam-delay": `${delay}s`,
        "--beam-size": `${size}px`,
      } as React.CSSProperties}
    />
  );
}

export { BorderBeam };
