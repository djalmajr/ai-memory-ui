import { useQuery } from "~/lib/query";
import { Show, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { DataGrid } from "~/components/data-grid";
import { Input } from "~/components/input";
import { ScrollArea } from "~/components/scroll-area";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import {
  adminApprovePendingWrite,
  adminPendingWrite,
  adminPendingWriteDiff,
  adminPendingWrites,
  adminRejectPendingWrite,
} from "~/lib/admin-api";
import type { DecisionOutcome, ProposalStatus, ProposalSummary } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { canMutate, isAdminTier, tier } from "~/lib/auth";
import { formatDateTime, fromMicros } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import { labelIdentityKey } from "~/lib/scope-api";
import * as m from "~/paraglide/messages";

// Pending writes (C5). GET devolve array puro, `staged_at DESC`, clamp 1..200,
// **sem cursor**. `staged_at`/`decided_at` são microssegundos.
// Approve 409 é valor `{status:"conflict"}` (alvo pinned ou mudou desde o
// staging), não erro. Approve/reject de proposta ausente/não-pendente: 500,
// não 404 — o GET de detalhe é que devolve 404.

const STATUSES: readonly ProposalStatus[] = [
  "pending",
  "approved",
  "rejected",
  "conflict",
  "failed",
];

export function ScopePendingScreen(props: { workspace: string; project: string }) {
  const scope = () => ({ workspace: props.workspace, project: props.project });
  const [status, setStatus] = createSignal<ProposalStatus | "">("pending");
  const [limit, setLimit] = createSignal(50);
  const [selected, setSelected] = createSignal<ProposalSummary | null>(null);

  const list$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () =>
      adminPendingWrites(scope(), {
        limit: limit(),
        status: status() || undefined,
      }),
    queryKey: [
      "admin",
      "pending-writes",
      props.workspace,
      props.project,
      status() || "all",
      limit(),
    ],
  }));

  const pendingCount$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { status: "pending", limit: 200 }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  return (
    <Shell
      description={<span>{t(() => m.pending_subtitle())}</span>}
      level="scope"
      scope={scope()}
      pendingCount={pendingCount$.data?.length}
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.nav_pending())} />}
      screen={t(() => m.nav_pending())}
    >
      <Show
        when={isAdminTier(tier())}
        fallback={
          <EmptyState title={t(() => m.state_empty_title())} body={t(() => m.pending_admin_only())} />
        }
      >
        <Show when={list$.isPending}>
          <div class="flex flex-col gap-2">
            <Skeleton class="h-24 w-full rounded-md" />
            <Skeleton class="h-24 w-full rounded-md" />
          </div>
        </Show>
        <Show when={list$.isError}>
          <QueryError error={list$.error} onRetry={() => void list$.refetch()} />
        </Show>
        <Show when={!list$.isPending && !list$.isError}>
          <DataGrid
            empty={t(() => m.pending_empty())}
            filters={[
              {
                label: t(() => m.pending_filter()),
                onChange: (value) => {
                  setStatus(value as ProposalStatus | "");
                  setSelected(null);
                },
                options: [
                  { label: t(() => m.pending_status_all()), value: "" },
                  ...STATUSES.map((value) => ({ label: statusLabel(value), value })),
                ],
                value: status(),
              },
              {
                label: t(() => m.pending_limit()),
                onChange: (value) => setLimit(Number(value)),
                options: [
                  { label: "50", value: "50" },
                  { label: "100", value: "100" },
                  { label: "200", value: "200" },
                ],
                value: String(limit()),
              },
            ]}
            items={list$.data ?? []}
            pager={false}
            tableClass="table-fixed"
            onRow={setSelected}
            columns={[
              {
                id: "title",
                label: t(() => m.pending_col_title()),
                search: (row) => `${row.title} ${row.target_path} ${row.kind}`,
                sortValue: (row) => row.title,
                cell: (row) => (
                  <>
                    <div class="truncate">{row.title}</div>
                    <div class="truncate text-xs text-muted-foreground">{row.target_path}</div>
                  </>
                ),
              },
              {
                id: "operation",
                label: t(() => m.pending_col_operation()),
                class: "w-28",
                sortValue: (row) => row.operation,
                cell: (row) => <Badge variant="outline">{opLabel(row.operation)}</Badge>,
              },
              {
                id: "status",
                label: t(() => m.pending_filter()),
                class: "w-28",
                sortValue: (row) => row.status,
                cell: (row) => <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>,
              },
              {
                id: "staged",
                label: t(() => m.pending_col_staged()),
                class: "w-40 tabular-nums",
                sortValue: (row) => row.staged_at,
                cell: (row) => formatDateTime(fromMicros(row.staged_at)),
              },
            ]}
          />
          {/* O engine devolve um array puro, clamp 1..200, sem cursor. */}
          <p class="text-xs text-muted-foreground">{t(() => m.pending_no_cursor())}</p>
          <Show when={selected()}>
            {(proposal) => (
              <ProposalCard
                expanded
                project={props.project}
                proposal={proposal()}
                workspace={props.workspace}
                onSettled={() => {
                  void list$.refetch();
                  void pendingCount$.refetch();
                }}
              />
            )}
          </Show>
        </Show>
      </Show>
    </Shell>
  );
}

