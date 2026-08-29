import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Input } from "~/components/input";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import {
  adminAuditContamination,
  adminAuditLog,
  adminCurator,
  adminLint,
  type AuditEvent,
  type ScopeArgs,
} from "~/lib/admin-api";
import type { CuratorReport, LintReport } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { formatDateTime, fromMicros, fromRfc3339 } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Auditoria (nível servidor) — três blocos independentes.
//
// 1. Contaminação: `workspace`+`project` juntos ou ambos omitidos; um só → 400.
// 2. Lint/curator sob demanda. Defaults do engine (`default`/`scratch`) NÃO
//    são confiáveis: a tela sempre envia o par dos inputs.
// 3. Trilha: `GET /admin/audit-log` ainda não existe em origin/main — 404
//    esconde o bloco. `audit_log.detail` é literal "{}" na única inserção
//    (`ops.rs`); sem drawer de payload.

const DEFAULT_WORKSPACE = "default";
const DEFAULT_PROJECT = "scratch";
const DASH = "—";

function failMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function AuditScreen() {
  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_audit())}</span>}
      actions={<span>{t(() => m.audit_subtitle())}</span>}
    >
      <ContaminationBlock />
      <ReportsBlock />
      <AuditLogBlock />
    </Shell>
  );
}

function ContaminationBlock() {
  const [workspace, setWorkspace] = createSignal("");
  const [project, setProject] = createSignal("");
  const [applied, setApplied] = createSignal<ScopeArgs | undefined>(undefined);
  const [partial, setPartial] = createSignal(false);

  const q = useQuery(() => {
    const scope = applied();
    return {
      queryKey: ["admin", "audit-contamination", scope?.workspace ?? "", scope?.project ?? ""],
      queryFn: () => adminAuditContamination(scope),
    };
  });

  const applyScope = () => {
    const ws = workspace().trim();
    const proj = project().trim();
    if ((ws && !proj) || (!ws && proj)) {
      // Um só parâmetro faz o engine responder 400 JSON.
      setPartial(true);
      return;
    }
    setPartial(false);
    setApplied(ws && proj ? { workspace: ws, project: proj } : undefined);
  };

  const findings = () => q.data?.findings ?? [];
  const misbucketed = () => q.data?.summary.sessions_misbucketed ?? 0;

  return (
    <section class="flex flex-col gap-4">
      <h2 class="text-sm font-semibold">{t(() => m.audit_contamination_title())}</h2>
      <form
        class="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          applyScope();
        }}
      >
        <label class="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
          {t(() => m.audit_scope_workspace())}
          <Input
            class="h-9"
            value={workspace()}
            onInput={(event) => setWorkspace(event.currentTarget.value)}
          />
        </label>
        <label class="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
          {t(() => m.audit_scope_project())}
          <Input
            class="h-9"
            value={project()}
            onInput={(event) => setProject(event.currentTarget.value)}
          />
        </label>
        <Button size="sm" type="submit">
          {t(() => m.audit_scope_apply())}
        </Button>
        <span class="text-xs text-muted-foreground">
          <Show when={applied()} fallback={t(() => m.audit_scope_global())}>
            {(scope) => `${scope().workspace}/${scope().project}`}
          </Show>
        </span>
      </form>
      <Show when={partial()}>
        <p class="text-sm text-destructive">{t(() => m.audit_scope_together())}</p>
      </Show>

      <Show when={!q.isPending} fallback={<LoadingBlock />}>
        <Show
          when={!(q.isError && q.data === undefined)}
          fallback={
            <ErrorBlock
              message={failMessage(q.error)}
              onRetry={() => void q.refetch()}
            />
          }
        >
          <p class="text-sm">
            {t(() => m.audit_contamination_summary({ count: misbucketed() }))}
          </p>
          <Show
            when={findings().length > 0}
            fallback={
              <EmptyState
                title={t(() => m.state_empty_title())}
                body={t(() => m.audit_empty_contamination())}
              />
            }
          >
            <div class="overflow-x-auto rounded-lg border border-hairline">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-hairline text-xs text-muted-foreground">
                    <th class="w-[140px] px-4 py-2 text-left font-medium">
                      {t(() => m.audit_col_check())}
                    </th>
                    <th class="w-[110px] px-4 py-2 text-left font-medium">
                      {t(() => m.audit_col_confidence())}
                    </th>
                    <th class="w-[120px] px-4 py-2 text-left font-medium">
                      {t(() => m.audit_col_entity_kind())}
                    </th>
                    <th class="w-[180px] px-4 py-2 text-left font-medium">
                      {t(() => m.audit_col_entity_id())}
                    </th>
                    <th class="w-[140px] px-4 py-2 text-left font-medium">
                      {t(() => m.audit_col_landed_ws())}
                    </th>
                    <th class="w-[140px] px-4 py-2 text-left font-medium">
                      {t(() => m.audit_col_landed_proj())}
                    </th>
                    <th class="w-[140px] px-4 py-2 text-left font-medium">
                      {t(() => m.audit_col_expected())}
                    </th>
                    <th class="min-w-[160px] px-4 py-2 text-left font-medium">
                      {t(() => m.audit_col_cwd())}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={findings()}>
                    {(row) => (
                      <tr class="border-b border-hairline last:border-0">
                        <td class="px-4 py-2 font-mono">{row.check}</td>
                        <td class="px-4 py-2">{row.confidence}</td>
                        <td class="px-4 py-2 font-mono">{row.entity_kind}</td>
                        <td class="truncate px-4 py-2 font-mono" title={row.entity_id}>
                          {row.entity_id}
                        </td>
                        <td class="px-4 py-2 font-mono">{row.landed_workspace}</td>
                        <td class="px-4 py-2 font-mono">{row.landed_project}</td>
                        <td class="px-4 py-2 font-mono">{row.expected_project ?? DASH}</td>
                        <td class="truncate px-4 py-2 font-mono" title={row.cwd ?? undefined}>
                          {row.cwd ?? DASH}
                        </td>
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
  );
}

