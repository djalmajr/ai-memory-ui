import { useQuery } from "~/lib/query";
import { Show, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { Filter } from "~/components/icons";
import { Input } from "~/components/input";
import { Content as PopoverContent, Portal as PopoverPortal, Root as PopoverRoot, Trigger as PopoverTrigger } from "~/components/popover";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/tabs";
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

// Auditoria (nível servidor) — três visões independentes, uma por aba.
//
// 1. Contaminação: `workspace`+`project` juntos ou ambos omitidos; um só → 400.
// 2. Lint/curator sob demanda. Defaults do engine (`default`/`scratch`) NÃO
//    são confiáveis: a tela sempre envia o par dos inputs.
// 3. Trilha: `GET /admin/audit-log` devolve `{ events }`. 404 (engine antigo,
//    sem o leitor) esconde o bloco. `detail` continua string — o writer grava
//    o literal `"{}"` — então não há drawer de payload.

const DEFAULT_WORKSPACE = "default";
const DEFAULT_PROJECT = "scratch";
const DASH = "—";

function failMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function ScopeFilter(props: {
  applied: ScopeArgs | undefined;
  partial: boolean;
  project: string;
  workspace: string;
  onApply: () => boolean;
  onClear: () => void;
  onProject: (value: string) => void;
  onWorkspace: (value: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (props.onApply()) setOpen(false);
  };
  const clear = () => {
    props.onClear();
    setOpen(false);
  };
  return (
    <PopoverRoot gutter={4} open={open()} placement="bottom-end" onOpenChange={setOpen}>
      <PopoverTrigger class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-normal hover:bg-muted">
        <Filter class="text-muted-foreground" size={16} />
        {t(() => m.audit_scope_filter())}
        <Show when={props.applied}>
          {(scope) => (
            <Badge class="max-w-36 truncate rounded-sm px-1 font-normal" variant="secondary">
              {scope().workspace}/{scope().project}
            </Badge>
          )}
        </Show>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent class="w-96">
          <form class="flex flex-col gap-3" onSubmit={submit}>
            <div class="flex flex-col gap-1">
              <p class="text-sm font-medium">{t(() => m.audit_scope_filter())}</p>
              <p class="text-xs text-muted-foreground">{t(() => m.audit_scope_hint())}</p>
            </div>
            <div class="flex gap-2">
              <label class="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
                {t(() => m.audit_scope_workspace())}
                <Input
                  value={props.workspace}
                  onInput={(event) => props.onWorkspace(event.currentTarget.value)}
                />
              </label>
              <label class="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
                {t(() => m.audit_scope_project())}
                <Input
                  value={props.project}
                  onInput={(event) => props.onProject(event.currentTarget.value)}
                />
              </label>
            </div>
            <Show when={props.partial}>
              <p class="text-xs text-destructive">{t(() => m.audit_scope_together())}</p>
            </Show>
            <div class="flex gap-2">
              <Button type="submit">{t(() => m.audit_scope_apply())}</Button>
              <Button type="button" variant="outline" onClick={clear}>
                {t(() => m.audit_scope_clear())}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  );
}

export function AuditScreen() {
  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_audit())}</span>}
      description={<span>{t(() => m.audit_subtitle())}</span>}
    >
      <Tabs defaultValue="contamination">
        <TabsList>
          <TabsTrigger value="contamination">{t(() => m.audit_contamination_title())}</TabsTrigger>
          <TabsTrigger value="reports">{t(() => m.audit_reports_title())}</TabsTrigger>
          <TabsTrigger value="log">{t(() => m.audit_log_title())}</TabsTrigger>
        </TabsList>
        <TabsContent value="contamination">
          <ContaminationBlock />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsBlock />
        </TabsContent>
        <TabsContent value="log">
          <AuditLogBlock />
        </TabsContent>
      </Tabs>
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
      return false;
    }
    setPartial(false);
    setApplied(ws && proj ? { workspace: ws, project: proj } : undefined);
    return true;
  };

  const clearScope = () => {
    setWorkspace("");
    setProject("");
    setPartial(false);
    setApplied(undefined);
  };

  const findings = () => q.data?.findings ?? [];

  return (
    <section class="flex flex-col gap-4">
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
          <DataGrid
            beforeSort={
              <ScopeFilter
                applied={applied()}
                partial={partial()}
                project={project()}
                workspace={workspace()}
                onApply={applyScope}
                onClear={clearScope}
                onProject={setProject}
                onWorkspace={setWorkspace}
              />
            }
            empty={t(() => m.audit_empty_contamination())}
            items={findings()}
            columns={[
              { id: "check", label: t(() => m.audit_col_check()), class: "w-[140px] font-mono", search: (row) => `${row.check} ${row.entity_id}`, sortValue: (row) => row.check, cell: (row) => row.check },
              { id: "confidence", label: t(() => m.audit_col_confidence()), class: "w-[110px]", filter: { label: t(() => m.audit_col_confidence()), value: (row) => row.confidence }, sortValue: (row) => row.confidence, cell: (row) => row.confidence },
              { id: "kind", label: t(() => m.audit_col_entity_kind()), class: "w-[120px] font-mono", sortValue: (row) => row.entity_kind, cell: (row) => row.entity_kind },
              { id: "id", label: t(() => m.audit_col_entity_id()), class: "w-[180px] truncate font-mono", sortValue: (row) => row.entity_id, cell: (row) => row.entity_id },
              { id: "ws", label: t(() => m.audit_col_landed_ws()), class: "w-[140px] font-mono", sortValue: (row) => row.landed_workspace, cell: (row) => row.landed_workspace },
              { id: "proj", label: t(() => m.audit_col_landed_proj()), class: "w-[140px] font-mono", sortValue: (row) => row.landed_project, cell: (row) => row.landed_project },
              { id: "expected", label: t(() => m.audit_col_expected()), class: "w-[140px] font-mono", cell: (row) => row.expected_project ?? DASH },
              { id: "cwd", label: t(() => m.audit_col_cwd()), class: "min-w-[160px] truncate font-mono", cell: (row) => row.cwd ?? DASH },
            ]}
          />
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
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex min-w-[160px] flex-col gap-1.5 text-sm font-medium">
          {t(() => m.audit_scope_workspace())}
          <Input
            value={workspace()}
            onInput={(event) => setWorkspace(event.currentTarget.value)}
          />
        </label>
        <label class="flex min-w-[160px] flex-col gap-1.5 text-sm font-medium">
          {t(() => m.audit_scope_project())}
          <Input
            value={project()}
            onInput={(event) => setProject(event.currentTarget.value)}
          />
        </label>
        <Button type="button" disabled={lintPending()} onClick={() => void runLint()}>
          {t(() => m.audit_lint_run())}
        </Button>
        <Button
         
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
          <FindingsTable
            empty={t(() => m.audit_empty_lint())}
            rows={report().findings.map((finding) => ({
              kind: finding.kind,
              severity: finding.severity,
              message: finding.message,
              pages: finding.pages,
              detail: finding.detail,
            }))}
          />
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
            <FindingsTable
              empty={t(() => m.audit_empty_curator())}
              rows={report().findings.map((finding) => ({
                kind: finding.kind,
                severity: finding.severity,
                message: finding.message,
                pages: finding.pages,
                detail: stringDetail(finding.detail),
              }))}
            />
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
            <LogTable empty={t(() => m.audit_empty_log())} events={q.data ?? []} />
          </Show>
        </Show>
      </Show>
    </section>
  );
}

