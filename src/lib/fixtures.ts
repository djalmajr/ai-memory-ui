// Dados de exemplo para desenvolvimento/preview da UI sem um ai-memory rodando.
// Ativados por `VITE_FIXTURES=1 npm run dev` (somente em DEV — ver lib/api.ts).
// Espelham o workspace canônico `centralit` com projetos aninhados.
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

const WS = "centralit";

export const fixtureWorkspaces: WorkspaceSummary[] = [
  { workspace_name: WS, project_count: 3, page_count: 15, last_updated: "2026-05-20T14:30:00Z", current: true },
  { workspace_name: "zomme", project_count: 8, page_count: 214, last_updated: "2026-05-24T13:30:00Z" },
  { workspace_name: "run2biz", project_count: 2, page_count: 41, last_updated: "2026-05-23T18:00:00Z" },
];

export const fixtureProjects: ProjectSummary[] = [
  { workspace_name: WS, project_name: "smart-city", page_count: 9, last_updated: "2026-05-20T14:30:00Z" },
  { workspace_name: WS, project_name: "front-manager", page_count: 5, last_updated: "2026-05-18T09:10:00Z" },
  { workspace_name: WS, project_name: "ops", page_count: 1, last_updated: "2026-05-12T08:00:00Z" },
];

interface FixturePage extends PageSummary {
  body_markdown: string;
  pinned?: boolean;
  supersedes?: string | null;
}

const SMART_CITY: FixturePage[] = [
  {
    path: "README.md",
    title: "Smart City — visão geral",
    kind: "note",
    tier: "core",
    updated_at: "2026-05-20T14:30:00Z",
    pinned: true,
    body_markdown:
      "# Smart City\n\nPlataforma de telemetria urbana. Esta wiki concentra **regras**, **decisões** e _gotchas_ do projeto.\n\n## Componentes\n\n- Ingestão (ETL)\n- API de consulta\n- Embeddings via Ollama\n\n> Escrita ocorre via agente (MCP) ou CLI — esta UI é somente leitura.",
  },
  {
    path: "_rules/coding-style.md",
    title: "Estilo de código",
    kind: "rule",
    tier: "core",
    updated_at: "2026-05-19T10:00:00Z",
    body_markdown:
      "# Estilo de código\n\n- TypeScript estrito (`noUnusedLocals`).\n- Componentes em SolidJS.\n\n```ts\nconst soma = (a: number, b: number): number => a + b;\n```\n",
  },
  {
    path: "_rules/api-contract.md",
    title: "Contrato da API",
    kind: "rule",
    tier: "core",
    updated_at: "2026-05-17T16:20:00Z",
    body_markdown:
      "# Contrato da API\n\n`/api/v1` é **somente leitura**. Escrita é gated por role no gateway.\n\n| Rota | Método |\n|---|---|\n| /search | GET/POST |\n| /projects | GET |\n",
  },
  {
    path: "decisions/ADR-0011-ai-memory.md",
    title: "ADR-0011 — ai-memory como stack",
    kind: "decision",
    tier: "core",
    updated_at: "2026-05-20T11:05:00Z",
    body_markdown:
      "# ADR-0011 — ai-memory como memory stack\n\n**Status:** aceito. Substitui a stack QMD.\n\nDecisão: usar o fork `djalmajr/ai-memory` (Rust) com multi-projeto, `/api/v1` e embeddings.",
  },
  {
    path: "decisions/ADR-0012-auth-oauth.md",
    title: "ADR-0012 — Auth OAuth PKCE",
    kind: "decision",
    tier: "core",
    updated_at: "2026-05-20T11:40:00Z",
    body_markdown:
      "# ADR-0012 — Auth OAuth Authorization Code + PKCE\n\nKeycloak + `mcp-auth` forwardAuth permanecem. Token via PKCE com refresh transparente (RFC 9728).",
  },
  {
    path: "etl/ingest-pipeline.md",
    title: "Pipeline de ingestão",
    kind: "note",
    tier: "supporting",
    updated_at: "2026-05-16T08:00:00Z",
    body_markdown:
      "# Pipeline de ingestão\n\nClona fontes → gera markdown (opencode) → `write-page` via server → `embed`.\n",
  },
  {
    path: "etl/gotchas.md",
    title: "Gotchas da ETL",
    kind: "gotcha",
    tier: "supporting",
    updated_at: "2026-05-15T12:30:00Z",
    body_markdown:
      "# Gotchas da ETL\n\n- **Não** usar `write-page` embedded contra o data dir de um server rodando: escritas concorrentes perdem dados (o writer actor é o caminho seguro).",
  },
  {
    path: "architecture/overview.md",
    title: "Arquitetura — visão geral",
    kind: "note",
    tier: "core",
    updated_at: "2026-05-14T09:00:00Z",
    body_markdown:
      "# Arquitetura\n\nBinário único Rust: MCP HTTP + `/web` + `/api/v1`. SQLite FTS5 + vetor (RRF).",
  },
  {
    path: "architecture/embeddings.md",
    title: "Embeddings",
    kind: "note",
    tier: "supporting",
    updated_at: "2026-05-13T15:45:00Z",
    body_markdown:
      "# Embeddings\n\nProvider HTTP (Ollama `qwen3-embedding:0.6b`, dim **1024**). Embed por projeto.",
  },
];

