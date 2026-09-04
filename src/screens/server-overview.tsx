import { useQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { For, Show, type JSX } from "solid-js";

import { Button } from "~/components/button";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import {
  adminActivityByClient,
  adminCheckpoints,
  adminPendingWrites,
  adminProjects,
  adminStatus,
} from "~/lib/admin-api";
import type {
  AdminProjectSummary,
  Checkpoint,
  ClientActivityCount,
  ProviderHealthSnapshot,
  StatusReport,
} from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { formatRelative, fromUnixSeconds } from "~/lib/datetime";
import { t, useLocale } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Layout segue o protótipo Paper "Visão geral · Padrão" (J3B-0): stat strip,
// "Requer atenção" e "Atividade por cliente". Células que o protótipo previa
// mas o engine não expõe foram substituídas por dados reais: não há endpoint
// de uso de disco e o inventário de chaves vive no mcp-auth (`/keys`), então
// as células viram Páginas e Observações vindas de `/admin/status`.

interface AttentionRow {
  pending: number;
  project: string;
  workspace: string;
}

/** Fan-out limitado: o engine não agrega pending writes server-wide. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const n = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (cursor < items.length) {
        const i = cursor;
        cursor += 1;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function loadAttention(): Promise<AttentionRow[]> {
  const projects = await adminProjects();
  const rows = await mapLimit(projects, 6, pendingForProject);
  return rows.filter((row): row is AttentionRow => row !== null);
}

async function pendingForProject(project: AdminProjectSummary): Promise<AttentionRow | null> {
  try {
    // `status=pending` é o filtro documentado; sem ele o clamp 200 mistura aprovadas.
    const writes = await adminPendingWrites(
      { project: project.project_name, workspace: project.workspace_name },
      { limit: 200, status: "pending" },
    );
    if (writes.length === 0) return null;
    return {
      pending: writes.length,
      project: project.project_name,
      workspace: project.workspace_name,
    };
  } catch (error) {
    // Escopo que 404 é ignorado (projeto sumiu entre /projects e a fila).
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(useLocale(), {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatFull(value: number): string {
  return new Intl.NumberFormat(useLocale()).format(value);
}

/** Célula do stat strip do protótipo: rótulo, valor 17px, sublinha muted. */
function StatCell(props: { label: string; mono?: boolean; sub: string; value: string }) {
  return (
    <div class="flex min-w-0 flex-1 flex-col gap-0.5 border-hairline p-4 not-last:border-r max-md:not-last:border-r-0 max-md:not-last:border-b">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <strong class="truncate text-[17px] font-semibold leading-[22px]">{props.value}</strong>
      <span class={props.mono ? "truncate font-mono text-xs text-muted-foreground" : "truncate text-xs text-muted-foreground"}>
        {props.sub}
      </span>
    </div>
  );
}

/** Resumo da célula LLM + Embeddings a partir do snapshot de providers. */
function providersSummary(providers: ProviderHealthSnapshot): { sub: string; value: string } {
  const { llm, embedding } = providers;
  const value =
    llm.status === embedding.status
      ? llm.provider && llm.status === "ok"
        ? `${llm.provider} ok`
        : llm.status
      : `${llm.status} · ${embedding.status}`;
  const models = [llm.model, embedding.model].filter((model): model is string => model !== null);
  return { sub: models.length > 0 ? models.join(" · ") : "—", value };
}

function QueryBlock(props: {
  children: JSX.Element;
  empty: boolean;
  emptyBody: string;
  error: Error | null;
  isError: boolean;
  isPending: boolean;
  onRetry: () => void;
}) {
  return (
    <Show
      fallback={
        <div class="flex flex-col gap-3">
          <Skeleton class="h-4 w-1/3 rounded-md" />
          <Skeleton class="h-16 w-full rounded-md" />
        </div>
      }
      when={!props.isPending}
    >
      <Show
        fallback={
          <div class="flex flex-col items-start gap-2" role="alert">
            <strong class="text-sm">{t(() => m.state_error_title())}</strong>
            <p class="text-sm text-destructive">{errorText(props.error)}</p>
            <Button onClick={() => props.onRetry()} size="sm" type="button" variant="outline">
              {t(() => m.state_retry())}
            </Button>
          </div>
        }
        when={!props.isError}
      >
        <Show
          fallback={
            <div class="rounded-lg border border-hairline">
              <EmptyState body={props.emptyBody} title={t(() => m.state_empty_title())} />
            </div>
          }
          when={!props.empty}
        >
          {props.children}
        </Show>
      </Show>
    </Show>
  );
}

export function ServerOverviewScreen() {
  const statusQ = useQuery<StatusReport>(() => ({
    queryFn: adminStatus,
    queryKey: ["admin", "status"],
  }));
  const checkpointsQ = useQuery<Checkpoint[]>(() => ({
    queryFn: () => adminCheckpoints(1),
    queryKey: ["admin", "checkpoints", 1],
  }));
  const activityQ = useQuery<ClientActivityCount[]>(() => ({
    queryFn: () => adminActivityByClient(7),
    queryKey: ["admin", "activity", 7],
  }));
  const attentionQ = useQuery<AttentionRow[]>(() => ({
    queryFn: loadAttention,
    queryKey: ["admin", "attention"],
  }));

  const backup = () => checkpointsQ.data?.[0] ?? null;
  // Barra da atividade: largura = participação do cliente no total da janela;
  // dentro dela, leituras (primary) e escritas (tom claro) mostram o mix.
  const activityTotal = () => (activityQ.data ?? []).reduce((sum, row) => sum + row.reads + row.writes, 0);

  return (
    <Shell
      actions={
        <Show when={statusQ.data}>
          {/* Só a versão: qualquer sufixo de status ("saudável"/"conectado")
              seria tautológico — se o conteúdo carregou, o engine respondeu.
              O tooltip documenta a origem do dado. */}
          {(status) => (
            <span class="cursor-default" title={t(() => m.overview_engine_status_hint())}>
              {t(() => m.overview_engine_status({ version: status().version }))}
            </span>
          )}
        </Show>
      }
      heading={<span>{t(() => m.nav_overview())}</span>}
      level="server"
    >
      <section class="flex flex-col gap-1.5">
        <QueryBlock
          empty={statusQ.data === undefined}
          emptyBody={t(() => m.overview_status_empty())}
          error={statusQ.error}
          isError={statusQ.isError}
          isPending={statusQ.isPending}
          onRetry={() => void statusQ.refetch()}
        >
          <Show when={statusQ.data}>
            {(status) => (
              <div class="flex w-full rounded-lg border border-hairline max-md:flex-col">
                <StatCell
                  label={t(() => m.overview_backup())}
                  mono
                  sub={backup()?.short_oid ?? "—"}
                  value={backup() ? formatRelative(fromUnixSeconds(backup()!.time)) : "—"}
                />
                <StatCell
                  label={t(() => m.overview_pages())}
                  sub={t(() => m.overview_sub_versions({ count: formatFull(status().counts.pages_all) }))}
                  value={formatCompact(status().counts.pages_latest)}
                />
                <StatCell
                  label={t(() => m.overview_observations())}
                  sub={t(() => m.overview_sub_sessions({ count: formatFull(status().counts.sessions) }))}
                  value={formatCompact(status().counts.observations)}
                />
                <StatCell
                  label={t(() => m.overview_llm_embeddings())}
                  sub={providersSummary(status().providers).sub}
                  value={providersSummary(status().providers).value}
                />
              </div>
            )}
          </Show>
        </QueryBlock>
      </section>

      <section class="flex flex-col gap-1.5">
        <h2 class="text-sm font-semibold">{t(() => m.overview_attention())}</h2>
        <QueryBlock
          empty={(attentionQ.data?.length ?? 0) === 0}
          emptyBody={t(() => m.overview_attention_empty())}
          error={attentionQ.error}
          isError={attentionQ.isError}
          isPending={attentionQ.isPending}
          onRetry={() => void attentionQ.refetch()}
        >
          <div class="flex flex-col rounded-lg border border-hairline">
            <For each={attentionQ.data}>
              {(row) => (
                <div class="flex items-center gap-2.5 border-hairline px-3.5 py-2.5 not-last:border-b">
                  <span aria-hidden="true" class="size-2 shrink-0 rounded-full bg-warning" />
                  <span class="min-w-0 flex-1 truncate text-sm">
                    {t(() => m.overview_attention_row({ count: row.pending }))}
                  </span>
                  <span class="shrink-0 font-mono text-xs text-muted-foreground">
                    {row.workspace}/{row.project}
                  </span>
                  <Link
                    class="shrink-0 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    to="/s/$workspace/$project/pending"
                    params={{ project: row.project, workspace: row.workspace }}
                  >
                    {t(() => m.overview_attention_review())}
                  </Link>
                </div>
              )}
            </For>
          </div>
        </QueryBlock>
      </section>

      <section class="flex flex-col gap-1.5">
        <h2 class="text-sm font-semibold">{t(() => m.overview_activity_title())}</h2>
        <QueryBlock
          empty={(activityQ.data?.length ?? 0) === 0}
          emptyBody={t(() => m.overview_activity_empty())}
          error={activityQ.error}
          isError={activityQ.isError}
          isPending={activityQ.isPending}
          onRetry={() => void activityQ.refetch()}
        >
          <div class="flex flex-col rounded-lg border border-hairline">
            <For each={activityQ.data}>
              {(row) => (
                <div class="flex items-center gap-3 border-hairline px-3.5 py-2.5 not-last:border-b">
                  <Show
                    fallback={
                      <span class="w-28 shrink-0 truncate text-xs italic text-muted-foreground">
                        {t(() => m.overview_client_unknown())}
                      </span>
                    }
                    when={row.client !== "unknown"}
                  >
                    <span class="w-28 shrink-0 truncate font-mono text-xs">{row.client}</span>
                  </Show>
                  <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      class="flex h-1.5 overflow-hidden rounded-full"
                      style={{
                        width: `${activityTotal() <= 0 ? 0 : ((row.reads + row.writes) / activityTotal()) * 100}%`,
                      }}
                    >
                      <div class="h-1.5 bg-primary" style={{ width: `${(row.reads / Math.max(1, row.reads + row.writes)) * 100}%` }} />
                      <div class="h-1.5 min-w-0 flex-1 bg-primary/30" />
                    </div>
                  </div>
                  <span class="w-10 shrink-0 text-right text-xs text-muted-foreground">
                    {activityTotal() <= 0
                      ? "—"
                      : new Intl.NumberFormat(useLocale(), { maximumFractionDigits: 0, style: "percent" }).format(
                          (row.reads + row.writes) / activityTotal(),
                        )}
                  </span>
                  <span class="flex shrink-0 items-center gap-1.5 text-right text-xs text-muted-foreground">
                    <span aria-hidden="true" class="size-1.5 rounded-full bg-primary" />
                    {t(() => m.overview_activity_reads({ count: formatFull(row.reads) }))}
                    <span aria-hidden="true" class="ml-1 size-1.5 rounded-full bg-primary/30" />
                    {t(() => m.overview_activity_writes({ count: formatFull(row.writes) }))}
                  </span>
                </div>
              )}
            </For>
          </div>
        </QueryBlock>
      </section>
    </Shell>
  );
}
