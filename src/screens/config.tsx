import { useQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState, Metric } from "~/components/ui-bits";
import { adminStatus } from "~/lib/admin-api";
import type {
  DerivedIndexStatus,
  EmbeddingTripleCount,
  ProviderRoleHealthSnapshot,
  StatusReport,
} from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Configuração (B10). Só o observável de GET /admin/status. Não existe
// endpoint de config efetiva — linhas de compose/env/decay ficam de fora.

function failMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

// admin-types usa nomes curtos; o engine serializa os campos de reader.rs
// (`pages_fts_rows`, `embedding_rows`, `links_from_latest_pages`). Lemos os
// dois para a tela não nascer zerada contra um status real.
interface DerivedWire {
  pages_fts?: number;
  pages_fts_rows?: number;
  observations_fts?: number;
  observations_fts_rows?: number;
  links?: number;
  links_from_latest_pages?: number;
  embeddings?: number;
  embedding_rows?: number;
  embedding_triples?: EmbeddingTripleCount[];
}

function derivedView(d: DerivedIndexStatus) {
  const w = d as DerivedIndexStatus & DerivedWire;
  return {
    pagesFts: w.pages_fts ?? w.pages_fts_rows ?? 0,
    observationsFts: w.observations_fts ?? w.observations_fts_rows ?? 0,
    links: w.links ?? w.links_from_latest_pages ?? 0,
    embeddings: w.embeddings ?? w.embedding_rows ?? 0,
    triples: w.embedding_triples ?? [],
  };
}

function tripleIsStale(triple: EmbeddingTripleCount, embedding: ProviderRoleHealthSnapshot): boolean {
  // Sem provider/modelo/dim atuais não há o que comparar — não marcar.
  if (embedding.provider == null && embedding.model == null && embedding.dim == null) {
    return false;
  }
  if (embedding.provider != null && triple.provider !== embedding.provider) return true;
  if (embedding.model != null && triple.model !== embedding.model) return true;
  if (embedding.dim != null && triple.dim !== embedding.dim) return true;
  return false;
}

function IdentityRow(props: { label: string; value: string }) {
  return (
    <div class="flex gap-4 text-sm">
      <span class="w-28 shrink-0 text-xs text-muted-foreground">{props.label}</span>
      <span class="min-w-0 break-all font-mono">{props.value}</span>
    </div>
  );
}

function ProviderCard(props: { role: ProviderRoleHealthSnapshot; title: string }) {
  return (
    <div class="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-hairline p-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-medium">{props.title}</h3>
        <Badge variant="outline">{props.role.status}</Badge>
      </div>
      <Show when={props.role.provider}>
        {(provider) => (
          <p class="font-mono text-sm">
            {t(() => m.config_col_provider())}: {provider()}
          </p>
        )}
      </Show>
      <Show when={props.role.model}>
        {(model) => (
          <p class="font-mono text-sm">
            {t(() => m.config_col_model())}: {model()}
          </p>
        )}
      </Show>
      <Show when={props.role.dim != null}>
        <p class="font-mono text-sm">
          {t(() => m.config_col_dim())}: {props.role.dim}
        </p>
      </Show>
    </div>
  );
}

