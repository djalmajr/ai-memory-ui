import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import { adminPendingWrites } from "~/lib/admin-api";
import { ApiError } from "~/lib/api";
import { isAdminTier, tier } from "~/lib/auth";
import { formatDateTime, fromRfc3339 } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import {
  HANDOFF_STATES,
  labelIdentityKey,
  listHandoffs,
  type ApiHandoffEntry,
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

  return (
    <Shell
      level="scope"
      scope={scope()}
      pendingCount={pending$.data?.length}
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.nav_handoffs())} />}
    >
      <div class="flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1 text-xs text-muted-foreground">
          {t(() => m.handoffs_col_state())}
          <select
            class="h-8 rounded-md border border-hairline bg-content-bg px-2 text-sm text-foreground"
            value={state()}
            onChange={(event) => setState(event.currentTarget.value as HandoffState | "")}
          >
            <option value="">{t(() => m.handoffs_state_all())}</option>
            <For each={[...HANDOFF_STATES]}>
              {(value) => <option value={value}>{handoffStateLabel(value)}</option>}
            </For>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-muted-foreground">
          {t(() => m.handoffs_limit())}
          <select
            class="h-8 rounded-md border border-hairline bg-content-bg px-2 text-sm text-foreground"
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
        <Show
          when={rows().length > 0}
          fallback={
            <EmptyState title={t(() => m.state_empty_title())} body={t(() => m.handoffs_empty())} />
          }
        >
          <div class="overflow-x-auto rounded-lg border border-hairline">
            <table class="w-full table-fixed text-sm">
              <thead>
                <tr class="border-b border-hairline text-left text-xs text-muted-foreground">
                  <th class="w-28 px-3 py-2 font-medium">{t(() => m.handoffs_col_state())}</th>
                  <th class="w-36 px-3 py-2 font-medium">{t(() => m.handoffs_col_agent())}</th>
                  <th class="w-40 px-3 py-2 font-medium">{t(() => m.handoffs_col_created())}</th>
                  <th class="px-3 py-2 font-medium">{t(() => m.handoffs_col_summary())}</th>
                  <th class="w-48 px-3 py-2 font-medium">{t(() => m.handoffs_col_accepted())}</th>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>{(row) => <HandoffRow row={row} />}</For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </Shell>
  );
}

function HandoffRow(props: { row: ApiHandoffEntry }) {
  return (
    <tr class="border-b border-hairline last:border-0">
      <td class="px-3 py-2">
        <HandoffStateBadge state={props.row.state} />
      </td>
      <td class="px-3 py-2">
        <div>{props.row.agent}</div>
        <div class="truncate font-mono text-xs text-muted-foreground" title={props.row.owner ?? ""}>
          {labelIdentityKey(props.row.owner)}
        </div>
      </td>
      <td class="px-3 py-2 tabular-nums">{formatDateTime(fromRfc3339(props.row.at))}</td>
      <td class="px-3 py-2">
        <Show
          when={!props.row.redacted}
          fallback={
            <span class="text-xs text-muted-foreground">{t(() => m.handoffs_redacted())}</span>
          }
        >
          <span class="line-clamp-2">{props.row.summary ?? "—"}</span>
          <Show when={(props.row.open_questions ?? []).length > 0}>
            <p class="mt-1 text-xs text-muted-foreground">
              {(props.row.open_questions ?? []).join(" · ")}
            </p>
          </Show>
          <Show when={(props.row.next_steps ?? []).length > 0}>
            <p class="mt-1 text-xs text-muted-foreground">
              {(props.row.next_steps ?? []).join(" · ")}
            </p>
          </Show>
        </Show>
      </td>
      <td class="px-3 py-2 text-xs">
        <div class="font-mono" title={props.row.accepted_by ?? ""}>
          {labelIdentityKey(props.row.accepted_by)}
        </div>
        <div class="tabular-nums text-muted-foreground">
          {props.row.accepted_at ? formatDateTime(fromRfc3339(props.row.accepted_at)) : "—"}
        </div>
      </td>
    </tr>
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
      <Button type="button" size="sm" variant="outline" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}