function LogTable(props: { empty: string; events: AuditEvent[] }) {
  return (
    <DataGrid
      empty={props.empty}
      items={props.events}
      columns={[
        { id: "at", label: t(() => m.audit_col_at()), class: "w-[160px] tabular-nums", sortValue: (event) => event.at, cell: (event) => formatDateTime(fromMicros(event.at)) },
        { id: "op", label: t(() => m.audit_col_op()), class: "w-[140px] font-mono", search: (event) => `${event.op} ${event.page_path ?? ""}`, filter: { label: t(() => m.audit_col_op()), value: (event) => event.op }, sortValue: (event) => event.op, cell: (event) => event.op },
        { id: "workspace", label: t(() => m.audit_col_workspace()), class: "w-[140px] font-mono", cell: (event) => event.workspace ?? DASH },
        { id: "project", label: t(() => m.audit_col_project()), class: "w-[140px] font-mono", cell: (event) => event.project ?? DASH },
        { id: "page", label: t(() => m.audit_col_page()), class: "min-w-[180px] truncate font-mono", cell: (event) => event.page_path ?? DASH },
        { id: "author", label: t(() => m.audit_col_author()), class: "w-[140px]", sortValue: (event) => event.author_username ?? "", cell: (event) => event.author_username ?? DASH },
      ]}
    />
  );
}

function FindingsTable(props: {
  empty: string;
  rows: { kind: string; severity: string; message: string; pages: string[]; detail: string | null }[];
}) {
  return (
    <DataGrid
      empty={props.empty}
      items={props.rows}
      columns={[
        { id: "kind", label: t(() => m.audit_col_kind()), class: "w-[120px] font-mono", search: (row) => row.message, sortValue: (row) => row.kind, cell: (row) => row.kind },
        { id: "severity", label: t(() => m.audit_col_severity()), class: "w-[110px]", filter: { label: t(() => m.audit_col_severity()), value: (row) => row.severity }, sortValue: (row) => row.severity, cell: (row) => <Badge variant={severityVariant(row.severity)}>{row.severity}</Badge> },
        { id: "message", label: t(() => m.audit_col_message()), class: "min-w-[200px]", cell: (row) => (<><span>{row.message}</span><Show when={row.detail}>{(detail) => <span class="mt-1 block text-xs text-muted-foreground">{detail()}</span>}</Show></>) },
        { id: "pages", label: t(() => m.audit_col_pages()), class: "w-[220px] font-mono text-xs", cell: (row) => (row.pages.length > 0 ? row.pages.join(", ") : DASH) },
      ]}
    />
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
      <Button type="button" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}

