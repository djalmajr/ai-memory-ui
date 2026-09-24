import { useNavigate } from "@tanstack/solid-router";
import { useQuery } from "~/lib/query";
import { Archive, Ellipsis, History, Pencil, Save, Trash2, X } from "~/components/icons";
import { Portal } from "@solidjs/web";
import { Show, createSignal, onSettled, untrack } from "solid-js";

import { Button } from "~/components/button";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { DataGrid } from "~/components/data-grid";
import { Input } from "~/components/input";
import { MarkdownEditor } from "~/components/markdown-editor";
import { stripFrontmatter } from "~/components/markdown";
import { PagePathBreadcrumb, PageReader } from "~/components/page-reader";
import { Content as PopoverContent, Portal as PopoverPortal, Root as PopoverRoot, Trigger as PopoverTrigger } from "~/components/popover";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { Tooltip } from "~/components/tooltip";
import { EmptyState } from "~/components/ui-bits";
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

export function ScopePageScreen(props: {
  editing: boolean;
  path: string;
  project: string;
  workspace: string;
}) {
  const navigate = useNavigate();
  const [restoreOpen, setRestoreOpen] = createSignal(false);
  const scope = () => ({ project: props.project, workspace: props.workspace });
  const pageParams = () => ({
    _splat: props.path,
    project: props.project,
    workspace: props.workspace,
  });

  const openEdit = () => {
    void navigate({
      params: pageParams(),
      search: { mode: "edit" },
      to: "/s/$workspace/$project/pages/$",
    });
  };

  const closeEdit = () => {
    void navigate({
      params: pageParams(),
      search: {},
      to: "/s/$workspace/$project/pages/$",
    });
  };

  const openWritten = (path: string) => {
    void navigate({
      params: { ...pageParams(), _splat: path },
      search: {},
      to: "/s/$workspace/$project/pages/$",
    });
  };

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
      description={<span>{props.path ? t(() => m.page_subtitle()) : t(() => m.page_new_subtitle())}</span>}
      fill={props.editing}
      heading={
        props.path ? (
          <span>{page$.data?.title ?? props.path}</span>
        ) : (
          <ScopeBreadcrumb scope={scope()} screen={screenLabel()} />
        )
      }
      level="scope"
      pendingCount={pending$.data?.length}
      scope={scope()}
    >
      <Show when={(props.path && page$.data) || (props.editing && canMutate(tier()))}>
        <div class="-mx-4 -mt-4 border-b border-hairline px-4 py-2">
          <div class="flex min-w-0 items-center gap-2">
            <Show when={props.path}>
              <div class="min-w-0">
                <PagePathBreadcrumb path={props.path} project={props.project} workspace={props.workspace} />
              </div>
            </Show>
            <div class="-my-2 ml-auto flex shrink-0 items-center gap-0.5" id="page-body-actions">
              <Show when={!props.editing && props.path && canMutate(tier())}>
                <Tooltip content={t(() => m.page_restore_title())}>
                  <Button
                    aria-label={t(() => m.page_restore_title())}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() => setRestoreOpen(true)}
                  >
                    <Archive class="size-3.5" size={14} />
                  </Button>
                </Tooltip>
                <Tooltip content={t(() => m.page_edit())}>
                  <Button
                    aria-label={t(() => m.page_edit())}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={openEdit}
                  >
                    <Pencil class="size-3.5" size={14} />
                  </Button>
                </Tooltip>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={!props.path && !props.editing}>
        <EmptyState body={t(() => m.reader_empty_body())} title={t(() => m.reader_empty_title())} />
        <Show when={canMutate(tier())}>
          <Button type="button" onClick={openEdit}>
            {t(() => m.page_write_title())}
          </Button>
        </Show>
      </Show>

      <Show when={!props.path && props.editing && canMutate(tier())}>
        <PageEditor
          body=""
          kind="note"
          path=""
          pinned={false}
          project={props.project}
          tags={[]}
          tierName="semantic"
          title=""
          workspace={props.workspace}
          onBack={closeEdit}
          onDeleted={closeEdit}
          onSaved={openWritten}
        />
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
          <Show
            when={props.editing && canMutate(tier())}
            fallback={
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
                      search: {},
                      to: "/s/$workspace/$project/pages/$",
                    });
                  }}
                />
                <Show when={restoreOpen() && canMutate(tier())}>
                  <RestoreDialog
                    onClose={() => setRestoreOpen(false)}
                    onRestored={() => void page$.refetch()}
                    path={props.path}
                    project={props.project}
                    workspace={props.workspace}
                  />
                </Show>
              </div>
            }
          >
            <PageEditor
              body={page().body_markdown}
              kind={page().kind}
              path={page().path}
              pinned={page().pinned}
              project={props.project}
              tags={stringTags(page().frontmatter)}
              tierName={page().tier}
              title={page().title}
              workspace={props.workspace}
              onBack={closeEdit}
              onDeleted={() => {
                void navigate({
                  params: { project: props.project, workspace: props.workspace },
                  to: "/s/$workspace/$project",
                });
              }}
              onSaved={(path) => {
                openWritten(path);
                void page$.refetch();
              }}
            />
          </Show>
        )}
      </Show>
    </Shell>
  );
}

