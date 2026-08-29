import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import {
  adminProjects,
  adminSessionsByAgent,
} from "~/lib/admin-api";
import type { AdminProjectSummary, AgentSessionCount } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
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

function periodLabel(days: SinceDays): string {
  if (days === 7) return t(() => m.sessions_period_7());
  if (days === 30) return t(() => m.sessions_period_30());
  return t(() => m.sessions_period_all());
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
      actions={<span>{periodLabel(sinceDays())}</span>}
    >
      <p class="text-sm text-muted-foreground">{t(() => m.sessions_note())}</p>

      <PeriodToggle value={sinceDays()} onChange={setSinceDays} />

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
          <Show
            when={rows().length > 0}
            fallback={
              <EmptyState
                title={t(() => m.state_empty_title())}
                body={t(() => m.sessions_empty_body())}
              />
            }
          >
            <div class="overflow-x-auto rounded-lg border border-hairline">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-hairline text-xs text-muted-foreground">
                    <th class="w-[220px] px-4 py-2 text-left font-medium">
                      {t(() => m.sessions_col_agent())}
                    </th>
                    <th class="w-[120px] px-4 py-2 text-right font-medium">
                      {t(() => m.sessions_col_sessions())}
                    </th>
                    <th class="w-[120px] px-4 py-2 text-right font-medium">
                      {t(() => m.sessions_col_projects())}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={rows()}>
                    {(row) => (
                      <tr class="border-b border-hairline last:border-0">
                        <td class="px-4 py-2 font-mono">{row.agent}</td>
                        <td class="px-4 py-2 text-right tabular-nums">{row.sessions}</td>
                        <td class="px-4 py-2 text-right tabular-nums">{row.projects}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </Show>
    </Shell>
  );
}

function PeriodToggle(props: { value: SinceDays; onChange: (value: SinceDays) => void }) {
  const options: { days: SinceDays; label: () => string }[] = [
    { days: 7, label: () => m.sessions_period_7() },
    { days: 30, label: () => m.sessions_period_30() },
    { days: 0, label: () => m.sessions_period_all() },
  ];
  return (
    <div class="flex flex-wrap gap-2" role="group" aria-label={t(() => m.sessions_period_label())}>
      <For each={options}>
        {(option) => (
          <button
            type="button"
            aria-pressed={props.value === option.days}
            class={cn(
              "h-9 rounded-md border border-hairline px-3 text-sm outline-none transition",
              "focus-visible:ring-2 focus-visible:ring-ring",
              props.value === option.days
                ? "bg-active-item font-medium text-foreground"
                : "bg-content-bg text-muted-foreground hover:text-foreground",
            )}
            onClick={() => props.onChange(option.days)}
          >
            {t(option.label)}
          </button>
        )}
      </For>
    </div>
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
      <Button size="sm" type="button" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}
