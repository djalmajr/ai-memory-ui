import { useQuery } from "~/lib/query";
import { Show, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import { Button } from "~/components/button";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Checkbox } from "~/components/checkbox";
import { DataGrid } from "~/components/data-grid";
import { Input } from "~/components/input";
import { ScrollArea } from "~/components/scroll-area";
import { Select } from "~/components/select";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { adminBackup, adminCheckpoints, adminCommit, adminCompact, adminExportOkf, adminProjects, adminReorg, type CompactReport } from "~/lib/admin-api";
import type { Checkpoint, CommitResult } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { canMutate, tier } from "~/lib/auth";
import { formatBytes } from "~/lib/utils";
import { formatDateTime, fromUnixSeconds } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Operações de servidor (B8). Só as quatro rotas globais: backup, checkpoints,
// commit e reorg. Lint/embed/forget-sweep/auto-improve exigem workspace+project
// e vivem em `/s/.../ops`; restore-page exige path+rev git e vive no leitor.

function failMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function OpCard(props: {
  title: string;
  description: string;
  children?: JSX.Element;
  disabled?: boolean;
  pending: boolean;
  onRun: () => void;
}) {
  return (
    <section class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-medium">{props.title}</h2>
          <p class="text-xs text-muted-foreground">{props.description}</p>
        </div>
        <Button
          class="shrink-0"
          disabled={props.disabled || props.pending || !canMutate(tier())}
          type="button"
          variant="outline"
          onClick={props.onRun}
        >
          {props.pending ? t(() => m.ops_running()) : t(() => m.ops_execute())}
        </Button>
      </div>
      {props.children}
    </section>
  );
}

function CheckpointTable(props: { items: Checkpoint[] }) {
  return (
    <DataGrid
      empty={t(() => m.ops_checkpoints_empty())}
      items={props.items}
      columns={[
        {
          id: "oid",
          label: t(() => m.ops_col_oid()),
          class: "w-28 font-mono text-xs",
          search: (row) => `${row.short_oid} ${row.summary}`,
          sortValue: (row) => row.short_oid,
          cell: (row) => row.short_oid,
        },
        {
          id: "summary",
          label: t(() => m.ops_col_summary()),
          sortValue: (row) => row.summary,
          cell: (row) => row.summary,
        },
        {
          id: "time",
          label: t(() => m.ops_col_time()),
          class: "w-40 text-muted-foreground",
          sortValue: (row) => row.time,
          cell: (row) => formatDateTime(fromUnixSeconds(row.time)),
        },
      ]}
    />
  );
}

