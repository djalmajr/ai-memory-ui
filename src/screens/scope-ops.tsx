import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import {
  adminAutoImprove,
  adminEmbed,
  adminForgetSweep,
  adminLint,
  adminPendingWrites,
} from "~/lib/admin-api";
import type { EmbedReport, LintReport, SweepReport } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { canMutate, isAdminTier, tier } from "~/lib/auth";
import { formatDateTime, fromRfc3339 } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import { listSessions } from "~/lib/scope-api";
import * as m from "~/paraglide/messages";

// Operações de projeto (C6).
// Lint/embed/forget-sweep/auto-improve defaultam workspace="default" e
// project="scratch" no serde do engine. Esta tela **sempre** manda o escopo
// da rota — nunca confiar nesses defaults (um clique lintaria o scratch).
//
// Auto-improve: `session_id` é o único extra obrigatório. `dry_run`/`stage`/
// `mode` foram removidos: qualquer `Some` (inclusive `false`) devolve 422.

interface AutoImproveStageResponse {
  run_id: string;
  approval_required: boolean;
  approval_policy: string;
  session_id: string;
  summary: string;
  warnings: string[];
  rejected_candidates_count: number;
  proposals: { id: string; sidecar_path: string; status: string; page_id: string | null }[];
  skipped: { target_path: string; reason: string }[];
}

