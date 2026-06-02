import {
  fixtureBriefing,
  fixtureListPages,
  fixtureProjectOverview,
  fixtureProjects,
  fixtureReadPage,
  fixtureRecent,
  fixtureSearch,
  fixtureWorkspaceOverview,
  fixtureWorkspaces,
} from "~/lib/fixtures";
import type {
  ApiPage,
  BriefingSnapshot,
  CrossProjectEdge,
  GraphResponse,
  PageSummary,
  ProjectKey,
  ProjectSummary,
  SearchScope,
  SearchHit,
  WorkspaceOverview,
  WorkspaceSummary,
} from "~/lib/types";

// `/api/v1` hangs off the server's base path (AI_MEMORY_BASE_PATH), not the
// web mount, so we can't derive it from the `<base href>`. The server injects
// `<meta name="ai-memory-base-path">` with that prefix (empty at the host
// root); read it to build the API root. Empty => `/api/v1` (unchanged default).
function readBasePath(): string {
  if (typeof document === "undefined") return "";
  return (
    document
      .querySelector('meta[name="ai-memory-base-path"]')
      ?.getAttribute("content")
      ?.replace(/\/+$/, "") ?? ""
  );
}

const API_ROOT = `${readBasePath()}/api/v1`;

// Modo de preview offline: `VITE_FIXTURES=1 npm run dev` serve dados de exemplo
// (lib/fixtures.ts) sem precisar de um ai-memory rodando. Inerte em produção.
const USE_FIXTURES = import.meta.env.DEV && import.meta.env.VITE_FIXTURES === "1";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep the HTTP status fallback when the body is not JSON.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

export function listProjects(): Promise<ProjectSummary[]> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureProjects);
  }
  return requestJson<ProjectSummary[]>("/projects");
}

// GET /api/v1/graph — resolved cross-project dependency edges (page→page,
// each carrying both endpoints' workspace/project). The graph view
// aggregates these into a project-level dependency graph.
const FIXTURE_GRAPH_EDGES: CrossProjectEdge[] = [
  {
    from_workspace: "default",
    from_project: "app",
    from_path: "concepts/dep.md",
    to_workspace: "default",
    to_project: "infra",
    to_path: "runbooks/02.md",
  },
];

export function graph(): Promise<GraphResponse> {
  if (USE_FIXTURES) {
    return Promise.resolve({ edges: FIXTURE_GRAPH_EDGES });
  }
  return requestJson<GraphResponse>("/graph");
}

export function listProjectsForWorkspace(workspace: string): Promise<ProjectSummary[]> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureProjects.filter((project) => project.workspace_name === workspace));
  }
  const params = new URLSearchParams({ workspace });
  return requestJson<ProjectSummary[]>(`/projects?${params.toString()}`);
}

export function listWorkspaces(): Promise<WorkspaceSummary[]> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureWorkspaces);
  }
  return requestJson<WorkspaceSummary[]>("/workspaces");
}

// Handoff + briefing de workspace + saúde da memória, via
// GET /api/v1/workspaces/{workspace}/overview (fork ai-memory). Em um backend
// sem esse endpoint, degrada p/ null (as seções do overview somem).
export function workspaceOverview(workspace: string): Promise<WorkspaceOverview | null> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureWorkspaceOverview(workspace));
  }
  return requestJson<WorkspaceOverview>(`/workspaces/${segment(workspace)}/overview`).catch(() => null);
}

// Handoff + briefing + saúde escopados a um projeto, via
// GET /api/v1/workspaces/{ws}/projects/{proj}/overview (fork ai-memory). Em um
// backend sem esse endpoint, degrada p/ null (handoff/saúde do projeto somem).
export function projectOverview(key: ProjectKey, limit = 8): Promise<WorkspaceOverview | null> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureProjectOverview(key));
  }
  return requestJson<WorkspaceOverview>(
    `/workspaces/${segment(key.workspace)}/projects/${segment(key.project)}/overview?limit=${limit}`,
  ).catch(() => null);
}

export function listPages(key: ProjectKey): Promise<PageSummary[]> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureListPages(key));
  }
  return requestJson<PageSummary[]>(
    `/workspaces/${segment(key.workspace)}/projects/${segment(key.project)}/pages`,
  );
}

export function readPage(key: ProjectKey, path: string): Promise<ApiPage> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureReadPage(key, path));
  }
  return requestJson<ApiPage>(
    `/workspaces/${segment(key.workspace)}/projects/${segment(key.project)}/pages/${path
      .split("/")
      .map(segment)
      .join("/")}`,
  );
}

export function recentPages(key: ProjectKey, limit = 8): Promise<PageSummary[]> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureRecent(key, limit));
  }
  return requestJson<PageSummary[]>(
    `/workspaces/${segment(key.workspace)}/projects/${segment(key.project)}/recent?limit=${limit}`,
  );
}

export function briefing(key: ProjectKey, limit = 8): Promise<BriefingSnapshot> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureBriefing(key));
  }
  return requestJson<BriefingSnapshot>(
    `/workspaces/${segment(key.workspace)}/projects/${segment(key.project)}/briefing?limit=${limit}`,
  );
}

export function searchPages(
  query: string,
  options: SearchOptions = {},
  limit = 12,
): Promise<SearchHit[]> {
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureSearch(query, options.scopes?.[0] ?? options.key ?? null));
  }
  if (options.scopes?.length) {
    return requestJson<SearchHit[]>("/search", {
      body: JSON.stringify({
        limit,
        q: query,
        scopes: options.scopes.map((scope) => ({
          project: scope.project,
          workspace: scope.workspace,
        })),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (options.key) {
    params.set("workspace", options.key.workspace);
    params.set("project", options.key.project);
  }
  return requestJson<SearchHit[]>(`/search?${params.toString()}`);
}

interface SearchOptions {
  key?: ProjectKey | null;
  scopes?: SearchScope[];
}
