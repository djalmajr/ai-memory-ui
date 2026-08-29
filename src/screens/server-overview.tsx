import { useQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { For, Show, type JSX } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState, Metric } from "~/components/ui-bits";
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
  DerivedIndexStatus,
  ProviderRoleHealthSnapshot,
  StatusReport,
} from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { formatDateTime, fromUnixSeconds } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Disco, inventário de chaves e contagem por kind ficam de fora: não há
// endpoint de uso de disco, `/admin/status` não quebra pages por kind, e a
// lista de chaves vive no mcp-auth (`/keys`) — ausente neste host.

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

/** admin-types enxugou os nomes; o fio real usa `*_rows` / `links_from_latest_pages`. */
function derivedCount(
  derived: DerivedIndexStatus,
  typed: "embeddings" | "links" | "observations_fts" | "pages_fts",
): number {
  const rec = derived as unknown as Record<string, unknown>;
  const wire: Record<typeof typed, string> = {
    embeddings: "embedding_rows",
    links: "links_from_latest_pages",
    observations_fts: "observations_fts_rows",
    pages_fts: "pages_fts_rows",
  };
  const a = rec[typed];
  const b = rec[wire[typed]];
  if (typeof a === "number") return a;
  if (typeof b === "number") return b;
  return 0;
}

function providerTone(status: string): "error" | "outline" | "secondary" | "success" {
  if (status === "ok") return "success";
  if (status === "error") return "error";
  if (status === "disabled") return "secondary";
  return "outline";
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
          fallback={<EmptyState body={props.emptyBody} title={t(() => m.state_empty_title())} />}
          when={!props.empty}
        >
          {props.children}
        </Show>
      </Show>
    </Show>
  );
}

function ActivityBar(props: { max: number; value: number }) {
  const pct = () => (props.max <= 0 ? 0 : Math.min(100, (props.value / props.max) * 100));
  return (
    <svg aria-hidden="true" class="h-1.5 w-full" preserveAspectRatio="none" viewBox="0 0 100 4">
      <rect class="fill-muted" height="4" width="100" x="0" y="0" />
      <rect class="fill-primary" height="4" width={pct()} x="0" y="0" />
    </svg>
  );
}

