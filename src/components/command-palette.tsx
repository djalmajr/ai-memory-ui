import * as PopoverPrimitive from "@kobalte/core/popover";
import {
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Globe,
  Loader2,
  Search,
  X,
} from "lucide-solid";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal } from "solid-js";

import { KindBadge } from "~/components/ui-bits";
import { HighlightMatch } from "~/components/workspace-cascader";
import { t } from "~/lib/i18n";
import type { SearchHit, WorkspaceWithProjects } from "~/lib/types";
import * as m from "~/paraglide/messages";

// Explicit search scope chosen via the cascader.
export type SearchTarget =
  | { kind: "global" }
  | { kind: "workspace"; workspace: string }
  | { kind: "project"; workspace: string; project: string };

export function CommandPalette(props: {
  loading: boolean;
  target: SearchTarget;
  workspaces: WorkspaceWithProjects[];
  onClose: () => void;
  onInput: (value: string) => void;
  onTargetChange: (target: SearchTarget) => void;
  onSelect: (hit: SearchHit) => void;
  open: boolean;
  query: string;
  results: SearchHit[];
  submitted: string;
}) {
  let inputRef: HTMLInputElement | undefined;
  let resultsRef: HTMLDivElement | undefined;
  const [active, setActive] = createSignal(0);

  createEffect(() => {
    if (props.open) {
      queueMicrotask(() => inputRef?.focus());
    }
  });
  // Resultados mudaram → reseta o cursor para o topo.
  createEffect(() => {
    props.results;
    setActive(0);
  });
  // Cursor ativo mudou (teclado ↓/↑ ou hover) → garante que o item visado
  // fique visível. Sem isso, a navegação por teclado podia "selecionar" itens
  // fora do viewport e o usuário não via o highlight se mover.
  createEffect(() => {
    const idx = active();
    const container = resultsRef;
    if (!container || idx < 0) return;
    const item = container.children[idx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  });

  function onKeyDown(event: KeyboardEvent) {
    const items = props.results;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const hit = items[active()];
      if (hit) {
        event.preventDefault();
        props.onSelect(hit);
      }
    }
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 p-4 pt-[14vh] backdrop-blur-sm"
        data-testid="command-palette"
        onClick={props.onClose}
      >
        <div
          class="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div class="flex items-center gap-2 border-b px-3 py-2.5">
            <SearchScopeCascader
              target={props.target}
              workspaces={props.workspaces}
              onTargetChange={props.onTargetChange}
            />
            <Search class="shrink-0 text-muted-foreground" size={18} />
            <input
              ref={inputRef}
              aria-label="Search memory"
              class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              data-testid="palette-input"
              placeholder={t(() => m.search_placeholder())}
              value={props.query}
              onInput={(event) => props.onInput(event.currentTarget.value)}
              onKeyDown={onKeyDown}
            />
            <Show when={props.query.length > 0}>
              <button
                aria-label="Clear query"
                class="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
                type="button"
                onClick={() => props.onInput("")}
              >
                <X size={14} />
              </button>
            </Show>
            <kbd class="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground sm:inline-block">
              esc
            </kbd>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <Switch>
              <Match when={props.submitted.length === 0}>
                <PaletteHint body={t(() => m.palette_ready_body())} title={t(() => m.palette_ready_title())} />
              </Match>
              <Match when={props.loading && props.results.length === 0}>
                <div class="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 class="animate-spin" size={16} />
                  {t(() => m.palette_searching())}
                </div>
              </Match>
              <Match when={props.results.length === 0}>
                <PaletteHint
                  body={t(() => m.palette_no_results_body())}
                  title={t(() => m.palette_no_results_title())}
                />
              </Match>
              <Match when={props.results.length > 0}>
                <div ref={resultsRef} class="flex flex-col gap-1" data-testid="palette-results">
                  <For each={props.results}>
                    {(hit, index) => (
                      <button
                        class="flex w-full min-w-0 flex-col gap-1 rounded-lg p-3 text-left outline-none transition"
                        classList={{
                          "bg-selected": index() === active(),
                          "hover:bg-hover": index() !== active(),
                        }}
                        type="button"
                        onClick={() => props.onSelect(hit)}
                        onMouseEnter={() => setActive(index())}
                      >
                        <span class="flex min-w-0 items-center gap-2">
                          <KindBadge kind={hit.kind} />
                          <strong class="min-w-0 flex-1 truncate text-sm leading-tight">{hit.title}</strong>
                          <span
                            class="shrink-0 font-mono text-[0.65rem] text-muted-foreground"
                            title={`rank ${hit.rank}`}
                          >
                            {formatRank(hit.rank)}
                          </span>
                        </span>
                        <small class="truncate text-xs text-muted-foreground">
                          {hit.workspace}/{hit.project} ·{" "}
                          <HighlightMatch query={props.submitted} text={hit.path} />
                        </small>
                        <p class="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {renderSnippet(hit.snippet)}
                        </p>
                      </button>
                    )}
                  </For>
                </div>
              </Match>
            </Switch>
          </div>
          <div class="flex items-center gap-3 border-t px-4 py-2 text-[0.7rem] text-muted-foreground">
            <span>↑↓ {t(() => m.palette_nav())}</span>
            <span class="flex items-center gap-1">
              <CornerDownLeft size={11} /> {t(() => m.palette_open())}
            </span>
            <span class="ml-auto truncate">
              {t(() => m.palette_results({ count: props.results.length }))}
            </span>
          </div>
        </div>
      </div>
    </Show>
  );
}

export function PaletteHint(props: { body: string; title: string }) {
  return (
    <div class="flex min-h-32 flex-col items-center justify-center gap-1 p-6 text-center">
      <strong class="text-sm">{props.title}</strong>
      <span class="max-w-72 text-sm text-muted-foreground">{props.body}</span>
    </div>
  );
}

