import { useQuery } from "~/lib/query";
import { Show } from "solid-js";

import { Badge } from "~/components/badge";
import { Tooltip } from "~/components/tooltip";
import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/tabs";
import { StatCell, StatStrip } from "~/components/stat-strip";
import { adminStatus } from "~/lib/admin-api";
import type {
  DerivedIndexStatus,
  EmbeddingTripleCount,
  ProviderRoleHealthSnapshot,
  StatusReport,
} from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { t } from "~/lib/i18n";
import { formatBytes } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Configuração (B10). Só o observável de GET /admin/status: identidade,
// contagens, índices, providers e storage (disco, tamanho, reclaim, fila
// de escrita, formato OKF). Não existe endpoint de config efetiva — linhas
// de compose/env/decay ficam de fora.

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
        <Show when={props.role.provider}>
          {(provider) => <Badge variant="outline">{provider()}</Badge>}
        </Show>
      </div>
      <Show when={props.role.model}>
        {(model) => (
          <p class="text-sm">
            {t(() => m.config_col_model())}: {model()}
          </p>
        )}
      </Show>
      <Show when={props.role.dim != null}>
        <p class="text-sm">
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
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">{t(() => m.config_tab_general())}</TabsTrigger>
        <TabsTrigger value="derived">{t(() => m.config_derived())}</TabsTrigger>
      </TabsList>
      <TabsContent value="general" class="flex flex-col gap-4">
      <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
        <h2 class="text-sm font-medium">{t(() => m.config_identity())}</h2>
        <IdentityRow label={t(() => m.config_version())} value={props.status.version} />
        <IdentityRow label={t(() => m.config_bind())} value={props.status.bind} />
        <IdentityRow label={t(() => m.config_data_dir())} value={props.status.data_dir} />
        <IdentityRow label={t(() => m.config_db_path())} value={props.status.db_path} />
      </section>

      <section class="flex flex-col gap-1.5">
        <h2 class="text-sm font-semibold">{t(() => m.config_counts())}</h2>
        <StatStrip>
          <StatCell label={t(() => m.config_count_pages())} value={counts().pages_latest} />
          <StatCell label={t(() => m.config_count_versions())} value={counts().pages_all} />
          <StatCell label={t(() => m.config_count_sessions())} value={counts().sessions} />
          <StatCell label={t(() => m.config_count_observations())} value={counts().observations} />
        </StatStrip>
      </section>

      <Show when={props.status.storage}>
        {(storage) => (
          <>
          <section class="flex flex-col gap-1.5">
            <h2 class="text-sm font-semibold">{t(() => m.config_storage())}</h2>
            <StatStrip>
              <StatCell
                label={t(() => m.config_disk_free())}
                sub={
                  storage().data_dir_free_bytes === null
                    ? t(() => m.overview_disk_unknown())
                    : t(() => m.overview_disk_sub())
                }
                value={formatBytes(storage().data_dir_free_bytes)}
              />
              <StatCell
                label={t(() => m.config_database_bytes())}
                sub={t(() => m.overview_database_sub())}
                value={formatBytes(storage().database_bytes)}
              />
              <StatCell
                label={t(() => m.config_reclaimable_bytes())}
                sub={t(() => m.overview_reclaimable_sub())}
                value={formatBytes(storage().reclaimable_bytes)}
              />
              <Show when={props.status.write_queue}>
                {(queue) => (
                  <StatCell
                    label={t(() => m.config_write_queue())}
                    value={`${queue()[0]} / ${queue()[1]}`}
                  />
                )}
              </Show>
            </StatStrip>
          </section>
          <Show when={props.status.wiki_format}>
            {(format) => (
              <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
                <h2 class="text-sm font-medium">{t(() => m.config_okf())}</h2>
                <p class="text-sm">
                  {format().okf_migrated ? t(() => m.config_okf_yes()) : t(() => m.config_okf_no())}
                </p>
                <Show when={format().backup_archive}>
                  {(archive) => (
                    <IdentityRow label={t(() => m.config_backup_archive())} value={archive()} />
                  )}
                </Show>
              </section>
            )}
          </Show>
        </>
        )}
      </Show>

      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-medium">{t(() => m.config_providers())}</h2>
        <div class="flex flex-col gap-4 sm:flex-row">
          <ProviderCard role={props.status.providers.llm} title={t(() => m.config_provider_llm())} />
          <ProviderCard role={props.status.providers.embedding} title={t(() => m.config_provider_embedding())} />
        </div>
      </section>

      <p class="text-sm text-muted-foreground">{t(() => m.config_readonly_note())}</p>
      </TabsContent>
      <TabsContent value="derived" class="flex flex-col gap-4">
        <StatStrip>
          <StatCell label={t(() => m.config_derived_pages_fts())} value={derived().pagesFts} />
          <StatCell label={t(() => m.config_derived_obs_fts())} value={derived().observationsFts} />
          <StatCell label={t(() => m.config_derived_links())} value={derived().links} />
          <StatCell label={t(() => m.config_derived_embeddings())} value={derived().embeddings} />
        </StatStrip>
        <DataGrid
          empty={t(() => m.config_empty_triples())}
          items={derived().triples}
          columns={[
            {
              id: "provider",
              label: t(() => m.config_col_provider()),
              search: (triple) => `${triple.provider} ${triple.model}`,
              sortValue: (triple) => triple.provider,
              cell: (triple) => triple.provider,
            },
            {
              id: "model",
              label: t(() => m.config_col_model()),
              sortValue: (triple) => triple.model,
              cell: (triple) => triple.model,
            },
            {
              id: "dim",
              label: t(() => m.config_col_dim()),
              class: "w-20 tabular-nums",
              sortValue: (triple) => triple.dim,
              cell: (triple) => triple.dim,
            },
            {
              id: "count",
              label: t(() => m.config_col_count()),
              class: "w-24 tabular-nums",
              sortValue: (triple) => triple.count,
              cell: (triple) => triple.count,
            },
            {
              id: "stale",
              label: t(() => m.config_stale_triple()),
              class: "w-28",
              hideable: false,
              cell: (triple) => (
                <Show when={tripleIsStale(triple, embedding())}>
                  <Tooltip content={t(() => m.config_stale_hint())}>
                    <Badge variant="warning">{t(() => m.config_stale_triple())}</Badge>
                  </Tooltip>
                </Show>
              ),
            },
          ]}
        />
      </TabsContent>
    </Tabs>
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
      screen={t(() => m.nav_config())}
      description={<span>{t(() => m.config_subtitle())}</span>}
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
          <Button type="button" variant="outline" onClick={() => void q.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>
      <Show when={q.data}>{(status) => <ConfigBody status={status()} />}</Show>
    </Shell>
  );
}
