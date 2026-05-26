import { Link, useLocation, useNavigate } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import {
  Activity,
  AlertTriangle,
  Box,
  Boxes,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  CornerDownLeft,
  FileText,
  Folder,
  FolderOpen,
  History,
  LayoutDashboard,
  ListTree,
  Loader2,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
} from "lucide-solid";
import type { Accessor, JSX } from "solid-js";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

import { Button } from "~/components/button";
import { Markdown, stripFrontmatter } from "~/components/markdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/select";
import { Skeleton } from "~/components/skeleton";
import { APP_NAME, APP_TAGLINE } from "~/lib/brand";
import { history, recordVisit } from "~/lib/history";
import type { VisitEntry } from "~/lib/history";
import { locales, switchLocale, t, useLocale } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";
import { theme, toggleTheme } from "~/lib/theme";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";
import {
  briefing,
  listPages,
  listProjects,
  listWorkspaces,
  readPage,
  recentPages,
  searchPages,
  workspaceExtras,
} from "~/lib/api";
import type {
  ApiPage,
  BriefingSnapshot,
  PageSummary,
  ProjectKey,
  ProjectSummary,
  SearchHit,
  WorkspaceExtras,
  WorkspaceSummary,
} from "~/lib/types";

type SearchMode = "global" | "project" | "workspace";

interface AppRouteSelection {
  workspace: string | null;
  project: string | null;
  path: string | null;
}

type DocView = "overview" | "documents";

interface AppProps {
  routeSelection: Accessor<AppRouteSelection>;
}

interface NavigatePageInput {
  key: ProjectKey;
  path: string;
  replace?: boolean;
}

interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
}

// Estado de UI do file-tree em escopo de módulo: o App é remontado ao alternar
// entre rota de projeto e rota de página (componentes distintos no TanStack
// Router), então signals locais seriam resetados. Em escopo de módulo eles
// sobrevivem ao remount — é o que faz "selecionar projeto" surtir efeito.
const [treeScope, setTreeScope] = createSignal<string | null>(null); // null = workspace inteiro
const [treeWidth, setTreeWidth] = createSignal(280);
// Aba ativa da topbar (segmented): visão geral vs. file-tree (documentos).
const [docView, setDocView] = createSignal<DocView>("overview");
// Pastas começam expandidas; rastreamos apenas as recolhidas pelo usuário.
const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
const [expandedProjects, setExpandedProjects] = createSignal<Set<string>>(new Set());

