import type { JSX } from "@solidjs/web";
import { For, Show, createEffect, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { ArrowDownUp, Check, ChevronDown, ChevronsUpDown, ChevronUp, GripVertical, PlusCircle, Settings2, Trash2, X } from "~/components/icons";
import { Input } from "~/components/input";
import { ScrollArea } from "~/components/scroll-area";
import { Content as PopoverContent, Portal as PopoverPortal, Root as PopoverRoot, Trigger as PopoverTrigger } from "~/components/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/table";
import { TablePager } from "~/components/table-pager";
import { t } from "~/lib/i18n";
import { DEFAULT_PAGE_SIZE, pageSlice, type PageSize } from "~/lib/pagination";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Appliance list: search, dashed facet filters, Sort, Columns, then the primary
// action. The grid below is the bordered table plus the page footer.

export type GridOption = { label: string; value: string };

export type GridColumn<T> = {
  cell: (item: T) => JSX.Element;
  class?: string;
  filter?: {
    label: string;
    options?: GridOption[];
    value: (item: T) => string;
  };
  hideable?: boolean;
  id: string;
  label: string;
  search?: (item: T) => string;
  sortValue?: (item: T) => string | number | null | undefined;
};

/** A control that changes the query, drawn as the same facet chip. */
export type GridFilter = {
  label: string;
  onChange: (value: string) => void;
  options: GridOption[];
  value: string;
};

function compare(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function FacetFilter(props: {
  label: string;
  onChange: (selected: string[]) => void;
  options: GridOption[];
  selected: string[];
}) {
  const [open, setOpen] = createSignal(false);
  const chosen = () => props.options.filter((option) => props.selected.includes(option.value));
  const toggle = (value: string) => {
    const next = props.selected.includes(value)
      ? props.selected.filter((item) => item !== value)
      : [...props.selected, value];
    props.onChange(next);
  };
  return (
    <PopoverRoot gutter={4} open={open()} placement="bottom-start" onOpenChange={setOpen}>
      <PopoverTrigger class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border bg-background px-2.5 text-sm font-normal hover:bg-muted">
        <PlusCircle class="text-muted-foreground" size={16} />
        {props.label}
        <Show when={chosen().length > 0}>
          <span class="mx-0.5 h-4 w-px bg-border" />
          <For each={chosen()}>
            {(option) => (
              <Badge class="rounded-sm px-1 font-normal" variant="secondary">
                {option.label}
              </Badge>
            )}
          </For>
        </Show>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent class="w-52 gap-0 p-0">
          <ScrollArea class="max-h-72 p-1">
          <For each={props.options}>
            {(option) => {
              const on = () => props.selected.includes(option.value);
              return (
                <button
                  class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  type="button"
                  onClick={() => toggle(option.value)}
                >
                  <span
                    class={cn(
                      "flex size-4 items-center justify-center rounded-sm border border-primary",
                      on() ? "bg-primary text-primary-foreground" : "opacity-50",
                    )}
                  >
                    <Show when={on()}>
                      <Check size={12} />
                    </Show>
                  </span>
                  <span class="truncate">{option.label}</span>
                </button>
              );
            }}
          </For>
          </ScrollArea>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  );
}

function ChoiceFilter(props: GridFilter) {
  const [open, setOpen] = createSignal(false);
  const current = () => props.options.find((option) => option.value === props.value);
  return (
    <PopoverRoot gutter={4} open={open()} placement="bottom-start" onOpenChange={setOpen}>
      <PopoverTrigger class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border bg-background px-2.5 text-sm font-normal hover:bg-muted">
        <PlusCircle class="text-muted-foreground" size={16} />
        {props.label}
        <Show when={current()}>
          {(option) => (
            <>
              <span class="mx-0.5 h-4 w-px bg-border" />
              <Badge class="rounded-sm px-1 font-normal" variant="secondary">
                {option().label}
              </Badge>
            </>
          )}
        </Show>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent class="w-44 gap-0 p-0">
          <ScrollArea class="max-h-72 p-1">
          <For each={props.options}>
            {(option) => (
              <button
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                type="button"
                onClick={() => {
                  props.onChange(option.value);
                  setOpen(false);
                }}
              >
                <span
                  class={cn(
                    "flex size-4 items-center justify-center rounded-sm border border-primary",
                    option.value === props.value ? "bg-primary text-primary-foreground" : "opacity-50",
                  )}
                >
                  <Show when={option.value === props.value}>
                    <Check size={12} />
                  </Show>
                </span>
                {option.label}
              </button>
            )}
          </For>
          </ScrollArea>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  );
}

export function DataGrid<T>(props: {
  action?: JSX.Element;
  /** Slot in the left toolbar cluster, with the filters. */
  leading?: JSX.Element;
  /** Slot immediately to the left of the Sort button. */
  beforeSort?: JSX.Element;
  columns: GridColumn<T>[];
  empty: string;
  filters?: GridFilter[];
  items: readonly T[];
  onRow?: (item: T) => void;
  pager?: boolean;
  searchPlaceholder?: string;
  tableClass?: string;
}) {
  const [query, setQuery] = createSignal("");
  const [filters, setFilters] = createSignal<Record<string, string[]>>({});
  const [hidden, setHidden] = createSignal<Record<string, boolean>>({});
  const [sort, setSort] = createSignal<{ desc: boolean; id: string } | null>(null);
  const [sortOpen, setSortOpen] = createSignal(false);
  const [columnsOpen, setColumnsOpen] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal<PageSize>(DEFAULT_PAGE_SIZE);

  const searchable = () => props.columns.some((column) => column.search);
  const sortable = () => props.columns.filter((column) => column.sortValue);
  const hideable = () => props.columns.filter((column) => column.hideable !== false && column.label);
  const shown = () => props.columns.filter((column) => !hidden()[column.id]);

  const filtered = () => {
    const text = query().trim().toLowerCase();
    const active = filters();
    return props.items.filter((item) => {
      if (text) {
        const haystack = props.columns
          .filter((column) => column.search)
          .map((column) => column.search?.(item) ?? "")
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      for (const column of props.columns) {
        const selected = column.filter ? active[column.id] : undefined;
        if (!selected || selected.length === 0 || !column.filter) continue;
        if (!selected.includes(column.filter.value(item))) return false;
      }
      return true;
    });
  };

  const sorted = () => {
    const spec = sort();
    const rows = filtered().slice();
    if (!spec) return rows;
    const column = props.columns.find((item) => item.id === spec.id);
    if (!column?.sortValue) return rows;
    const valueOf = column.sortValue;
    rows.sort((left, right) => {
      const compared = compare(valueOf(left) ?? "", valueOf(right) ?? "");
      return spec.desc ? -compared : compared;
    });
    return rows;
  };

  const paged = () => props.pager !== false;
  const visible = () => (paged() ? pageSlice(sorted(), page(), pageSize()) : sorted());
  const filtering = () => query().trim().length > 0 || Object.values(filters()).some((selected) => selected.length > 0);

  createEffect(
    () => ({ filters: filters(), query: query(), sort: sort() }),
    () => {
      setPage(1);
    },
  );

  const toggleSort = (id: string, desc?: boolean) => {
    const current = sort();
    if (desc === undefined) {
      if (!current || current.id !== id) setSort({ desc: false, id });
      else if (!current.desc) setSort({ desc: true, id });
      else setSort(null);
      return;
    }
    if (current?.id === id && current.desc === desc) setSort(null);
    else setSort({ desc, id });
    setSortOpen(false);
  };

  return (
    <div class="flex w-full flex-col gap-2.5">
      <div class="flex w-full flex-wrap items-start justify-between gap-2 p-1" role="toolbar">
        <div class="flex flex-1 flex-wrap items-center gap-2">
          <Show when={searchable()}>
            <Input
              class="h-8 w-48 sm:w-56"
              placeholder={props.searchPlaceholder ?? t(() => m.table_search())}
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
          </Show>
          {props.leading}
          <For each={props.filters ?? []}>{(filter) => <ChoiceFilter {...filter} />}</For>
          <For each={props.columns.filter((column) => column.filter)}>
            {(column) => (
              <FacetFilter
                label={column.filter?.label ?? column.label}
                options={
                  column.filter?.options ??
                  Array.from(new Set(props.items.map((item) => column.filter?.value(item) ?? ""))).map((value) => ({
                    label: value,
                    value,
                  }))
                }
                selected={filters()[column.id] ?? []}
                onChange={(selected) => setFilters((current) => ({ ...current, [column.id]: selected }))}
              />
            )}
          </For>
          <Show when={filtering()}>
            <Button
              class="border-dashed font-normal"
              type="button"
              variant="outline"
              onClick={() => {
                setQuery("");
                setFilters({});
              }}
            >
              <X />
              {t(() => m.table_reset())}
            </Button>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          {props.beforeSort}
          <PopoverRoot gutter={4} open={sortOpen()} placement="bottom-end" onOpenChange={setSortOpen}>
            <PopoverTrigger class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-normal hover:bg-muted">
              <ArrowDownUp class="text-muted-foreground" size={16} />
              {t(() => m.table_sort())}
              <Show when={sort()}>
                <Badge class="h-[18px] rounded-[3px] px-1 font-mono text-[10px] font-normal" variant="secondary">
                  1
                </Badge>
              </Show>
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent class="w-auto min-w-[380px] max-w-[calc(100vw-2rem)] gap-3.5 p-4">
                <div class="flex flex-col gap-1">
                  <h4 class="leading-none font-medium">
                    {sort() ? t(() => m.table_sort_by()) : t(() => m.table_sort_none())}
                  </h4>
                  <p class={cn("text-sm text-muted-foreground", sort() && "sr-only")}>
                    {sort() ? t(() => m.table_sort_modify_hint()) : t(() => m.table_sort_add_hint())}
                  </p>
                  <p class="text-xs text-muted-foreground">{t(() => m.table_sort_single())}</p>
                </div>
                <Show when={sort()}>
                  {(current) => (
                    <div class="flex items-center gap-2">
                      <div class="relative w-40">
                        <select
                          aria-label={t(() => m.table_sort())}
                          class="h-8 w-full appearance-none rounded-md border border-input bg-background pr-8 pl-2.5 text-sm outline-none"
                          value={current().id}
                          onChange={(event) => setSort({ desc: current().desc, id: event.currentTarget.value })}
                        >
                          <For each={sortable()}>
                            {(column) => <option value={column.id}>{column.label}</option>}
                          </For>
                        </select>
                        <ChevronsUpDown class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 opacity-50" size={16} />
                      </div>
                      <div class="relative w-36">
                        <select
                          aria-label={t(() => m.table_sort())}
                          class="h-8 w-full appearance-none rounded-md border border-input bg-background pr-8 pl-2.5 text-sm outline-none"
                          value={current().desc ? "desc" : "asc"}
                          onChange={(event) => setSort({ desc: event.currentTarget.value === "desc", id: current().id })}
                        >
                          <option value="asc">{t(() => m.table_sort_asc())}</option>
                          <option value="desc">{t(() => m.table_sort_desc())}</option>
                        </select>
                        <ChevronsUpDown class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 opacity-50" size={16} />
                      </div>
                      <Button
                        aria-label={t(() => m.table_sort_clear())}
                        class="size-8 shrink-0 rounded-md"
                        size="icon"
                        type="button"
                        variant="outline"
                        onClick={() => setSort(null)}
                      >
                        <Trash2 />
                      </Button>
                      <Button
                        class="size-8 shrink-0 rounded-md"
                        size="icon"
                        type="button"
                        variant="outline"
                        tabindex={-1}
                      >
                        <GripVertical />
                      </Button>
                    </div>
                  )}
                </Show>
                <div class="flex items-center gap-2">
                  <Button
                    class="rounded-md"
                    disabled={sortable().length === 0 || sort() !== null}
                    type="button"
                    onClick={() => {
                      const first = sortable()[0];
                      if (first) setSort({ desc: false, id: first.id });
                    }}
                  >
                    {t(() => m.table_sort_add())}
                  </Button>
                  <Show when={sort()}>
                    <Button class="rounded-md" type="button" variant="outline" onClick={() => setSort(null)}>
                      {t(() => m.table_sort_clear())}
                    </Button>
                  </Show>
                </div>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
          <PopoverRoot gutter={4} open={columnsOpen()} placement="bottom-end" onOpenChange={setColumnsOpen}>
            <PopoverTrigger class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-normal hover:bg-muted">
              <Settings2 class="text-muted-foreground" size={16} />
              {t(() => m.table_columns())}
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent class="w-44 gap-0 p-1">
                <For each={hideable()}>
                  {(column) => {
                    const visible = () => !hidden()[column.id];
                    return (
                      <button
                        class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted"
                        data-checked={visible() ? "" : undefined}
                        type="button"
                        onClick={() => setHidden((current) => ({ ...current, [column.id]: visible() }))}
                      >
                        <span class="truncate">{column.label}</span>
                        <Check class={cn("ml-auto", visible() ? "opacity-100" : "opacity-0")} size={16} />
                      </button>
                    );
                  }}
                </For>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
          {props.action}
        </div>
      </div>
      <div class="overflow-hidden rounded-md border border-hairline">
        <Table class={props.tableClass}>
          <TableHeader>
            <TableRow>
              <For each={shown()}>
                {(column) => (
                  <TableHead class={cn(column.class, "font-sans")}>
                    <Show
                      when={column.sortValue}
                      fallback={<span>{column.label}</span>}
                    >
                      <button
                        class="-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-accent"
                        type="button"
                        onClick={() => toggleSort(column.id)}
                      >
                        {column.label}
                        <Show when={sort()?.id === column.id && sort()?.desc} fallback={<Show when={sort()?.id === column.id} fallback={<ChevronsUpDown class="text-muted-foreground" size={14} />}><ChevronUp class="text-muted-foreground" size={14} /></Show>}>
                          <ChevronDown class="text-muted-foreground" size={14} />
                        </Show>
                      </button>
                    </Show>
                  </TableHead>
                )}
              </For>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={visible().length > 0}
              fallback={
                <TableRow>
                  <TableCell class="h-24 text-center whitespace-normal text-muted-foreground" colSpan={Math.max(shown().length, 1)}>
                    {props.empty}
                  </TableCell>
                </TableRow>
              }
            >
              <For each={visible()}>
                {(item) => (
                  <TableRow class={props.onRow ? "cursor-pointer" : undefined} onClick={() => props.onRow?.(item)}>
                    <For each={shown()}>
                      {(column) => <TableCell class={column.class}>{column.cell(item)}</TableCell>}
                    </For>
                  </TableRow>
                )}
              </For>
            </Show>
          </TableBody>
        </Table>
      </div>
      <Show when={paged()}>
        <TablePager
          page={page()}
          pageSize={pageSize()}
          total={sorted().length}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Show>
    </div>
  );
}
