import { Link, useLocation, useNavigate } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import {
  Activity,
  AlertTriangle,
  Box,
  Boxes,
  Brain,
  Calendar,
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
  Globe,
  Hash,
  History,
  Layers,
  LayoutDashboard,
  Link2,
  List,
  ListTree,
  Loader2,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Tag,
  Type,
  Users,
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

import * as PopoverPrimitive from "@kobalte/core/popover";
import { createVirtualizer } from "@tanstack/solid-virtual";

import { Button } from "~/components/button";
import { Markdown, stripFrontmatter } from "~/components/markdown";
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
  projectOverview,
  readPage,
  recentPages,
  searchPages,
  workspaceOverview,
} from "~/lib/api";
import type {
  ApiPage,
  BriefingSnapshot,
  HealthPage,
  MemoryHealth,
  PageSummary,
  ProjectKey,
  ProjectSummary,
  RelatedPage,
  SearchHit,
  WorkspaceOverview,
  WorkspaceHandoff,
  WorkspaceSummary,
  WorkspaceWithProjects,
} from "~/lib/types";

// Explicit search scope chosen via the cascader.
type SearchTarget =
  | { kind: "global" }
  | { kind: "workspace"; workspace: string }
  | { kind: "project"; workspace: string; project: string };

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
  const [searchTarget, setSearchTarget] = createSignal<SearchTarget>({ kind: "global" });
  const [submittedQuery, setSubmittedQuery] = createSignal("");
  const [submittedSearchTarget, setSubmittedSearchTarget] = createSignal<SearchTarget>({ kind: "global" });
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

  // Tree (workspace → projects) used by the cascader switcher. Built
  // client-side from the two flat lists already fetched above so the
  // switcher can show everything in one popover (search included)
  // without firing per-workspace requests.
  const workspacesWithProjects = createMemo<WorkspaceWithProjects[]>(() => {
    const wsList = workspacesData();
    const projList = projectsData();
    return wsList.map((ws) => ({
      ...ws,
      projects: projList.filter((p) => p.workspace_name === ws.workspace_name),
    }));
  });

  // Sem workspace → tela inicial (seleção de workspace).
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

  // Overview do workspace overview (handoff, briefing, saúde) — fixtures/degrada.
  const workspaceOverview$ = useQuery<WorkspaceOverview | null>(() => {
    const ws = selectedWorkspace();
    return {
      enabled: Boolean(ws) && isWorkspaceOnly(),
      queryFn: () => (ws ? workspaceOverview(ws) : Promise.resolve(null)),
      queryKey: ["workspace-overview", ws ?? ""],
      staleTime: 15_000,
    };
  });
  const workspaceOverviewData = createMemo(() => {
    if (workspaceOverview$.isPending || workspaceOverview$.isError) {
      return null;
    }
    return workspaceOverview$.data ?? null;
  });

  // Overview do projeto (handoff, briefing e saúde escopados ao projeto) — só no
  // overview de um projeto selecionado; degrada p/ null.
  const projectOverview$ = useQuery<WorkspaceOverview | null>(() => {
    const key = selectedKey();
    const enabled = Boolean(key) && !isWorkspaceOnly();
    return {
      enabled,
      queryFn: () => (key ? projectOverview(key) : Promise.resolve(null)),
      queryKey: ["project-overview", key?.workspace ?? "", key?.project ?? ""],
      staleTime: 15_000,
    };
  });
  const projectOverviewData = createMemo(() => {
    if (projectOverview$.isPending || projectOverview$.isError) {
      return null;
    }
    return projectOverview$.data ?? null;
  });

  // Expand a target into ({ key | scopes } + enabled) for searchPages.
  // - `global`: no key, no scopes (server searches everything).
  // - `workspace`: scopes = every project in that workspace (POST body).
  // - `project`: key = { workspace, project } (GET param).
  function targetParams(target: SearchTarget, wsList: WorkspaceWithProjects[]): {
    key: ProjectKey | null;
    scopes: ProjectKey[];
  } {
    if (target.kind === "project") return { key: { project: target.project, workspace: target.workspace }, scopes: [] };
    if (target.kind === "workspace") {
      const ws = wsList.find((w) => w.workspace_name === target.workspace);
      return { key: null, scopes: ws?.projects.map(keyOf) ?? [] };
    }
    return { key: null, scopes: [] };
  }

  const search$ = useQuery<SearchHit[]>(() => {
    const term = submittedQuery();
    const target = submittedSearchTarget();
    const { key, scopes } = targetParams(target, workspacesWithProjects());
    return {
      enabled: term.length > 0 && (target.kind === "global" || Boolean(key) || scopes.length > 0),
      queryFn: () => searchPages(term, { key, scopes }),
      queryKey: [
        "search",
        term,
        target.kind,
        key?.workspace ?? "all",
        key?.project ?? "all",
        scopes.map(scopeId).join("|"),
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
    // Default target inferred from the current route: a project page →
    // search inside that project; a workspace page → that workspace;
    // home (or anything without context) → global.
    const key = selectedKey();
    if (key) {
      setSearchTarget({ kind: "project", workspace: key.workspace, project: key.project });
    } else {
      const sel = props.routeSelection();
      if (sel.workspace) setSearchTarget({ kind: "workspace", workspace: sel.workspace });
      else setSearchTarget({ kind: "global" });
    }
    setPaletteOpen(true);
  }

  function submitSearch() {
    setSubmittedSearchTarget(searchTarget());
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
            <WorkspaceProjectCascader
              currentProject={treeScope()}
              currentWorkspace={selectedWorkspace() ?? ""}
              workspaces={workspacesWithProjects()}
              onSelectProject={(key) => {
                const view = docView();
                setTreeScope(key.project);
                openProject(key);
                setDocView(view);
              }}
              onSelectWorkspace={(workspace) => {
                const view = docView();
                setTreeScope(null);
                openWorkspace(workspace);
                setDocView(view);
              }}
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
              overview={workspaceOverviewData()}
              projectOverview={projectOverviewData()}
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
                  {(current) => (
                    <PageReader
                      page={current()}
                      onNavigate={(path) => {
                        const k = selectedKey();
                        if (k) {
                          navigateToPage({ key: k, path });
                        }
                      }}
                    />
                  )}
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
        target={searchTarget()}
        workspaces={workspacesWithProjects()}
        onClose={() => setPaletteOpen(false)}
        onInput={liveSearch}
        onTargetChange={(target) => {
          setSearchTarget(target);
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
function WorkspaceProjectCascader(props: {
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
function HighlightMatch(props: { query: string; text: string }) {
  const segments = createMemo<Array<{ match: boolean; text: string }>>(() => {
    const q = props.query.trim();
    if (!q) return [{ match: false, text: props.text }];
    const lower = props.text.toLowerCase();
    const needle = q.toLowerCase();
    const out: Array<{ match: boolean; text: string }> = [];
    let i = 0;
    while (i < props.text.length) {
      const at = lower.indexOf(needle, i);
      if (at === -1) {
        out.push({ match: false, text: props.text.slice(i) });
        break;
      }
      if (at > i) out.push({ match: false, text: props.text.slice(i, at) });
      out.push({ match: true, text: props.text.slice(at, at + needle.length) });
      i = at + needle.length;
    }
    return out;
  });
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
  overview: WorkspaceOverview | null;
  onOpenDoc: (path: string) => void;
  recent: PageSummary[];
}) {
  // Project overview (when available) carry a project-scoped briefing; fall back
  // to the standalone briefing query that also feeds the documents inspector.
  const briefing = () => props.overview?.briefing ?? props.briefing;
  return (
    <div class="flex flex-col gap-6">
      <Show when={props.overview?.handoff}>{(h) => <HandoffCard handoff={h()} />}</Show>
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
              when={briefing()}
            >
              {/* o handoff já aparece no card do topo quando há overview; evita duplicar o aviso */}
              {(snapshot) => <BriefingView briefing={snapshot()} hidePendingHandoff={Boolean(props.overview?.handoff)} />}
            </Show>
          </div>
          <Show when={props.overview?.health}>
            {(health) => <HealthCard health={health()} onOpenDoc={(_project, path) => props.onOpenDoc(path)} />}
          </Show>
        </aside>
      </div>
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

function HealthRow(props: {
  label: string;
  value: number;
  pages?: HealthPage[];
  onOpenDoc?: (project: string, path: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const expandable = () => (props.pages?.length ?? 0) > 0;
  return (
    <div>
      <button
        class="flex w-full items-center justify-between gap-2 text-left outline-none"
        disabled={!expandable()}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span class="flex items-center gap-1 text-muted-foreground">
          <ChevronRight
            class={cn("transition", expandable() ? "opacity-100" : "opacity-0")}
            classList={{ "rotate-90": open() }}
            size={13}
          />
          {props.label}
        </span>
        <span
          class={cn(
            "grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold",
            props.value > 0 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {props.value}
        </span>
      </button>
      <Show when={open() && expandable()}>
        <ul class="mt-1.5 flex flex-col gap-0.5 border-l pl-3" data-testid="health-detail">
          <For each={props.pages}>
            {(item) => (
              <li>
                <button
                  class="flex w-full items-center gap-2 rounded-md p-1 text-left text-xs outline-none transition hover:bg-hover"
                  onClick={() => props.onOpenDoc?.(item.project, item.path)}
                  type="button"
                >
                  <KindBadge kind={item.kind} />
                  <span class="min-w-0 truncate">{item.title}</span>
                  <span class="ml-auto shrink-0 truncate font-mono text-[10px] text-muted-foreground/70">
                    {item.project}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

function HandoffCard(props: { handoff: WorkspaceHandoff }) {
  const copy = () => {
    const h = props.handoff;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(
        `${h.summary}\n\n${t(() => m.ws_handoff_questions())}:\n- ${h.open_questions.join("\n- ")}\n\n${t(() => m.ws_handoff_next())}:\n- ${h.next_steps.join("\n- ")}`,
      );
    }
  };
  return (
    <section class="rounded-xl border border-primary/30 bg-accent/40 p-5" data-testid="handoff-card">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <History class="shrink-0 text-primary" size={20} />
          <div>
            <h2 class="text-base font-semibold">{t(() => m.ws_handoff_title())}</h2>
            <p class="text-xs text-muted-foreground">
              handoff · {props.handoff.agent} · {formatRelative(props.handoff.at)} · {props.handoff.project}
            </p>
          </div>
        </div>
        <button
          class="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onClick={copy}
        >
          <Copy size={14} /> {t(() => m.ws_handoff_copy())}
        </button>
      </div>
      <p class="mt-3 text-sm">{props.handoff.summary}</p>
      <div class="mt-4 grid grid-cols-2 gap-5 max-sm:grid-cols-1">
        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-bold uppercase text-muted-foreground">
            {t(() => m.ws_handoff_questions())}
          </h3>
          <For each={props.handoff.open_questions}>
            {(q) => (
              <span class="flex items-start gap-2 text-sm">
                <CircleHelp class="mt-0.5 shrink-0 text-muted-foreground" size={14} /> {q}
              </span>
            )}
          </For>
        </div>
        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-bold uppercase text-muted-foreground">{t(() => m.ws_handoff_next())}</h3>
          <For each={props.handoff.next_steps}>
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
  );
}

function HealthCard(props: { health: MemoryHealth; onOpenDoc: (project: string, path: string) => void }) {
  return (
    <div class="rounded-lg border bg-card p-4" data-testid="health-card">
      <div class="mb-3.5 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck class="text-muted-foreground" size={15} />
        {t(() => m.ws_health_title())}
      </div>
      <div class="flex flex-col gap-2 text-sm">
        <HealthRow
          label={t(() => m.health_stale())}
          onOpenDoc={props.onOpenDoc}
          pages={props.health.stale_pages}
          value={props.health.stale}
        />
        <HealthRow
          label={t(() => m.health_duplicates())}
          onOpenDoc={props.onOpenDoc}
          pages={props.health.duplicate_pages}
          value={props.health.duplicates}
        />
        <HealthRow label={t(() => m.health_contradictions())} value={props.health.contradictions} />
        <HealthRow
          label={t(() => m.health_orphans())}
          onOpenDoc={props.onOpenDoc}
          pages={props.health.orphan_pages}
          value={props.health.orphans}
        />
      </div>
      <p class="mt-3 font-mono text-xs text-muted-foreground">
        {">_ "}
        {t(() => m.health_audit())}
      </p>
    </div>
  );
}

function WorkspaceOverviewBody(props: {
  overview: WorkspaceOverview | null;
  onOpenDoc: (project: string, path: string) => void;
  onOpenProject: (key: ProjectKey) => void;
  projects: ProjectSummary[];
  workspacePages: ProjectPages[];
}) {
  const pagesOf = (project: string) =>
    props.workspacePages.find((entry) => entry.project === project)?.pages ?? [];
  const recent = createMemo(() => workspaceRecentDocs(props.workspacePages));
  return (
    <div class="flex flex-col gap-6">
      <Show when={props.overview?.handoff}>{(h) => <HandoffCard handoff={h()} />}</Show>

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
                      <Box class="shrink-0 text-muted-foreground" size={16} />
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
          <Show when={props.overview?.briefing}>
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
          <Show when={props.overview?.health}>
            {(health) => <HealthCard health={health()} onOpenDoc={props.onOpenDoc} />}
          </Show>
        </aside>
      </div>
    </div>
  );
}

function OverviewPanel(props: {
  briefing: BriefingSnapshot | null;
  overview: WorkspaceOverview | null;
  projectOverview: WorkspaceOverview | null;
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
            overview={props.projectOverview}
            onOpenDoc={(path) => props.onOpenDoc(props.project ?? "", path)}
            recent={props.recent}
          />
        }
        when={props.isWorkspace}
      >
        <WorkspaceOverviewBody
          overview={props.overview}
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
            {t(() => m.home_workspaces())}
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

function PageReader(props: { page: ApiPage; onNavigate: (path: string) => void }) {
  // Soft-nav for same-project wikilinks; cross-project links fall through to
  // their href (full navigation), which already carries the correct basepath.
  const handleWikilinkClick = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a.wikilink") as
      | HTMLAnchorElement
      | null;
    if (!anchor) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return; // allow open-in-new-tab / new-window
    }
    const ws = anchor.dataset.ws;
    const proj = anchor.dataset.proj;
    const path = anchor.dataset.path;
    if (!ws || !proj || path == null) return;
    if (ws === props.page.workspace && proj === props.page.project) {
      event.preventDefault();
      props.onNavigate(path);
    }
  };
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
      <Show when={Object.keys(props.page.frontmatter ?? {}).length > 0}>
        <Frontmatter frontmatter={props.page.frontmatter} />
      </Show>
      <div class="min-w-0 p-6">
        <Markdown
          onClick={handleWikilinkClick}
          project={props.page.project}
          source={stripFrontmatter(props.page.body_markdown)}
          workspace={props.page.workspace}
        />
      </div>
      <Show when={props.page.links.length > 0 || props.page.backlinks.length > 0}>
        <footer class="grid gap-6 border-t p-6 sm:grid-cols-2" data-testid="page-relations">
          <RelatedList items={props.page.links} onNavigate={props.onNavigate} title={t(() => m.reader_links())} />
          <RelatedList items={props.page.backlinks} onNavigate={props.onNavigate} title={t(() => m.reader_backlinks())} />
        </footer>
      </Show>
    </article>
  );
}

function RelatedList(props: { title: string; items: RelatedPage[]; onNavigate: (path: string) => void }) {
  return (
    <Show when={props.items.length > 0}>
      <section>
        <h3 class="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
          {props.title}
          <span class="font-normal lowercase">({props.items.length})</span>
        </h3>
        <ul class="flex flex-col gap-1">
          <For each={props.items}>
            {(item) => (
              <li>
                <button
                  class="flex w-full items-center gap-2 rounded-md p-1.5 text-left outline-none transition hover:bg-hover"
                  onClick={() => props.onNavigate(item.path)}
                  type="button"
                >
                  <KindBadge kind={item.kind} />
                  <span class="min-w-0 truncate text-sm">{item.title}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}

// Chaves cujo valor é renderizado como chip (mesmo visual de "tags").
const FM_CHIP_KEYS = new Set(["kind", "tier", "type", "status", "audience", "category", "labels", "tags"]);

// Ícone por chave conhecida; demais caem no genérico (List).
function frontmatterIcon(key: string) {
  switch (key.toLowerCase()) {
    case "title":
      return Type;
    case "kind":
    case "type":
      return Tag;
    case "tier":
      return Layers;
    case "tags":
    case "category":
    case "labels":
      return Hash;
    case "created":
    case "updated":
    case "date":
      return Calendar;
    case "status":
      return Activity;
    case "audience":
    case "owner":
      return Users;
    case "sources":
    case "related":
    case "links":
      return Link2;
    default:
      return List;
  }
}

// Returns the primitive items as strings IF every entry is primitive.
// Returns null for non-arrays AND for arrays whose entries are objects —
// those fall through to a richer renderer instead of stringifying to
// "[object Object]".
function frontmatterArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((item) => item !== null && typeof item === "object")) return null;
  return value.map((item) => (item == null ? "" : String(item))).filter((s) => s.length > 0);
}

// Heurística: tokens curtos sem espaço parecem tag → viram chip.
function looksLikeTag(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 32 && !/\s/.test(trimmed);
}

function FrontmatterValue(props: { name: string; value: unknown }) {
  const chips = (items: string[]) => (
    <div class="flex flex-wrap gap-1.5">
      <For each={items}>{(item) => <Chip class="bg-muted text-muted-foreground">{item}</Chip>}</For>
    </div>
  );
  return (
    <Show fallback={<span class="text-sm text-muted-foreground">—</span>} when={props.value != null && props.value !== ""}>
      {(() => {
        const value = props.value;
        const arr = frontmatterArray(value);
        if (arr) {
          return arr.length > 0 ? chips(arr) : <span class="text-sm text-muted-foreground">—</span>;
        }
        if (Array.isArray(value)) {
          // Array of objects (e.g. `contributors`). Render each entry as a
          // mini key:value table so the user can actually read the data.
          return (
            <ul class="flex flex-col gap-2">
              <For each={value as Record<string, unknown>[]}>
                {(entry) => (
                  <li class="rounded-md border bg-muted/30 px-3 py-2">
                    <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                      <For each={Object.entries(entry ?? {})}>
                        {([k, v]) => (
                          <>
                            <dt class="font-medium text-muted-foreground">{k}</dt>
                            <dd class="min-w-0 break-words font-mono text-foreground/90">
                              {v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </dd>
                          </>
                        )}
                      </For>
                    </dl>
                  </li>
                )}
              </For>
            </ul>
          );
        }
        if (typeof value === "object") {
          return <span class="break-words font-mono text-xs text-foreground/80">{JSON.stringify(value)}</span>;
        }
        const str = String(value);
        if (/^https?:\/\//i.test(str.trim())) {
          return (
            <a class="break-all text-sm text-primary underline-offset-2 hover:underline" href={str.trim()} rel="noreferrer" target="_blank">
              {str}
            </a>
          );
        }
        if (FM_CHIP_KEYS.has(props.name.toLowerCase()) || looksLikeTag(str)) {
          return chips([str.trim()]);
        }
        return <span class="break-words text-sm text-foreground/90">{str}</span>;
      })()}
    </Show>
  );
}

function Frontmatter(props: { frontmatter: Record<string, unknown> }) {
  const [open, setOpen] = createSignal(false);
  const entries = createMemo(() =>
    Object.entries(props.frontmatter ?? {}).filter(([, value]) => value != null && value !== ""),
  );
  return (
    <div class="px-6 pt-4">
      <details
        class="group/fm overflow-hidden rounded-lg border bg-card"
        data-testid="frontmatter"
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary class="flex cursor-pointer list-none items-center gap-2 border-b border-transparent bg-muted/40 px-4 py-2.5 text-xs font-semibold text-foreground outline-none transition hover:bg-muted/60 group-open/fm:border-border">
          <ChevronRight class="text-muted-foreground transition group-open/fm:rotate-90" size={14} />
          <span>{t(() => m.reader_frontmatter())}</span>
          <span class="font-normal text-muted-foreground">({entries().length})</span>
        </summary>
        <Show when={open()}>
          <dl class="flex flex-col py-2">
            <For each={entries()}>
              {([key, value]) => {
                const Icon = frontmatterIcon(key);
                return (
                  <div class="flex items-start gap-4 px-4 py-1.5 transition hover:bg-muted/30">
                    <dt class="flex w-32 shrink-0 items-center gap-2 pt-0.5 text-xs text-muted-foreground">
                      <Icon class="shrink-0" size={14} />
                      <span class="truncate">{key}</span>
                    </dt>
                    <dd class="min-w-0 flex-1">
                      <FrontmatterValue name={key} value={value} />
                    </dd>
                  </div>
                );
              }}
            </For>
          </dl>
        </Show>
      </details>
    </div>
  );
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

function scopeTriggerLabel(target: SearchTarget): string {
  if (target.kind === "global") return t(() => m.palette_scope_global());
  if (target.kind === "workspace") return target.workspace;
  return `${target.workspace} / ${target.project}`;
}

// Search-scope picker: the same two-column cascader as the top-bar
// workspace switcher, plus an explicit "Global" row at the top. Lets the
// user pin the search to any workspace or project regardless of which
// route they're currently on.
function SearchScopeCascader(props: {
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
