"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

type AnimatedTab = {
  value: string;
  label: string;
  content: React.ReactNode;
};

type AnimatedTabsProps = {
  tabs: AnimatedTab[];
  defaultValue?: string;
  className?: string;
};

function AnimatedTabs({ tabs, defaultValue, className }: AnimatedTabsProps) {
  const [value, setValue] = React.useState(defaultValue ?? tabs[0]?.value);
  const reduce = useReducedMotion();
  const activeTab = tabs.find((tab) => tab.value === value) ?? tabs[0];

  if (!activeTab) return null;

  return (
    <div className={cn("w-full", className)}>
      <div className="relative flex w-fit gap-1 rounded-xl border bg-muted/60 p-1" role="tablist" aria-label="Варианты интерфейса">
        {tabs.map((tab) => {
          const active = tab.value === activeTab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              className="relative rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => setValue(tab.value)}
            >
              {active && !reduce ? <motion.span layoutId="animated-tab-indicator" className="absolute inset-0 -z-0 rounded-lg bg-background shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 30 }} /> : null}
              {active && reduce ? <span className="absolute inset-0 -z-0 rounded-lg bg-background shadow-sm" /> : null}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab.value}
          role="tabpanel"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mt-5"
        >
          {activeTab.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export { AnimatedTabs };
