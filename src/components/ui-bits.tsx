import { AlertTriangle, ChevronRight } from "~/components/icons";
import type { JSX } from "@solidjs/web";
import { Match, Show, Switch, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
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

// Chip discreto e uniforme — base compartilhada por kind/tier/pinned: o
// `Badge` do design system em caixa baixa.
export function Chip(props: { children: JSX.Element; class?: string }) {
  return (
    <Badge class={cn("lowercase", props.class)} variant="secondary">
      {props.children}
    </Badge>
  );
}

// Badge por kind — tons de status do appliance (fundo a 10% + texto forte).
export function KindBadge(props: { kind: string }) {
  const variant = () => {
    switch (props.kind.toLowerCase()) {
      case "rule":
        return "success" as const;
      case "decision":
        return "warning" as const;
      case "gotcha":
        return "error" as const;
      default:
        return "secondary" as const;
    }
  };
  return (
    <Badge class="lowercase" variant={variant()}>
      {props.kind}
    </Badge>
  );
}

export function Metric(props: { inverted?: boolean; label: string; value: number | string }) {
  return (
    <div class="min-w-0">
      <strong class="block font-heading text-xl leading-none">{props.value}</strong>
      <small class={props.inverted ? "text-xs text-sidebar-foreground/60" : "text-xs text-muted-foreground"}>
        {props.label}
      </small>
    </div>
  );
}
