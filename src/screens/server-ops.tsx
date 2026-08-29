import { For, Show, createSignal, type JSX } from "solid-js";

import { Button } from "~/components/button";
import { Checkbox } from "~/components/checkbox";
import { Input } from "~/components/input";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import { adminBackup, adminCheckpoints, adminCommit, adminReorg } from "~/lib/admin-api";
import type { Checkpoint, CommitResult } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { canMutate, isAdminTier, tier } from "~/lib/auth";
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
          size="sm"
          type="button"
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
    <div class="overflow-x-auto rounded-md border border-hairline">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-left text-xs text-muted-foreground">
            <th class="w-28 px-3 py-2 font-medium">{t(() => m.ops_col_oid())}</th>
            <th class="px-3 py-2 font-medium">{t(() => m.ops_col_summary())}</th>
            <th class="w-40 px-3 py-2 font-medium">{t(() => m.ops_col_time())}</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.items}>
            {(row) => (
              <tr class="border-b border-hairline last:border-0">
                <td class="px-3 py-2 font-mono text-xs">{row.short_oid}</td>
                <td class="px-3 py-2">{row.summary}</td>
                <td class="px-3 py-2 text-muted-foreground">
                  {formatDateTime(fromUnixSeconds(row.time))}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
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
    } catch (error) {
      setReorgError(failMessage(error));
    } finally {
      setReorgPending(false);
    }
  };

  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_ops())}</span>}
      actions={<span>{t(() => m.ops_subtitle())}</span>}
    >
      <div class="flex flex-col gap-4">
        {/* Cookie autentica só GET: dizer por que as execuções estão travadas. */}
        <Show when={isAdminTier(tier()) && !canMutate(tier())}>
          <p class="rounded-md border border-hairline bg-muted/40 p-4 text-xs text-muted-foreground">
            {t(() => m.mutation_needs_key())}
          </p>
        </Show>
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
                <Button size="sm" type="button" variant="outline" onClick={() => void runCheckpoints()}>
                  {t(() => m.state_retry())}
                </Button>
              </div>
            )}
          </Show>
          <Show when={!checkPending() && checkpoints()?.length === 0}>
            <EmptyState body={t(() => m.ops_checkpoints_empty())} title={t(() => m.state_empty_title())} />
          </Show>
          <Show when={!checkPending() && (checkpoints() ?? []).length > 0}>
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
            class="font-mono"
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
          onRun={() => void runReorg()}
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
            <pre class="overflow-x-auto whitespace-pre-wrap rounded-md border border-hairline bg-sidebar-bg p-4 font-mono text-xs">
              {JSON.stringify(reorgReport(), null, 2)}
            </pre>
          </Show>
        </OpCard>

        <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
          <h2 class="text-sm font-medium">{t(() => m.ops_absent_title())}</h2>
          <p class="text-sm text-muted-foreground">{t(() => m.ops_absent_project())}</p>
          <p class="text-sm text-muted-foreground">{t(() => m.ops_absent_restore())}</p>
        </section>
      </div>
    </Shell>
  );
}
