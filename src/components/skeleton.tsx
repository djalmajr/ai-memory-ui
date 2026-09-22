import type { JSX } from "@solidjs/web"
import { omit } from "solid-js"

import { cn } from "~/lib/utils"

// shadcn base-nova `skeleton` (appliance).
function Skeleton(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const others = omit(props, "class")
  return <div aria-busy="true" class={cn("animate-pulse rounded-md bg-muted", props.class)} data-slot="skeleton" {...others} />
}

export { Skeleton }
