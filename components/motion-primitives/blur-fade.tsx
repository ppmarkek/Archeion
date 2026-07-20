"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/utils";

type BlurFadeProps = HTMLMotionProps<"div"> & {
  delay?: number;
  duration?: number;
  offset?: number;
  blur?: string;
};

function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.55,
  offset = 18,
  blur = "8px",
  ...props
}: BlurFadeProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: offset, filter: `blur(${blur})` }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export { BlurFade };
