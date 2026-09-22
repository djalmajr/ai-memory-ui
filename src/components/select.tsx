import { For, Show, createSignal } from "solid-js";

import { Check, ChevronDown } from "~/components/icons";
import { ScrollArea } from "~/components/scroll-area";
import {
  Content as PopoverContent,
  Portal as PopoverPortal,
  Root as PopoverRoot,
  Trigger as PopoverTrigger,
} from "~/components/popover";
import { cn } from "~/lib/utils";

// Appliance `Select` (shadcn base-nova) on the hand-rolled popover. Base UI's
// select is React-only, and the open animation stays off for the same reason
// as the popover: `transform` is the position, not a motion.

export function Select<T extends string>(props: {
  disabled?: boolean;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  const [open, setOpen] = createSignal(false);
  const [width, setWidth] = createSignal(0);
  let anchor: HTMLDivElement | undefined;
  const measure = () => {
    if (anchor) setWidth(anchor.offsetWidth);
  };
  const label = () => props.options.find((option) => option.value === props.value)?.label ?? "";

  return (
    <div class="w-full" ref={anchor} onPointerDown={measure}>
      <PopoverRoot gutter={4} open={open()} placement="bottom-start" onOpenChange={setOpen}>
        <PopoverTrigger
          aria-haspopup="listbox"
          class="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap outline-none transition-colors select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
          disabled={props.disabled}
          onClick={measure}
        >
          <span class="line-clamp-1 flex-1 text-left">{label()}</span>
          <ChevronDown class="text-muted-foreground" size={16} />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            class="z-[70] w-auto min-w-36 gap-0 p-0"
            role="listbox"
            style={{ width: width() > 0 ? `${width()}px` : undefined }}
          >
            <ScrollArea class="max-h-72 p-1">
            <For each={props.options}>
              {(option) => {
                const selected = () => option.value === props.value;
                return (
                  <button
                    aria-selected={selected() ? "true" : "false"}
                    class={cn(
                      "relative flex w-full cursor-default items-center rounded-md py-1 pr-8 pl-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground",
                      selected() && "bg-accent/60",
                    )}
                    role="option"
                    type="button"
                    onClick={() => {
                      props.onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                    <Show when={selected()}>
                      <Check class="pointer-events-none absolute right-2" size={16} />
                    </Show>
                  </button>
                );
              }}
              </For>
            </ScrollArea>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
  );
}