function App(props: AppProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchDraft, setSearchDraft] = createSignal("");
  const [searchMode, setSearchMode] = createSignal<SearchMode>("project");
  const [submittedQuery, setSubmittedQuery] = createSignal("");
  const [submittedSearchMode, setSubmittedSearchMode] = createSignal<SearchMode>("project");
  const [submittedScopes, setSubmittedScopes] = createSignal<ProjectKey[]>([]);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [treeFilter, setTreeFilter] = createSignal("");

  const workspaces$ = useQuery<WorkspaceSummary[]>(() => ({
    queryFn: listWorkspaces,
    queryKey: ["workspaces"],
    staleTime: 15_000,
  }));
  const workspacesData = createMemo(() => {
    if (workspaces$.isPending || workspaces$.isError) {
      return [];
    }
    return workspaces$.data ?? [];
  });

  const projects$ = useQuery<ProjectSummary[]>(() => ({
    queryFn: listProjects,
    queryKey: ["projects"],
    staleTime: 15_000,
  }));
  const projectsData = createMemo(() => {
    if (projects$.isPending || projects$.isError) {
      return [];
    }
    return projects$.data ?? [];
  });

  // Sem workspace → tela inicial (seleção de namespace).
  // Workspace sem projeto → workspace overview. Com projeto → project view.
  const selectedWorkspace = createMemo(() => props.routeSelection().workspace);
  const selectedKey = createMemo<ProjectKey | null>(() => {
    const workspace = props.routeSelection().workspace;
    const project = props.routeSelection().project;
    return workspace && project ? { project, workspace } : null;
  });
  const isHome = createMemo(() => !selectedWorkspace());
  const isWorkspaceOnly = createMemo(() => Boolean(selectedWorkspace()) && !props.routeSelection().project);

  const pages$ = useQuery<PageSummary[]>(() => {
    const key = selectedKey();
    return {
      enabled: Boolean(key),
      queryFn: () => (key ? listPages(key) : Promise.resolve([])),
      queryKey: ["pages", key?.workspace ?? "", key?.project ?? ""],
      staleTime: 15_000,
    };
  });

  const recent$ = useQuery<PageSummary[]>(() => {
    const key = selectedKey();
    return {
      enabled: Boolean(key),
      queryFn: () => (key ? recentPages(key) : Promise.resolve([])),
      queryKey: ["recent", key?.workspace ?? "", key?.project ?? ""],
      staleTime: 15_000,
    };
  });

  const briefing$ = useQuery<BriefingSnapshot | null>(() => {
    const key = selectedKey();
    return {
      enabled: Boolean(key),
      queryFn: () => (key ? briefing(key) : Promise.resolve(null)),
      queryKey: ["briefing", key?.workspace ?? "", key?.project ?? ""],
      staleTime: 15_000,
    };
  });
  const pagesData = createMemo(() => {
    if (pages$.isPending || pages$.isError) {
      return [];
    }
    return pages$.data ?? [];
  });
  const recentData = createMemo(() => {
    if (recent$.isPending || recent$.isError) {
      return [];
    }
    return recent$.data ?? [];
  });
  const briefingData = createMemo(() => {
    if (briefing$.isPending || briefing$.isError) {
      return null;
    }
    return briefing$.data ?? null;
  });

  const selectedPath = createMemo(() => {
    const routePath = props.routeSelection().path;
    return routePath ?? recentData()[0]?.path ?? pagesData()[0]?.path ?? null;
  });

  const page$ = useQuery<ApiPage | null>(() => {
    const key = selectedKey();
    const path = selectedPath();
    return {
      enabled: Boolean(key && path),
      queryFn: () => (key && path ? readPage(key, path) : Promise.resolve(null)),
      queryKey: ["page", key?.workspace ?? "", key?.project ?? "", path ?? ""],
      staleTime: 15_000,
    };
  });

  // Projetos do workspace atual — raízes do file-tree.
  const workspaceProjects = createMemo(() => {
    const ws = selectedWorkspace();
    if (!ws) {
      return [];
    }
    return projectsData().filter((project) => project.workspace_name === ws);
  });

  // Páginas de TODOS os projetos do workspace (file-tree multi-projeto).
  const workspacePages$ = useQuery<ProjectPages[]>(() => {
    const projects = workspaceProjects();
    const ws = selectedWorkspace();
    return {
      enabled: Boolean(ws) && projects.length > 0,
      queryFn: () =>
        Promise.all(
          projects.map(async (project) => ({
            pageCount: project.page_count,
            pages: await listPages({ project: project.project_name, workspace: project.workspace_name }),
            project: project.project_name,
            workspace: project.workspace_name,
          })),
        ),
      queryKey: ["workspace-pages", ws ?? "", projects.map((p) => p.project_name).join(",")],
      staleTime: 15_000,
    };
  });
  const workspacePagesData = createMemo(() => {
    if (workspacePages$.isPending || workspacePages$.isError) {
      return [];
    }
    return workspacePages$.data ?? [];
  });

  // Extras do workspace overview (handoff, briefing, saúde) — fixtures/degrada.
  const workspaceExtras$ = useQuery<WorkspaceExtras | null>(() => {
    const ws = selectedWorkspace();
    return {
      enabled: Boolean(ws) && isWorkspaceOnly(),
      queryFn: () => (ws ? workspaceExtras(ws) : Promise.resolve(null)),
      queryKey: ["workspace-extras", ws ?? ""],
      staleTime: 15_000,
    };
  });
  const workspaceExtrasData = createMemo(() => {
    if (workspaceExtras$.isPending || workspaceExtras$.isError) {
      return null;
    }
    return workspaceExtras$.data ?? null;
  });

  // Escopo "workspace" da busca = todos os projetos do workspace (via POST scopes).
  const workspaceScopes = createMemo<ProjectKey[]>(() => workspaceProjects().map(keyOf));

  const submittedScopeIds = createMemo(() => submittedScopes().map(scopeId).join("|"));
  const search$ = useQuery<SearchHit[]>(() => {
    const term = submittedQuery();
    const mode = submittedSearchMode();
    const key = mode === "project" ? selectedKey() : null;
    const scopes = mode === "workspace" ? submittedScopes() : [];
    return {
      enabled: term.length > 0 && (mode === "global" || Boolean(key) || scopes.length > 0),
      queryFn: () => searchPages(term, { key, scopes }),
      queryKey: [
        "search",
        term,
        mode,
        key?.workspace ?? "all",
        key?.project ?? "all",
        submittedScopeIds(),
      ],
      staleTime: 15_000,
    };
  });
  const pageData = createMemo(() => {
    if (page$.isPending || page$.isError) {
      return null;
    }
    return page$.data ?? null;
  });
  const searchData = createMemo(() => {
    if (search$.isPending || search$.isError) {
      return [];
    }
    return search$.data ?? [];
  });

  const treeFiltering = createMemo(() => treeFilter().trim().length > 0);
  const treeForest = createMemo(() =>
    buildWorkspaceForest(
      workspacePagesData().filter((entry) => !treeScope() || entry.project === treeScope()),
      treeFilter().trim().toLowerCase(),
    ),
  );

  onMount(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (paletteOpen()) {
          setPaletteOpen(false);
        } else {
          openPalette();
        }
        return;
      }
      if (event.key === "Escape" && paletteOpen()) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

  function navigateToPage(input: NavigatePageInput) {
    if (isCurrentPageRoute(location().pathname, input.key, input.path)) {
      return;
    }
    void navigate({
      params: {
        _splat: input.path,
        project: input.key.project,
        workspace: input.key.workspace,
      },
      replace: input.replace,
      to: "/projects/$workspace/$project/pages/$",
    });
  }

  function openWorkspace(workspace: string) {
    setDocView("overview");
    setTreeScope(null);
    void navigate({ params: { workspace }, to: "/projects/$workspace" });
  }

  function openProject(key: ProjectKey) {
    setDocView("overview");
    void navigate({
      params: { project: key.project, workspace: key.workspace },
      to: "/projects/$workspace/$project",
    });
  }

  function goHome() {
    void navigate({ to: "/" });
  }

  // Rota com página aberta (deep link, clique no file-tree) → aba Documentos.
  createEffect(() => {
    if (props.routeSelection().path) {
      setDocView("documents");
    }
  });

  // Registra a página aberta no histórico local (seção "Recentes" da home).
  createEffect(() => {
    const page = pageData();
    if (page) {
      recordVisit({
        kind: page.kind,
        path: page.path,
        project: page.project,
        title: page.title,
        workspace: page.workspace,
      });
    }
  });

  function openPalette() {
    // Em casa não há projeto → começa em escopo global.
    if (isHome()) {
      setSearchMode("global");
    }
    setPaletteOpen(true);
  }

  function submitSearch() {
    const mode = searchMode();
    setSubmittedSearchMode(mode);
    setSubmittedScopes(mode === "workspace" ? workspaceScopes() : []);
    setSubmittedQuery(searchDraft().trim());
  }

  // Busca ao vivo no command-palette (debounce implícito via cache do TanStack).
  function liveSearch(value: string) {
    setSearchDraft(value);
    submitSearch();
  }

  function selectHit(hit: SearchHit) {
    setPaletteOpen(false);
    setTreeScope(null); // mostra todos os projetos p/ a página aberta aparecer na árvore
    setDocView("documents");
    navigateToPage({ key: { project: hit.project, workspace: hit.workspace }, path: hit.path });
  }

  // Filtrando → tudo expandido p/ revelar os matches.
  const isFolderExpanded = (path: string) => treeFiltering() || !collapsed().has(path);
  function toggleFolder(path: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  const isProjectExpanded = (name: string) => treeFiltering() || expandedProjects().has(name);
  function toggleProject(name: string) {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }
  // O projeto da rota começa expandido no file-tree.
  createEffect(() => {
    const key = selectedKey();
    if (key) {
      setExpandedProjects((current) =>
        current.has(key.project) ? current : new Set(current).add(key.project),
      );
    }
  });

  return (
    <div class="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <Show when={isHome()}>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <HomeScreen
            onOpenDoc={(workspace, project, path) => {
              setDocView("documents");
              navigateToPage({ key: { project, workspace }, path });
            }}
            onOpenPalette={openPalette}
            onOpenWorkspace={openWorkspace}
            projects={projectsData()}
            recent={history()}
            workspaces={workspacesData()}
          />
        </div>
      </Show>
      <Show when={!isHome()}>
        <header class="flex h-14 shrink-0 items-center gap-3 border-b bg-toolbar px-4">
          <button
            aria-label="Início"
            class="flex shrink-0 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={goHome}
          >
            <Brain class="shrink-0 text-primary" size={26} />
            <span class="flex flex-col leading-tight max-sm:hidden">
              <strong class="text-sm font-semibold">{APP_NAME}</strong>
              <small class="text-xs text-muted-foreground">{APP_TAGLINE}</small>
            </span>
          </button>
          <button
            class="mx-auto flex w-full max-w-xl items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-left text-sm text-muted-foreground outline-none transition hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="search-trigger"
            type="button"
            onClick={openPalette}
          >
            <Search class="shrink-0" size={16} />
            <span class="min-w-0 flex-1 truncate">{t(() => m.search_placeholder())}</span>
            <kbd class="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-sm leading-none">⌘K</kbd>
          </button>
          <div class="flex shrink-0 items-center gap-1.5">
            <ViewSegmented view={docView()} onChange={setDocView} />
            <WorkspaceSwitcher
              onHome={goHome}
              onSelectProject={(key) => {
                setTreeScope(key.project);
                openProject(key);
              }}
              onSelectWorkspace={() => {
                setTreeScope(null);
                openWorkspace(selectedWorkspace() ?? "");
              }}
              projects={workspaceProjects()}
              scope={treeScope()}
              workspace={selectedWorkspace() ?? ""}
            />
            <LanguageSwitcher />
            <ThemeToggle />
            <Avatar />
          </div>
        </header>
        <Show when={docView() === "overview"}>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <OverviewPanel
              briefing={briefingData()}
              extras={workspaceExtrasData()}
              isWorkspace={isWorkspaceOnly()}
              onBack={() => (isWorkspaceOnly() ? goHome() : openWorkspace(selectedWorkspace() ?? ""))}
              onOpenDoc={(project, path) => {
                setDocView("documents");
                navigateToPage({ key: { project, workspace: selectedWorkspace() ?? "" }, path });
              }}
              onOpenPalette={openPalette}
              onOpenProject={openProject}
              project={props.routeSelection().project}
              projects={workspaceProjects()}
              recent={recentData()}
              workspace={selectedWorkspace() ?? ""}
              workspacePages={workspacePagesData()}
            />
          </div>
        </Show>
        <Show when={docView() === "documents"}>
        <div class="flex min-h-0 flex-1">
          <aside
            class="flex min-h-0 shrink-0 flex-col bg-sidebar max-lg:hidden"
            style={{ width: `${treeWidth()}px` }}
          >
            <div class="shrink-0 border-b p-2">
              <div class="relative">
                <Search
                  class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={14}
                />
                <input
                  aria-label={t(() => m.tree_filter_placeholder())}
                  class="w-full rounded-md border bg-background py-1.5 pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary"
                  data-testid="tree-filter"
                  placeholder={t(() => m.tree_filter_placeholder())}
                  value={treeFilter()}
                  onInput={(event) => setTreeFilter(event.currentTarget.value)}
                />
                <Show when={treeFilter().length > 0}>
                  <button
                    aria-label="Limpar filtro"
                    class="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground outline-none transition hover:bg-hover hover:text-foreground"
                    type="button"
                    onClick={() => setTreeFilter("")}
                  >
                    <X size={13} />
                  </button>
                </Show>
              </div>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto p-2">
              <Show
                fallback={
                  <EmptyState
                    body={t(() => m.tree_no_project_body())}
                    title={t(() => m.tree_no_project_title())}
                  />
                }
                when={selectedWorkspace()}
              >
                <QueryBoundary query={workspacePages$}>
                  <Show
                    fallback={
                      <EmptyState
                        body={treeFiltering() ? t(() => m.tree_filter_empty_body()) : t(() => m.tree_empty_body())}
                        title={treeFiltering() ? t(() => m.tree_filter_empty_title()) : t(() => m.tree_empty_title())}
                      />
                    }
                    when={treeForest().length > 0}
                  >
                    <div class="flex min-w-0 flex-col" data-testid="file-tree">
                      <FileTreeNodes
                        depth={0}
                        isFolderExpanded={isFolderExpanded}
                        isProjectExpanded={isProjectExpanded}
                        nodes={treeForest()}
                        onToggleFolder={toggleFolder}
                        onToggleProject={toggleProject}
                        selectedPath={selectedPath()}
                        selectedProject={selectedKey()?.project ?? null}
                      />
                    </div>
                  </Show>
                </QueryBoundary>
              </Show>
            </div>
          </aside>
          <ResizeHandle
            class="max-lg:hidden"
            onDelta={(dx) => setTreeWidth((width) => Math.min(480, Math.max(200, width + dx)))}
          />
          <main class="min-w-0 flex-1 overflow-y-auto bg-background">
            <Show
              fallback={
                <div class="p-8">
                  <EmptyState body={t(() => m.reader_empty_body())} title={t(() => m.reader_empty_title())} />
                </div>
              }
              when={selectedPath()}
            >
              <QueryBoundary query={page$}>
                <Show
                  fallback={
                    <div class="p-8">
                      <EmptyState body={t(() => m.reader_empty_body())} title={t(() => m.reader_empty_title())} />
                    </div>
                  }
                  when={pageData()}
                >
                  {(current) => <PageReader page={current()} />}
                </Show>
              </QueryBoundary>
            </Show>
          </main>
          <aside class="flex w-[19rem] min-h-0 shrink-0 flex-col overflow-y-auto border-l bg-secondary max-xl:hidden">
            <Show
              fallback={
                <div class="p-4">
                  <EmptyState body={t(() => m.inspector_select_project())} title={t(() => m.inspector_title())} />
                </div>
              }
              when={selectedKey()}
            >
              <CollapsibleSection icon={<Clock3 class="text-muted-foreground" size={15} />} title={t(() => m.inspector_recent())}>
                <QueryBoundary query={recent$}>
                  <div class="flex flex-col gap-2">
                    <For each={recentData()}>
                      {(item) => (
                        <Link
                          class="grid grid-cols-[auto_minmax(0,1fr)] grid-rows-2 gap-x-3 rounded-md p-1.5 text-left outline-none transition hover:bg-hover"
                          params={{
                            _splat: item.path,
                            project: selectedKey()?.project ?? "",
                            workspace: selectedKey()?.workspace ?? "",
                          }}
                          to="/projects/$workspace/$project/pages/$"
                        >
                          <span class="row-span-2 mt-1 size-2 rounded-full bg-primary" />
                          <strong class="truncate text-sm font-medium leading-tight">{item.title}</strong>
                          <small class="truncate text-xs text-muted-foreground">{formatDate(item.updated_at)}</small>
                        </Link>
                      )}
                    </For>
                  </div>
                </QueryBoundary>
              </CollapsibleSection>
              <CollapsibleSection icon={<ShieldCheck class="text-muted-foreground" size={15} />} title={t(() => m.inspector_briefing())}>
                <QueryBoundary query={briefing$}>
                  <Show when={briefingData()}>
                    {(snapshot) => <BriefingView briefing={snapshot()} />}
                  </Show>
                </QueryBoundary>
              </CollapsibleSection>
            </Show>
          </aside>
        </div>
        </Show>
      </Show>
      <CommandPalette
        loading={search$.isPending || search$.isFetching}
        mode={searchMode()}
        onClose={() => setPaletteOpen(false)}
        onInput={liveSearch}
        onModeChange={(mode) => {
          setSearchMode(mode);
          submitSearch();
        }}
        onSelect={selectHit}
        open={paletteOpen()}
        query={searchDraft()}
        results={searchData()}
        submitted={submittedQuery()}
      />
    </div>
  );
}

