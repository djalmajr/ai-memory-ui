import type { JSX } from "@solidjs/web"
import { omit } from "solid-js"

import { ScrollArea } from "~/components/scroll-area"
import { cn } from "~/lib/utils"

// shadcn base-nova `table` (appliance). Wide tables scroll on the ScrollArea
// thumb instead of the native horizontal bar.
function Table(props: JSX.HTMLAttributes<HTMLTableElement> & { scrollClass?: string }) {
  const others = omit(props, "class", "scrollClass")
  return (
    <ScrollArea class={cn("w-full", props.scrollClass)}>
      <table class={cn("w-full caption-bottom text-sm", props.class)} data-slot="table" {...others} />
    </ScrollArea>
  )
}

function TableHeader(props: JSX.HTMLAttributes<HTMLTableSectionElement>) {
  const others = omit(props, "class")
  return <thead class={cn("[&_tr]:border-b", props.class)} data-slot="table-header" {...others} />
}

function TableBody(props: JSX.HTMLAttributes<HTMLTableSectionElement>) {
  const others = omit(props, "class")
  return (
    <tbody
      class={cn("[&_tr:last-child]:border-0 [&_tr]:hover:bg-muted/50", props.class)}
      data-slot="table-body"
      {...others}
    />
  )
}

function TableFooter(props: JSX.HTMLAttributes<HTMLTableSectionElement>) {
  const others = omit(props, "class")
  return (
    <tfoot
      class={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", props.class)}
      data-slot="table-footer"
      {...others}
    />
  )
}

function TableRow(props: JSX.HTMLAttributes<HTMLTableRowElement>) {
  const others = omit(props, "class")
  return (
    <tr
      class={cn("border-b transition-colors data-[state=selected]:bg-muted", props.class)}
      data-slot="table-row"
      {...others}
    />
  )
}

function TableHead(props: JSX.ThHTMLAttributes<HTMLTableCellElement>) {
  const others = omit(props, "class")
  return (
    <th
      class={cn("h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground", props.class)}
      data-slot="table-head"
      {...others}
    />
  )
}

function TableCell(props: JSX.TdHTMLAttributes<HTMLTableCellElement>) {
  const others = omit(props, "class")
  return <td class={cn("p-2 align-middle whitespace-nowrap", props.class)} data-slot="table-cell" {...others} />
}

function TableCaption(props: JSX.HTMLAttributes<HTMLTableCaptionElement>) {
  const others = omit(props, "class")
  return <caption class={cn("mt-4 text-sm text-muted-foreground", props.class)} data-slot="table-caption" {...others} />
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow }
