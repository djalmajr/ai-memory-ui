import { useQuery } from "~/lib/query";
import { For, Show, createEffect, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { Input } from "~/components/input";
import { ScrollArea } from "~/components/scroll-area";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import { adminMoveSession, adminOpenSessions, adminPendingWrites, adminPurgeSession } from "~/lib/admin-api";
import { AGENT_KINDS } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { canMutate, isAdminTier, tier } from "~/lib/auth";
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
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          {t(() => m.sessions_limit())}
          <select class="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
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
        <DataGrid
          empty={t(() => m.sessions_empty())}
          items={rows()}
          pager={false}
          tableClass="table-fixed"
          onRow={setSelected}
          columns={[
            {
              id: "id",
              label: t(() => m.sessions_col_id()),
              class: "w-28 truncate font-mono text-xs",
              search: (row) => row.session_id,
              sortValue: (row) => row.session_id,
              cell: (row) => row.session_id.slice(0, 8),
            },
            {
              id: "agent",
              label: t(() => m.sessions_col_agent()),
              class: "w-32 truncate",
              filter: { label: t(() => m.sessions_col_agent()), value: (row) => row.agent_kind },
              sortValue: (row) => row.agent_kind,
              cell: (row) => row.agent_kind,
            },
            {
              id: "started",
              label: t(() => m.sessions_col_started()),
              class: "w-40 tabular-nums",
              sortValue: (row) => row.started_at,
              cell: (row) => formatDateTime(fromRfc3339(row.started_at)),
            },
            {
              id: "ended",
              label: t(() => m.sessions_col_ended()),
              class: "w-40 tabular-nums",
              sortValue: (row) => row.ended_at ?? "",
              cell: (row) => (row.ended_at ? formatDateTime(fromRfc3339(row.ended_at)) : t(() => m.sessions_open())),
            },
            {
              id: "observations",
              label: t(() => m.sessions_col_observations()),
              class: "w-24 tabular-nums",
              sortValue: (row) => row.observation_count,
              cell: (row) => row.observation_count,
            },
            {
              id: "owner",
              label: t(() => m.sessions_col_owner()),
              class: "w-32 truncate font-mono text-xs",
              sortValue: (row) => row.actor_user ?? "",
              cell: (row) => labelIdentityKey(row.actor_user),
            },
          ]}
        />
          <div class="flex items-center gap-2">
            <Button
              type="button"
             
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
             
              variant="outline"
              disabled={rows().length < limit()}
              onClick={() => setOffset((value) => value + limit())}
            >
              {t(() => m.sessions_next())}
            </Button>
          </div>
      </Show>

      {/* GET /admin/open-sessions exige agent exato (AgentKind::as_str). Aliases
          como `claude` / `opencode` o engine recusa com 400 — o seletor só
          oferece a lista canônica. Não existe lista aberta server-wide. */}
      <Show when={isAdminTier(tier())}>
        <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
          <h2 class="text-sm font-medium">{t(() => m.sessions_open_admin())}</h2>
          <p class="text-xs text-muted-foreground">{t(() => m.sessions_open_hint())}</p>
          <label class="flex max-w-xs flex-col gap-1.5 text-sm font-medium">
            {t(() => m.sessions_open_agent())}
            <select class="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
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

function SessionOps(props: {
  onPurged: () => void;
  project: string;
  sessionId: string;
  workspace: string;
}) {
  const [purgeArmed, setPurgeArmed] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [destWorkspace, setDestWorkspace] = createSignal("");
  const [destProject, setDestProject] = createSignal("");
  const [moveReport, setMoveReport] = createSignal<unknown>(null);

  createEffect(
    () => props.workspace,
    (workspace) => {
      setDestWorkspace(workspace);
    },
  );

  const fail = (caught: unknown) => {
    setError(caught instanceof ApiError ? caught.message : String(caught));
  };

  const purge = async () => {
    setPending(true);
    setError(null);
    try {
      await adminPurgeSession(
        { project: props.project, workspace: props.workspace },
        props.sessionId,
      );
      props.onPurged();
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(false);
    }
  };

  const move = async (confirm: boolean) => {
    const project = destProject().trim();
    if (!project) return;
    setPending(true);
    setError(null);
    try {
      setMoveReport(
        await adminMoveSession({
          confirm,
          project,
          session_id: props.sessionId,
          workspace: destWorkspace().trim() || undefined,
        }),
      );
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <section class="flex flex-col gap-2 rounded-lg border border-hairline p-3">
      <div class="flex flex-wrap gap-2">
        <Show
          when={purgeArmed()}
          fallback={
            <Button type="button" variant="outline" onClick={() => setPurgeArmed(true)}>
              {t(() => m.sessions_purge())}
            </Button>
          }
        >
          <Button disabled={pending()} type="button" onClick={() => void purge()}>
            {t(() => m.sessions_purge_confirm())}
          </Button>
        </Show>
      </div>
      <p class="text-xs font-medium">{t(() => m.sessions_move())}</p>
      <Input
        placeholder={t(() => m.sessions_move_dest_workspace())}
        value={destWorkspace()}
        onInput={(event) => setDestWorkspace(event.currentTarget.value)}
      />
      <Input
        placeholder={t(() => m.sessions_move_dest_project())}
        value={destProject()}
        onInput={(event) => setDestProject(event.currentTarget.value)}
      />
      <div class="flex flex-wrap gap-2">
        <Button disabled={pending() || destProject().trim().length === 0} type="button" variant="outline" onClick={() => void move(false)}>
          {t(() => m.sessions_move_preview())}
        </Button>
        <Button disabled={pending() || destProject().trim().length === 0} type="button" onClick={() => void move(true)}>
          {t(() => m.sessions_move_confirm())}
        </Button>
      </div>
      <Show when={error()}>
        {(message) => (
          <p class="text-sm text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={moveReport() !== null}>
        <ScrollArea class="max-h-80">
          <pre class="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(moveReport(), null, 2)}</pre>
        </ScrollArea>
      </Show>
    </section>
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

  createEffect(
    () => [order(), kind(), q(), props.session.session_id],
    () => {
      setOffset(0);
    },
  );

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
      <div class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={props.onClose} />
      <aside class="fixed inset-y-0 right-0 z-50 flex w-[480px] max-w-full min-h-0 flex-col gap-4 border-l border-hairline bg-content-bg p-4 shadow-card">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="text-sm font-medium">{t(() => m.sessions_drawer_title())}</h2>
            <p class="truncate font-mono text-xs text-muted-foreground" title={props.session.session_id}>
              {props.session.session_id}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={props.onClose}>
            {t(() => m.sessions_close())}
          </Button>
        </div>

        <Show when={canMutate(tier())}>
          <SessionOps
            project={props.project}
            sessionId={props.session.session_id}
            workspace={props.workspace}
            onPurged={props.onClose}
          />
        </Show>

        <div class="flex flex-wrap items-end gap-2">
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            {t(() => m.sessions_order())}
            <select class="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
              value={order()}
              onChange={(event) => setOrder(event.currentTarget.value as ObservationOrder)}
            >
              <option value="asc">{t(() => m.sessions_order_asc())}</option>
              <option value="desc">{t(() => m.sessions_order_desc())}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            {t(() => m.sessions_kind())}
            <select class="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
              value={kind()}
              onChange={(event) => setKind(event.currentTarget.value)}
            >
              <option value="">{t(() => m.sessions_kind_all())}</option>
              <For each={[...OBSERVATION_KINDS]}>
                {(value) => <option value={value}>{value}</option>}
              </For>
            </select>
          </label>
          <Input class="max-w-48"
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
                <ScrollArea fill class="min-h-0 flex-1">
                <ul class="flex flex-col gap-3">
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
                </ScrollArea>
              </Show>
              <div class="flex items-center gap-2">
                <Button
                  type="button"
                 
                  variant="outline"
                  disabled={offset() === 0}
                  onClick={() => setOffset((value) => Math.max(0, value - limit))}
                >
                  {t(() => m.sessions_prev())}
                </Button>
                <Button
                  type="button"
                 
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
      <Button type="button" variant="outline" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}