function ProviderCard(props: { label: string; snap: ProviderRoleHealthSnapshot }) {
  return (
    <div class="flex min-w-0 flex-col gap-1 rounded-lg border border-hairline p-4 text-sm">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <Badge class="w-fit" variant={providerTone(props.snap.status)}>
        {props.snap.status}
      </Badge>
      <Show when={props.snap.provider}>{(value) => <span class="truncate">{value()}</span>}</Show>
      <Show when={props.snap.model}>
        {(value) => <span class="truncate font-mono text-xs text-muted-foreground">{value()}</span>}
      </Show>
      <Show when={props.snap.dim !== null}>
        <span class="text-xs text-muted-foreground">
          {t(() => m.overview_dim())} {props.snap.dim}
        </span>
      </Show>
    </div>
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
  const activityMax = () => Math.max(0, ...(activityQ.data ?? []).map((row) => row.reads + row.writes));
  const attentionTotal = () => (attentionQ.data ?? []).reduce((sum, row) => sum + row.pending, 0);

  return (
    <Shell
      actions={
        <Show when={statusQ.data}>{(status) => <span class="font-mono">{status().version}</span>}</Show>
      }
      heading={<span>{t(() => m.nav_overview())}</span>}
      level="server"
    >
      <section class="flex flex-col gap-4">
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
              <div class="grid grid-cols-5 gap-4 max-md:grid-cols-2">
                <Metric label={t(() => m.overview_pages())} value={status().counts.pages_latest} />
                <Metric label={t(() => m.overview_versions())} value={status().counts.pages_all} />
                <Metric label={t(() => m.overview_sessions())} value={status().counts.sessions} />
                <Metric label={t(() => m.overview_observations())} value={status().counts.observations} />
                <div class="min-w-0">
                  <Show
                    fallback={
                      <>
                        <strong class="block truncate font-mono text-sm leading-none">—</strong>
                        <small class="text-xs text-muted-foreground">{t(() => m.overview_backup())}</small>
                      </>
                    }
                    when={backup()}
                  >
                    {(cp) => (
                      <>
                        <strong class="block truncate font-mono text-sm leading-none">{cp().short_oid}</strong>
                        <small class="text-xs text-muted-foreground">
                          {t(() => m.overview_backup())} · {formatDateTime(fromUnixSeconds(cp().time))}
                        </small>
                      </>
                    )}
                  </Show>
                </div>
              </div>
            )}
          </Show>
        </QueryBlock>
      </section>

      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-medium">{t(() => m.overview_health())}</h2>
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
              <div class="flex flex-col gap-4">
                <div class="grid grid-cols-4 gap-4 max-md:grid-cols-2">
                  <Metric
                    label={t(() => m.overview_derived_pages_fts())}
                    value={derivedCount(status().derived, "pages_fts")}
                  />
                  <Metric
                    label={t(() => m.overview_derived_obs_fts())}
                    value={derivedCount(status().derived, "observations_fts")}
                  />
                  <Metric
                    label={t(() => m.overview_derived_links())}
                    value={derivedCount(status().derived, "links")}
                  />
                  <Metric
                    label={t(() => m.overview_derived_embeddings())}
                    value={derivedCount(status().derived, "embeddings")}
                  />
                </div>
                <Show when={status().derived.embedding_triples.length > 0}>
                  <div class="overflow-x-auto">
                    <table class="w-full table-fixed text-sm">
                      <caption class="mb-2 text-left text-xs text-muted-foreground">
                        {t(() => m.overview_triples())}
                      </caption>
                      <thead class="text-xs text-muted-foreground">
                        <tr>
                          <th class="w-40 pb-2 text-left font-medium">{t(() => m.overview_triple_provider())}</th>
                          <th class="w-48 pb-2 text-left font-medium">{t(() => m.overview_triple_model())}</th>
                          <th class="w-16 pb-2 text-right font-medium">{t(() => m.overview_triple_dim())}</th>
                          <th class="w-20 pb-2 text-right font-medium">{t(() => m.overview_triple_count())}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={status().derived.embedding_triples}>
                          {(row) => (
                            <tr class="border-t border-hairline">
                              <td class="py-2 font-mono text-xs">{row.provider}</td>
                              <td class="py-2 font-mono text-xs">{row.model}</td>
                              <td class="py-2 text-right">{row.dim}</td>
                              <td class="py-2 text-right">{row.count}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
                <div class="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <ProviderCard label={t(() => m.overview_llm())} snap={status().providers.llm} />
                  <ProviderCard label={t(() => m.overview_embedding())} snap={status().providers.embedding} />
                </div>
              </div>
            )}
          </Show>
        </QueryBlock>
      </section>

      <section class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-sm font-medium">{t(() => m.overview_activity_title())}</h2>
          <p class="text-xs text-muted-foreground">{t(() => m.overview_activity_note())}</p>
        </div>
        <QueryBlock
          empty={(activityQ.data?.length ?? 0) === 0}
          emptyBody={t(() => m.overview_activity_empty())}
          error={activityQ.error}
          isError={activityQ.isError}
          isPending={activityQ.isPending}
          onRetry={() => void activityQ.refetch()}
        >
          <div class="overflow-x-auto">
            <table class="w-full table-fixed text-sm">
              <thead class="text-xs text-muted-foreground">
                <tr>
                  <th class="pb-2 text-left font-medium">{t(() => m.overview_col_client())}</th>
                  <th class="w-20 pb-2 text-right font-medium">{t(() => m.overview_col_reads())}</th>
                  <th class="w-20 pb-2 text-right font-medium">{t(() => m.overview_col_writes())}</th>
                  <th class="w-20 pb-2 text-right font-medium">{t(() => m.overview_col_total())}</th>
                  <th class="w-32 pb-2 text-left font-medium" />
                </tr>
              </thead>
              <tbody>
                <For each={activityQ.data}>
                  {(row) => (
                    <tr class="border-t border-hairline">
                      <td class="py-2 font-mono text-xs">{row.client}</td>
                      <td class="py-2 text-right">{row.reads}</td>
                      <td class="py-2 text-right">{row.writes}</td>
                      <td class="py-2 text-right">{row.reads + row.writes}</td>
                      <td class="py-2">
                        <ActivityBar max={activityMax()} value={row.reads + row.writes} />
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </QueryBlock>
      </section>

      <section class="flex flex-col gap-4">
        <div class="flex items-baseline justify-between gap-2">
          <h2 class="text-sm font-medium">{t(() => m.overview_attention())}</h2>
          <Show when={(attentionQ.data?.length ?? 0) > 0}>
            <span class="text-xs text-muted-foreground">
              {t(() => m.overview_attention_total({ count: attentionTotal() }))}
            </span>
          </Show>
        </div>
        <QueryBlock
          empty={(attentionQ.data?.length ?? 0) === 0}
          emptyBody={t(() => m.overview_attention_empty())}
          error={attentionQ.error}
          isError={attentionQ.isError}
          isPending={attentionQ.isPending}
          onRetry={() => void attentionQ.refetch()}
        >
          <div class="overflow-x-auto">
            <table class="w-full table-fixed text-sm">
              <thead class="text-xs text-muted-foreground">
                <tr>
                  <th class="pb-2 text-left font-medium">{t(() => m.overview_col_scope())}</th>
                  <th class="w-24 pb-2 text-right font-medium">{t(() => m.overview_col_pending())}</th>
                </tr>
              </thead>
              <tbody>
                <For each={attentionQ.data}>
                  {(row) => (
                    <tr class="border-t border-hairline">
                      <td class="py-2">
                        <Link
                          class="font-mono text-xs hover:underline"
                          to="/s/$workspace/$project/pending"
                          params={{ project: row.project, workspace: row.workspace }}
                        >
                          {row.workspace}/{row.project}
                        </Link>
                      </td>
                      <td class="py-2 text-right">{row.pending}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </QueryBlock>
      </section>
    </Shell>
  );
}