function ReportsBlock() {
  const [workspace, setWorkspace] = createSignal(DEFAULT_WORKSPACE);
  const [project, setProject] = createSignal(DEFAULT_PROJECT);

  const [lintPending, setLintPending] = createSignal(false);
  const [lintError, setLintError] = createSignal<string | null>(null);
  const [lintReport, setLintReport] = createSignal<LintReport | null>(null);

  const [curatorPending, setCuratorPending] = createSignal(false);
  const [curatorError, setCuratorError] = createSignal<string | null>(null);
  const [curatorReport, setCuratorReport] = createSignal<CuratorReport | null>(null);

  const scope = (): ScopeArgs => ({
    workspace: workspace().trim() || DEFAULT_WORKSPACE,
    project: project().trim() || DEFAULT_PROJECT,
  });

  const runLint = async () => {
    setLintPending(true);
    setLintError(null);
    try {
      setLintReport(await adminLint(scope(), { dry_run: true }));
    } catch (error) {
      setLintError(failMessage(error));
    } finally {
      setLintPending(false);
    }
  };

  const runCurator = async () => {
    setCuratorPending(true);
    setCuratorError(null);
    try {
      // dry_run:true sozinho — mandar stage ao mesmo tempo dá 422.
      setCuratorReport(await adminCurator(scope(), { dry_run: true }));
    } catch (error) {
      setCuratorError(failMessage(error));
    } finally {
      setCuratorPending(false);
    }
  };

  return (
    <section class="flex flex-col gap-4">
      <h2 class="text-sm font-semibold">{t(() => m.audit_reports_title())}</h2>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
          {t(() => m.audit_scope_workspace())}
          <Input
            class="h-9"
            value={workspace()}
            onInput={(event) => setWorkspace(event.currentTarget.value)}
          />
        </label>
        <label class="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
          {t(() => m.audit_scope_project())}
          <Input
            class="h-9"
            value={project()}
            onInput={(event) => setProject(event.currentTarget.value)}
          />
        </label>
        <Button size="sm" type="button" disabled={lintPending()} onClick={() => void runLint()}>
          {t(() => m.audit_lint_run())}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="outline"
          disabled={curatorPending()}
          onClick={() => void runCurator()}
        >
          {t(() => m.audit_curator_run())}
        </Button>
      </div>

      <Show when={lintPending()}>
        <LoadingBlock />
      </Show>
      <Show when={lintError()}>
        {(message) => <ErrorBlock message={message()} onRetry={() => void runLint()} />}
      </Show>
      <Show when={!lintPending() && !lintError() && lintReport()}>
        {(report) => (
          <Show
            when={report().findings.length > 0}
            fallback={
              <EmptyState
                title={t(() => m.state_empty_title())}
                body={t(() => m.audit_empty_lint())}
              />
            }
          >
            <FindingsTable
              rows={report().findings.map((finding) => ({
                kind: finding.kind,
                severity: finding.severity,
                message: finding.message,
                pages: finding.pages,
                detail: finding.detail,
              }))}
            />
          </Show>
        )}
      </Show>

      <Show when={curatorPending()}>
        <LoadingBlock />
      </Show>
      <Show when={curatorError()}>
        {(message) => <ErrorBlock message={message()} onRetry={() => void runCurator()} />}
      </Show>
      <Show when={!curatorPending() && !curatorError() && curatorReport()}>
        {(report) => (
          <div class="flex flex-col gap-2">
            <p class="text-sm">{report().summary}</p>
            <p class="text-xs text-muted-foreground">
              {formatDateTime(fromRfc3339(report().generated_at))} · {report().workspace}/
              {report().project}
            </p>
            <Show
              when={report().findings.length > 0}
              fallback={
                <EmptyState
                  title={t(() => m.state_empty_title())}
                  body={t(() => m.audit_empty_curator())}
                />
              }
            >
              <FindingsTable
                rows={report().findings.map((finding) => ({
                  kind: finding.kind,
                  severity: finding.severity,
                  message: finding.message,
                  pages: finding.pages,
                  detail: stringDetail(finding.detail),
                }))}
              />
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}

function AuditLogBlock() {
  const q = useQuery(() => ({
    queryKey: ["admin", "audit-log"],
    queryFn: () => adminAuditLog({ limit: 50 }),
  }));

  return (
    <section class="flex flex-col gap-4">
      <h2 class="text-sm font-semibold">{t(() => m.audit_log_title())}</h2>
      <Show when={!q.isPending} fallback={<LoadingBlock />}>
        <Show
          when={!(q.isError && q.data === undefined)}
          fallback={
            <ErrorBlock
              message={failMessage(q.error)}
              onRetry={() => void q.refetch()}
            />
          }
        >
          <Show
            when={q.data !== null}
            fallback={<p class="text-sm text-muted-foreground">{t(() => m.audit_log_missing())}</p>}
          >
            <Show
              when={(q.data ?? []).length > 0}
              fallback={
                <EmptyState
                  title={t(() => m.state_empty_title())}
                  body={t(() => m.audit_empty_log())}
                />
              }
            >
              <LogTable events={q.data ?? []} />
            </Show>
          </Show>
        </Show>
      </Show>
    </section>
  );
}

function LogTable(props: { events: AuditEvent[] }) {
  return (
    <div class="overflow-x-auto rounded-lg border border-hairline">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-xs text-muted-foreground">
            <th class="w-[160px] px-4 py-2 text-left font-medium">{t(() => m.audit_col_at())}</th>
            <th class="w-[140px] px-4 py-2 text-left font-medium">{t(() => m.audit_col_op())}</th>
            <th class="w-[140px] px-4 py-2 text-left font-medium">
              {t(() => m.audit_col_workspace())}
            </th>
            <th class="w-[140px] px-4 py-2 text-left font-medium">
              {t(() => m.audit_col_project())}
            </th>
            <th class="min-w-[180px] px-4 py-2 text-left font-medium">
              {t(() => m.audit_col_page())}
            </th>
            <th class="w-[140px] px-4 py-2 text-left font-medium">
              {t(() => m.audit_col_author())}
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={props.events}>
            {(event) => (
              <tr class="border-b border-hairline last:border-0">
                <td class="px-4 py-2 tabular-nums">
                  {formatDateTime(fromMicros(event.at))}
                </td>
                <td class="px-4 py-2 font-mono">{event.op}</td>
                <td class="px-4 py-2 font-mono">{event.workspace ?? DASH}</td>
                <td class="px-4 py-2 font-mono">{event.project ?? DASH}</td>
                <td class="truncate px-4 py-2 font-mono" title={event.page_path ?? undefined}>
                  {event.page_path ?? DASH}
                </td>
                <td class="px-4 py-2">{event.author_username ?? DASH}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function FindingsTable(props: {
  rows: { kind: string; severity: string; message: string; pages: string[]; detail: string | null }[];
}) {
  return (
    <div class="overflow-x-auto rounded-lg border border-hairline">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-xs text-muted-foreground">
            <th class="w-[120px] px-4 py-2 text-left font-medium">{t(() => m.audit_col_kind())}</th>
            <th class="w-[110px] px-4 py-2 text-left font-medium">
              {t(() => m.audit_col_severity())}
            </th>
            <th class="min-w-[200px] px-4 py-2 text-left font-medium">
              {t(() => m.audit_col_message())}
            </th>
            <th class="w-[220px] px-4 py-2 text-left font-medium">
              {t(() => m.audit_col_pages())}
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr class="border-b border-hairline last:border-0">
                <td class="px-4 py-2 font-mono">{row.kind}</td>
                <td class="px-4 py-2">
                  <Badge variant={severityVariant(row.severity)}>{row.severity}</Badge>
                </td>
                <td class="px-4 py-2">
                  <span>{row.message}</span>
                  <Show when={row.detail}>
                    {(detail) => (
                      <span class="mt-1 block text-xs text-muted-foreground">{detail()}</span>
                    )}
                  </Show>
                </td>
                <td class="px-4 py-2 font-mono text-xs">
                  {row.pages.length > 0 ? row.pages.join(", ") : DASH}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function severityVariant(value: string): "error" | "warning" | "success" | "secondary" | "outline" {
  const severity = value.toLowerCase();
  if (severity === "error" || severity === "critical" || severity === "high") return "error";
  if (severity === "warning" || severity === "warn" || severity === "medium") return "warning";
  if (severity === "info" || severity === "low" || severity === "note") return "secondary";
  if (severity === "ok" || severity === "success") return "success";
  return "outline";
}

/** Curator `detail` é `unknown`. Só texto entra na célula; objeto não vira drawer. */
function stringDetail(detail: unknown): string | null {
  return typeof detail === "string" && detail.length > 0 ? detail : null;
}

function LoadingBlock() {
  return (
    <div class="flex flex-col gap-3">
      <Skeleton class="h-4 w-3/4 rounded-md" />
      <Skeleton class="h-4 w-1/2 rounded-md" />
      <Skeleton class="h-20 w-full rounded-md" />
    </div>
  );
}

function ErrorBlock(props: { message: string; onRetry: () => void }) {
  return (
    <div
      class="flex flex-col items-center justify-center gap-2 rounded-lg border border-hairline p-4 text-center"
      role="alert"
    >
      <strong class="text-sm">{t(() => m.state_error_title())}</strong>
      <span class="max-w-md text-sm text-muted-foreground">{props.message}</span>
      <Button size="sm" type="button" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}

