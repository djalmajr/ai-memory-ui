import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

// Stat strip from the overview: label, 17px value, optional muted subtitle.
// Cells share one border and divide with a hairline.

export function StatStrip(props: { children: JSX.Element }) {
  return (
    <div class="flex w-full rounded-lg border border-hairline max-md:flex-col">{props.children}</div>
  );
}

export function StatCell(props: { label: string; mono?: boolean; sub?: string; value: string | number }) {
  return (
    <div class="flex min-w-0 flex-1 flex-col gap-0.5 border-hairline p-4 not-last:border-r max-md:not-last:border-r-0 max-md:not-last:border-b">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <strong class="truncate text-[17px] font-semibold leading-[22px]">{props.value}</strong>
      <Show when={props.sub}>
        {(sub) => (
          <span
            class={
              props.mono
                ? "truncate font-mono text-xs text-muted-foreground"
                : "truncate text-xs text-muted-foreground"
            }
          >
            {sub()}
          </span>
        )}
      </Show>
    </div>
  );
}