function ConfigBody(props: { status: StatusReport }) {
  const derived = () => derivedView(props.status.derived);
  const counts = () => props.status.counts;
  const embedding = () => props.status.providers.embedding;

  return (
    <div class="flex flex-col gap-4">
      <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
        <h2 class="text-sm font-medium">{t(() => m.config_identity())}</h2>
        <IdentityRow label={t(() => m.config_version())} value={props.status.version} />
        <IdentityRow label={t(() => m.config_bind())} value={props.status.bind} />
        <IdentityRow label={t(() => m.config_data_dir())} value={props.status.data_dir} />
        <IdentityRow label={t(() => m.config_db_path())} value={props.status.db_path} />
      </section>

      <section class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
        <h2 class="text-sm font-medium">{t(() => m.config_counts())}</h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label={t(() => m.config_count_pages())} value={counts().pages_latest} />
          <Metric label={t(() => m.config_count_versions())} value={counts().pages_all} />
          <Metric label={t(() => m.config_count_sessions())} value={counts().sessions} />
          <Metric label={t(() => m.config_count_observations())} value={counts().observations} />
        </div>
      </section>

      <section class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
        <h2 class="text-sm font-medium">{t(() => m.config_derived())}</h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label={t(() => m.config_derived_pages_fts())} value={derived().pagesFts} />
          <Metric label={t(() => m.config_derived_obs_fts())} value={derived().observationsFts} />
          <Metric label={t(() => m.config_derived_links())} value={derived().links} />
          <Metric label={t(() => m.config_derived_embeddings())} value={derived().embeddings} />
        </div>
        <h3 class="text-xs font-medium text-muted-foreground">{t(() => m.config_triples())}</h3>
        <Show
          when={derived().triples.length > 0}
          fallback={
            <EmptyState body={t(() => m.config_empty_triples())} title={t(() => m.state_empty_title())} />
          }
        >
          <div class="overflow-x-auto rounded-md border border-hairline">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-hairline text-left text-xs text-muted-foreground">
                  <th class="px-3 py-2 font-medium">{t(() => m.config_col_provider())}</th>
                  <th class="px-3 py-2 font-medium">{t(() => m.config_col_model())}</th>
                  <th class="w-20 px-3 py-2 font-medium">{t(() => m.config_col_dim())}</th>
                  <th class="w-24 px-3 py-2 font-medium">{t(() => m.config_col_count())}</th>
                  <th class="w-28 px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                <For each={derived().triples}>
                  {(triple) => (
                    <tr class="border-b border-hairline last:border-0">
                      <td class="px-3 py-2 font-mono text-xs">{triple.provider}</td>
                      <td class="px-3 py-2 font-mono text-xs">{triple.model}</td>
                      <td class="px-3 py-2 font-mono text-xs">{triple.dim}</td>
                      <td class="px-3 py-2 tabular-nums">{triple.count}</td>
                      <td class="px-3 py-2">
                        <Show when={tripleIsStale(triple, embedding())}>
                          <Badge title={t(() => m.config_stale_hint())} variant="warning">
                            {t(() => m.config_stale_triple())}
                          </Badge>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>

      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-medium">{t(() => m.config_providers())}</h2>
        <div class="flex flex-col gap-4 sm:flex-row">
          <ProviderCard role={props.status.providers.llm} title={t(() => m.config_provider_llm())} />
          <ProviderCard role={props.status.providers.embedding} title={t(() => m.config_provider_embedding())} />
        </div>
      </section>

      <p class="text-sm text-muted-foreground">{t(() => m.config_readonly_note())}</p>
    </div>
  );
}

export function ConfigScreen() {
  const q = useQuery(() => ({
    queryFn: adminStatus,
    queryKey: ["admin", "status"],
  }));

  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_config())}</span>}
      actions={<span>{t(() => m.config_subtitle())}</span>}
    >
      <Show when={q.isPending && q.data === undefined}>
        <div class="flex flex-col gap-3">
          <Skeleton class="h-4 w-1/2 rounded-md" />
          <Skeleton class="h-24 w-full rounded-md" />
          <Skeleton class="h-24 w-full rounded-md" />
        </div>
      </Show>
      <Show when={q.isError && q.data === undefined}>
        <div class="flex flex-col items-start gap-2" role="alert">
          <p class="text-sm font-medium">{t(() => m.state_error_title())}</p>
          <p class="text-sm text-destructive">{failMessage(q.error)}</p>
          <Button size="sm" type="button" variant="outline" onClick={() => void q.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>
      <Show when={q.data}>{(status) => <ConfigBody status={status()} />}</Show>
    </Shell>
  );
}
