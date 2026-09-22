import type { JSX } from "@solidjs/web"
import { omit } from "solid-js"

import { cn } from "~/lib/utils"

// shadcn base-nova `card` (appliance): `rounded-xl`, hairline ring instead of a
// border, spacing driven by `--card-spacing` (`size="sm"` tightens it).
type DivProps = JSX.HTMLAttributes<HTMLDivElement>

function Card(props: DivProps & { size?: "default" | "sm" }) {
  const others = omit(props, "class", "size")
  return (
    <div
      class={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0",
        props.class,
      )}
      data-size={props.size ?? "default"}
      data-slot="card"
      {...others}
    />
  )
}

function CardHeader(props: DivProps) {
  const others = omit(props, "class")
  return (
    <div
      class={cn(
        "group/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        props.class,
      )}
      data-slot="card-header"
      {...others}
    />
  )
}

function CardTitle(props: DivProps) {
  const others = omit(props, "class")
  return (
    <div
      class={cn("font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm", props.class)}
      data-slot="card-title"
      {...others}
    />
  )
}

function CardDescription(props: DivProps) {
  const others = omit(props, "class")
  return <div class={cn("text-sm text-muted-foreground", props.class)} data-slot="card-description" {...others} />
}

function CardAction(props: DivProps) {
  const others = omit(props, "class")
  return (
    <div
      class={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", props.class)}
      data-slot="card-action"
      {...others}
    />
  )
}

function CardContent(props: DivProps) {
  const others = omit(props, "class")
  return <div class={cn("px-(--card-spacing)", props.class)} data-slot="card-content" {...others} />
}

function CardFooter(props: DivProps) {
  const others = omit(props, "class")
  return (
    <div
      class={cn("flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)", props.class)}
      data-slot="card-footer"
      {...others}
    />
  )
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
