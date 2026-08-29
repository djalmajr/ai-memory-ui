import { useQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { For, Show, createSignal, type JSX } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Checkbox } from "~/components/checkbox";
import { Input } from "~/components/input";
import { HandoffCard } from "~/components/overview";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState, Metric } from "~/components/ui-bits";
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
  target: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
}) {
  const [typed, setTyped] = createSignal("");
  const ready = () => typed() === props.target && !props.pending && !props.disabled;
  return (
    <div class="flex flex-col gap-2">
      {props.children}
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        {t(() => m.workspaces_confirm_name({ name: props.target }))}
        <Input
          class="h-9 font-mono"
          disabled={props.pending}
          onInput={(event) => setTyped(event.currentTarget.value)}
          value={typed()}
        />
      </label>
      <Button
        disabled={!ready()}
        onClick={() => props.onConfirm()}
        size="sm"
        type="button"
        variant={props.variant ?? "default"}
      >
        {props.pending ? t(() => m.state_loading()) : props.label}
      </Button>
      <Show when={props.error}>{(message) => <p class="text-sm text-destructive">{message()}</p>}</Show>
    </div>
  );
}

function ConflictSelect(props: { disabled?: boolean; value: ConflictMode; onChange: (value: ConflictMode) => void }) {
  return (
    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
      {t(() => m.workspaces_on_conflict())}
      <select
        class="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.value as ConflictMode)}
        value={props.value}
      >
        <option value="block">{t(() => m.workspaces_conflict_block())}</option>
        <option value="overwrite">{t(() => m.workspaces_conflict_overwrite())}</option>
        <option value="duplicate">{t(() => m.workspaces_conflict_duplicate())}</option>
      </select>
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
      heading={
        <>
          <Link class="text-muted-foreground hover:text-foreground" to="/workspaces">
            {t(() => m.nav_workspaces())}
          </Link>
          <span class="text-muted-foreground">/</span>
          <span class="font-mono">{props.workspace}</span>
        </>
      }
      level="server"
    >
      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-medium">{t(() => m.home_projects())}</h2>
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
                <Button onClick={() => void projectsQ.refetch()} size="sm" type="button" variant="outline">
                  {t(() => m.state_retry())}
                </Button>
              </div>
            }
            when={!projectsQ.isError}
          >
            <Show
              fallback={
                <EmptyState body={t(() => m.home_no_projects_body())} title={t(() => m.home_no_projects_title())} />
              }
              when={(projectsQ.data?.length ?? 0) > 0}
            >
              <div class="overflow-x-auto">
                <table class="w-full table-fixed text-sm">
                  <thead class="text-xs text-muted-foreground">
                    <tr>
                      <th class="pb-2 text-left font-medium">{t(() => m.workspaces_col_project())}</th>
                      <th class="w-24 pb-2 text-right font-medium">{t(() => m.workspaces_col_pages())}</th>
                      <th class="w-36 pb-2 text-left font-medium">{t(() => m.workspaces_col_updated())}</th>
                      <Show when={canMutate(tier())}>
                        <th class="w-48 pb-2 text-right font-medium" />
                      </Show>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={projectsQ.data}>
                      {(row) => (
                        <tr class="border-t border-hairline">
                          <td class="py-2">
                            <Link
                              class="font-mono text-xs hover:underline"
                              to="/s/$workspace/$project"
                              params={{ project: row.project_name, workspace: props.workspace }}
                            >
                              {row.project_name}
                            </Link>
                          </td>
                          <td class="py-2 text-right">{row.page_count}</td>
                          <td class="py-2 text-xs text-muted-foreground">{formatDateShort(row.last_updated)}</td>
                          <Show when={canMutate(tier())}>
                            <td class="py-2 text-right">
                              <div class="flex justify-end gap-1">
                                <Button
                                  onClick={() => {
                                    setProjectAction({ kind: "rename", project: row.project_name });
                                    setProjectTo("");
                                    setActionError(null);
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  {t(() => m.workspaces_project_rename())}
                                </Button>
                                <Button
                                  onClick={() => {
                                    setProjectAction({ kind: "move", project: row.project_name });
                                    setMoveTo(otherWorkspaces()[0] ?? "");
                                    setMoveConflict("block");
                                    setMoveForce(false);
                                    setActionError(null);
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  {t(() => m.workspaces_project_move())}
                                </Button>
                                <Button
                                  onClick={() => {
                                    setProjectAction({ kind: "purge", project: row.project_name });
                                    setPurgeForce(false);
                                    setActionError(null);
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  {t(() => m.workspaces_project_purge())}
                                </Button>
                              </div>
                            </td>
                          </Show>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </Show>
      </section>

      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-medium">{t(() => m.home_stats())}</h2>
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
                <div class="grid grid-cols-4 gap-4 max-md:grid-cols-2">
                  <Metric label={t(() => m.overview_pages())} value={overview().briefing.counts.pages_latest} />
                  <Metric label={t(() => m.overview_versions())} value={overview().briefing.counts.pages_all} />
                  <Metric label={t(() => m.overview_sessions())} value={overview().briefing.counts.sessions} />
                  <Metric label={t(() => m.overview_observations())} value={overview().briefing.counts.observations} />
                </div>
                <div class="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <div class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
                    <span class="text-xs text-muted-foreground">{t(() => m.workspaces_activity_7d())}</span>
                    <div class="grid grid-cols-3 gap-2">
                      <Metric
                        label={t(() => m.workspaces_activity_sessions())}
                        value={overview().briefing.activity_7d.sessions}
                      />
                      <Metric
                        label={t(() => m.workspaces_activity_observations())}
                        value={overview().briefing.activity_7d.observations}
                      />
                      <Metric
                        label={t(() => m.workspaces_activity_pages())}
                        value={overview().briefing.activity_7d.pages_updated}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
                    <span class="text-xs text-muted-foreground">{t(() => m.workspaces_activity_30d())}</span>
                    <div class="grid grid-cols-3 gap-2">
                      <Metric
                        label={t(() => m.workspaces_activity_sessions())}
                        value={overview().briefing.activity_30d.sessions}
                      />
                      <Metric
                        label={t(() => m.workspaces_activity_observations())}
                        value={overview().briefing.activity_30d.observations}
                      />
                      <Metric
                        label={t(() => m.workspaces_activity_pages())}
                        value={overview().briefing.activity_30d.pages_updated}
                      />
                    </div>
                  </div>
                </div>
                {/* contradictions é hardcoded 0 e audited_at hardcoded null no
                    engine — não renderizar como métricas reais. */}
                <div class="flex flex-col gap-2">
                  <span class="text-sm font-medium">{t(() => m.ws_health_title())}</span>
                  <div class="flex flex-wrap gap-4">
                    <span class="flex items-center gap-2 text-sm">
                      {t(() => m.health_stale())}
                      <Badge class="w-fit" variant={overview().health.stale > 0 ? "warning" : "secondary"}>
                        {overview().health.stale}
                      </Badge>
                    </span>
                    <span class="flex items-center gap-2 text-sm">
                      {t(() => m.health_duplicates())}
                      <Badge class="w-fit" variant={overview().health.duplicates > 0 ? "warning" : "secondary"}>
                        {overview().health.duplicates}
                      </Badge>
                    </span>
                    <span class="flex items-center gap-2 text-sm">
                      {t(() => m.health_orphans())}
                      <Badge class="w-fit" variant={overview().health.orphans > 0 ? "warning" : "secondary"}>
                        {overview().health.orphans}
                      </Badge>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </Show>
      </section>

      <Show when={canMutate(tier())}>
        <section class="flex flex-col gap-4">
          <h2 class="text-sm font-medium">{t(() => m.workspaces_risk())}</h2>
          <div class="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
            <div class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
              <span class="text-sm font-medium">{t(() => m.workspaces_rename())}</span>
              <TypedConfirm
                disabled={!renameTo().trim() || renameTo().trim() === props.workspace}
                error={actionError()}
                label={t(() => m.workspaces_confirm())}
                pending={busy()}
                target={props.workspace}
                onConfirm={() => {
                  const to = renameTo().trim();
                  if (!to || to === props.workspace) return;
                  void run(() => adminRenameWorkspace(props.workspace, to), {
                    href: `/workspaces/${encodeURIComponent(to)}`,
                  });
                }}
              >
                <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t(() => m.workspaces_rename_to())}
                  <Input
                    class="h-9 font-mono"
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
                target={props.workspace}
                variant="destructive"
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
                <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t(() => m.workspaces_merge_into())}
                  <select
                    class="flex h-9 rounded-md border border-input bg-background px-3 font-mono text-sm"
                    disabled={busy()}
                    onChange={(event) => setMergeTo(event.currentTarget.value)}
                    value={mergeTo()}
                  >
                    <option value="">{t(() => m.workspaces_merge_into())}</option>
                    <For each={otherWorkspaces()}>{(name) => <option value={name}>{name}</option>}</For>
                  </select>
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
                target={props.workspace}
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

          <Show when={projectAction()}>
            {(action) => (
              <div class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium">
                    <Show when={action().kind === "rename"}>{t(() => m.workspaces_project_rename())}</Show>
                    <Show when={action().kind === "move"}>{t(() => m.workspaces_project_move())}</Show>
                    <Show when={action().kind === "purge"}>{t(() => m.workspaces_project_purge())}</Show>
                    <span class="ml-2 font-mono text-xs text-muted-foreground">{action().project}</span>
                  </span>
                  <Button
                    onClick={() => {
                      setProjectAction(null);
                      setActionError(null);
                    }}
                    size="sm"
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
                    target={action().project}
                    onConfirm={() => {
                      const to = projectTo().trim();
                      if (!to || to === action().project) return;
                      void run(() => adminRenameProject(props.workspace, action().project, to), {
                        done: () => setProjectAction(null),
                      });
                    }}
                  >
                    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                      {t(() => m.workspaces_rename_to())}
                      <Input
                        class="h-9 font-mono"
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
                    target={action().project}
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
                    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                      {t(() => m.workspaces_move_to())}
                      <select
                        class="flex h-9 rounded-md border border-input bg-background px-3 font-mono text-sm"
                        disabled={busy()}
                        onChange={(event) => setMoveTo(event.currentTarget.value)}
                        value={moveTo()}
                      >
                        <option value="">{t(() => m.workspaces_move_to())}</option>
                        <For each={otherWorkspaces()}>{(name) => <option value={name}>{name}</option>}</For>
                      </select>
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
                    target={action().project}
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
        </section>
      </Show>
    </Shell>
  );
}
