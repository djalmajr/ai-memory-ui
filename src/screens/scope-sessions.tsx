import { useQuery } from "@tanstack/solid-query";
import { For, Show, createEffect, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { Input } from "~/components/input";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import { adminOpenSessions, adminPendingWrites } from "~/lib/admin-api";
import { AGENT_KINDS } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { isAdminTier, tier } from "~/lib/auth";
import { formatDateTime, fromRfc3339 } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import {
  OBSERVATION_KINDS,
  labelIdentityKey,
  listSessionObservations,
  listSessions,
  type ObservationOrder,
  type SessionSummary,
} from "~/lib/scope-api";
import * as m from "~/paraglide/messages";

// Sessões do escopo (C3). `/api/v1/.../sessions` filtra por dono; timestamps
// RFC3339. `actor_user` é chave de armazenamento, nunca nome. include_open
// default do engine é false — o toggle é o único caminho para ver abertas.

export function ScopeSessionsScreen(props: { workspace: string; project: string }) {
  const scope = () => ({ workspace: props.workspace, project: props.project });
  const [includeOpen, setIncludeOpen] = createSignal(false);
  const [offset, setOffset] = createSignal(0);
  const [limit, setLimit] = createSignal(20);
  const [selected, setSelected] = createSignal<SessionSummary | null>(null);
  const [openAgent, setOpenAgent] = createSignal("");

  const pending$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { status: "pending", limit: 200 }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  const list$ = useQuery(() => ({
    queryFn: () =>
      listSessions(props.workspace, props.project, {
        include_open: includeOpen(),
        limit: limit(),
        offset: offset(),
      }),
    queryKey: ["api", "sessions", props.workspace, props.project, includeOpen(), limit(), offset()],
  }));

  const open$ = useQuery(() => {
    const agent = openAgent();
    return {
      enabled: isAdminTier(tier()) && agent.length > 0,
      queryFn: () => adminOpenSessions(scope(), agent, true),
      queryKey: ["admin", "open-sessions", props.workspace, props.project, agent],
    };
  });

  const rows = () => list$.data?.sessions ?? [];
  const page = () => Math.floor(offset() / limit()) + 1;

  return (
    <Shell
      level="scope"
      scope={scope()}
      pendingCount={pending$.data?.length}
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.sessions_title())} />}
    >
      <div class="flex flex-wrap items-end gap-4">
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="size-4 accent-primary"
            checked={includeOpen()}
            onChange={(event) => {
              setIncludeOpen(event.currentTarget.checked);
              setOffset(0);
            }}
          />
          {t(() => m.sessions_include_open())}
        </label>
        <label class="flex flex-col gap-1 text-xs text-muted-foreground">
          {t(() => m.sessions_limit())}
          <select
            class="h-8 rounded-md border border-hairline bg-content-bg px-2 text-sm text-foreground"
            value={String(limit())}
            onChange={(event) => {
              setLimit(Number(event.currentTarget.value));
              setOffset(0);
            }}
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
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
            <EmptyState title={t(() => m.state_empty_title())} body={t(() => m.sessions_empty())} />
          }
        >
          <div class="overflow-x-auto rounded-lg border border-hairline">
            <table class="w-full table-fixed text-sm">
              <thead>
                <tr class="border-b border-hairline text-left text-xs text-muted-foreground">
                  <th class="w-28 px-3 py-2 font-medium">{t(() => m.sessions_col_id())}</th>
                  <th class="w-32 px-3 py-2 font-medium">{t(() => m.sessions_col_agent())}</th>
                  <th class="w-40 px-3 py-2 font-medium">{t(() => m.sessions_col_started())}</th>
                  <th class="w-40 px-3 py-2 font-medium">{t(() => m.sessions_col_ended())}</th>
                  <th class="w-24 px-3 py-2 font-medium">{t(() => m.sessions_col_observations())}</th>
                  <th class="w-32 px-3 py-2 font-medium">{t(() => m.sessions_col_owner())}</th>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(row) => (
                    <tr
                      class="cursor-pointer border-b border-hairline last:border-0 hover:bg-active-item"
                      onClick={() => setSelected(row)}
                    >
                      <td class="truncate px-3 py-2 font-mono text-xs" title={row.session_id}>
                        {row.session_id.slice(0, 8)}
                      </td>
                      <td class="truncate px-3 py-2">{row.agent_kind}</td>
                      <td class="px-3 py-2 tabular-nums">
                        {formatDateTime(fromRfc3339(row.started_at))}
                      </td>
                      <td class="px-3 py-2 tabular-nums">
                        {row.ended_at
                          ? formatDateTime(fromRfc3339(row.ended_at))
                          : t(() => m.sessions_open())}
                      </td>
                      <td class="px-3 py-2 tabular-nums">{row.observation_count}</td>
                      <td class="truncate px-3 py-2 font-mono text-xs" title={row.actor_user ?? ""}>
                        {labelIdentityKey(row.actor_user)}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div class="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={offset() === 0}
              onClick={() => setOffset((value) => Math.max(0, value - limit()))}
            >
              {t(() => m.sessions_prev())}
            </Button>
            <span class="text-xs text-muted-foreground">
              {t(() => m.sessions_page({ n: page() }))}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={rows().length < limit()}
              onClick={() => setOffset((value) => value + limit())}
            >
              {t(() => m.sessions_next())}
            </Button>
          </div>
        </Show>
      </Show>

      {/* GET /admin/open-sessions exige agent exato (AgentKind::as_str). Aliases
          como `claude` / `opencode` o engine recusa com 400 — o seletor só
          oferece a lista canônica. Não existe lista aberta server-wide. */}
      <Show when={isAdminTier(tier())}>
        <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
          <h2 class="text-sm font-medium">{t(() => m.sessions_open_admin())}</h2>
          <p class="text-xs text-muted-foreground">{t(() => m.sessions_open_hint())}</p>
          <label class="flex max-w-xs flex-col gap-1 text-xs text-muted-foreground">
            {t(() => m.sessions_open_agent())}
            <select
              class="h-8 rounded-md border border-hairline bg-content-bg px-2 text-sm text-foreground"
              value={openAgent()}
              onChange={(event) => setOpenAgent(event.currentTarget.value)}
            >
              <option value="">{t(() => m.sessions_open_pick())}</option>
              <For each={[...AGENT_KINDS]}>
                {(kind) => <option value={kind}>{kind}</option>}
              </For>
            </select>
          </label>
          <Show when={open$.isError}>
            <QueryError error={open$.error} onRetry={() => void open$.refetch()} />
          </Show>
          <Show when={openAgent() && !open$.isPending && !open$.isError}>
            <Show
              when={(open$.data ?? []).length > 0}
              fallback={
                <EmptyState
                  title={t(() => m.state_empty_title())}
                  body={t(() => m.sessions_open_empty())}
                />
              }
            >
              <ul class="flex flex-col gap-1 text-sm">
                <For each={open$.data ?? []}>
                  {(entry) => (
                    <li class="flex gap-4 font-mono text-xs">
                      <span title={entry.session_id}>{entry.session_id.slice(0, 8)}</span>
                      <span class="truncate text-muted-foreground" title={entry.cwd ?? ""}>
                        {entry.cwd ?? "—"}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </section>
      </Show>

      <Show when={selected()}>
        {(session) => (
          <ObservationsDrawer
            workspace={props.workspace}
            project={props.project}
            session={session()}
            onClose={() => setSelected(null)}
          />
        )}
      </Show>
    </Shell>
  );
}

function ObservationsDrawer(props: {
  workspace: string;
  project: string;
  session: SessionSummary;
  onClose: () => void;
}) {
  const [order, setOrder] = createSignal<ObservationOrder>("asc");
  const [kind, setKind] = createSignal("");
  const [q, setQ] = createSignal("");
  const [offset, setOffset] = createSignal(0);
  const limit = 50;

  createEffect(() => {
    order();
    kind();
    q();
    props.session.session_id;
    setOffset(0);
  });

  const obs$ = useQuery(() => ({
    queryFn: () =>
      listSessionObservations(props.workspace, props.project, props.session.session_id, {
        body_max_chars: 4000,
        kinds: kind() || undefined,
        limit,
        offset: offset(),
        order: order(),
        q: q() || undefined,
      }),
    queryKey: [
      "api",
      "observations",
      props.workspace,
      props.project,
      props.session.session_id,
      order(),
      kind(),
      q(),
      offset(),
    ],
  }));

  return (
    <>
      <div class="fixed inset-0 z-40 bg-black/20" onClick={props.onClose} />
      <aside class="fixed inset-y-0 right-0 z-50 flex w-[480px] max-w-full flex-col gap-4 border-l border-hairline bg-content-bg p-4 shadow-card">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="text-sm font-medium">{t(() => m.sessions_drawer_title())}</h2>
            <p class="truncate font-mono text-xs text-muted-foreground" title={props.session.session_id}>
              {props.session.session_id}
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
            {t(() => m.sessions_close())}
          </Button>
        </div>

        <div class="flex flex-wrap items-end gap-2">
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">
            {t(() => m.sessions_order())}
            <select
              class="h-8 rounded-md border border-hairline bg-content-bg px-2 text-sm text-foreground"
              value={order()}
              onChange={(event) => setOrder(event.currentTarget.value as ObservationOrder)}
            >
              <option value="asc">{t(() => m.sessions_order_asc())}</option>
              <option value="desc">{t(() => m.sessions_order_desc())}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">
            {t(() => m.sessions_kind())}
            <select
              class="h-8 rounded-md border border-hairline bg-content-bg px-2 text-sm text-foreground"
              value={kind()}
              onChange={(event) => setKind(event.currentTarget.value)}
            >
              <option value="">{t(() => m.sessions_kind_all())}</option>
              <For each={[...OBSERVATION_KINDS]}>
                {(value) => <option value={value}>{value}</option>}
              </For>
            </select>
          </label>
          <Input
            class="h-8 max-w-48"
            value={q()}
            placeholder={t(() => m.sessions_search())}
            onInput={(event) => setQ(event.currentTarget.value)}
          />
        </div>

        <Show when={obs$.isPending}>
          <Skeleton class="h-24 w-full rounded-md" />
        </Show>
        <Show when={obs$.isError}>
          <QueryError error={obs$.error} onRetry={() => void obs$.refetch()} />
        </Show>
        <Show when={obs$.data}>
          {(data) => (
            <>
              <p class="text-xs text-muted-foreground">
                {t(() => m.sessions_total({ n: data().total }))}
              </p>
              <Show when={data().elided_other_scope > 0}>
                <p class="text-xs text-muted-foreground">
                  {t(() => m.sessions_elided({ n: data().elided_other_scope }))}
                </p>
              </Show>
              <Show
                when={data().observations.length > 0}
                fallback={
                  <EmptyState
                    title={t(() => m.state_empty_title())}
                    body={t(() => m.sessions_obs_empty())}
                  />
                }
              >
                <ul class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                  <For each={data().observations}>
                    {(item) => (
                      <li class="flex flex-col gap-1 rounded-md border border-hairline p-2">
                        <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{item.kind}</span>
                          <span class="tabular-nums">
                            {formatDateTime(fromRfc3339(item.created_at))}
                          </span>
                        </div>
                        <strong class="text-sm">{item.title}</strong>
                        {/* Sufixo `[body truncated; N chars omitted]` vem do engine
                            e precisa permanecer visível — não recortar de novo. */}
                        <pre class="whitespace-pre-wrap font-mono text-xs">{item.body}</pre>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={offset() === 0}
                  onClick={() => setOffset((value) => Math.max(0, value - limit))}
                >
                  {t(() => m.sessions_prev())}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={offset() + data().observations.length >= data().total}
                  onClick={() => setOffset((value) => value + limit)}
                >
                  {t(() => m.sessions_next())}
                </Button>
              </div>
            </>
          )}
        </Show>
      </aside>
    </>
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
