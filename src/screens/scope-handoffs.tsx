import { useQuery } from "~/lib/query";
import { Show, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
import { Tooltip } from "~/components/tooltip";
import { Button } from "~/components/button";
import { Checkbox } from "~/components/checkbox";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { DataGrid } from "~/components/data-grid";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { StatCell, StatStrip } from "~/components/stat-strip";
import { Skeleton } from "~/components/skeleton";
import { adminPendingWrites, adminExpireHandoffs } from "~/lib/admin-api";
import { ApiError } from "~/lib/api";
import { canMutate, isAdminTier, tier } from "~/lib/auth";
import { formatDateTime, fromRfc3339 } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import {
  HANDOFF_STATES,
  labelIdentityKey,
  listHandoffs,
  type HandoffState,
} from "~/lib/scope-api";
import * as m from "~/paraglide/messages";

// Handoffs do escopo (C4). `state` só aceita open|accepted|expired (outro →
// 400). `all_owners=true` exige Root; 403 `all_owners requires root
// authorization`. summary/open_questions/next_steps são omitidos (não null)
// quando redacted. owner/accepted_by são chaves de armazenamento.

export function ScopeHandoffsScreen(props: { workspace: string; project: string }) {
  const scope = () => ({ workspace: props.workspace, project: props.project });
  const [state, setState] = createSignal<HandoffState | "">("");
  const [allOwners, setAllOwners] = createSignal(false);
  const [limit, setLimit] = createSignal(50);

  const pending$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { status: "pending", limit: 200 }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  const list$ = useQuery(() => ({
    queryFn: () =>
      listHandoffs(props.workspace, props.project, {
        all_owners: allOwners() || undefined,
        limit: limit(),
        state: state() || undefined,
      }),
    queryKey: ["api", "handoffs", props.workspace, props.project, state(), allOwners(), limit()],
  }));

  const open$ = useQuery(() => ({
    queryFn: () =>
      listHandoffs(props.workspace, props.project, {
        all_owners: isAdminTier(tier()) || undefined,
        limit: 1,
        state: "open",
      }),
    queryKey: ["api", "handoffs", props.workspace, props.project, "open-exists"],
  }));
  const hasOpen = () => (open$.data?.handoffs.length ?? 0) > 0;

  const rows = () => list$.data?.handoffs ?? [];
  const [expireOpen, setExpireOpen] = createSignal(false);
  const [expirePending, setExpirePending] = createSignal(false);
  const [expireError, setExpireError] = createSignal<string | null>(null);
  const [expiredCount, setExpiredCount] = createSignal<number | null>(null);

  const expire = async () => {
    setExpirePending(true);
    setExpireError(null);
    try {
      const result = await adminExpireHandoffs(scope());
      setExpiredCount(result.expired);
      await Promise.all([list$.refetch(), open$.refetch()]);
      return true;
    } catch (error) {
      setExpireError(error instanceof ApiError ? error.message : String(error));
      return false;
    } finally {
      setExpirePending(false);
    }
  };

  return (
    <Shell
      description={<span>{t(() => m.handoffs_subtitle())}</span>}
      level="scope"
      scope={scope()}
      pendingCount={pending$.data?.length}
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.nav_handoffs())} />}
      screen={t(() => m.nav_handoffs())}
    >
      <Show when={canMutate(tier())}>
        <section class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-medium">{t(() => m.handoffs_expire())}</h2>
              <p class="text-xs text-muted-foreground">{t(() => m.handoffs_expire_desc())}</p>
            </div>
            <Button
              class="shrink-0"
              disabled={!hasOpen()}
              type="button"
              variant="outline"
              onClick={() => setExpireOpen(true)}
            >
              {t(() => m.ops_execute())}
            </Button>
          </div>
            <Show when={expireOpen()}>
              <ConfirmDialog
                body={t(() => m.handoffs_expire_desc())}
                confirmLabel={t(() => m.handoffs_expire_confirm())}
                destructive
                error={expireError()}
                pending={expirePending()}
                title={t(() => m.handoffs_expire())}
                onClose={() => setExpireOpen(false)}
                onConfirm={() => void expire().then((ok) => { if (ok) setExpireOpen(false); })}
              />
            </Show>
            <Show when={expiredCount() !== null}>
              <StatStrip>
                <StatCell label={t(() => m.handoffs_expire())} value={expiredCount() ?? 0} />
              </StatStrip>
            </Show>
          <Show when={expireError()}>
            {(message) => (
              <p class="text-sm text-destructive" role="alert">
                {message()}
              </p>
            )}
          </Show>
        </section>
      </Show>

      <Show when={list$.isPending}>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-4 w-1/2 rounded-md" />
          <Skeleton class="h-24 w-full rounded-md" />
        </div>
      </Show>
      <Show when={list$.isError}>
        <QueryError error={list$.error} onRetry={() => void list$.refetch()} />
      </Show>
      <Show when={!list$.isPending && !list$.isError}>
        <DataGrid
          empty={t(() => m.handoffs_empty())}
          filters={[
            {
              label: t(() => m.handoffs_col_state()),
              onChange: (value) => setState(value as HandoffState | ""),
              options: [
                { label: t(() => m.handoffs_state_all()), value: "" },
                ...HANDOFF_STATES.map((value) => ({ label: handoffStateLabel(value), value })),
              ],
              value: state(),
            },
            {
              label: t(() => m.handoffs_limit()),
              onChange: (value) => setLimit(Number(value)),
              options: [
                { label: "50", value: "50" },
                { label: "100", value: "100" },
                { label: "200", value: "200" },
              ],
              value: String(limit()),
            },
          ]}
          items={rows()}
          leading={
            // all_owners=true exige Root; 403 `all_owners requires root authorization`.
            // Sem offset neste endpoint.
            isAdminTier(tier()) ? (
              <label class="flex h-8 items-center gap-2 text-sm">
                <Checkbox checked={allOwners()} onChange={setAllOwners} />
                {t(() => m.handoffs_all_owners())}
              </label>
            ) : undefined
          }
          tableClass="table-fixed"
          columns={[
            {
              id: "state",
              label: t(() => m.handoffs_col_state()),
              class: "w-28",
              filter: {
                label: t(() => m.handoffs_col_state()),
                value: (row) => row.state,
              },
              sortValue: (row) => row.state,
              cell: (row) => <HandoffStateBadge state={row.state} />,
            },
            {
              id: "agent",
              label: t(() => m.handoffs_col_agent()),
              class: "w-36",
              search: (row) => `${row.agent} ${row.summary ?? ""}`,
              sortValue: (row) => row.agent,
              cell: (row) => (
                <>
                  <div>{row.agent}</div>
                  <Tooltip class="block min-w-0" content={row.owner || undefined}>
                    <div class="truncate text-xs text-muted-foreground">{labelIdentityKey(row.owner)}</div>
                  </Tooltip>
                </>
              ),
            },
            {
              id: "created",
              label: t(() => m.handoffs_col_created()),
              class: "w-40 tabular-nums",
              sortValue: (row) => row.at,
              cell: (row) => formatDateTime(fromRfc3339(row.at)),
            },
            {
              id: "summary",
              label: t(() => m.handoffs_col_summary()),
              sortValue: (row) => row.summary ?? "",
              cell: (row) => (
                <Show when={!row.redacted} fallback={<span class="text-xs text-muted-foreground">{t(() => m.handoffs_redacted())}</span>}>
                  <span class="line-clamp-2">{row.summary ?? "—"}</span>
                </Show>
              ),
            },
            {
              id: "accepted",
              label: t(() => m.handoffs_col_accepted()),
              class: "w-48 text-xs",
              cell: (row) => (
                <>
                  <Tooltip class="block min-w-0" content={row.accepted_by || undefined}>
                    <div>{labelIdentityKey(row.accepted_by)}</div>
                  </Tooltip>
                  <div class="tabular-nums text-muted-foreground">
                    {row.accepted_at ? formatDateTime(fromRfc3339(row.accepted_at)) : "—"}
                  </div>
                </>
              ),
            },
          ]}
        />
      </Show>
    </Shell>
  );
}

function handoffStateLabel(state: HandoffState): string {
  switch (state) {
    case "open":
      return t(() => m.handoffs_state_open());
    case "accepted":
      return t(() => m.handoffs_state_accepted());
    case "expired":
      return t(() => m.handoffs_state_expired());
  }
}

function HandoffStateBadge(props: { state: string }) {
  const variant = () => {
    if (props.state === "accepted") return "success" as const;
    if (props.state === "expired") return "warning" as const;
    return "default" as const;
  };
  const label = () => {
    if (props.state === "open" || props.state === "accepted" || props.state === "expired") {
      return handoffStateLabel(props.state);
    }
    return props.state;
  };
  return (
    <Badge variant={variant()} class="capitalize">
      {label()}
    </Badge>
  );
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