const FRONT_MANAGER: FixturePage[] = [
  {
    path: "README.md",
    title: "Front Manager",
    kind: "note",
    tier: "core",
    updated_at: "2026-05-18T09:10:00Z",
    body_markdown: "# Front Manager\n\nGestão de frentes de trabalho.",
  },
  {
    path: "_rules/naming.md",
    title: "Convenções de nomes",
    kind: "rule",
    tier: "core",
    updated_at: "2026-05-12T10:00:00Z",
    body_markdown: "# Convenções de nomes\n\n`kebab-case` para arquivos.",
  },
  {
    path: "decisions/ADR-0001-stack.md",
    title: "ADR-0001 — Stack",
    kind: "decision",
    tier: "core",
    updated_at: "2026-05-11T14:00:00Z",
    body_markdown: "# ADR-0001 — Stack\n\nSolidJS + TanStack.",
  },
  {
    path: "ui/components.md",
    title: "Componentes de UI",
    kind: "note",
    tier: "supporting",
    updated_at: "2026-05-10T11:00:00Z",
    body_markdown: "# Componentes\n\nshadcn-solid + Kobalte.",
  },
  {
    path: "ui/theming.md",
    title: "Theming",
    kind: "note",
    tier: "supporting",
    updated_at: "2026-05-09T17:00:00Z",
    body_markdown: "# Theming\n\nTokens HSL teal (asciimark), dark/light.",
  },
];

const OPS: FixturePage[] = [
  {
    path: "runbooks/deploy.md",
    title: "Runbook de deploy",
    kind: "note",
    tier: "core",
    updated_at: "2026-05-12T08:00:00Z",
    body_markdown: "# Runbook de deploy\n\n`helm upgrade --install` no lab, depois prod.",
  },
];

function pagesFor(project: string): FixturePage[] {
  if (project === "front-manager") {
    return FRONT_MANAGER;
  }
  if (project === "ops") {
    return OPS;
  }
  return SMART_CITY;
}

function toSummary(page: FixturePage): PageSummary {
  return { kind: page.kind, path: page.path, tier: page.tier, title: page.title, updated_at: page.updated_at };
}

export function fixtureListPages(key: ProjectKey): PageSummary[] {
  return pagesFor(key.project).map(toSummary);
}

export function fixtureReadPage(key: ProjectKey, path: string): ApiPage {
  const page = pagesFor(key.project).find((item) => item.path === path) ?? pagesFor(key.project)[0];
  return {
    body_markdown: page.body_markdown,
    created_at: "2026-05-01T09:00:00Z",
    frontmatter: { kind: page.kind, tier: page.tier },
    kind: page.kind,
    path: page.path,
    pinned: page.pinned ?? false,
    project: key.project,
    supersedes: page.supersedes ?? null,
    tier: page.tier,
    title: page.title,
    updated_at: page.updated_at,
    workspace: key.workspace,
  };
}

export function fixtureRecent(key: ProjectKey, limit: number): PageSummary[] {
  return [...pagesFor(key.project)]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit)
    .map(toSummary);
}