function ResizeHandle(props: { class?: string; onDelta: (dx: number) => void }) {
  function onPointerDown(event: PointerEvent) {
    event.preventDefault();
    let last = event.clientX;
    const move = (moveEvent: PointerEvent) => {
      props.onDelta(moveEvent.clientX - last);
      last = moveEvent.clientX;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  return (
    <div
      aria-hidden="true"
      class={cn("group relative w-1 shrink-0 cursor-col-resize", props.class)}
      onPointerDown={onPointerDown}
    >
      <div class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary" />
    </div>
  );
}

function CollapsibleSection(props: {
  children: JSX.Element;
  defaultOpen?: boolean;
  icon: JSX.Element;
  title: string;
}) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  return (
    <div class="flex flex-col border-b">
      <button
        class="flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold outline-none transition hover:bg-hover focus-visible:bg-hover"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span class="flex min-w-0 items-center gap-2">
          {props.icon}
          <span class="truncate">{props.title}</span>
        </span>
        <ChevronRight
          class={cn("shrink-0 text-muted-foreground transition-transform", open() && "rotate-90")}
          size={14}
        />
      </button>
      <Show when={open()}>
        <div class="px-4 pb-4">{props.children}</div>
      </Show>
    </div>
  );
}

const localeNames: Record<Locale, string> = {
  "en": "English",
  "es": "Español",
  "pt-BR": "Português",
};

const localeFlags: Record<Locale, string> = {
  "en": "🇺🇸",
  "es": "🇪🇸",
  "pt-BR": "🇧🇷",
};

function LanguageSwitcher() {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="relative">
      <button
        aria-label="Idioma"
        class="grid size-9 place-items-center rounded-md text-lg outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="language-switcher"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {localeFlags[useLocale()]}
      </button>
      <Show when={open()}>
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
          <For each={locales}>
            {(loc) => (
              <button
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover"
                classList={{ "bg-selected text-primary": useLocale() === loc }}
                type="button"
                onClick={() => {
                  switchLocale(loc);
                  setOpen(false);
                }}
              >
                <span class="text-base leading-none">{localeFlags[loc]}</span>
                <span class="truncate">{localeNames[loc]}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function Avatar() {
  return (
    <div
      class="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary"
      title="djalmajr"
    >
      DJ
    </div>
  );
}

function WorkspaceSwitcher(props: {
  onHome: () => void;
  onSelectProject: (key: ProjectKey) => void;
  onSelectWorkspace: () => void;
  projects: ProjectSummary[];
  scope: string | null;
  workspace: string;
}) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="relative">
      <button
        class="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="workspace-switcher"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <Boxes class="shrink-0 text-primary" size={15} />
        <span class="max-sm:hidden">{props.workspace}</span>
        <Show when={props.scope}>
          {(scope) => (
            <>
              <span class="text-muted-foreground/50">/</span>
              <strong class="font-medium">{scope()}</strong>
            </>
          )}
        </Show>
        <ChevronDown class="text-muted-foreground" size={14} />
      </button>
      <Show when={open()}>
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
          <button
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none transition hover:bg-hover"
            type="button"
            onClick={() => {
              setOpen(false);
              props.onHome();
            }}
          >
            <Brain class="shrink-0 text-muted-foreground" size={15} />
            {t(() => m.nav_home())}
          </button>
          <div class="my-1 border-t" />
          <button
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover"
            classList={{ "bg-selected text-primary": props.scope === null }}
            type="button"
            onClick={() => {
              setOpen(false);
              props.onSelectWorkspace();
            }}
          >
            <Boxes class="shrink-0 text-primary" size={16} />
            <span class="flex min-w-0 flex-1 flex-col">
              <strong class="truncate text-sm font-medium leading-tight">{props.workspace}</strong>
              <small class="truncate text-xs text-muted-foreground">{t(() => m.switcher_all_projects())}</small>
            </span>
          </button>
          <For each={props.projects}>
            {(project) => (
              <button
                class="flex w-full items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-left text-sm outline-none transition hover:bg-hover"
                classList={{ "bg-selected text-primary": props.scope === project.project_name }}
                type="button"
                onClick={() => {
                  setOpen(false);
                  props.onSelectProject(keyOf(project));
                }}
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
        </div>
      </Show>
    </div>
  );
}

// Segmented icon-only da topbar: alterna Visão geral ⟷ Documentos.
function ViewSegmented(props: { onChange: (view: DocView) => void; view: DocView }) {
  const cls = (active: boolean) =>
    cn(
      "grid size-7 place-items-center rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div aria-label="Visualização" class="flex items-center gap-0.5 rounded-lg border bg-muted p-0.5" role="group">
      <button
        aria-label="Visão geral"
        class={cls(props.view === "overview")}
        title="Visão geral"
        type="button"
        onClick={() => props.onChange("overview")}
      >
        <LayoutDashboard size={16} />
      </button>
      <button
        aria-label="Documentos"
        class={cls(props.view === "documents")}
        title="Documentos"
        type="button"
        onClick={() => props.onChange("documents")}
      >
        <ListTree size={16} />
      </button>
    </div>
  );
}

function ProjectOverviewBody(props: {
  briefing: BriefingSnapshot | null;
  onOpenDoc: (path: string) => void;
  recent: PageSummary[];
}) {
  return (
    <div class="grid grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] gap-5 max-lg:grid-cols-1">
      <section class="min-w-0 rounded-lg border bg-card p-1.5">
        <div class="mb-1 flex items-center gap-2 px-2 pt-1.5 text-sm font-semibold">
          <Clock3 class="text-muted-foreground" size={15} />
          {t(() => m.inspector_recent())}
        </div>
        <div class="flex flex-col">
          <For each={props.recent}>
            {(item) => (
              <button
                class="flex items-center gap-2 rounded-md p-2 text-left outline-none transition hover:bg-hover"
                type="button"
                onClick={() => props.onOpenDoc(item.path)}
              >
                <FileText class="shrink-0 text-muted-foreground" size={15} />
                <span class="flex min-w-0 flex-1 flex-col">
                  <strong class="truncate text-sm font-medium leading-tight">{item.title}</strong>
                  <small class="truncate text-xs text-muted-foreground">{item.path}</small>
                </span>
                <Show when={item.kind && item.kind.toLowerCase() !== "note"}>
                  <KindBadge kind={item.kind} />
                </Show>
                <small class="shrink-0 text-xs text-muted-foreground">{formatDate(item.updated_at)}</small>
              </button>
            )}
          </For>
        </div>
      </section>
      <aside class="flex min-w-0 flex-col gap-4">
        <div class="rounded-lg border bg-card p-4">
          <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck class="text-muted-foreground" size={15} />
            {t(() => m.inspector_briefing())}
          </div>
          <Show
            fallback={<small class="text-xs text-muted-foreground">{t(() => m.palette_searching())}</small>}
            when={props.briefing}
          >
            {(snapshot) => <BriefingView briefing={snapshot()} />}
          </Show>
        </div>
      </aside>
    </div>
  );
}

function kindCounts(pages: PageSummary[]): { count: number; kind: string }[] {
  const map = new Map<string, number>();
  for (const page of pages) {
    map.set(page.kind, (map.get(page.kind) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([kind, count]) => ({ count, kind }))
    .sort((a, b) => b.count - a.count);
}

function workspaceRecentDocs(entries: ProjectPages[]): (PageSummary & { project: string })[] {
  return entries
    .flatMap((entry) => entry.pages.map((page) => ({ ...page, project: entry.project })))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 6);
}

function HealthRow(props: { label: string; value: number }) {
  return (
    <div class="flex items-center justify-between">
      <span class="text-muted-foreground">{props.label}</span>
      <span
        class={cn(
          "grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold",
          props.value > 0 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {props.value}
      </span>
    </div>
  );
}

function WorkspaceOverviewBody(props: {
  extras: WorkspaceExtras | null;
  onOpenDoc: (project: string, path: string) => void;
  onOpenProject: (key: ProjectKey) => void;
  projects: ProjectSummary[];
  workspacePages: ProjectPages[];
}) {
  const pagesOf = (project: string) =>
    props.workspacePages.find((entry) => entry.project === project)?.pages ?? [];
  const recent = createMemo(() => workspaceRecentDocs(props.workspacePages));
  const copyHandoff = () => {
    const h = props.extras?.handoff;
    if (h && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(
        `${h.summary}\n\n${t(() => m.ws_handoff_questions())}:\n- ${h.open_questions.join("\n- ")}\n\n${t(() => m.ws_handoff_next())}:\n- ${h.next_steps.join("\n- ")}`,
      );
    }
  };
  return (
    <div class="flex flex-col gap-6">
      <Show when={props.extras?.handoff}>
        {(h) => (
          <section class="rounded-xl border border-primary/30 bg-accent/40 p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <History class="shrink-0 text-primary" size={20} />
                <div>
                  <h2 class="text-base font-semibold">{t(() => m.ws_handoff_title())}</h2>
                  <p class="text-xs text-muted-foreground">
                    handoff · {h().agent} · {formatRelative(h().at)} · {h().project}
                  </p>
                </div>
              </div>
              <button
                class="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={copyHandoff}
              >
                <Copy size={14} /> {t(() => m.ws_handoff_copy())}
              </button>
            </div>
            <p class="mt-3 text-sm">{h().summary}</p>
            <div class="mt-4 grid grid-cols-2 gap-5 max-sm:grid-cols-1">
              <div class="flex flex-col gap-2">
                <h3 class="text-xs font-bold uppercase text-muted-foreground">
                  {t(() => m.ws_handoff_questions())}
                </h3>
                <For each={h().open_questions}>
                  {(q) => (
                    <span class="flex items-start gap-2 text-sm">
                      <CircleHelp class="mt-0.5 shrink-0 text-muted-foreground" size={14} /> {q}
                    </span>
                  )}
                </For>
              </div>
              <div class="flex flex-col gap-2">
                <h3 class="text-xs font-bold uppercase text-muted-foreground">{t(() => m.ws_handoff_next())}</h3>
                <For each={h().next_steps}>
                  {(s) => (
                    <span class="flex items-start gap-2 text-sm">
                      <Check class="mt-0.5 shrink-0 text-primary" size={14} /> {s}
                    </span>
                  )}
                </For>
              </div>
            </div>
            <p class="mt-4 text-xs text-muted-foreground">{t(() => m.ws_handoff_note())}</p>
          </section>
        )}
      </Show>

      <div class="grid grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] gap-5 max-lg:grid-cols-1">
        <div class="flex min-w-0 flex-col gap-6">
          <section class="rounded-lg border bg-card p-1.5" data-testid="ws-projects">
            <div class="mb-3.5 flex items-center gap-2 px-2 pt-2.5 text-sm font-semibold">
              <Box class="text-muted-foreground" size={15} />
              {t(() => m.home_projects())}
            </div>
            <div class="flex flex-col">
              <For each={props.projects}>
                {(project) => {
                  const meta = () => {
                    const counts = kindCounts(pagesOf(project.project_name))
                      .map((kc) => `${kc.count} ${kc.kind}`)
                      .join(" · ");
                    const pages = t(() => m.count_pages({ count: project.page_count }));
                    return counts ? `${pages} · ${counts}` : pages;
                  };
                  return (
                    <button
                      class="flex items-center gap-3 rounded-md p-2 text-left outline-none transition hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                      onClick={() => props.onOpenProject(keyOf(project))}
                    >
                      <Box class="shrink-0 text-primary" size={16} />
                      <span class="flex min-w-0 flex-1 flex-col">
                        <strong class="truncate text-sm font-medium leading-tight">{project.project_name}</strong>
                        <small class="truncate text-xs text-muted-foreground">{meta()}</small>
                      </span>
                      <small class="shrink-0 text-xs text-muted-foreground">{formatRelative(project.last_updated)}</small>
                      <ChevronRight class="shrink-0 text-muted-foreground" size={15} />
                    </button>
                  );
                }}
              </For>
            </div>
          </section>

          <Show when={recent().length > 0}>
            <section class="rounded-lg border bg-card p-1.5">
              <div class="mb-3.5 flex items-center gap-2 px-2 pt-2.5 text-sm font-semibold">
                <FileText class="text-muted-foreground" size={15} />
                {t(() => m.ws_recent_docs())}
              </div>
              <div class="flex flex-col">
                <For each={recent()}>
                  {(item) => (
                    <button
                      class="flex items-center gap-2 rounded-md p-2 text-left outline-none transition hover:bg-hover"
                      type="button"
                      onClick={() => props.onOpenDoc(item.project, item.path)}
                    >
                      <FileText class="shrink-0 text-muted-foreground" size={15} />
                      <span class="flex min-w-0 flex-1 flex-col">
                        <strong class="truncate text-sm font-medium leading-tight">{item.title}</strong>
                        <small class="truncate text-xs text-muted-foreground">{item.project}</small>
                      </span>
                      <Show when={item.kind && item.kind.toLowerCase() !== "note"}>
                        <KindBadge kind={item.kind} />
                      </Show>
                      <small class="shrink-0 text-xs text-muted-foreground">{formatRelative(item.updated_at)}</small>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>
        </div>

        <aside class="flex min-w-0 flex-col gap-4">
          <Show when={props.extras?.briefing}>
            {(b) => (
              <div class="rounded-lg border bg-card p-4">
                <div class="mb-3.5 flex items-center gap-2 text-sm font-semibold">
                  <Activity class="text-muted-foreground" size={15} />
                  {t(() => m.inspector_briefing())}
                </div>
                <BriefingView briefing={b()} hidePendingHandoff />
              </div>
            )}
          </Show>
          <Show when={props.extras?.health}>
            {(health) => (
              <div class="rounded-lg border bg-card p-4">
                <div class="mb-3.5 flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck class="text-muted-foreground" size={15} />
                  {t(() => m.ws_health_title())}
                </div>
                <div class="flex flex-col gap-2 text-sm">
                  <HealthRow label={t(() => m.health_stale())} value={health().stale} />
                  <HealthRow label={t(() => m.health_duplicates())} value={health().duplicates} />
                  <HealthRow label={t(() => m.health_contradictions())} value={health().contradictions} />
                  <HealthRow label={t(() => m.health_orphans())} value={health().orphans} />
                </div>
                <p class="mt-3 font-mono text-xs text-muted-foreground">
                  {">_ "}
                  {t(() => m.health_audit())}
                </p>
              </div>
            )}
          </Show>
        </aside>
      </div>
    </div>
  );
}

function OverviewPanel(props: {
  briefing: BriefingSnapshot | null;
  extras: WorkspaceExtras | null;
  isWorkspace: boolean;
  onBack: () => void;
  onOpenDoc: (project: string, path: string) => void;
  onOpenPalette: () => void;
  onOpenProject: (key: ProjectKey) => void;
  project: string | null;
  projects: ProjectSummary[];
  recent: PageSummary[];
  workspace: string;
  workspacePages: ProjectPages[];
}) {
  const stats = createMemo(() => {
    const pages = props.projects.reduce((sum, p) => sum + p.page_count, 0);
    const last = props.projects.reduce<string | null>((acc, p) => {
      if (!p.last_updated) {
        return acc;
      }
      return !acc || p.last_updated > acc ? p.last_updated : acc;
    }, null);
    return { last, pages, projects: props.projects.length };
  });
  const projectSummary = createMemo(() => props.projects.find((p) => p.project_name === props.project) ?? null);
  const meta = () => {
    const updated = t(() => m.reader_updated()).toLowerCase();
    if (props.isWorkspace) {
      return `workspace · ${stats().projects} ${t(() => m.home_metric_projects()).toLowerCase()} · ${stats().pages} ${t(() => m.home_metric_pages()).toLowerCase()} · ${updated} ${formatRelative(stats().last)}`;
    }
    const sum = projectSummary();
    const pages = t(() => m.count_pages({ count: sum?.page_count ?? 0 }));
    return `${props.workspace} · ${pages} · ${updated} ${formatDate(sum?.last_updated)}`;
  };
  return (
    <div class="mx-auto flex min-w-0 max-w-5xl flex-col gap-6 p-6">
      <header class="flex flex-col gap-1">
        <button
          class="-ml-1 flex w-fit items-center gap-0.5 rounded-md py-0.5 pr-2 text-sm text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onClick={props.onBack}
        >
          <ChevronLeft size={16} />
          {props.isWorkspace ? t(() => m.nav_home()) : props.workspace}
        </button>
        <h1 class="text-2xl font-semibold leading-tight">
          {props.isWorkspace ? props.workspace : props.project}
        </h1>
        <p class="text-sm text-muted-foreground">{meta()}</p>
      </header>
      <Show
        fallback={
          <ProjectOverviewBody
            briefing={props.briefing}
            onOpenDoc={(path) => props.onOpenDoc(props.project ?? "", path)}
            recent={props.recent}
          />
        }
        when={props.isWorkspace}
      >
        <WorkspaceOverviewBody
          extras={props.extras}
          onOpenDoc={props.onOpenDoc}
          onOpenProject={props.onOpenProject}
          projects={props.projects}
          workspacePages={props.workspacePages}
        />
      </Show>
    </div>
  );
}

// Tela inicial = hub de entrada: busca + recentes + workspaces + stats.
function HomeScreen(props: {
  onOpenDoc: (workspace: string, project: string, path: string) => void;
  onOpenPalette: () => void;
  onOpenWorkspace: (workspace: string) => void;
  projects: ProjectSummary[];
  recent: VisitEntry[];
  workspaces: WorkspaceSummary[];
}) {
  const totalProjects = () => props.workspaces.reduce((sum, w) => sum + w.project_count, 0);
  const totalDocs = () => props.workspaces.reduce((sum, w) => sum + w.page_count, 0);
  const projectsOf = (ws: string) => props.projects.filter((p) => p.workspace_name === ws);
  return (
    <div class="relative flex min-h-full flex-col" data-testid="home-screen">
      <div class="absolute right-4 top-4 flex items-center gap-1.5">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-14">
        <div class="flex flex-col items-center gap-3 text-center">
          <Brain class="text-primary" size={60} />
          <div>
            <h1 class="text-2xl font-semibold leading-tight">{APP_NAME}</h1>
            <p class="text-sm text-muted-foreground">{t(() => m.home_tagline())}</p>
          </div>
        </div>

        <button
          class="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm text-muted-foreground shadow-sm outline-none transition hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="home-search"
          type="button"
          onClick={props.onOpenPalette}
        >
          <Search class="shrink-0" size={18} />
          <span class="min-w-0 flex-1 truncate">{t(() => m.search_placeholder())}</span>
          <kbd class="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-sm leading-none">⌘K</kbd>
        </button>

        <Show when={props.recent.length > 0}>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t(() => m.home_recent())}
            </h2>
            <div class="flex flex-col rounded-lg border bg-card p-1">
              <For each={props.recent}>
                {(item) => (
                  <button
                    class="flex items-center gap-2 rounded-md p-2 text-left outline-none transition hover:bg-hover"
                    type="button"
                    onClick={() => props.onOpenDoc(item.workspace, item.project, item.path)}
                  >
                    <FileText class="shrink-0 text-muted-foreground" size={15} />
                    <span class="flex min-w-0 flex-1 flex-col">
                      <strong class="truncate text-sm font-medium leading-tight">{item.title}</strong>
                      <small class="truncate text-xs text-muted-foreground">
                        {item.workspace} / {item.project}
                      </small>
                    </span>
                    <Show when={item.kind && item.kind.toLowerCase() !== "note"}>
                      <KindBadge kind={item.kind ?? ""} />
                    </Show>
                    <small class="shrink-0 text-xs text-muted-foreground">{formatRelative(item.at)}</small>
                  </button>
                )}
              </For>
            </div>
          </section>
        </Show>

        <section class="flex flex-col gap-2">
          <h2 class="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t(() => m.home_namespaces())}
          </h2>
          <div class="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <For each={props.workspaces}>
              {(ws) => (
                <button
                  class="flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm outline-none transition hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                  onClick={() => props.onOpenWorkspace(ws.workspace_name)}
                >
                  <span class="flex items-center justify-between">
                    <span class="grid size-9 place-items-center rounded-lg bg-accent text-primary">
                      <Boxes size={18} />
                    </span>
                    <ChevronRight class="text-muted-foreground" size={16} />
                  </span>
                  <strong class="text-base leading-tight">{ws.workspace_name}</strong>
                  <small class="text-xs text-muted-foreground">
                    {t(() => m.home_ws_meta({ docs: ws.page_count, projects: ws.project_count }))}
                  </small>
                  <Show when={projectsOf(ws.workspace_name).length > 0}>
                    <div class="flex flex-wrap gap-1">
                      <For each={projectsOf(ws.workspace_name).slice(0, 3)}>
                        {(p) => (
                          <span class="truncate rounded bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                            {p.project_name}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <small class="text-xs text-muted-foreground">{formatRelative(ws.last_updated)}</small>
                </button>
              )}
            </For>
          </div>
        </section>

        <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{t(() => m.home_workspaces_count({ count: props.workspaces.length }))}</span>
          <span>·</span>
          <span>{totalProjects()} {t(() => m.home_metric_projects()).toLowerCase()}</span>
          <span>·</span>
          <span>{totalDocs()} {t(() => m.home_metric_pages()).toLowerCase()}</span>
          <span>·</span>
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-success-foreground" />
            {t(() => m.status_connected())}
          </span>
        </div>
      </div>
    </div>
  );
}

function CommandPalette(props: {
  loading: boolean;
  mode: SearchMode;
  onClose: () => void;
  onInput: (value: string) => void;
  onModeChange: (mode: SearchMode) => void;
  onSelect: (hit: SearchHit) => void;
  open: boolean;
  query: string;
  results: SearchHit[];
  submitted: string;
}) {
  let inputRef: HTMLInputElement | undefined;
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
            <ScopeSelect mode={props.mode} onModeChange={props.onModeChange} />
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
                <div class="flex flex-col gap-1" data-testid="palette-results">
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
                          {hit.workspace}/{hit.project} · {hit.path}
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

function PaletteHint(props: { body: string; title: string }) {
  return (
    <div class="flex min-h-32 flex-col items-center justify-center gap-1 p-6 text-center">
      <strong class="text-sm">{props.title}</strong>
      <span class="max-w-72 text-sm text-muted-foreground">{props.body}</span>
    </div>
  );
}

function FileTreeNodes(props: {
  depth: number;
  isFolderExpanded: (path: string) => boolean;
  isProjectExpanded: (name: string) => boolean;
  nodes: TreeNode[];
  onToggleFolder: (path: string) => void;
  onToggleProject: (name: string) => void;
  selectedPath: string | null;
  selectedProject: string | null;
}) {
  return (
    <For each={props.nodes}>
      {(node) => {
        // Alinhamento (asciimark): slot do chevron = largura do ícone (16px) e
        // passo de recuo = ícone+gap, então o chevron do filho alinha com o
        // ícone do pai e o ícone do filho alinha com o texto do pai.
        const indent = () => `${props.depth * 20 + 8}px`;
        const expanded = () =>
          node.type === "project"
            ? props.isProjectExpanded(node.name)
            : props.isFolderExpanded(node.path);
        const selected = () =>
          node.type === "file" &&
          node.path === props.selectedPath &&
          node.project === props.selectedProject;
        const renderChildren = () => (
          <Show when={expanded()}>
            <FileTreeNodes
              depth={props.depth + 1}
              isFolderExpanded={props.isFolderExpanded}
              isProjectExpanded={props.isProjectExpanded}
              nodes={node.children}
              onToggleFolder={props.onToggleFolder}
              onToggleProject={props.onToggleProject}
              selectedPath={props.selectedPath}
              selectedProject={props.selectedProject}
            />
          </Show>
        );
        return (
          <Switch>
            <Match when={node.type === "file"}>
              <Link
                class={cn(
                  "flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-2 text-left outline-none transition hover:bg-hover focus-visible:bg-hover",
                  selected() && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
                )}
                data-testid={`page-${node.project}/${node.path}`}
                params={{ _splat: node.path, project: node.project, workspace: node.workspace }}
                style={{ "padding-left": indent() }}
                title={node.name}
                to="/projects/$workspace/$project/pages/$"
              >
                <span aria-hidden="true" class="w-4 shrink-0" />
                <FileText class={cn("shrink-0", selected() ? "opacity-100" : "opacity-70")} size={16} />
                <span class="min-w-0 flex-1 truncate text-sm">{node.name}</span>
              </Link>
            </Match>
            <Match when={node.type === "dir"}>
              <button
                class="flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-2 text-left outline-none transition hover:bg-hover focus-visible:bg-hover"
                style={{ "padding-left": indent() }}
                title={node.name}
                type="button"
                onClick={() => props.onToggleFolder(node.path)}
              >
                <span class="flex w-4 shrink-0 items-center justify-center">
                  <ChevronRight
                    class={cn("text-muted-foreground transition-transform", expanded() && "rotate-90")}
                    size={14}
                  />
                </span>
                <Show fallback={<Folder class="shrink-0 text-primary" size={16} />} when={expanded()}>
                  <FolderOpen class="shrink-0 text-primary" size={16} />
                </Show>
                <span class="min-w-0 flex-1 truncate text-sm">{node.name}</span>
              </button>
              {renderChildren()}
            </Match>
            <Match when={node.type === "project"}>
              <button
                class="flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-2 text-left outline-none transition hover:bg-hover focus-visible:bg-hover"
                style={{ "padding-left": indent() }}
                title={node.name}
                type="button"
                onClick={() => props.onToggleProject(node.name)}
              >
                <span class="flex w-4 shrink-0 items-center justify-center">
                  <ChevronRight
                    class={cn("text-muted-foreground transition-transform", expanded() && "rotate-90")}
                    size={14}
                  />
                </span>
                <Box class="shrink-0 text-primary" size={16} />
                <span class="min-w-0 flex-1 truncate text-sm font-semibold">{node.name}</span>
                <Show when={node.count !== undefined}>
                  <span class="shrink-0 rounded-full bg-accent px-1.5 text-[0.625rem] font-semibold text-accent-foreground">
                    {node.count}
                  </span>
                </Show>
              </button>
              {renderChildren()}
            </Match>
          </Switch>
        );
      }}
    </For>
  );
}

function PageReader(props: { page: ApiPage }) {
  return (
    <article class="min-w-0" data-testid="page-reader">
      <header class="border-b p-6">
        <nav aria-label="breadcrumb" class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span class="truncate">{props.page.workspace}</span>
          <span class="opacity-40">/</span>
          <span class="truncate">{props.page.project}</span>
          <For each={props.page.path.split("/")}>
            {(segment, index) => (
              <>
                <span class="opacity-40">/</span>
                <span
                  class="truncate"
                  classList={{
                    "font-medium text-foreground": index() === props.page.path.split("/").length - 1,
                  }}
                >
                  {segment}
                </span>
              </>
            )}
          </For>
        </nav>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <h3 class="text-2xl font-semibold tracking-normal">{props.page.title}</h3>
          <KindBadge kind={props.page.kind} />
          <Chip class="bg-muted text-muted-foreground">{props.page.tier}</Chip>
          <Show when={props.page.pinned}>
            <Chip class="bg-primary/15 text-primary">{t(() => m.reader_pinned())}</Chip>
          </Show>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          {t(() => m.reader_updated())} {formatDate(props.page.updated_at)}
          <Show when={props.page.supersedes}>
            {(supersedes) => (
              <>
                {" · "}
                {t(() => m.reader_supersedes())} {supersedes()}
              </>
            )}
          </Show>
        </p>
      </header>
      <Show when={frontmatterEntries(props.page.frontmatter).length > 0}>
        <Frontmatter entries={frontmatterEntries(props.page.frontmatter)} />
      </Show>
      <div class="min-w-0 p-6">
        <Markdown source={stripFrontmatter(props.page.body_markdown)} />
      </div>
    </article>
  );
}

function Frontmatter(props: { entries: [string, string][] }) {
  const [open, setOpen] = createSignal(false);
  return (
    <details
      class="group/fm border-b bg-muted/20 px-6 py-3"
      data-testid="frontmatter"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary class="flex cursor-pointer list-none items-center gap-2 text-xs font-bold uppercase text-muted-foreground outline-none">
        <ChevronRight class="transition group-open/fm:rotate-90" size={14} />
        {t(() => m.reader_frontmatter())}
        <span class="font-normal lowercase">({props.entries.length})</span>
      </summary>
      <Show when={open()}>
        <dl class="mt-3 grid grid-cols-[minmax(6rem,12rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <For each={props.entries}>
            {([key, value]) => (
              <>
                <dt class="truncate font-medium text-muted-foreground">{key}</dt>
                <dd class="min-w-0 break-words font-mono text-xs text-foreground/80">{value}</dd>
              </>
            )}
          </For>
        </dl>
      </Show>
    </details>
  );
}

function frontmatterEntries(frontmatter: Record<string, unknown>): [string, string][] {
  if (!frontmatter || typeof frontmatter !== "object") {
    return [];
  }
  return Object.entries(frontmatter).map(([key, value]) => {
    const text =
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    return [key, text] as [string, string];
  });
}

function BriefingView(props: { briefing: BriefingSnapshot; hidePendingHandoff?: boolean }) {
  return (
    <div class="flex flex-col gap-4" data-testid="briefing">
      <div class="grid grid-cols-3 gap-3">
        <Metric label={t(() => m.briefing_latest())} value={props.briefing.counts.pages_latest} />
        <Metric label={t(() => m.briefing_versions())} value={props.briefing.counts.pages_all} />
        <Metric label={t(() => m.briefing_sessions())} value={props.briefing.counts.sessions} />
        <Metric label={t(() => m.briefing_observations())} value={props.briefing.counts.observations} />
        <Metric label={t(() => m.briefing_pages_7d())} value={props.briefing.activity_7d.pages_updated} />
        <Metric label={t(() => m.briefing_pages_30d())} value={props.briefing.activity_30d.pages_updated} />
      </div>
      <Show when={!props.hidePendingHandoff && props.briefing.pending_handoff_count > 0}>
        <div class="flex items-center gap-2 rounded-lg border border-warning bg-warning/15 p-2.5 text-xs text-warning-foreground">
          <Clock3 size={14} />
          <span>
            {props.briefing.pending_handoff_count === 1
              ? t(() => m.briefing_pending_handoff({ count: props.briefing.pending_handoff_count }))
              : t(() => m.briefing_pending_handoffs({ count: props.briefing.pending_handoff_count }))}
          </span>
        </div>
      </Show>
      <Show when={props.briefing.last_observation_at}>
        {(at) => (
          <small class="text-xs text-muted-foreground">
            {t(() => m.briefing_last_observation({ date: formatDate(at()) }))}
          </small>
        )}
      </Show>
      <div class="flex flex-col gap-2">
        <Show
          fallback={<small class="text-muted-foreground">{t(() => m.briefing_no_rules())}</small>}
          when={props.briefing.rules.length > 0}
        >
          <div class="text-xs font-bold uppercase text-muted-foreground">{t(() => m.briefing_rules())}</div>
          <For each={props.briefing.rules}>
            {(rule) => (
              <div class="rounded-lg border bg-muted/40 p-3">
                <strong class="block truncate text-sm">{rule.title}</strong>
                <small class="block truncate text-xs text-muted-foreground">{rule.path}</small>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

function ThemeToggle() {
  return (
    <Button
      aria-label="Toggle color theme"
      class="ml-auto size-9 shrink-0"
      data-testid="theme-toggle"
      size="icon"
      variant="ghost"
      onClick={toggleTheme}
    >
      <Show fallback={<Moon size={16} />} when={theme() === "dark"}>
        <Sun size={16} />
      </Show>
    </Button>
  );
}

const SCOPE_OPTIONS: SearchMode[] = ["project", "workspace", "global"];
function scopeLabel(mode: SearchMode): string {
  if (mode === "project") {
    return t(() => m.palette_scope_project());
  }
  if (mode === "workspace") {
    return t(() => m.palette_scope_workspace());
  }
  return t(() => m.palette_scope_global());
}

// Escopo da busca como Select (solid-ui/Kobalte), à esquerda do input do ⌘K.
function ScopeSelect(props: { mode: SearchMode; onModeChange: (mode: SearchMode) => void }) {
  return (
    <Select<SearchMode>
      options={SCOPE_OPTIONS}
      value={props.mode}
      onChange={(value) => value && props.onModeChange(value)}
      itemComponent={(itemProps) => (
        <SelectItem item={itemProps.item}>{scopeLabel(itemProps.item.rawValue)}</SelectItem>
      )}
    >
      <SelectTrigger aria-label="Escopo da busca" class="h-8 shrink-0 text-xs font-medium">
        <SelectValue<SearchMode>>{(state) => scopeLabel(state.selectedOption())}</SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>
  );
}

function QueryBoundary<T>(props: { children: JSX.Element; query: QueryState<T> }) {
  const hasData = () => {
    if (props.query.isPending || props.query.isError) {
      return false;
    }
    return props.query.data !== undefined;
  };
  return (
    <Switch>
      <Match when={props.query.isError && !hasData()}>
        <div class="flex min-h-32 items-center justify-center gap-2 p-4 text-sm text-destructive" role="alert">
          <AlertTriangle size={18} />
          <span>{props.query.error?.message ?? "Request failed"}</span>
        </div>
      </Match>
      <Match when={props.query.isPending && !hasData()}>
        <div class="flex min-h-32 flex-col justify-center gap-3 p-4">
          <Skeleton class="h-4 w-3/4 rounded-md" />
          <Skeleton class="h-4 w-1/2 rounded-md" />
          <Skeleton class="h-20 w-full rounded-md" />
        </div>
      </Match>
      <Match when={true}>{props.children}</Match>
    </Switch>
  );
}

function EmptyState(props: { body: string; title: string }) {
  return (
    <div class="flex min-h-32 flex-col items-center justify-center gap-1 text-center">
      <strong class="text-sm">{props.title}</strong>
      <span class="max-w-64 text-sm text-muted-foreground">{props.body}</span>
    </div>
  );
}

// Chip discreto e uniforme — base compartilhada por kind/tier/pinned.
function Chip(props: { children: JSX.Element; class?: string }) {
  return (
    <span
      class={cn(
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[0.625rem] font-medium lowercase leading-4 tracking-wide",
        props.class,
      )}
    >
      {props.children}
    </span>
  );
}

// Badge discreto — bg colorido suave por kind, sem cor de borda.
function KindBadge(props: { kind: string }) {
  const tone = () => {
    switch (props.kind.toLowerCase()) {
      case "rule":
        return "bg-success text-success-foreground";
      case "decision":
        return "bg-warning text-warning-foreground";
      case "gotcha":
        return "bg-error text-error-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };
  return <Chip class={tone()}>{props.kind}</Chip>;
}

function Metric(props: { inverted?: boolean; label: string; value: number }) {
  return (
    <div class="min-w-0">
      <strong class="block text-xl leading-none">{props.value}</strong>
      <small class={props.inverted ? "text-xs text-sidebar-foreground/60" : "text-xs text-muted-foreground"}>
        {props.label}
      </small>
    </div>
  );
}

function keyOf(project: ProjectSummary): ProjectKey {
  return {
    project: project.project_name,
    workspace: project.workspace_name,
  };
}

function scopeId(key: ProjectKey): string {
  return `${key.workspace}/${key.project}`;
}

function isCurrentPageRoute(pathname: string, key: ProjectKey, path: string): boolean {
  return decodePathname(pathname).endsWith(`${projectRouteTail(key)}/pages/${path}`);
}

function projectRouteTail(key: ProjectKey): string {
  return `/projects/${key.workspace}/${key.project}`;
}

function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

type TreeNodeType = "project" | "dir" | "file";

interface TreeNode {
  type: TreeNodeType;
  name: string;
  path: string; // file: path da página; dir: path do diretório; project: nome do projeto
  project: string;
  workspace: string;
  kind?: string;
  count?: number; // total de páginas (apenas em nós de projeto)
  children: TreeNode[];
}

interface ProjectPages {
  pageCount: number;
  pages: PageSummary[];
  project: string;
  workspace: string;
}

/** Forest do workspace: cada projeto é uma raiz, com sua árvore de páginas. */
function buildWorkspaceForest(entries: ProjectPages[], filter: string): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const entry of entries) {
    const pages = filter
      ? entry.pages.filter((page) => `${page.title} ${page.path}`.toLowerCase().includes(filter))
      : entry.pages;
    if (filter && pages.length === 0) {
      continue;
    }
    roots.push({
      children: buildPageNodes(pages, entry.workspace, entry.project),
      count: entry.pageCount,
      name: entry.project,
      path: `proj:${entry.workspace}/${entry.project}`,
      project: entry.project,
      type: "project",
      workspace: entry.workspace,
    });
  }
  return roots;
}

/** Árvore de diretórios/arquivos de um projeto, a partir dos paths das páginas. */
function buildPageNodes(pages: PageSummary[], workspace: string, project: string): TreeNode[] {
  const root: TreeNode = { children: [], name: "", path: "", project, type: "dir", workspace };
  for (const page of pages) {
    const segments = page.path.split("/");
    let cursor = root;
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      if (isFile) {
        cursor.children.push({
          children: [],
          kind: page.kind,
          name: page.title || segment,
          path: page.path,
          project,
          type: "file",
          workspace,
        });
        return;
      }
      const dirPath = segments.slice(0, index + 1).join("/");
      let dir = cursor.children.find((child) => child.type === "dir" && child.path === dirPath);
      if (!dir) {
        dir = { children: [], name: segment, path: dirPath, project, type: "dir", workspace };
        cursor.children.push(dir);
      }
      cursor = dir;
    });
  }
  sortTreeNode(root);
  return root.children;
}

function sortTreeNode(node: TreeNode): void {
  node.children.sort((a, b) => {
    if ((a.type === "dir") !== (b.type === "dir")) {
      return a.type === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.type === "dir") {
      sortTreeNode(child);
    }
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return m.recent_no_updates();
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

// Tempo relativo localizado ("há 2 minutos"), rastreando o locale ativo.
function formatRelative(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  const ms = typeof value === "number" ? value : new Date(value).valueOf();
  if (Number.isNaN(ms)) {
    return String(value);
  }
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(useLocale(), { numeric: "auto" });
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (abs < MIN) {
    return rtf.format(0, "minute");
  }
  if (abs < HOUR) {
    return rtf.format(Math.round(diff / MIN), "minute");
  }
  if (abs < DAY) {
    return rtf.format(Math.round(diff / HOUR), "hour");
  }
  return rtf.format(Math.round(diff / DAY), "day");
}

function formatRank(rank: number): string {
  if (!Number.isFinite(rank)) {
    return "—";
  }
  const abs = Math.abs(rank);
  if (abs === 0) {
    return "0";
  }
  return abs < 0.001 ? rank.toExponential(1) : rank.toFixed(3);
}

function renderSnippet(snippet: string) {
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

export type { AppRouteSelection };
export default App;