export function ServerOpsScreen() {
  const [backupPending, setBackupPending] = createSignal(false);
  const [backupName, setBackupName] = createSignal<string | null>(null);
  const [backupError, setBackupError] = createSignal<string | null>(null);

  const [checkError, setCheckError] = createSignal<string | null>(null);
  const [checkPending, setCheckPending] = createSignal(false);
  const [checkpoints, setCheckpoints] = createSignal<Checkpoint[] | null>(null);

  const [commitPending, setCommitPending] = createSignal(false);
  const [commitError, setCommitError] = createSignal<string | null>(null);
  const [commitMessage, setCommitMessage] = createSignal("");
  const [commitResult, setCommitResult] = createSignal<CommitResult | null>(null);

  // Dry-run ON por padrão: o serde do engine defaulta `false` (escreve de
  // verdade). A UI inverte isso para ninguém disparar o reorg sem olhar.
  const [dryRun, setDryRun] = createSignal(true);
  const [reorgPending, setReorgPending] = createSignal(false);
  const [reorgError, setReorgError] = createSignal<string | null>(null);
  const [reorgReport, setReorgReport] = createSignal<unknown>(null);

  const [compactOpen, setCompactOpen] = createSignal(false);
  const [reorgOpen, setReorgOpen] = createSignal(false);
  const [compactPending, setCompactPending] = createSignal(false);
  const [compactError, setCompactError] = createSignal<string | null>(null);
  const [compactReport, setCompactReport] = createSignal<CompactReport | null>(null);

  const [exportWs, setExportWs] = createSignal("");
  const [exportProject, setExportProject] = createSignal("");
  const projects$ = useQuery(() => ({
    queryFn: adminProjects,
    queryKey: ["admin", "projects"],
  }));
  const exportKey = () => (exportProject() ? `${exportWs()}\t${exportProject()}` : "");
  const [exportPending, setExportPending] = createSignal(false);
  const [exportError, setExportError] = createSignal<string | null>(null);
  const [exportName, setExportName] = createSignal<string | null>(null);

  const runBackup = async () => {
    setBackupPending(true);
    setBackupError(null);
    try {
      const { blob, filename } = await adminBackup();
      saveBlob(blob, filename);
      setBackupName(filename);
    } catch (error) {
      setBackupError(failMessage(error));
    } finally {
      setBackupPending(false);
    }
  };

  const runCheckpoints = async () => {
    setCheckPending(true);
    setCheckError(null);
    try {
      setCheckpoints(await adminCheckpoints(20));
    } catch (error) {
      setCheckError(failMessage(error));
    } finally {
      setCheckPending(false);
    }
  };

  const runCommit = async () => {
    const message = commitMessage().trim();
    if (!message) return;
    setCommitPending(true);
    setCommitError(null);
    try {
      const result = await adminCommit(message);
      setCommitResult(result);
      if (checkpoints() !== null) {
        setCheckpoints(await adminCheckpoints(20));
      }
    } catch (error) {
      setCommitError(failMessage(error));
    } finally {
      setCommitPending(false);
    }
  };

  const runReorg = async () => {
    setReorgPending(true);
    setReorgError(null);
    try {
      setReorgReport(await adminReorg(dryRun()));
      return true;
    } catch (error) {
      setReorgError(failMessage(error));
      return false;
    } finally {
      setReorgPending(false);
    }
  };

  const runCompact = async () => {
    setCompactPending(true);
    setCompactError(null);
    try {
      setCompactReport(await adminCompact());
      return true;
    } catch (error) {
      setCompactError(failMessage(error));
      return false;
    } finally {
      setCompactPending(false);
    }
  };

  const runExport = async () => {
    const project = exportProject().trim();
    const workspace = exportWs().trim();
    if (!workspace || !project) return;
    setExportPending(true);
    setExportError(null);
    try {
      const { blob, filename } = await adminExportOkf({ project, workspace });
      saveBlob(blob, filename);
      setExportName(filename);
    } catch (error) {
      setExportError(failMessage(error));
    } finally {
      setExportPending(false);
    }
  };

  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_ops())}</span>}
      screen={t(() => m.nav_ops())}
      description={<span>{t(() => m.ops_subtitle())}</span>}
    >
      <div class="flex flex-col gap-4">
        <OpCard
          description={t(() => m.ops_backup_desc())}
          pending={backupPending()}
          title={t(() => m.ops_backup_title())}
          onRun={() => void runBackup()}
        >
          <Show when={backupError()}>
            {(message) => (
              <p class="text-sm text-destructive" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <Show when={backupName()}>
            {(name) => (
              <p class="font-mono text-sm text-muted-foreground">
                {t(() => m.ops_backup_done({ filename: name() }))}
              </p>
            )}
          </Show>
        </OpCard>

        <OpCard
          description={t(() => m.ops_checkpoints_desc())}
          pending={checkPending()}
          title={t(() => m.ops_checkpoints_title())}
          onRun={() => void runCheckpoints()}
        >
          <Show when={checkPending()}>
            <div class="flex flex-col gap-2">
              <Skeleton class="h-4 w-3/4 rounded-md" />
              <Skeleton class="h-4 w-1/2 rounded-md" />
            </div>
          </Show>
          <Show when={checkError()}>
            {(message) => (
              <div class="flex flex-col items-start gap-2" role="alert">
                <p class="text-sm text-destructive">{message()}</p>
                <Button type="button" variant="outline" onClick={() => void runCheckpoints()}>
                  {t(() => m.state_retry())}
                </Button>
              </div>
            )}
          </Show>
          <Show when={!checkPending() && checkpoints()}>
            <CheckpointTable items={checkpoints() ?? []} />
          </Show>
        </OpCard>

        <OpCard
          description={t(() => m.ops_commit_desc())}
          disabled={commitMessage().trim().length === 0}
          pending={commitPending()}
          title={t(() => m.ops_commit_title())}
          onRun={() => void runCommit()}
        >
          <Input
            disabled={commitPending()}
            placeholder={t(() => m.ops_commit_placeholder())}
            value={commitMessage()}
            onInput={(event) => setCommitMessage(event.currentTarget.value)}
          />
          <Show when={commitError()}>
            {(message) => (
              <p class="text-sm text-destructive" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <Show when={commitResult()}>
            {(result) => {
              const value = result();
              return (
                <p class={cn("font-mono text-sm", value.committed ? "" : "text-muted-foreground")}>
                  {value.committed
                    ? t(() => m.ops_commit_ok({ oid: value.oid }))
                    : t(() => m.ops_commit_noop({ reason: value.reason }))}
                </p>
              );
            }}
          </Show>
        </OpCard>

        <OpCard
          description={t(() => m.ops_reorg_desc())}
          pending={reorgPending()}
          title={t(() => m.ops_reorg_title())}
          onRun={() => {
            if (dryRun()) void runReorg();
            else setReorgOpen(true);
          }}
        >
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={dryRun()} onChange={(checked) => setDryRun(checked)} />
            <span>{t(() => m.ops_reorg_dry_run())}</span>
          </label>
          <p class="text-xs text-muted-foreground">{t(() => m.ops_reorg_workspace_note())}</p>
          <Show when={reorgError()}>
            {(message) => (
              <p class="text-sm text-destructive" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <Show when={reorgReport() !== null}>
            {/* Relatório cru: ReorgReport tem plan/summary, mas rotular
                campos inventaria uma UI que o contrato não pede. */}
            <ScrollArea class="rounded-md border border-hairline bg-sidebar-bg">
              <pre class="whitespace-pre-wrap p-4 font-mono text-xs">{JSON.stringify(reorgReport(), null, 2)}</pre>
            </ScrollArea>
          </Show>
        </OpCard>

        <section class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-medium">{t(() => m.ops_compact_title())}</h2>
              <p class="text-xs text-muted-foreground">{t(() => m.ops_compact_desc())}</p>
            </div>
            <Button
              disabled={!canMutate(tier())}
              type="button"
              variant="outline"
              onClick={() => setCompactOpen(true)}
            >
              {t(() => m.ops_execute())}
            </Button>
            <Show when={compactOpen()}>
              <ConfirmDialog
                body={t(() => m.ops_compact_desc())}
                confirmLabel={t(() => m.ops_compact_confirm())}
                error={compactError()}
                pending={compactPending()}
                title={t(() => m.ops_compact_title())}
                onClose={() => setCompactOpen(false)}
                onConfirm={() => void runCompact().then((ok) => { if (ok) setCompactOpen(false); })}
              />
            </Show>
            <Show when={reorgOpen()}>
              <ConfirmDialog
                body={t(() => m.ops_reorg_confirm_body())}
                confirmLabel={t(() => m.ops_run())}
                destructive
                error={reorgError()}
                pending={reorgPending()}
                title={t(() => m.ops_reorg_title())}
                onClose={() => setReorgOpen(false)}
                onConfirm={() => void runReorg().then((ok) => { if (ok) setReorgOpen(false); })}
              />
            </Show>
          </div>
          <Show when={compactError()}>
            {(message) => (
              <p class="text-sm text-destructive" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <Show when={compactReport()}>
            {(report) => (
              <p class="font-mono text-sm text-muted-foreground">
                {t(() =>
                  m.ops_compact_result({
                    after: formatBytes(report().bytes_after),
                    before: formatBytes(report().bytes_before),
                    reclaimed: formatBytes(report().bytes_reclaimed),
                  }),
                )}
              </p>
            )}
          </Show>
        </section>

        <section class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-medium">{t(() => m.ops_export_okf_title())}</h2>
              <p class="text-xs text-muted-foreground">{t(() => m.ops_export_okf_desc())}</p>
            </div>
            <Button
              disabled={exportPending() || !canMutate(tier()) || exportProject().trim().length === 0}
              type="button"
              variant="outline"
              onClick={() => void runExport()}
            >
              {exportPending() ? t(() => m.ops_running()) : t(() => m.ops_execute())}
            </Button>
          </div>
          <Select
            class="max-w-sm"
            options={(projects$.data ?? []).map((project) => ({
              label: `${project.workspace_name} / ${project.project_name}`,
              value: `${project.workspace_name}\t${project.project_name}`,
            }))}
            placeholder={t(() => m.ops_export_okf_project())}
            searchable
            value={exportKey()}
            onChange={(value) => {
              const [workspace, project] = value.split("\t");
              setExportWs(workspace ?? "");
              setExportProject(project ?? "");
            }}
          />
          <Show when={exportError()}>
            {(message) => (
              <p class="text-sm text-destructive" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <Show when={exportName()}>
            {(name) => <p class="font-mono text-sm text-muted-foreground">{name()}</p>}
          </Show>
        </section>

        <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
          <h2 class="text-sm font-medium">{t(() => m.ops_absent_title())}</h2>
          <p class="text-sm text-muted-foreground">{t(() => m.ops_absent_project())}</p>
          <p class="text-sm text-muted-foreground">{t(() => m.ops_absent_restore())}</p>
        </section>
      </div>
    </Shell>
  );
}
