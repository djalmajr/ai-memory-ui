import type { ComponentProps } from "@solidjs/web"
import { omit } from "solid-js"

import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "~/lib/utils"

// shadcn base-nova `badge` (appliance). `success`/`warning`/`error` follow the
// appliance `status.tsx` tones: 10% background + strong text.
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive/10 text-destructive dark:bg-destructive/20",
        outline: "border-border text-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        error: "bg-error text-error-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>

function Badge(props: BadgeProps) {
  const others = omit(props, "class", "variant")
  return <span class={cn(badgeVariants({ variant: props.variant }), props.class)} data-slot="badge" {...others} />
}

export type { BadgeProps }
export { Badge, badgeVariants }
