import { useQuery } from "~/lib/query";
import { Link } from "@tanstack/solid-router";
import { Show, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import { Button } from "~/components/button";
import { ArrowRightLeft, Pencil, Trash2 } from "~/components/icons";
import { Tooltip } from "~/components/tooltip";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { DataGrid } from "~/components/data-grid";
import { Checkbox } from "~/components/checkbox";
import { Input } from "~/components/input";
import { Select } from "~/components/select";
import { HandoffCard } from "~/components/overview";
import { Shell } from "~/components/shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/tabs";
import { Skeleton } from "~/components/skeleton";
import { StatCell, StatStrip } from "~/components/stat-strip";
import {
  adminDeleteWorkspace,
  adminMergeWorkspace,
  adminMoveProject,
  adminPurgeProject,
  adminRenameProject,
  adminRenameWorkspace,
} from "~/lib/admin-api";
import { ApiError, listProjectsForWorkspace, listWorkspaces, workspaceOverview } from "~/lib/api";
import { canMutate, isAdminTier, tier } from "~/lib/auth";
import { formatDateShort } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import type { ProjectSummary, WorkspaceOverview, WorkspaceSummary } from "~/lib/types";
import * as m from "~/paraglide/messages";

type ConflictMode = "block" | "duplicate" | "overwrite";

type ProjectAction =
  | { kind: "move"; project: string }
  | { kind: "purge"; project: string }
  | { kind: "rename"; project: string };

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function TypedConfirm(props: {
  children?: JSX.Element;
  disabled?: boolean;
  error: string | null;
  label: string;
  pending: boolean;
  variant?: "default" | "destructive";
  onConfirm: () => void;
}) {
  const [ask, setAsk] = createSignal(false);
  return (
    <div class="flex flex-col gap-2">
      {props.children}
      <Button
        disabled={props.pending || props.disabled}
        onClick={() => setAsk(true)}
        type="button"
        variant={props.variant ?? "default"}
      >
        {props.pending ? t(() => m.state_loading()) : props.label}
      </Button>
      <Show when={props.error}>{(message) => <p class="text-sm text-destructive">{message()}</p>}</Show>
      <Show when={ask()}>
        <ConfirmDialog
          body={t(() => m.confirm_irreversible())}
          confirmLabel={props.label}
          destructive={props.variant === "destructive"}
          error={props.error}
          pending={props.pending}
          title={props.label}
          onClose={() => setAsk(false)}
          onConfirm={() => props.onConfirm()}
        />
      </Show>
    </div>
  );
}

function ConflictSelect(props: { disabled?: boolean; value: ConflictMode; onChange: (value: ConflictMode) => void }) {
  return (
    <label class="flex flex-col gap-1.5 text-sm font-medium">
      {t(() => m.workspaces_on_conflict())}
      <Select
        disabled={props.disabled}
        options={[
          { label: t(() => m.workspaces_conflict_block()), value: "block" },
          { label: t(() => m.workspaces_conflict_overwrite()), value: "overwrite" },
          { label: t(() => m.workspaces_conflict_duplicate()), value: "duplicate" },
        ]}
        value={props.value}
        onChange={props.onChange}
      />
    </label>
  );
}

function ForceCheck(props: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label class="flex items-center gap-2 text-sm">
      <Checkbox checked={props.checked} disabled={props.disabled} onChange={props.onChange} />
      <span>{t(() => m.workspaces_force())}</span>
    </label>
  );
}