export function ScopeOpsScreen(props: { workspace: string; project: string }) {
  const scope = () => ({ workspace: props.workspace, project: props.project });
  const [sessionId, setSessionId] = createSignal("");
  const [lintDry, setLintDry] = createSignal(true);
  const [noLlm, setNoLlm] = createSignal(false);
  const [embedDry, setEmbedDry] = createSignal(true);
  const [reembed, setReembed] = createSignal(false);
  const [allProjects, setAllProjects] = createSignal(false);
  const [sweepDry, setSweepDry] = createSignal(true);

  const lint = createOp<LintReport>();
  const embed = createOp<EmbedReport>();
  const sweep = createOp<SweepReport>();
  const improve = createOp<AutoImproveStageResponse>();

  const pending$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { status: "pending", limit: 200 }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  const sessions$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () =>
      listSessions(props.workspace, props.project, { include_open: true, limit: 100 }),
    queryKey: ["api", "sessions", props.workspace, props.project, true, 100, 0],
  }));

  const runLint = () =>
    lint.run(() => adminLint(scope(), { dry_run: lintDry(), no_llm: noLlm() }));
  const runEmbed = () =>
    embed.run(() =>
      adminEmbed(scope(), {
        all_projects: allProjects(),
        dry_run: embedDry(),
        reembed: reembed(),
      }),
    );
  const runSweep = () => sweep.run(() => adminForgetSweep(scope(), sweepDry()));
  const runImprove = () => {
    const id = sessionId();
    if (!id) return;
    return improve.run(() => adminAutoImprove(scope(), id) as Promise<AutoImproveStageResponse>);
  };

  return (
    <Shell
      level="scope"
      scope={scope()}
      pendingCount={pending$.data?.length}
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.nav_ops())} />}
    >
      <Show
        when={isAdminTier(tier())}
        fallback={
          <EmptyState title={t(() => m.state_empty_title())} body={t(() => m.ops_admin_only())} />
        }
      >
        {/* Cookie autentica só GET: explicar por que as ações estão travadas. */}
        <Show when={isAdminTier(tier()) && !canMutate(tier())}>
          <p class="rounded-md border border-hairline bg-muted/40 p-4 text-xs text-muted-foreground">
            {t(() => m.mutation_needs_key())}
          </p>
        </Show>
        <section class="flex flex-col gap-1 rounded-lg border border-hairline p-4">
          <h2 class="text-sm font-medium">{t(() => m.ops_scope_card())}</h2>
          <p class="font-mono text-sm">
            {props.workspace}/{props.project}
          </p>
          <p class="text-xs text-muted-foreground">{t(() => m.ops_scope_note())}</p>
        </section>

        <section class="flex flex-col gap-3 rounded-lg border border-hairline p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-medium">{t(() => m.ops_lint())}</h2>
            <Button type="button" size="sm" disabled={lint.busy() || !canMutate(tier())} onClick={() => void runLint()}>
              {t(() => m.ops_run())}
            </Button>
          </div>
          <div class="flex flex-wrap gap-4 text-sm">
            <Flag checked={lintDry()} onChange={setLintDry} label={t(() => m.ops_dry_run())} />
            <Flag checked={noLlm()} onChange={setNoLlm} label={t(() => m.ops_no_llm())} />
          </div>
          <OpError error={lint.error()} />
          <Show when={lint.result()}>
            {(report) => (
              <Show
                when={report().findings.length > 0}
                fallback={<p class="text-xs text-muted-foreground">{t(() => m.ops_no_findings())}</p>}
              >
                <ul class="flex flex-col gap-2 text-sm">
                  <For each={report().findings}>
                    {(finding) => (
                      <li class="rounded-md border border-hairline p-2">
                        <div class="text-xs text-muted-foreground">
                          {finding.severity} · {finding.kind}
                        </div>
                        <p>{finding.message}</p>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            )}
          </Show>
        </section>

        <section class="flex flex-col gap-3 rounded-lg border border-hairline p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-medium">{t(() => m.ops_embed())}</h2>
            <Button type="button" size="sm" disabled={embed.busy() || !canMutate(tier())} onClick={() => void runEmbed()}>
              {t(() => m.ops_run())}
            </Button>
          </div>
          <div class="flex flex-wrap gap-4 text-sm">
            <Flag checked={embedDry()} onChange={setEmbedDry} label={t(() => m.ops_dry_run())} />
            <Flag checked={reembed()} onChange={setReembed} label={t(() => m.ops_reembed())} />
            <Flag
              checked={allProjects()}
              onChange={setAllProjects}
              label={t(() => m.ops_all_projects())}
            />
          </div>
          <OpError error={embed.error()} />
          <Show when={embed.result()}>
            {(report) => (
              <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Metric label={t(() => m.ops_embedded())} value={report().embedded} />
                <Metric label={t(() => m.ops_skipped())} value={report().skipped} />
                <Metric label={t(() => m.ops_failed())} value={report().failed} />
                <Metric label={t(() => m.ops_would_embed())} value={report().would_embed} />
                <div class="col-span-2 text-xs text-muted-foreground">
                  {report().provider} · {report().model} · dim {report().dim}
                </div>
              </dl>
            )}
          </Show>
        </section>

        <section class="flex flex-col gap-3 rounded-lg border border-hairline p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-medium">{t(() => m.ops_sweep())}</h2>
            <Button type="button" size="sm" disabled={sweep.busy() || !canMutate(tier())} onClick={() => void runSweep()}>
              {t(() => m.ops_run())}
            </Button>
          </div>
          <Flag checked={sweepDry()} onChange={setSweepDry} label={t(() => m.ops_dry_run())} />
          <OpError error={sweep.error()} />
          <Show when={sweep.result()}>
            {(report) => (
              <div class="flex flex-col gap-2 text-sm">
                <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label={t(() => m.ops_candidates())} value={report().candidates_evaluated} />
                  <Metric label={t(() => m.ops_evicted())} value={report().evicted.length} />
                  <Metric label={t(() => m.ops_expired())} value={report().expired.length} />
                  <Metric label={t(() => m.ops_hard_deleted())} value={report().hard_deleted} />
                </dl>
                <p class="text-xs text-muted-foreground">dry_run={String(report().dry_run)}</p>
              </div>
            )}
          </Show>
        </section>

        <section class="flex flex-col gap-3 rounded-lg border border-hairline p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-medium">{t(() => m.ops_improve())}</h2>
            <Button
              type="button"
              size="sm"
              disabled={improve.busy() || !sessionId() || !canMutate(tier())}
              title={!sessionId() ? t(() => m.ops_session_hint()) : undefined}
              onClick={() => void runImprove()}
            >
              {t(() => m.ops_run())}
            </Button>
          </div>
          <label class="flex max-w-md flex-col gap-1 text-xs text-muted-foreground">
            {t(() => m.ops_session())}
            <Show when={sessions$.isPending}>
              <Skeleton class="h-8 w-full rounded-md" />
            </Show>
            <Show when={!sessions$.isPending}>
              <select
                class="h-8 rounded-md border border-hairline bg-content-bg px-2 text-sm text-foreground"
                value={sessionId()}
                onChange={(event) => setSessionId(event.currentTarget.value)}
              >
                <option value="">{t(() => m.ops_session_hint())}</option>
                <For each={sessions$.data?.sessions ?? []}>
                  {(row) => (
                    <option value={row.session_id}>
                      {row.session_id.slice(0, 8)} · {row.agent_kind} ·{" "}
                      {formatDateTime(fromRfc3339(row.started_at))}
                    </option>
                  )}
                </For>
              </select>
            </Show>
          </label>
          <Show when={!sessionId()}>
            <p class="text-xs text-muted-foreground">{t(() => m.ops_session_hint())}</p>
          </Show>
          <Show when={sessions$.data && sessions$.data.sessions.length === 0}>
            <p class="text-xs text-muted-foreground">{t(() => m.ops_session_none())}</p>
          </Show>
          <p class="text-xs text-muted-foreground">{t(() => m.ops_improve_no_dry())}</p>
          <OpError error={improve.error()} />
          <Show when={improve.result()}>
            {(report) => (
              <div class="flex flex-col gap-2 text-sm">
                <h3 class="text-xs font-medium text-muted-foreground">
                  {t(() => m.ops_improve_summary())}
                </h3>
                <p>{report().summary}</p>
                <p class="text-xs text-muted-foreground">
                  {report().approval_policy} · proposals {report().proposals.length} · skipped{" "}
                  {report().skipped.length}
                </p>
              </div>
            )}
          </Show>
        </section>
      </Show>
    </Shell>
  );
}

function createOp<T>() {
  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal<T | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const run = async (fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      const value = await fn();
      setResult(() => value);
    } catch (caught) {
      setResult(null);
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : t(() => m.state_error_title()),
      );
    } finally {
      setBusy(false);
    }
  };
  return { busy, result, error, run };
}

function Flag(props: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        class="size-4 accent-primary"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      {props.label}
    </label>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <div>
      <dt class="text-xs text-muted-foreground">{props.label}</dt>
      <dd class="tabular-nums">{props.value}</dd>
    </div>
  );
}

function OpError(props: { error: string | null }) {
  return (
    <Show when={props.error}>
      {(message) => (
        <p class="text-sm text-destructive" role="alert">
          {message()}
        </p>
      )}
    </Show>
  );
}
