import { useNavigate } from "@tanstack/solid-router";
import { useQuery } from "~/lib/query";
import { Archive } from "~/components/icons";
import { Show, createEffect, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { Input } from "~/components/input";
import { PageReader } from "~/components/page-reader";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { CollapsibleSection, EmptyState } from "~/components/ui-bits";
import { TableCell, TableHead, TableRow } from "~/components/table";
import { adminCheckpoints, adminDeletePage, adminPendingWrites, adminRestorePage, adminWritePage } from "~/lib/admin-api";
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
        <Show when={canMutate(tier())}>
          <WritePanel
            body=""
            kind="note"
            path=""
            pinned={false}
            project={props.project}
            tags={[]}
            tierName="semantic"
            title=""
            workspace={props.workspace}
            onSaved={() => void page$.refetch()}
          />
        </Show>
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
          <Button type="button" variant="outline" onClick={() => void page$.refetch()}>
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
              <WritePanel
                body={page().body_markdown}
                kind={page().kind}
                path={page().path}
                pinned={page().pinned}
                project={props.project}
                tags={stringTags(page().frontmatter)}
                tierName={page().tier}
                title={page().title}
                workspace={props.workspace}
                onSaved={() => void page$.refetch()}
              />
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

function stringTags(frontmatter: Record<string, unknown>): string[] {
  const tags = frontmatter.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

function WritePanel(props: {
  body: string;
  kind: string;
  onSaved: () => void;
  path: string;
  pinned: boolean;
  project: string;
  tags: string[];
  tierName: string;
  title: string;
  workspace: string;
}) {
  const [path, setPath] = createSignal("");
  const [body, setBody] = createSignal("");
  const [confirmPath, setConfirmPath] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [saved, setSaved] = createSignal<string | null>(null);

  createEffect(
    () => ({ body: props.body, path: props.path }),
    (next) => {
      setPath(next.path);
      setBody(next.body);
    },
  );

  const save = async () => {
    const nextPath = path().trim();
    if (!nextPath || !body().trim()) return;
    setPending(true);
    setError(null);
    try {
      const written = await adminWritePage({
        body: body(),
        kind: props.kind || undefined,
        path: nextPath,
        pinned: props.pinned,
        project: props.project,
        tags: props.tags,
        tier: props.tierName || "semantic",
        title: props.title || undefined,
        workspace: props.workspace,
      });
      setSaved(written.path);
      props.onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (confirmPath() !== path()) return;
    setPending(true);
    setError(null);
    try {
      await adminDeletePage({ project: props.project, workspace: props.workspace }, path());
      setSaved(null);
      props.onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <section class="flex flex-col gap-3 rounded-lg border border-hairline p-4">
      <h2 class="text-sm font-medium">{t(() => m.page_write_title())}</h2>
      <label class="flex flex-col gap-1.5 text-sm">
        {t(() => m.page_write_path())}
        <Input
          disabled={props.path.length > 0}
          value={path()}
          onInput={(event) => setPath(event.currentTarget.value)}
        />
      </label>
      <label class="flex flex-col gap-1.5 text-sm">
        {t(() => m.page_write_body())}
        <textarea
          class="min-h-40 rounded-lg border border-input bg-transparent p-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={body()}
          onInput={(event) => setBody(event.currentTarget.value)}
        />
      </label>
      <div class="flex flex-wrap gap-2">
        <Button disabled={pending()} type="button" onClick={() => void save()}>
          {t(() => m.page_write_save())}
        </Button>
      </div>
      <Show when={props.path.length > 0}>
        <div class="flex flex-col gap-2 border-t border-hairline pt-3">
          <p class="text-xs text-muted-foreground">{t(() => m.page_delete_hint())}</p>
          <Input
            value={confirmPath()}
            onInput={(event) => setConfirmPath(event.currentTarget.value)}
          />
          <Button
            disabled={pending() || confirmPath() !== path()}
            type="button"
            variant="outline"
            onClick={() => void remove()}
          >
            {t(() => m.page_delete_confirm())}
          </Button>
        </div>
      </Show>
      <Show when={error()}>
        {(message) => (
          <p class="text-sm text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={saved()}>
        {(value) => (
          <p class="text-sm text-muted-foreground">{t(() => m.page_write_saved({ path: value() }))}</p>
        )}
      </Show>
    </section>
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
            <Button type="button" variant="outline" onClick={() => void checkpoints$.refetch()}>
              {t(() => m.state_retry())}
            </Button>
          </div>
        </Show>

        <Show when={!checkpoints$.isPending && !checkpoints$.isError}>
          <DataGrid
            empty={t(() => m.page_restore_empty())}
            items={checkpoints$.data ?? []}
            columns={[
              {
                id: "commit",
                label: t(() => m.page_col_commit()),
                class: "w-28 font-mono text-xs",
                search: (checkpoint) => `${checkpoint.short_oid} ${checkpoint.summary}`,
                sortValue: (checkpoint) => checkpoint.short_oid,
                cell: (checkpoint) => checkpoint.short_oid,
              },
              {
                id: "summary",
                label: t(() => m.page_col_summary()),
                class: "min-w-0 truncate",
                sortValue: (checkpoint) => checkpoint.summary,
                cell: (checkpoint) => checkpoint.summary,
              },
              {
                id: "date",
                label: t(() => m.page_col_date()),
                class: "w-36 text-muted-foreground",
                sortValue: (checkpoint) => checkpoint.time,
                cell: (checkpoint) => formatDateTime(fromUnixSeconds(checkpoint.time)),
              },
              {
                id: "restore",
                label: t(() => m.page_restore_action()),
                class: "w-28",
                hideable: false,
                cell: (checkpoint) => (
                  <Button
                    disabled={restoringOid() !== null}
                    type="button"
                    variant="outline"
                    onClick={() => void restore(checkpoint)}
                  >
                    {restoringOid() === checkpoint.oid
                      ? t(() => m.page_restore_working())
                      : t(() => m.page_restore_action())}
                  </Button>
                ),
              },
            ]}
          />
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
