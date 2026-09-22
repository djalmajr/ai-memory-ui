import { cn } from "~/lib/utils";

// shadcn base-nova checkbox look on a native `<input type="checkbox">`: the
// input stays in the tree (transparent, on top) so keyboard, forms and
// assistive tech keep working; the control next to it is visual only and
// follows the input's state via `peer-*`.
export function Checkbox(props: {
  checked?: boolean;
  class?: string;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <span class={cn("group relative inline-flex", props.class)}>
      <input
        checked={props.checked ?? false}
        class="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        disabled={props.disabled}
        type="checkbox"
        onChange={(event) => props.onChange?.(event.currentTarget.checked)}
      />
      <span
        aria-hidden="true"
        class="pointer-events-none flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background text-primary-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-50 dark:bg-input/30 [&>svg]:hidden peer-checked:[&>svg]:block"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5 12l5 5l10 -10" />
        </svg>
      </span>
    </span>
  );
}
