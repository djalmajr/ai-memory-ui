import { useNavigate } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { Archive } from "lucide-solid";
import { For, Show, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { PageReader } from "~/components/page-reader";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { CollapsibleSection, EmptyState } from "~/components/ui-bits";
import { adminCheckpoints, adminPendingWrites, adminRestorePage } from "~/lib/admin-api";
import type { Checkpoint } from "~/lib/admin-types";
import { ApiError, readPage } from "~/lib/api";
import { canMutate, isAdminTier, tier } from "~/lib/auth";
import { formatDateTime, fromUnixSeconds } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Leitor de página do escopo. `ApiPage.supersedes` é ponteiro de linhagem
// (outro path), nunca "versão anterior desta página" — o `PageReader` já
// rotula como supersede via `reader_supersedes`.
//
// Restaurar usa `POST /admin/restore-page {workspace,project,path,rev}` onde
// `rev` é revisão git. Não existe histórico por página: o seletor lista
// `GET /admin/checkpoints?limit=100` e envia `rev = oid`.

export function ScopePageScreen(props: { path: string; project: string; workspace: string }) {
  const navigate = useNavigate();
  const scope = () => ({ project: props.project, workspace: props.workspace });

  const page$ = useQuery(() => ({
    enabled: props.path.length > 0,
    queryFn: () => readPage({ project: props.project, workspace: props.workspace }, props.path),
    queryKey: ["page", props.workspace, props.project, props.path],
  }));

  const pending$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { limit: 200, status: "pending" }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  const screenLabel = () => page$.data?.title ?? t(() => m.nav_wiki());

  return (
    <Shell
      heading={<ScopeBreadcrumb scope={scope()} screen={screenLabel()} />}
      level="scope"
      pendingCount={pending$.data?.length}
      scope={scope()}
    >
      <Show when={!props.path}>
        <EmptyState body={t(() => m.reader_empty_body())} title={t(() => m.reader_empty_title())} />
      </Show>

      <Show when={props.path && page$.isPending}>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-6 w-1/2 rounded-md" />
          <Skeleton class="h-4 w-1/3 rounded-md" />
          <Skeleton class="h-40 w-full rounded-md" />
        </div>
      </Show>

      <Show when={props.path && page$.isError}>
        <div class="flex flex-col items-start gap-2 text-sm" role="alert">
          <strong>{t(() => m.state_error_title())}</strong>
          <span class="text-destructive">{errorText(page$.error)}</span>
          <Button size="sm" type="button" variant="outline" onClick={() => void page$.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>

      <Show when={page$.data}>
        {(page) => (
          <div class="flex flex-col gap-4">
            <PageReader
              page={page()}
              onNavigate={(nextPath) => {
                void navigate({
                  params: {
                    _splat: nextPath,
                    project: props.project,
                    workspace: props.workspace,
                  },
                  to: "/s/$workspace/$project/pages/$",
                });
              }}
            />
            <Show when={canMutate(tier())}>
              <RestorePanel
                onRestored={() => void page$.refetch()}
                path={props.path}
                project={props.project}
                workspace={props.workspace}
              />
            </Show>
          </div>
        )}
      </Show>
    </Shell>
  );
}

function RestorePanel(props: {
  onRestored: () => void;
  path: string;
  project: string;
  workspace: string;
}) {
  const checkpoints$ = useQuery(() => ({
    queryFn: () => adminCheckpoints(100),
    queryKey: ["admin", "checkpoints", 100],
  }));
  const [restoringOid, setRestoringOid] = createSignal<string | null>(null);
  const [restoreError, setRestoreError] = createSignal<string | null>(null);
  const [restoredOid, setRestoredOid] = createSignal<string | null>(null);

  const restore = async (checkpoint: Checkpoint) => {
    setRestoringOid(checkpoint.oid);
    setRestoreError(null);
    setRestoredOid(null);
    try {
      await adminRestorePage(
        { project: props.project, workspace: props.workspace },
        props.path,
        checkpoint.oid,
      );
      setRestoredOid(checkpoint.short_oid);
      props.onRestored();
    } catch (error) {
      // Mensagem literal do engine (arquivo ausente naquele commit, 4xx/5xx).
      setRestoreError(errorText(error));
    } finally {
      setRestoringOid(null);
    }
  };

  return (
    <CollapsibleSection
      defaultOpen={false}
      icon={<Archive class="text-muted-foreground" size={15} />}
      title={t(() => m.page_restore_title())}
    >
      <div class="flex flex-col gap-4">
        <p class="text-xs text-muted-foreground">{t(() => m.page_restore_hint())}</p>

        <Show when={checkpoints$.isPending}>
          <Skeleton class="h-16 w-full rounded-md" />
        </Show>

        <Show when={checkpoints$.isError}>
          <div class="flex flex-col items-start gap-2 text-sm" role="alert">
            <span class="text-destructive">{errorText(checkpoints$.error)}</span>
            <Button size="sm" type="button" variant="outline" onClick={() => void checkpoints$.refetch()}>
              {t(() => m.state_retry())}
            </Button>
          </div>
        </Show>

        <Show when={!checkpoints$.isPending && !checkpoints$.isError}>
          <Show
            fallback={<EmptyState body={t(() => m.page_restore_empty())} title={t(() => m.state_empty_title())} />}
            when={(checkpoints$.data?.length ?? 0) > 0}
          >
            <div class="overflow-x-auto rounded-lg border border-hairline">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-hairline text-left text-xs text-muted-foreground">
                    <th class="w-28 px-2 py-1.5 font-medium">{t(() => m.page_col_commit())}</th>
                    <th class="min-w-0 px-2 py-1.5 font-medium">{t(() => m.page_col_summary())}</th>
                    <th class="w-36 px-2 py-1.5 font-medium">{t(() => m.page_col_date())}</th>
                    <th class="w-28 px-2 py-1.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  <For each={checkpoints$.data ?? []}>
                    {(checkpoint) => (
                      <tr class="border-b border-hairline last:border-0">
                        <td class="px-2 py-1.5 font-mono text-xs">{checkpoint.short_oid}</td>
                        <td class="min-w-0 truncate px-2 py-1.5">{checkpoint.summary}</td>
                        <td class="px-2 py-1.5 text-muted-foreground">
                          {formatDateTime(fromUnixSeconds(checkpoint.time))}
                        </td>
                        <td class="px-2 py-1.5">
                          <Button
                            disabled={restoringOid() !== null}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => void restore(checkpoint)}
                          >
                            {restoringOid() === checkpoint.oid
                              ? t(() => m.page_restore_working())
                              : t(() => m.page_restore_action())}
                          </Button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>

        <Show when={restoreError()}>
          {(message) => (
            <p class="text-sm text-destructive" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <Show when={restoredOid()}>
          {(oid) => <p class="text-sm text-muted-foreground">{t(() => m.page_restore_ok({ oid: oid() }))}</p>}
        </Show>
      </div>
    </CollapsibleSection>
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
