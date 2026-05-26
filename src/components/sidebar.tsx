import { PanelLeft } from "lucide-solid";
import type { JSX, ParentProps } from "solid-js";
import { createContext, createMemo, createSignal, splitProps, useContext } from "solid-js";

import { cn } from "~/lib/utils";

interface SidebarContextValue {
  open: () => boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

interface SidebarProviderProps extends ParentProps {
  defaultOpen?: boolean;
}

interface SidebarTriggerProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  class?: string;
}

interface SidebarRootProps extends ParentProps, JSX.HTMLAttributes<HTMLElement> {
  class?: string;
}

interface SidebarDivProps extends ParentProps, JSX.HTMLAttributes<HTMLDivElement> {
  class?: string;
}

interface SidebarSectionProps extends ParentProps, JSX.HTMLAttributes<HTMLElement> {
  class?: string;
}

interface SidebarListProps extends ParentProps, JSX.HTMLAttributes<HTMLUListElement> {
  class?: string;
}

interface SidebarListItemProps extends ParentProps, JSX.LiHTMLAttributes<HTMLLIElement> {
  class?: string;
}

interface SidebarMenuButtonProps extends ParentProps, JSX.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  class?: string;
}

const SidebarContext = createContext<SidebarContextValue>();

function SidebarProvider(props: SidebarProviderProps) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  const value = {
    open,
    setOpen,
    toggle: () => setOpen((current) => !current),
  };

  return <SidebarContext.Provider value={value}>{props.children}</SidebarContext.Provider>;
}

function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}

function Sidebar(props: SidebarRootProps) {
  const [local, others] = splitProps(props, ["class", "children"]);
  const sidebar = useSidebar();
  const state = createMemo(() => (sidebar.open() ? "expanded" : "collapsed"));

  return (
    <aside
      class={cn(
        "group/sidebar sticky top-0 z-30 flex h-screen min-w-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-[width] duration-200 ease-out max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-2xl",
        sidebar.open() ? "w-[18rem]" : "w-[4.75rem] max-lg:-translate-x-full",
        local.class,
      )}
      data-state={state()}
      {...others}
    >
      {local.children}
    </aside>
  );
}

function SidebarHeader(props: SidebarDivProps) {
  const [local, others] = splitProps(props, ["class"]);
  return <div class={cn("flex min-w-0 flex-col gap-3 p-4", local.class)} {...others} />;
}

function SidebarContent(props: SidebarDivProps) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div class={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-3", local.class)} {...others} />
  );
}

function SidebarFooter(props: SidebarDivProps) {
  const [local, others] = splitProps(props, ["class"]);
  return <div class={cn("mt-auto border-t border-sidebar-border p-4", local.class)} {...others} />;
}

function SidebarGroup(props: SidebarSectionProps) {
  const [local, others] = splitProps(props, ["class"]);
  return <section class={cn("flex min-w-0 flex-col gap-2", local.class)} {...others} />;
}

function SidebarGroupContent(props: SidebarDivProps) {
  const [local, others] = splitProps(props, ["class"]);
  return <div class={cn("min-w-0", local.class)} {...others} />;
}

function SidebarGroupLabel(props: SidebarDivProps) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(
        "flex h-8 items-center px-2 text-xs font-semibold uppercase tracking-normal text-sidebar-foreground/65 group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0",
        local.class,
      )}
      {...others}
    />
  );
}

function SidebarMenu(props: SidebarListProps) {
  const [local, others] = splitProps(props, ["class"]);
  return <ul class={cn("flex min-w-0 flex-col gap-1", local.class)} {...others} />;
}

function SidebarMenuButton(props: SidebarMenuButtonProps) {
  const [local, others] = splitProps(props, ["active", "class", "children"]);
  return (
    <div
      class={cn(
        "flex min-h-10 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        local.active && "bg-sidebar-accent text-sidebar-accent-foreground",
        local.class,
      )}
      {...others}
    >
      {local.children}
    </div>
  );
}

function SidebarMenuItem(props: SidebarListItemProps) {
  const [local, others] = splitProps(props, ["class"]);
  return <li class={cn("min-w-0", local.class)} {...others} />;
}

function SidebarTrigger(props: SidebarTriggerProps) {
  const [local, others] = splitProps(props, ["class"]);
  const sidebar = useSidebar();
  return (
    <button
      {...others}
      aria-label={sidebar.open() ? "Collapse sidebar" : "Expand sidebar"}
      class={cn(
        "inline-flex size-9 items-center justify-center rounded-md border bg-card text-foreground shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        local.class,
      )}
      type="button"
      onClick={sidebar.toggle}
    >
      <PanelLeft size={18} />
    </button>
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
};