export function fixtureBriefing(key: ProjectKey): BriefingSnapshot {
  const pages = pagesFor(key.project);
  const rules = pages.filter((page) => page.kind === "rule");
  return {
    activity_30d: { days: 30, observations: 22, pages_updated: pages.length, sessions: 7 },
    activity_7d: { days: 7, observations: 6, pages_updated: 3, sessions: 2 },
    counts: { observations: 22, pages_all: pages.length + 4, pages_latest: pages.length, sessions: 7 },
    last_observation_at: "2026-05-20T14:30:00Z",
    pending_handoff_count: key.project === "smart-city" ? 1 : 0,
    recent_pages: fixtureRecent(key, 4).map((page) => ({
      kind: page.kind,
      path: page.path,
      title: page.title,
      updated_at: page.updated_at,
    })),
    rules: rules.map((page) => ({ kind: page.kind, path: page.path, title: page.title, updated_at: page.updated_at })),
  };
}

// Extras do workspace overview que a API do ai-memory não expõe hoje
// (handoff, briefing de workspace, saúde da memória) — só p/ o preview.
export function fixtureWorkspaceExtras(workspace: string): WorkspaceExtras {
  if (workspace !== WS) {
    return {
      briefing: {
        activity_30d: { days: 30, observations: 12, pages_updated: 8, sessions: 3 },
        activity_7d: { days: 7, observations: 4, pages_updated: 2, sessions: 1 },
        counts: { observations: 96, pages_all: 60, pages_latest: 41, sessions: 5 },
        last_observation_at: "2026-05-24T13:30:00Z",
        pending_handoff_count: 0,
        recent_pages: [],
        rules: [],
      },
      handoff: null,
      health: { audited_at: null, contradictions: 0, duplicates: 0, orphans: 0, stale: 0 },
    };
  }
  return {
    briefing: {
      activity_30d: { days: 30, observations: 110, pages_updated: 31, sessions: 9 },
      activity_7d: { days: 7, observations: 28, pages_updated: 9, sessions: 4 },
      counts: { observations: 540, pages_all: 38, pages_latest: 27, sessions: 12 },
      last_observation_at: "2026-05-24T13:30:00Z",
      pending_handoff_count: 1,
      recent_pages: [],
      rules: [],
    },
    handoff: {
      agent: "Claude Code",
      at: "2026-05-24T11:00:00Z",
      next_steps: [
        "Reembedar smart-city e front-manager após cutover.",
        "Atualizar runbook do MCP client para o fluxo OAuth.",
      ],
      open_questions: [
        "Ollama está acessível das VMs do cluster para embeddings?",
        "Manter o checkbox de recall-scope ou simplificar a busca?",
      ],
      project: "smart-city",
      summary:
        "Você estava migrando a ETL para escrever no ai-memory via /admin/write-page. smart-city publicou 17 páginas, front-manager 9; smart-city falhou no clone antes do fix de token por source.",
    },
    health: { audited_at: "2026-05-24T11:00:00Z", contradictions: 0, duplicates: 1, orphans: 3, stale: 2 },
  };
}

export function fixtureSearch(query: string, scope?: ProjectKey | null): SearchHit[] {
  const term = query.trim().toLowerCase();
  if (!term) {
    return [];
  }
  const sources = scope
    ? fixtureProjects.filter((project) => project.project_name === scope.project)
    : fixtureProjects;
  const hits: SearchHit[] = [];
  for (const project of sources) {
    for (const page of pagesFor(project.project_name)) {
      const haystack = `${page.title} ${page.body_markdown}`.toLowerCase();
      const index = haystack.indexOf(term);
      if (index === -1) {
        continue;
      }
      const raw = page.body_markdown.replace(/[#`*>|]/g, "").replace(/\s+/g, " ").trim();
      const at = raw.toLowerCase().indexOf(term);
      const start = Math.max(0, at - 30);
      const slice = raw.slice(start, start + 90);
      const snippet =
        at === -1
          ? slice
          : `${raw.slice(start, at)}<mark>${raw.slice(at, at + term.length)}</mark>${raw.slice(at + term.length, start + 90)}`;
      hits.push({
        kind: page.kind,
        path: page.path,
        project: project.project_name,
        rank: -(1 / (index + 1)),
        snippet: `…${snippet}…`,
        title: page.title,
        workspace: project.workspace_name,
      });
    }
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, 12);
}
