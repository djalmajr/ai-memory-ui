import { useQuery } from "~/lib/query";
import { For, Show, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
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

  const rows = () => list$.data?.handoffs ?? [];
  const [expireArmed, setExpireArmed] = createSignal(false);
  const [expirePending, setExpirePending] = createSignal(false);
  const [expireError, setExpireError] = createSignal<string | null>(null);
  const [expiredCount, setExpiredCount] = createSignal<number | null>(null);

  const expire = async () => {
    setExpirePending(true);
    setExpireError(null);
    try {
      const result = await adminExpireHandoffs(scope());
      setExpiredCount(result.expired);
      setExpireArmed(false);
      await list$.refetch();
    } catch (error) {
      setExpireError(error instanceof ApiError ? error.message : String(error));
    } finally {
      setExpirePending(false);
    }
  };

  return (
    <Shell
      level="scope"
      scope={scope()}
      pendingCount={pending$.data?.length}
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.nav_handoffs())} />}
    >
      <div class="flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          {t(() => m.handoffs_col_state())}
          <select class="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
            value={state()}
            onChange={(event) => setState(event.currentTarget.value as HandoffState | "")}
          >
            <option value="">{t(() => m.handoffs_state_all())}</option>
            <For each={[...HANDOFF_STATES]}>
              {(value) => <option value={value}>{handoffStateLabel(value)}</option>}
            </For>
          </select>
        </label>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          {t(() => m.handoffs_limit())}
          <select class="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
            value={String(limit())}
            onChange={(event) => setLimit(Number(event.currentTarget.value))}
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </label>
        {/* all_owners=true exige Root; 403 `all_owners requires root authorization`.
            Só oferecemos o controle no tier admin — se o engine ainda recusar,
            a mensagem 403 aparece no estado de erro. Sem offset neste endpoint. */}
        <Show when={isAdminTier(tier())}>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="size-4 accent-primary"
              checked={allOwners()}
              onChange={(event) => setAllOwners(event.currentTarget.checked)}
            />
            {t(() => m.handoffs_all_owners())}
          </label>
        </Show>
      </div>

      <Show when={canMutate(tier())}>
        <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
          <p class="text-sm">{t(() => m.handoffs_expire_desc())}</p>
          <div class="flex flex-wrap items-center gap-2">
            <Show
              when={expireArmed()}
              fallback={
                <Button type="button" variant="outline" onClick={() => setExpireArmed(true)}>
                  {t(() => m.handoffs_expire())}
                </Button>
              }
            >
              <Button disabled={expirePending()} type="button" onClick={() => void expire()}>
                {t(() => m.handoffs_expire_confirm())}
              </Button>
            </Show>
            <Show when={expiredCount() !== null}>
              <span class="text-sm text-muted-foreground">
                {t(() => m.handoffs_expired_n({ n: expiredCount() ?? 0 }))}
              </span>
            </Show>
          </div>
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
          items={rows()}
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
                  <div class="truncate font-mono text-xs text-muted-foreground" title={row.owner ?? ""}>
                    {labelIdentityKey(row.owner)}
                  </div>
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
                  <div class="font-mono" title={row.accepted_by ?? ""}>
                    {labelIdentityKey(row.accepted_by)}
                  </div>
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
