import * as PopoverPrimitive from "@kobalte/core/popover";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { Box, Boxes, ChevronDown, ChevronRight, Search } from "lucide-solid";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";

import { t } from "~/lib/i18n";
import type { ProjectKey, WorkspaceWithProjects } from "~/lib/types";
import { highlightSegments } from "~/lib/utils";
import * as m from "~/paraglide/messages";

/**
 * Cascader-style switcher for workspaces + projects with search.
 *
 * UX pattern (Ant Design cascader / shadcn cascader):
 *   - Trigger button: `<workspace> [/ <project>]` + chevron.
 *   - Popover with a search input on top + two scrollable columns:
 *       * left  — workspaces (matched + non-matched dimmed when searching);
 *       * right — projects of the highlighted workspace (also matched/dimmed
 *         when searching).
 *   - When the search box has text, the popover collapses to a single flat
 *     list of matching `workspace / project` paths so users find leaves fast.
 *   - Click on a workspace row → selects workspace (open in "all projects"
 *     mode); click on a project leaf → selects that workspace + project.
 *
 * Built on `@kobalte/core/popover` so keyboard focus + outside-click + a11y
 * are handled. Search highlight is rendered via `<HighlightMatch>` which
 * splits the matched substring into `<mark>` segments.
 */
export function WorkspaceProjectCascader(props: {
  currentProject: string | null;
  currentWorkspace: string;
  onSelectProject: (key: ProjectKey) => void;
  onSelectWorkspace: (workspace: string) => void;
  workspaces: WorkspaceWithProjects[];
}) {
  const [open, setOpen] = createSignal(false);
  // `query`        — controlled input value (instant typing feedback).
  // `searchTerm`   — debounced 200ms; what the filter actually reads.
  // Decouples typing latency from filter cost (matters at thousands of items).
  const [query, setQuery] = createSignal("");
  const [searchTerm, setSearchTerm] = createSignal("");
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const handleQuery = (value: string) => {
    setQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setSearchTerm(value), 200);
  };
  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  const [hoveredWs, setHoveredWs] = createSignal<string | null>(null);

  // The workspace highlighted in the right column. Defaults to currentWorkspace,
  // tracks the hover, but falls back to the first one if neither is in the list.
  const activeWorkspace = createMemo<string>(() => {
    const hover = hoveredWs();
    if (hover && props.workspaces.some((w) => w.workspace_name === hover)) return hover;
    if (props.workspaces.some((w) => w.workspace_name === props.currentWorkspace)) {
      return props.currentWorkspace;
    }
    return props.workspaces[0]?.workspace_name ?? "";
  });

  const activeProjects = createMemo(
    () => props.workspaces.find((w) => w.workspace_name === activeWorkspace())?.projects ?? [],
  );

  // When searching, flatten into a single ranked list of "ws / project" pairs.
  // Empty project_name represents a workspace row (so workspace-only matches
  // are reachable too). Slice cap protects render from runaway queries — at
  // the virtualization-friendly tier (1k+) the user should narrow further.
  type Hit = { workspace: string; project: string | null; pageCount: number };
  const searchHits = createMemo<Hit[]>(() => {
    const q = searchTerm().trim().toLowerCase();
    if (!q) return [];
    const out: Hit[] = [];
    for (const ws of props.workspaces) {
      const wsMatch = ws.workspace_name.toLowerCase().includes(q);
      if (wsMatch) out.push({ pageCount: ws.page_count, project: null, workspace: ws.workspace_name });
      for (const p of ws.projects) {
        if (p.project_name.toLowerCase().includes(q) || wsMatch) {
          out.push({ pageCount: p.page_count, project: p.project_name, workspace: ws.workspace_name });
        }
      }
      if (out.length >= 500) break;
    }
    return out.slice(0, 500);
  });

  const close = () => {
    setOpen(false);
    setQuery("");
    setSearchTerm("");
  };
  const pickWorkspace = (workspace: string) => {
    close();
    props.onSelectWorkspace(workspace);
  };
  const pickProject = (workspace: string, project: string) => {
    close();
    props.onSelectProject({ workspace, project });
  };

  // Scrolling containers measured by each virtualizer.
  // - Refs are SIGNALS, not `let`-vars: Kobalte's Popover mounts content
  //   only when open, so the element appears post-mount; without a signal
  //   Solid can't notify the virtualizer that the scroll element exists.
  // - `count` is a getter property — `count: arr.length` is evaluated once
  //   at createVirtualizer() call and frozen; getters keep it reactive.
  // Row heights match the padded button (~44px).
  const [workspacesScrollEl, setWorkspacesScrollEl] = createSignal<HTMLDivElement | null>(null);
  const [projectsScrollEl, setProjectsScrollEl] = createSignal<HTMLDivElement | null>(null);
  const [hitsScrollEl, setHitsScrollEl] = createSignal<HTMLDivElement | null>(null);
  const ROW_PX = 44;
  const OVERSCAN = 6;

  const workspacesVirtualizer = createVirtualizer({
    get count() { return props.workspaces.length; },
    estimateSize: () => ROW_PX,
    getScrollElement: () => workspacesScrollEl(),
    overscan: OVERSCAN,
  });
  const projectsVirtualizer = createVirtualizer({
    get count() { return activeProjects().length; },
    estimateSize: () => ROW_PX,
    getScrollElement: () => projectsScrollEl(),
    overscan: OVERSCAN,
  });
  const hitsVirtualizer = createVirtualizer({
    get count() { return searchHits().length; },
    estimateSize: () => ROW_PX,
    getScrollElement: () => hitsScrollEl(),
    overscan: OVERSCAN,
  });

  return (
    <PopoverPrimitive.Root open={open()} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        as="button"
        class="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="workspace-switcher"
        type="button"
      >
        <Boxes class="shrink-0 text-primary" size={15} />
        <span class="max-sm:hidden">{props.currentWorkspace}</span>
        <Show when={props.currentProject}>
          {(scope) => (
            <>
              <span class="text-muted-foreground/50">/</span>
              <strong class="font-medium">{scope()}</strong>
            </>
          )}
        </Show>
        <ChevronDown class="text-muted-foreground" size={14} />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          class="z-50 mt-1 w-[28rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl outline-none data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0"
          data-testid="workspace-cascader-content"
        >
          <div class="border-b p-2">
            <div class="relative">
              <Search class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input
                autofocus
                class="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={t(() => m.cascader_search_placeholder())}
                type="text"
                value={query()}
                onInput={(e) => handleQuery(e.currentTarget.value)}
              />
            </div>
          </div>
          {/* Search hits view (flat virtualized list) */}
          <Show when={searchTerm().trim()}>
            <Show
              fallback={
                <p class="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t(() => m.cascader_no_results())}
                </p>
              }
              when={searchHits().length > 0}
            >
              <div ref={setHitsScrollEl} class="h-80 overflow-y-auto p-1">
                <div style={{ height: `${hitsVirtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
                  <For each={hitsVirtualizer.getVirtualItems()}>
                    {(vItem) => {
                      const hit = searchHits()[vItem.index]!;
                      return (
                        <button
                          class="absolute left-0 right-0 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
                          style={{ height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
                          type="button"
                          onClick={() => {
                            if (hit.project) pickProject(hit.workspace, hit.project);
                            else pickWorkspace(hit.workspace);
                          }}
                        >
                          <Show
                            fallback={<Boxes class="shrink-0 text-primary" size={15} />}
                            when={hit.project}
                          >
                            <Box class="shrink-0 text-primary" size={15} />
                          </Show>
                          <span class="flex min-w-0 flex-1 items-center gap-1 truncate">
                            <HighlightMatch query={searchTerm()} text={hit.workspace} />
                            <Show when={hit.project}>
                              {(p) => (
                                <>
                                  <span class="text-muted-foreground/50">/</span>
                                  <HighlightMatch query={searchTerm()} text={p()} />
                                </>
                              )}
                            </Show>
                          </span>
                          <small class="shrink-0 text-xs text-muted-foreground">
                            {t(() => m.count_pages({ count: hit.pageCount }))}
                          </small>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
          {/* Two-column cascader view (no active search) */}
          <Show when={!searchTerm().trim()}>
            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x">
              {/* Left: workspaces (virtualized) */}
              <div ref={setWorkspacesScrollEl} class="h-80 overflow-y-auto p-1">
                <div style={{ height: `${workspacesVirtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
                  <For each={workspacesVirtualizer.getVirtualItems()}>
                    {(vItem) => {
                      const ws = props.workspaces[vItem.index]!;
                      return (
                        <button
                          class="absolute left-0 right-0 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
                          classList={{
                            "bg-selected text-primary":
                              activeWorkspace() === ws.workspace_name && props.currentProject === null,
                            "bg-hover": activeWorkspace() === ws.workspace_name,
                          }}
                          style={{ height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
                          type="button"
                          onMouseEnter={() => setHoveredWs(ws.workspace_name)}
                          onClick={() => pickWorkspace(ws.workspace_name)}
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
                      );
                    }}
                  </For>
                </div>
              </div>
              {/* Right: projects of the active workspace (virtualized) */}
              <div ref={setProjectsScrollEl} class="h-80 overflow-y-auto p-1">
                <Show
                  fallback={
                    <p class="px-3 py-6 text-center text-xs text-muted-foreground">
                      {t(() => m.cascader_no_projects())}
                    </p>
                  }
                  when={activeProjects().length > 0}
                >
                  <div style={{ height: `${projectsVirtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
                    <For each={projectsVirtualizer.getVirtualItems()}>
                      {(vItem) => {
                        // Memo so the data binding tracks `activeProjects()`.
                        // `<For>` doesn't re-run the callback when virtual items
                        // keep the same identity (same count + scroll), so a
                        // direct read here would freeze on the previous
                        // workspace's projects when hover switches between two
                        // same-sized workspaces.
                        const project = createMemo(() => activeProjects()[vItem.index]!);
                        return (
                          <button
                            class="absolute left-0 right-0 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
                            classList={{
                              "bg-selected text-primary":
                                props.currentProject === project().project_name &&
                                props.currentWorkspace === project().workspace_name,
                            }}
                            style={{ height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
                            type="button"
                            onClick={() => pickProject(project().workspace_name, project().project_name)}
                          >
                            <Box class="shrink-0 text-primary" size={15} />
                            <span class="flex min-w-0 flex-1 flex-col">
                              <strong class="truncate text-sm font-medium leading-tight">{project().project_name}</strong>
                              <small class="truncate text-xs text-muted-foreground">
                                {t(() => m.count_pages({ count: project().page_count }))}
                              </small>
                            </span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Splits `text` around case-insensitive matches of `query` and wraps each
 *  match in a primary-color `<mark>` so the user can see WHY a result was
 *  ranked. Pure presentational helper used by `<WorkspaceProjectCascader>`. */
export function HighlightMatch(props: { query: string; text: string }) {
  const segments = createMemo(() => highlightSegments(props.query, props.text));
  return (
    <span class="truncate">
      <For each={segments()}>
        {(seg) => (
          <Show fallback={<>{seg.text}</>} when={seg.match}>
            <mark class="bg-transparent font-semibold text-primary">{seg.text}</mark>
          </Show>
        )}
      </For>
    </span>
  );
}