function stringTags(frontmatter: Record<string, unknown>): string[] {
  const tags = frontmatter.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

function frontmatterBlock(source: string): string {
  if (!source.startsWith("---")) return "";
  const end = source.indexOf("\n---", 3);
  if (end === -1) return "";
  const after = source.indexOf("\n", end + 1);
  return after === -1 ? source : source.slice(0, after + 1);
}

function titleFromMarkdown(body: string, fallback: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(body);
  const title = match?.[1]?.trim() || fallback.trim();
  return title || undefined;
}

function PageEditor(props: {
  body: string;
  kind: string;
  onBack: () => void;
  onDeleted: () => void;
  onSaved: (path: string) => void;
  path: string;
  pinned: boolean;
  project: string;
  tags: string[];
  tierName: string;
  title: string;
  workspace: string;
}) {
  const initial = untrack(() => ({
    body: props.body,
    path: props.path,
    title: props.title,
  }));
  const front = frontmatterBlock(initial.body);
  const [path, setPath] = createSignal(initial.path);
  const [markdown, setMarkdown] = createSignal(stripFrontmatter(initial.body));
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [actionSlot, setActionSlot] = createSignal<HTMLElement>();

  onSettled(() => {
    const slot = document.getElementById("page-body-actions");
    if (slot) setActionSlot(slot);
  });

  const save = async () => {
    const nextPath = path().trim();
    const nextMarkdown = markdown().trim();
    if (!nextPath || !nextMarkdown) return;
    const body = front ? `${front}${nextMarkdown}\n` : `${nextMarkdown}\n`;
    setPending(true);
    setError(null);
    try {
      const written = await adminWritePage({
        body,
        kind: props.kind || undefined,
        path: nextPath,
        pinned: props.pinned,
        project: props.project,
        tags: props.tags,
        tier: props.tierName || "semantic",
        title: titleFromMarkdown(nextMarkdown, initial.title),
        workspace: props.workspace,
      });
      props.onSaved(written.path);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      await adminDeletePage({ project: props.project, workspace: props.workspace }, path());
      setDeleteOpen(false);
      props.onDeleted();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4" data-testid="page-editor">
      <Show when={props.path.length === 0}>
        <label class="flex flex-col gap-1.5 text-sm">
          {t(() => m.page_write_path())}
          <Input
            class="font-mono"
            value={path()}
            onInput={(event) => setPath(event.currentTarget.value)}
          />
        </label>
      </Show>
      <Show when={actionSlot()}>
        {(slot) => (
          <Portal mount={slot()}>
            <Tooltip content={t(() => m.page_write_save())}>
              <Button
                aria-label={t(() => m.page_write_save())}
                disabled={pending()}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => void save()}
              >
                <Save class="size-3.5" size={14} />
              </Button>
            </Tooltip>
            <Tooltip content={t(() => m.confirm_cancel())}>
              <Button
                aria-label={t(() => m.confirm_cancel())}
                size="icon"
                type="button"
                variant="ghost"
                onClick={props.onBack}
              >
                <X class="size-3.5" size={14} />
              </Button>
            </Tooltip>
            <Show when={props.path.length > 0}>
              <PopoverRoot gutter={4} open={menuOpen()} placement="bottom-end" onOpenChange={setMenuOpen}>
                <PopoverTrigger
                  aria-label={t(() => m.users_actions())}
                  class="inline-flex size-8 items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  disabled={pending()}
                >
                  <Ellipsis class="size-3.5" size={14} />
                </PopoverTrigger>
                <PopoverPortal>
                  <PopoverContent class="w-44 gap-0.5 p-1" role="menu">
                    <button
                      class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-destructive outline-none hover:bg-destructive/10 [&_svg]:size-4"
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 size={16} />
                      {t(() => m.page_delete())}
                    </button>
                  </PopoverContent>
                </PopoverPortal>
              </PopoverRoot>
            </Show>
          </Portal>
        )}
      </Show>
      <MarkdownEditor initial={stripFrontmatter(initial.body)} onChange={setMarkdown} />
      <Show when={deleteOpen()}>
        <ConfirmDialog
          body={t(() => m.page_delete_hint())}
          confirmLabel={t(() => m.page_delete_confirm())}
          destructive
          error={error()}
          pending={pending()}
          title={t(() => m.page_delete())}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => void remove()}
        />
      </Show>
      <Show when={error()}>
        {(message) => (
          <p class="text-sm text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </div>
  );
}

function RestoreDialog(props: {
  onClose: () => void;
  onRestored: () => void;
  path: string;
  project: string;
  workspace: string;
}) {
  let dialog: HTMLDivElement | undefined;
  onSettled(() => {
    dialog?.focus();
  });
  const checkpoints$ = useQuery(() => ({
    queryFn: () => adminCheckpoints(100),
    queryKey: ["admin", "checkpoints", 100],
  }));
  const [confirmRestore, setConfirmRestore] = createSignal<Checkpoint | null>(null);
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
      return true;
    } catch (error) {
      // Mensagem literal do engine (arquivo ausente naquele commit, 4xx/5xx).
      setRestoreError(errorText(error));
      return false;
    } finally {
      setRestoringOid(null);
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        ref={dialog}
        aria-labelledby="page-restore-title"
        aria-modal="true"
        class="flex max-h-[85vh] w-full max-w-5xl flex-col gap-4 overflow-hidden rounded-lg border border-hairline bg-content-bg p-4 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="dialog"
        tabindex="-1"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
      >
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-medium" id="page-restore-title">
            {t(() => m.page_restore_title())}
          </h2>
          <Button
            aria-label={t(() => m.page_restore_close())}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={props.onClose}
          >
            <X />
          </Button>
        </div>
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
            scrollClass="max-h-[calc(85vh-16rem)]"
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
                class: "w-24",
                hideable: false,
                cell: (checkpoint) => (
                  <Tooltip
                    content={
                      restoringOid() === checkpoint.oid
                        ? t(() => m.page_restore_working())
                        : t(() => m.page_restore_action())
                    }
                  >
                    <Button
                      aria-label={t(() => m.page_restore_action())}
                      disabled={restoringOid() !== null}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmRestore(checkpoint)}
                    >
                      <History size={16} />
                    </Button>
                  </Tooltip>
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
      <Show when={confirmRestore()}>
        {(checkpoint) => (
          <ConfirmDialog
            body={t(() => m.page_restore_confirm_body({ oid: checkpoint().short_oid }))}
            confirmLabel={t(() => m.page_restore_action())}
            destructive
            error={restoreError()}
            pending={restoringOid() !== null}
            title={t(() => m.page_restore_action())}
            onClose={() => {
              if (restoringOid() === null) setConfirmRestore(null);
            }}
            onConfirm={() => {
              void restore(checkpoint()).then((ok) => {
                if (ok) setConfirmRestore(null);
              });
            }}
          />
        )}
      </Show>
    </div>
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