function ProposalCard(props: {
  expanded?: boolean;
  proposal: ProposalSummary;
  workspace: string;
  project: string;
  onSettled: () => void;
}) {
  const scope = () => ({ workspace: props.workspace, project: props.project });
  const [open, setOpen] = createSignal(props.expanded ?? false);
  const [reason, setReason] = createSignal("");
  const [ask, setAsk] = createSignal<"approve" | "reject" | "regen" | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [outcome, setOutcome] = createSignal<DecisionOutcome | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const detail$ = useQuery(() => ({
    enabled: open(),
    queryFn: () => adminPendingWrite(scope(), props.proposal.id),
    queryKey: ["admin", "pending-write", props.workspace, props.project, props.proposal.id],
  }));

  const diff$ = useQuery(() => ({
    enabled: open(),
    queryFn: () => adminPendingWriteDiff(scope(), props.proposal.id),
    queryKey: ["admin", "pending-write-diff", props.workspace, props.project, props.proposal.id],
  }));

  const isConflict = () =>
    outcome()?.status === "conflict" || props.proposal.status === "conflict";
  const decided = () => {
    const status = outcome()?.status ?? props.proposal.status;
    return status === "approved" || status === "rejected";
  };

  const mapActionError = (error: unknown): string => {
    if (error instanceof ApiError && error.status === 500) {
      // Approve/reject de proposta ausente ou não-pendente volta 500, não 404.
      return t(() => m.pending_missing());
    }
    if (error instanceof ApiError) return error.message;
    return error instanceof Error ? error.message : t(() => m.state_error_title());
  };

  const approve = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await adminApprovePendingWrite(scope(), props.proposal.id);
      setOutcome(result);
      props.onSettled();
      return true;
    } catch (error) {
      setActionError(mapActionError(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reject = async (note: string) => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await adminRejectPendingWrite(scope(), props.proposal.id, note);
      setOutcome(result);
      props.onSettled();
      return true;
    } catch (error) {
      setActionError(mapActionError(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const regenerate = () => reject(t(() => m.pending_regen_reason()));

  return (
    <li class="flex flex-col gap-3 rounded-lg border border-hairline p-4">
      <button
        type="button"
        class="flex flex-col gap-1 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{opLabel(props.proposal.operation)}</Badge>
          <Badge variant={statusVariant(props.proposal.status)}>
            {statusLabel(props.proposal.status)}
          </Badge>
          <span class="text-xs text-muted-foreground">{props.proposal.kind}</span>
        </div>
        <strong class="text-sm">{props.proposal.title}</strong>
        <span class="text-xs text-muted-foreground">{props.proposal.target_path}</span>
        <span class="text-xs text-muted-foreground">
          {t(() => m.pending_confidence())} {props.proposal.confidence}
          {" · "}
          {formatDateTime(fromMicros(props.proposal.staged_at))}
        </span>
      </button>

      <Show when={open()}>
        <Show when={detail$.isPending || diff$.isPending}>
          <Skeleton class="h-20 w-full rounded-md" />
        </Show>
        <Show when={detail$.isError}>
          <QueryError error={detail$.error} onRetry={() => void detail$.refetch()} />
        </Show>
        <Show when={detail$.data}>
          {(detail) => (
            <div class="flex flex-col gap-2 text-sm">
              <p class="text-xs text-muted-foreground">
                {t(() => m.pending_edit_mode())}: {detail().edit_mode}
                {" · "}
                {t(() => m.pending_staged_by())}: {labelIdentityKey(detail().staged_by_actor_user)}
              </p>
              <div>
                <h3 class="text-xs font-medium text-muted-foreground">
                  {t(() => m.pending_rationale())}
                </h3>
                <p class="whitespace-pre-wrap">{detail().rationale}</p>
              </div>
              <div>
                <h3 class="text-xs font-medium text-muted-foreground">{t(() => m.pending_body())}</h3>
                <ScrollArea class="max-h-48 rounded-md border border-hairline bg-sidebar-bg">
                  <pre class="whitespace-pre-wrap p-2 text-sm">{detail().body_markdown}</pre>
                </ScrollArea>
              </div>
            </div>
          )}
        </Show>
        <Show when={diff$.data}>
          {(diff) => (
            <div>
              <h3 class="text-xs font-medium text-muted-foreground">{t(() => m.pending_diff())}</h3>
              {/* Formato caseiro do engine (`--- before` / `+++ after` / `--- proposed ---`),
                  não `diff -u`. Renderiza cru. */}
              <ScrollArea class="max-h-80 rounded-md border border-hairline bg-sidebar-bg">
                <pre class="whitespace-pre-wrap p-2 text-sm">{diff().diff}</pre>
              </ScrollArea>
            </div>
          )}
        </Show>
      </Show>

      <Show when={isConflict()}>
        <div class="flex flex-col gap-2 rounded-md border border-hairline bg-active-item p-4">
          <strong class="text-sm">{t(() => m.pending_conflict_title())}</strong>
          <p class="text-sm text-muted-foreground">{t(() => m.pending_conflict_body())}</p>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
             
              variant="outline"
              onClick={() => {
                setOpen(true);
                void diff$.refetch();
              }}
            >
              {t(() => m.pending_conflict_diff())}
            </Button>
            <Button
              type="button"
             
              variant="destructive"
              disabled={busy() || !canMutate(tier())}
              onClick={() => setAsk("regen")}
            >
              {t(() => m.pending_conflict_regen())}
            </Button>
          </div>
        </div>
      </Show>

      <Show when={outcome()?.status === "approved" ? outcome() : undefined}>
        {(result) => {
          const value = result();
          return (
            <p class="text-xs text-muted-foreground">
              {value.status === "approved" ? t(() => m.pending_approved({ id: value.page_id })) : null}
            </p>
          );
        }}
      </Show>
      <Show when={outcome()?.status === "rejected"}>
        <p class="text-xs text-muted-foreground">{t(() => m.pending_rejected())}</p>
      </Show>
      <Show when={actionError()}>
        {(message) => <p class="text-sm text-destructive">{message()}</p>}
      </Show>

      <Show when={props.proposal.status === "pending" && !decided() && !isConflict()}>
        <div class="flex flex-wrap items-end gap-2">
          <Button type="button" disabled={busy() || !canMutate(tier())} onClick={() => setAsk("approve")}>
            {t(() => m.pending_approve())}
          </Button>
          <label class="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium">
            {t(() => m.pending_reason())}
            <Input
              value={reason()}
              placeholder={t(() => m.pending_reason_placeholder())}
              onInput={(event) => setReason(event.currentTarget.value)}
            />
          </label>
          <Button
            type="button"
           
            variant="outline"
            disabled={busy() || !canMutate(tier())}
            onClick={() => setAsk("reject")}
          >
            {t(() => m.pending_reject())}
          </Button>
        </div>
      </Show>
      <Show when={ask()}>
        {(kind) => (
          <ConfirmDialog
            body={t(() => (kind() === "approve" ? m.pending_approve_body() : m.pending_reject_body()))}
            confirmLabel={t(() => (kind() === "approve" ? m.pending_approve() : m.pending_reject()))}
            destructive={kind() !== "approve"}
            error={actionError()}
            pending={busy()}
            title={t(() => (kind() === "approve" ? m.pending_approve() : m.pending_reject()))}
            onClose={() => setAsk(null)}
            onConfirm={() => {
              const run =
                kind() === "approve" ? approve() : kind() === "regen" ? regenerate() : reject(reason());
              void run.then((ok) => {
                if (ok) setAsk(null);
              });
            }}
          />
        )}
      </Show>
    </li>
  );
}

function statusLabel(status: ProposalStatus): string {
  switch (status) {
    case "pending":
      return t(() => m.pending_status_pending());
    case "approved":
      return t(() => m.pending_status_approved());
    case "rejected":
      return t(() => m.pending_status_rejected());
    case "conflict":
      return t(() => m.pending_status_conflict());
    case "failed":
      return t(() => m.pending_status_failed());
  }
}

function statusVariant(
  status: ProposalStatus,
): "default" | "success" | "warning" | "error" | "outline" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "outline";
    case "conflict":
      return "warning";
    case "failed":
      return "error";
    default:
      return "default";
  }
}

function opLabel(operation: "create" | "update"): string {
  return operation === "create" ? t(() => m.pending_op_create()) : t(() => m.pending_op_update());
}

function QueryError(props: { error: Error | null; onRetry: () => void }) {
  const message = () =>
    props.error instanceof ApiError
      ? props.error.message
      : (props.error?.message ?? t(() => m.state_error_title()));
  return (
    <div class="flex flex-col items-start gap-2" role="alert">
      <p class="text-sm text-destructive">{message()}</p>
      <Button type="button" variant="outline" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}
