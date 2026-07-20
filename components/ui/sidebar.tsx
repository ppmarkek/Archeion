"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type SidebarContextValue = {
  open: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside Sidebar");
  return context;
}

function Sidebar({ className, children, ...props }: React.ComponentProps<"aside">) {
  const [open, setOpen] = React.useState(true);
  const toggleSidebar = React.useCallback(() => setOpen((value) => !value), []);

  return (
    <SidebarContext.Provider value={{ open, toggleSidebar }}>
      <aside
        data-slot="sidebar"
        data-state={open ? "expanded" : "collapsed"}
        className={cn("flex min-h-svh w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 data-[state=collapsed]:w-16", className)}
        {...props}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
  );
}

function SidebarTrigger({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();
  return <button type="button" data-slot="sidebar-trigger" aria-label="Переключить боковую панель" className={cn("inline-flex size-9 items-center justify-center rounded-lg border border-input bg-background text-sm hover:bg-accent", className)} onClick={toggleSidebar} {...props}>☰</button>;
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("flex min-h-14 items-center px-4", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={cn("flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-3 py-4", className)} {...props} />;
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("border-t p-3", className)} {...props} />;
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <section data-slot="sidebar-group" className={cn("grid gap-2", className)} {...props} />;
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group-label" className={cn("px-2 text-xs font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/55", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("grid gap-1", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("min-w-0", className)} {...props} />;
}

function SidebarMenuButton({ className, active = false, ...props }: React.ComponentProps<"button"> & { active?: boolean }) {
  return <button type="button" data-slot="sidebar-menu-button" data-active={active} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground", className)} {...props} />;
}

export { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar };
