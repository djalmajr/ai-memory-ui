import { AlertTriangle, ChevronRight } from "lucide-solid";
import type { JSX } from "solid-js";
import { Match, Show, Switch, createSignal } from "solid-js";

import { Skeleton } from "~/components/skeleton";
import { cn } from "~/lib/utils";

export interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
}

export function CollapsibleSection(props: {
  children: JSX.Element;
  defaultOpen?: boolean;
  icon: JSX.Element;
  title: string;
}) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  return (
    <div class="flex flex-col border-b">
      <button
        class="flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold outline-none transition hover:bg-hover focus-visible:bg-hover"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span class="flex min-w-0 items-center gap-2">
          {props.icon}
          <span class="truncate">{props.title}</span>
        </span>
        <ChevronRight
          class={cn("shrink-0 text-muted-foreground transition-transform", open() && "rotate-90")}
          size={14}
        />
      </button>
      <Show when={open()}>
        <div class="px-4 pb-4">{props.children}</div>
      </Show>
    </div>
  );
}

export function QueryBoundary<T>(props: { children: JSX.Element; query: QueryState<T> }) {
  const hasData = () => {
    if (props.query.isPending || props.query.isError) {
      return false;
    }
    return props.query.data !== undefined;
  };
  return (
    <Switch>
      <Match when={props.query.isError && !hasData()}>
        <div class="flex min-h-32 items-center justify-center gap-2 p-4 text-sm text-destructive" role="alert">
          <AlertTriangle size={18} />
          <span>{props.query.error?.message ?? "Request failed"}</span>
        </div>
      </Match>
      <Match when={props.query.isPending && !hasData()}>
        <div class="flex min-h-32 flex-col justify-center gap-3 p-4">
          <Skeleton class="h-4 w-3/4 rounded-md" />
          <Skeleton class="h-4 w-1/2 rounded-md" />
          <Skeleton class="h-20 w-full rounded-md" />
        </div>
      </Match>
      <Match when={true}>{props.children}</Match>
    </Switch>
  );
}

export function EmptyState(props: { body: string; title: string }) {
  return (
    <div class="flex min-h-32 flex-col items-center justify-center gap-1 text-center">
      <strong class="text-sm">{props.title}</strong>
      <span class="max-w-64 text-sm text-muted-foreground">{props.body}</span>
    </div>
  );
}

// Chip discreto e uniforme — base compartilhada por kind/tier/pinned.
export function Chip(props: { children: JSX.Element; class?: string }) {
  return (
    <span
      class={cn(
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[0.625rem] font-medium lowercase leading-4 tracking-wide",
        props.class,
      )}
    >
      {props.children}
    </span>
  );
}

// Badge discreto — bg colorido suave por kind, sem cor de borda.
export function KindBadge(props: { kind: string }) {
  const tone = () => {
    switch (props.kind.toLowerCase()) {
      case "rule":
        return "bg-success text-success-foreground";
      case "decision":
        return "bg-warning text-warning-foreground";
      case "gotcha":
        return "bg-error text-error-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };
  return <Chip class={tone()}>{props.kind}</Chip>;
}

export function Metric(props: { inverted?: boolean; label: string; value: number }) {
  return (
    <div class="min-w-0">
      <strong class="block text-xl leading-none">{props.value}</strong>
      <small class={props.inverted ? "text-xs text-sidebar-foreground/60" : "text-xs text-muted-foreground"}>
        {props.label}
      </small>
    </div>
  );
}