export function WorkspaceDetailScreen(props: { workspace: string }) {
  const projectsQ = useQuery<ProjectSummary[]>(() => ({
    queryFn: () => listProjectsForWorkspace(props.workspace),
    queryKey: ["api", "projects", props.workspace],
  }));
  const overviewQ = useQuery<WorkspaceOverview | null>(() => ({
    queryFn: () => workspaceOverview(props.workspace),
    queryKey: ["api", "overview", props.workspace],
  }));
  const workspacesQ = useQuery<WorkspaceSummary[]>(() => ({
    enabled: isAdminTier(tier()),
    queryFn: listWorkspaces,
    queryKey: ["api", "workspaces"],
  }));

  const [busy, setBusy] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [renameTo, setRenameTo] = createSignal("");
  const [mergeTo, setMergeTo] = createSignal("");
  const [mergeConflict, setMergeConflict] = createSignal<ConflictMode>("block");
  const [mergeForce, setMergeForce] = createSignal(false);
  const [deleteForce, setDeleteForce] = createSignal(false);
  const [projectAction, setProjectAction] = createSignal<ProjectAction | null>(null);
  const [projectTo, setProjectTo] = createSignal("");
  const [moveTo, setMoveTo] = createSignal("");
  const [moveConflict, setMoveConflict] = createSignal<ConflictMode>("block");
  const [moveForce, setMoveForce] = createSignal(false);
  const [purgeForce, setPurgeForce] = createSignal(false);

  const otherWorkspaces = () =>
    (workspacesQ.data ?? []).map((row) => row.workspace_name).filter((name) => name !== props.workspace);

  const go = (path: string) => {
    window.location.assign(path);
  };

  const run = async (op: () => Promise<unknown>, after?: { done?: () => void; href?: string }) => {
    setBusy(true);
    setActionError(null);
    try {
      await op();
      if (after?.href) {
        go(after.href);
        return;
      }
      after?.done?.();
      await Promise.all([projectsQ.refetch(), overviewQ.refetch()]);
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      description={<span>{t(() => m.workspace_subtitle())}</span>}
      crumb={[
        { label: t(() => m.nav_workspaces()), to: "/workspaces" },
        { label: props.workspace },
      ]}
      heading={<span>{props.workspace}</span>}
      level="server"
    >
      <Tabs defaultValue="projects">
      <TabsList>
        <TabsTrigger value="projects">{t(() => m.home_projects())}</TabsTrigger>
        <TabsTrigger value="overview">{t(() => m.ws_metrics())}</TabsTrigger>
        <Show when={canMutate(tier())}>
          <TabsTrigger value="danger">{t(() => m.workspaces_risk())}</TabsTrigger>
        </Show>
      </TabsList>
      <TabsContent class="flex flex-col gap-4" value="projects">
        <Show
          fallback={
            <div class="flex flex-col gap-3">
              <Skeleton class="h-4 w-1/3 rounded-md" />
              <Skeleton class="h-24 w-full rounded-md" />
            </div>
          }
          when={!projectsQ.isPending}
        >
          <Show
            fallback={
              <div class="flex flex-col items-start gap-2" role="alert">
                <strong class="text-sm">{t(() => m.state_error_title())}</strong>
                <p class="text-sm text-destructive">{errorText(projectsQ.error)}</p>
                <Button onClick={() => void projectsQ.refetch()} type="button" variant="outline">
                  {t(() => m.state_retry())}
                </Button>
              </div>
            }
            when={!projectsQ.isError}
          >
            <DataGrid
              empty={t(() => m.home_no_projects_body())}
              items={projectsQ.data ?? []}
              tableClass="table-fixed"
              columns={[
                {
                  id: "project",
                  label: t(() => m.workspaces_col_project()),
                  class: "w-48",
                  search: (row) => row.project_name,
                  sortValue: (row) => row.project_name,
                  cell: (row) => (
                    <Link
                      class="block truncate hover:underline"
                      to="/s/$workspace/$project"
                      params={{ project: row.project_name, workspace: props.workspace }}
                    >
                      {row.project_name}
                    </Link>
                  ),
                },
                {
                  id: "pages",
                  label: t(() => m.workspaces_col_pages()),
                  class: "w-24 tabular-nums",
                  sortValue: (row) => row.page_count,
                  cell: (row) => row.page_count,
                },
                {
                  id: "updated",
                  label: t(() => m.workspaces_col_updated()),
                  class: "w-36",
                  sortValue: (row) => row.last_updated ?? "",
                  cell: (row) => formatDateShort(row.last_updated),
                },
                ...(canMutate(tier())
                  ? [
                      {
                        id: "actions",
                        label: "",
                        hideable: false,
                        cell: (row: (typeof projectsQ.data) extends (infer R)[] | undefined ? R : never) => (
                          <div class="flex justify-end gap-1">
                            <Tooltip content={t(() => m.workspaces_project_rename())}>
                              <Button
                                aria-label={t(() => m.workspaces_project_rename())}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setProjectAction({ kind: "rename", project: row.project_name });
                                  setProjectTo("");
                                  setActionError(null);
                                }}
                              >
                                <Pencil size={16} />
                              </Button>
                            </Tooltip>
                            <Tooltip content={t(() => m.workspaces_project_move())}>
                              <Button
                                aria-label={t(() => m.workspaces_project_move())}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setProjectAction({ kind: "move", project: row.project_name });
                                  setMoveTo(otherWorkspaces()[0] ?? "");
                                  setMoveConflict("block");
                                  setMoveForce(false);
                                  setActionError(null);
                                }}
                              >
                                <ArrowRightLeft size={16} />
                              </Button>
                            </Tooltip>
                            <Tooltip content={t(() => m.workspaces_project_purge())}>
                              <Button
                                aria-label={t(() => m.workspaces_project_purge())}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setProjectAction({ kind: "purge", project: row.project_name });
                                  setPurgeForce(false);
                                  setActionError(null);
                                }}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </Tooltip>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Show>
        </Show>
          <Show when={projectAction()}>
            {(action) => (
              <div class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium">
                    <Show when={action().kind === "rename"}>{t(() => m.workspaces_project_rename())}</Show>
                    <Show when={action().kind === "move"}>{t(() => m.workspaces_project_move())}</Show>
                    <Show when={action().kind === "purge"}>{t(() => m.workspaces_project_purge())}</Show>
                    <span class="ml-2 text-xs text-muted-foreground">{action().project}</span>
                  </span>
                  <Button
                    onClick={() => {
                      setProjectAction(null);
                      setActionError(null);
                    }}
                   
                    type="button"
                    variant="ghost"
                  >
                    ×
                  </Button>
                </div>
                <Show when={action().kind === "rename" ? action().project : false}>
                  <TypedConfirm
                    disabled={!projectTo().trim() || projectTo().trim() === action().project}
                    error={actionError()}
                    label={t(() => m.workspaces_confirm())}
                    pending={busy()}
                    onConfirm={() => {
                      const to = projectTo().trim();
                      if (!to || to === action().project) return;
                      void run(() => adminRenameProject(props.workspace, action().project, to), {
                        done: () => setProjectAction(null),
                      });
                    }}
                  >
                    <label class="flex flex-col gap-1.5 text-sm font-medium">
                      {t(() => m.workspaces_rename_to())}
                      <Input
                        disabled={busy()}
                        onInput={(event) => setProjectTo(event.currentTarget.value)}
                        value={projectTo()}
                      />
                    </label>
                  </TypedConfirm>
                </Show>
                <Show when={action().kind === "move" ? action().project : false}>
                  <TypedConfirm
                    disabled={!moveTo() || moveTo() === props.workspace}
                    error={actionError()}
                    label={t(() => m.workspaces_confirm())}
                    pending={busy()}
                    variant="destructive"
                    onConfirm={() => {
                      const to = moveTo();
                      if (!to) return;
                      void run(
                        () =>
                          adminMoveProject({
                            force: moveForce(),
                            from_workspace: props.workspace,
                            on_conflict: moveConflict(),
                            project: action().project,
                            to_workspace: to,
                          }),
                        { done: () => setProjectAction(null) },
                      );
                    }}
                  >
                    <label class="flex flex-col gap-1.5 text-sm font-medium">
                      {t(() => m.workspaces_move_to())}
                      <Select
                        disabled={busy()}
                        options={[
                          { label: t(() => m.workspaces_move_to()), value: "" },
                          ...otherWorkspaces().map((name) => ({ label: name, value: name })),
                        ]}
                        value={moveTo()}
                        onChange={setMoveTo}
                      />
                    </label>
                    <ConflictSelect disabled={busy()} onChange={setMoveConflict} value={moveConflict()} />
                    <ForceCheck checked={moveForce()} disabled={busy()} onChange={setMoveForce} />
                  </TypedConfirm>
                </Show>
                <Show when={action().kind === "purge" ? action().project : false}>
                  <TypedConfirm
                    error={actionError()}
                    label={t(() => m.workspaces_confirm())}
                    pending={busy()}
                    variant="destructive"
                    onConfirm={() => {
                      void run(
                        () =>
                          adminPurgeProject(
                            { project: action().project, workspace: props.workspace },
                            purgeForce(),
                          ),
                        { done: () => setProjectAction(null) },
                      );
                    }}
                  >
                    <ForceCheck checked={purgeForce()} disabled={busy()} onChange={setPurgeForce} />
                  </TypedConfirm>
                </Show>
              </div>
            )}
          </Show>
      </TabsContent>

      <TabsContent class="flex flex-col gap-4" value="overview">
        <Show
          fallback={
            <div class="flex flex-col gap-3">
              <Skeleton class="h-4 w-1/3 rounded-md" />
              <Skeleton class="h-16 w-full rounded-md" />
            </div>
          }
          when={!overviewQ.isPending}
        >
          <Show
            fallback={<p class="text-sm text-muted-foreground">{t(() => m.workspaces_no_overview())}</p>}
            when={overviewQ.data}
          >
            {(overview) => (
              <div class="flex flex-col gap-4">
                <Show when={overview().handoff}>{(handoff) => <HandoffCard handoff={handoff()} />}</Show>
                <StatStrip>
                  <StatCell label={t(() => m.overview_pages())} value={overview().briefing.counts.pages_latest} />
                  <StatCell label={t(() => m.overview_versions())} value={overview().briefing.counts.pages_all} />
                  <StatCell label={t(() => m.overview_sessions())} value={overview().briefing.counts.sessions} />
                  <StatCell label={t(() => m.overview_observations())} value={overview().briefing.counts.observations} />
                </StatStrip>
                <div class="flex flex-col gap-2">
                  <span class="text-xs text-muted-foreground">{t(() => m.workspaces_activity_7d())}</span>
                  <StatStrip>
                    <StatCell
                      label={t(() => m.workspaces_activity_sessions())}
                      value={overview().briefing.activity_7d.sessions}
                    />
                    <StatCell
                      label={t(() => m.workspaces_activity_observations())}
                      value={overview().briefing.activity_7d.observations}
                    />
                    <StatCell
                      label={t(() => m.workspaces_activity_pages())}
                      value={overview().briefing.activity_7d.pages_updated}
                    />
                  </StatStrip>
                </div>
                <div class="flex flex-col gap-2">
                  <span class="text-xs text-muted-foreground">{t(() => m.workspaces_activity_30d())}</span>
                  <StatStrip>
                    <StatCell
                      label={t(() => m.workspaces_activity_sessions())}
                      value={overview().briefing.activity_30d.sessions}
                    />
                    <StatCell
                      label={t(() => m.workspaces_activity_observations())}
                      value={overview().briefing.activity_30d.observations}
                    />
                    <StatCell
                      label={t(() => m.workspaces_activity_pages())}
                      value={overview().briefing.activity_30d.pages_updated}
                    />
                  </StatStrip>
                </div>
                <div class="flex flex-col gap-2">
                  <span class="text-xs text-muted-foreground">{t(() => m.ws_health_title())}</span>
                  <StatStrip>
                    <StatCell label={t(() => m.health_stale())} value={overview().health.stale} />
                    <StatCell label={t(() => m.health_duplicates())} value={overview().health.duplicates} />
                    <StatCell label={t(() => m.health_orphans())} value={overview().health.orphans} />
                  </StatStrip>
                </div>
              </div>
            )}
          </Show>
        </Show>
      </TabsContent>

      <Show when={canMutate(tier())}>
        <TabsContent class="flex flex-col gap-4" value="danger">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
              <span class="text-sm font-medium">{t(() => m.workspaces_rename())}</span>
              <TypedConfirm
                disabled={!renameTo().trim() || renameTo().trim() === props.workspace}
                error={actionError()}
                label={t(() => m.workspaces_confirm())}
                pending={busy()}
                onConfirm={() => {
                  const to = renameTo().trim();
                  if (!to || to === props.workspace) return;
                  void run(() => adminRenameWorkspace(props.workspace, to), {
                    href: `/workspaces/${encodeURIComponent(to)}`,
                  });
                }}
              >
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  {t(() => m.workspaces_rename_to())}
                  <Input
                    disabled={busy()}
                    onInput={(event) => setRenameTo(event.currentTarget.value)}
                    value={renameTo()}
                  />
                </label>
              </TypedConfirm>
            </div>

            <div class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
              <span class="text-sm font-medium">{t(() => m.workspaces_merge())}</span>
              <TypedConfirm
                disabled={!mergeTo() || mergeTo() === props.workspace}
                error={actionError()}
                label={t(() => m.workspaces_confirm())}
                pending={busy()}
                onConfirm={() => {
                  const to = mergeTo();
                  if (!to) return;
                  void run(
                    () =>
                      adminMergeWorkspace(props.workspace, to, {
                        force: mergeForce(),
                        on_conflict: mergeConflict(),
                      }),
                    { href: `/workspaces/${encodeURIComponent(to)}` },
                  );
                }}
              >
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  {t(() => m.workspaces_merge_into())}
                  <Select
                    disabled={busy()}
                    options={[
                      { label: t(() => m.workspaces_merge_into()), value: "" },
                      ...otherWorkspaces().map((name) => ({ label: name, value: name })),
                    ]}
                    value={mergeTo()}
                    onChange={setMergeTo}
                  />
                </label>
                <ConflictSelect disabled={busy()} onChange={setMergeConflict} value={mergeConflict()} />
                <ForceCheck checked={mergeForce()} disabled={busy()} onChange={setMergeForce} />
              </TypedConfirm>
            </div>

            <div class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
              <span class="text-sm font-medium">{t(() => m.workspaces_delete())}</span>
              <TypedConfirm
                error={actionError()}
                label={t(() => m.workspaces_confirm())}
                pending={busy()}
                variant="destructive"
                onConfirm={() => {
                  void run(() => adminDeleteWorkspace(props.workspace, deleteForce()), {
                    href: "/workspaces",
                  });
                }}
              >
                <ForceCheck checked={deleteForce()} disabled={busy()} onChange={setDeleteForce} />
              </TypedConfirm>
            </div>
          </div>

        </TabsContent>
      </Show>
      </Tabs>
    </Shell>

  );
}
