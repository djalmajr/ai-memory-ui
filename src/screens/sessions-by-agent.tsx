import { useQuery } from "~/lib/query";
import { Show, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { CircleHelp } from "~/components/icons";
import { DataGrid } from "~/components/data-grid";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import {
  adminProjects,
  adminSessionsByAgent,
} from "~/lib/admin-api";
import type { AdminProjectSummary, AgentSessionCount } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Sessões por agente (nível servidor).
//
// `GET /admin/open-sessions` exige workspace + project + um AgentKind
// kebab-case exato — não existe lista aberta server-wide, então esta tela
// NÃO chama esse endpoint. O que o engine oferece é
// `GET /admin/sessions/by-agent` escopado a um projeto; o agregado da tabela
// é composto no cliente. Drill-down de sessões abertas vive no escopo
// (`/s/{ws}/{proj}/sessions`), com seletor de agente.
//
// Coluna "última atividade": DOES NOT EXIST neste payload
// (`{agent, sessions}` só). Omitida, nunca estimada.

type SinceDays = 0 | 7 | 30;

function failMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function SessionsHelp() {
  const [open, setOpen] = createSignal(false);
  const id = "sessions-help";
  return (
    <div class="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Button
        aria-describedby={id}
        aria-label={t(() => m.sessions_help())}
        size="icon-sm"
        type="button"
        variant="ghost"
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      >
        <CircleHelp />
      </Button>
      <div
        class={
          open()
            ? "absolute top-full right-0 z-50 mt-1.5 w-80 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md"
            : "sr-only"
        }
        id={id}
        role="tooltip"
      >
        <p>{t(() => m.sessions_note())}</p>
      </div>
    </div>
  );
}

interface AgentAggregate {
  agent: string;
  sessions: number;
  projects: number;
}

/** Fan-out com teto de 6: cada projeto é uma ida a `/sessions/by-agent`.
 *  Sem teto vira thundering herd em instalações com muitos projetos. */
async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function loadAgentAggregates(sinceDays: SinceDays): Promise<AgentAggregate[]> {
  const projects = await adminProjects();
  const perProject = await mapPool(projects, 6, (project) => loadProjectAgents(project, sinceDays));
  const byAgent = new Map<string, { sessions: number; projects: Set<string> }>();
  for (const { projectKey, rows } of perProject) {
    for (const row of rows) {
      if (row.sessions <= 0) continue;
      let acc = byAgent.get(row.agent);
      if (!acc) {
        acc = { sessions: 0, projects: new Set() };
        byAgent.set(row.agent, acc);
      }
      acc.sessions += row.sessions;
      acc.projects.add(projectKey);
    }
  }
  return [...byAgent.entries()]
    .map(([agent, acc]) => ({
      agent,
      sessions: acc.sessions,
      projects: acc.projects.size,
    }))
    .sort((a, b) => b.sessions - a.sessions || a.agent.localeCompare(b.agent));
}

async function loadProjectAgents(
  project: AdminProjectSummary,
  sinceDays: SinceDays,
): Promise<{ projectKey: string; rows: AgentSessionCount[] }> {
  const projectKey = `${project.workspace_name}/${project.project_name}`;
  try {
    const rows = await adminSessionsByAgent(
      { workspace: project.workspace_name, project: project.project_name },
      sinceDays,
    );
    return { projectKey, rows };
  } catch (error) {
    // 404 = projeto sumiu entre o inventory e o fan-out; ignorar não inventa
    // contagem e não derruba o agregado inteiro.
    if (error instanceof ApiError && error.status === 404) {
      return { projectKey, rows: [] };
    }
    throw error;
  }
}

export function SessionsByAgentScreen() {
  const [sinceDays, setSinceDays] = createSignal<SinceDays>(7);
  const q = useQuery(() => ({
    queryKey: ["admin", "sessions-by-agent", sinceDays()],
    queryFn: () => loadAgentAggregates(sinceDays()),
  }));

  const rows = () => q.data ?? [];

  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_sessions())}</span>}
    >
      <Show when={!q.isPending} fallback={<LoadingBlock />}>
        <Show
          when={!(q.isError && q.data === undefined)}
          fallback={
            <ErrorBlock
              message={failMessage(q.error)}
              onRetry={() => void q.refetch()}
            />
          }
        >
          <DataGrid
            beforeSort={<SessionsHelp />}
            empty={t(() => m.sessions_empty_body())}
            filters={[
              {
                label: t(() => m.sessions_period_label()),
                value: String(sinceDays()),
                options: [
                  { label: t(() => m.sessions_period_7()), value: "7" },
                  { label: t(() => m.sessions_period_30()), value: "30" },
                  { label: t(() => m.sessions_period_all()), value: "0" },
                ],
                onChange: (value) => setSinceDays(Number(value) as SinceDays),
              },
            ]}
            items={rows()}
            columns={[
              {
                id: "agent",
                label: t(() => m.sessions_col_agent()),
                class: "w-[220px] font-mono",
                search: (row) => row.agent,
                sortValue: (row) => row.agent,
                cell: (row) => row.agent,
              },
              {
                id: "sessions",
                label: t(() => m.sessions_col_sessions()),
                class: "w-[120px] tabular-nums",
                sortValue: (row) => row.sessions,
                cell: (row) => row.sessions,
              },
              {
                id: "projects",
                label: t(() => m.sessions_col_projects()),
                class: "w-[120px] tabular-nums",
                sortValue: (row) => row.projects,
                cell: (row) => row.projects,
              },
            ]}
          />
        </Show>
      </Show>
    </Shell>
  );
}

function LoadingBlock() {
  return (
    <div class="flex flex-col gap-3">
      <Skeleton class="h-4 w-3/4 rounded-md" />
      <Skeleton class="h-4 w-1/2 rounded-md" />
      <Skeleton class="h-20 w-full rounded-md" />
    </div>
  );
}

function ErrorBlock(props: { message: string; onRetry: () => void }) {
  return (
    <div
      class="flex flex-col items-center justify-center gap-2 rounded-lg border border-hairline p-4 text-center"
      role="alert"
    >
      <strong class="text-sm">{t(() => m.state_error_title())}</strong>
      <span class="max-w-md text-sm text-muted-foreground">{props.message}</span>
      <Button type="button" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}