export function scopeTriggerLabel(target: SearchTarget): string {
  if (target.kind === "global") return t(() => m.palette_scope_global());
  if (target.kind === "workspace") return target.workspace;
  return `${target.workspace} / ${target.project}`;
}

// Search-scope picker: the same two-column cascader as the top-bar
// workspace switcher, plus an explicit "Global" row at the top. Lets the
// user pin the search to any workspace or project regardless of which
// route they're currently on.
export function SearchScopeCascader(props: {
  target: SearchTarget;
  workspaces: WorkspaceWithProjects[];
  onTargetChange: (target: SearchTarget) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [hoveredWs, setHoveredWs] = createSignal<string | null>(null);

  const activeWorkspace = createMemo<string>(() => {
    const hover = hoveredWs();
    if (hover && props.workspaces.some((w) => w.workspace_name === hover)) return hover;
    if (props.target.kind !== "global") {
      const t = props.target;
      if (props.workspaces.some((w) => w.workspace_name === t.workspace)) return t.workspace;
    }
    return props.workspaces[0]?.workspace_name ?? "";
  });

  const activeProjects = createMemo(
    () => props.workspaces.find((w) => w.workspace_name === activeWorkspace())?.projects ?? [],
  );

  function pick(target: SearchTarget) {
    setOpen(false);
    props.onTargetChange(target);
  }

  return (
    <PopoverPrimitive.Root open={open()} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        as="button"
        aria-label="Escopo da busca"
        class="flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
      >
        <Show
          fallback={<Globe class="shrink-0 text-primary" size={13} />}
          when={props.target.kind !== "global"}
        >
          <Boxes class="shrink-0 text-primary" size={13} />
        </Show>
        <span class="max-w-[14rem] truncate">{scopeTriggerLabel(props.target)}</span>
        <ChevronDown class="text-muted-foreground" size={13} />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          class="z-[60] mt-1 w-[28rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl outline-none data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0"
          data-testid="search-scope-cascader-content"
        >
          {/* Global row — always available on top */}
          <button
            class="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
            classList={{ "bg-selected text-primary": props.target.kind === "global" }}
            type="button"
            onClick={() => pick({ kind: "global" })}
          >
            <Globe class="shrink-0 text-primary" size={15} />
            <span class="flex-1 font-medium">{t(() => m.palette_scope_global())}</span>
            <small class="text-xs text-muted-foreground">{t(() => m.palette_scope_global_hint())}</small>
          </button>
          <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x">
            {/* Left: workspaces (click = workspace-wide search) */}
            <div class="max-h-72 overflow-y-auto p-1">
              <For each={props.workspaces}>
                {(ws) => (
                  <button
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
                    classList={{
                      "bg-selected text-primary":
                        props.target.kind === "workspace" && props.target.workspace === ws.workspace_name,
                      "bg-hover": activeWorkspace() === ws.workspace_name && !(
                        props.target.kind === "workspace" && props.target.workspace === ws.workspace_name
                      ),
                    }}
                    type="button"
                    onMouseEnter={() => setHoveredWs(ws.workspace_name)}
                    onClick={() => pick({ kind: "workspace", workspace: ws.workspace_name })}
                  >
                    <Boxes class="shrink-0 text-primary" size={15} />
                    <span class="flex min-w-0 flex-1 flex-col">
                      <strong class="truncate text-sm font-medium leading-tight">{ws.workspace_name}</strong>
                      <small class="truncate text-xs text-muted-foreground">
                        {t(() => m.home_ws_meta({ docs: ws.page_count, projects: ws.project_count }))}
                      </small>
                    </span>
                    <Show when={ws.projects.length > 0}>
                      <ChevronRight class="shrink-0 text-muted-foreground" size={14} />
                    </Show>
                  </button>
                )}
              </For>
            </div>
            {/* Right: projects of the active workspace */}
            <div class="max-h-72 overflow-y-auto p-1">
              <Show
                fallback={
                  <p class="px-3 py-6 text-center text-xs text-muted-foreground">
                    {t(() => m.cascader_no_projects())}
                  </p>
                }
                when={activeProjects().length > 0}
              >
                <For each={activeProjects()}>
                  {(project) => (
                    <button
                      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
                      classList={{
                        "bg-selected text-primary":
                          props.target.kind === "project" &&
                          props.target.workspace === project.workspace_name &&
                          props.target.project === project.project_name,
                      }}
                      type="button"
                      onClick={() => pick({ kind: "project", workspace: project.workspace_name, project: project.project_name })}
                    >
                      <Box class="shrink-0 text-primary" size={15} />
                      <span class="flex min-w-0 flex-1 flex-col">
                        <strong class="truncate text-sm font-medium leading-tight">{project.project_name}</strong>
                        <small class="truncate text-xs text-muted-foreground">
                          {t(() => m.count_pages({ count: project.page_count }))}
                        </small>
                      </span>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function formatRank(rank: number): string {
  if (!Number.isFinite(rank)) {
    return "—";
  }
  const abs = Math.abs(rank);
  if (abs === 0) {
    return "0";
  }
  return abs < 0.001 ? rank.toExponential(1) : rank.toFixed(3);
}

export function renderSnippet(snippet: string) {
  return snippet
    .replaceAll("</mark>", "<mark>")
    .split("<mark>")
    .map((part, index) =>
      index % 2 === 1 ? (
        <mark class="rounded-sm bg-primary/20 px-0.5 text-inherit" data-index={index}>
          {part}
        </mark>
      ) : (
        <span data-index={index}>{part}</span>
      ),
    );
}
