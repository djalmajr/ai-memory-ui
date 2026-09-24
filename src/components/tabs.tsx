import type { JSX } from "@solidjs/web";
import { createContext, createSignal, createUniqueId, omit, useContext } from "solid-js";

import { cn } from "~/lib/utils";

// shadcn base-nova `tabs` (appliance), segmented variant, on native ARIA
// tabs: roving tabindex on the triggers, arrows/Home/End move and select,
// `data-active` on the active trigger like base-ui. Panels stay mounted and
// are hidden with the `hidden` attribute so switching tabs keeps each panel's
// inputs and query results.

interface TabsContextValue {
  baseId: string;
  select: (value: string) => void;
  value: () => string;
}

const TabsContext = createContext<TabsContextValue>();

function useTabs(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs parts must be rendered inside <Tabs>");
  return context;
}

function Tabs(
  props: Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> & {
    defaultValue: string;
    onChange?: (value: string) => void;
    value?: string;
  },
) {
  const [internal, setInternal] = createSignal(props.defaultValue);
  const value = () => props.value ?? internal();
  const select = (next: string) => {
    if (next === value()) return;
    setInternal(next);
    props.onChange?.(next);
  };
  const others = omit(props, "class", "defaultValue", "onChange", "value");
  return (
    <TabsContext value={{ baseId: createUniqueId(), select, value }}>
      <div class={cn("group/tabs flex flex-col gap-2", props.class)} data-slot="tabs" {...others} />
    </TabsContext>
  );
}

function TabsList(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const tabs = useTabs();
  const others = omit(props, "class", "onKeyDown");
  const onKeyDown = (event: KeyboardEvent) => {
    const triggers = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const current = triggers.findIndex((el) => el === document.activeElement);
    if (current < 0) return;
    const last = triggers.length - 1;
    const target =
      event.key === "ArrowRight" ? (current === last ? 0 : current + 1)
      : event.key === "ArrowLeft" ? (current === 0 ? last : current - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (target < 0) return;
    event.preventDefault();
    const next = triggers[target]!;
    next.focus();
    tabs.select(next.dataset.value!);
  };
  return (
    <div
      {...others}
      class={cn(
        "group/tabs-list inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground",
        props.class,
      )}
      role="tablist"
      onKeyDown={onKeyDown}
    />
  );
}

function TabsTrigger(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const tabs = useTabs();
  const active = () => tabs.value() === props.value;
  const others = omit(props, "class", "onClick", "value");
  return (
    <button
      {...others}
      aria-controls={`${tabs.baseId}-panel-${props.value}`}
      aria-selected={active() ? "true" : "false"}
      class={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm dark:data-[active]:border-input dark:data-[active]:bg-input/30 dark:data-[active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
      data-active={active() ? "" : undefined}
      data-value={props.value}
      id={`${tabs.baseId}-tab-${props.value}`}
      role="tab"
      tabindex={active() ? 0 : -1}
      type="button"
      onClick={(event) => {
        if (typeof props.onClick === "function") props.onClick(event);
        tabs.select(props.value);
      }}
    />
  );
}

function TabsContent(props: JSX.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const tabs = useTabs();
  const others = omit(props, "class", "value");
  return (
    <div
      {...others}
      aria-labelledby={`${tabs.baseId}-tab-${props.value}`}
      class={cn("flex-1 text-sm outline-none", props.class)}
      hidden={tabs.value() !== props.value}
      id={`${tabs.baseId}-panel-${props.value}`}
      role="tabpanel"
      tabindex={0}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
