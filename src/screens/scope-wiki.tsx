import { useQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { For, Show, createMemo, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { Input } from "~/components/input";
import { kindCounts } from "~/components/overview";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState, KindBadge } from "~/components/ui-bits";
import { adminPendingWrites } from "~/lib/admin-api";
import { ApiError, listPages } from "~/lib/api";
import { isAdminTier, tier } from "~/lib/auth";
import { formatDateShort } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import type { PageSummary } from "~/lib/types";
import * as m from "~/paraglide/messages";

// Lista Wiki do escopo. `GET /api/v1/.../pages` devolve só
// `{path,title,kind,tier,updated_at}` (RFC3339, `is_latest`, path ASC).
//
// Não há coluna "Versões": nem `/api/v1` nem `/admin/*` expõem contagem ou
// histórico por página. O único caminho de histórico é o checkpoint git no
// leitor (`POST /admin/restore-page` com `rev` = oid).

const KIND_ALL = "all";

export function ScopeWikiScreen(props: { project: string; workspace: string }) {
  const scope = () => ({ project: props.project, workspace: props.workspace });
  const [query, setQuery] = createSignal("");
  const [kind, setKind] = createSignal(KIND_ALL);

  const pages$ = useQuery(() => ({
    queryFn: () => listPages({ project: props.project, workspace: props.workspace }),
    queryKey: ["pages", props.workspace, props.project],
  }));

  const pending$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { limit: 200, status: "pending" }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  const kinds = createMemo(() => kindCounts(pages$.data ?? []));

  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase();
    const selected = kind();
    return (pages$.data ?? []).filter((page) => {
      if (selected !== KIND_ALL && page.kind !== selected) return false;
      if (!needle) return true;
      return page.path.toLowerCase().includes(needle) || page.title.toLowerCase().includes(needle);
    });
  });

  const showBanner = () => {
    const current = tier();
    return current === "user" || current === "anonymous";
  };

  return (
    <Shell
      actions={
        <Show when={pages$.data}>
          {(pages) => <span>{t(() => m.count_pages({ count: pages().length }))}</span>}
        </Show>
      }
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.nav_wiki())} />}
      level="scope"
      pendingCount={pending$.data?.length}
      scope={scope()}
    >
      <Show when={showBanner()}>
        <div class="rounded-lg border border-hairline bg-accent px-3 py-2 text-sm text-accent-foreground">
          {tier() === "user" ? t(() => m.wiki_banner_user()) : t(() => m.wiki_banner_anonymous())}
        </div>
      </Show>

      <Show when={pages$.isPending}>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-8 w-full rounded-md" />
          <Skeleton class="h-8 w-full rounded-md" />
          <Skeleton class="h-8 w-2/3 rounded-md" />
        </div>
      </Show>

      <Show when={pages$.isError}>
        <div class="flex flex-col items-start gap-2 text-sm" role="alert">
          <strong>{t(() => m.state_error_title())}</strong>
          <span class="text-destructive">{errorText(pages$.error)}</span>
          <Button size="sm" type="button" variant="outline" onClick={() => void pages$.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>

      <Show when={!pages$.isPending && !pages$.isError}>
        <Show
          fallback={<EmptyState body={t(() => m.wiki_empty_body())} title={t(() => m.state_empty_title())} />}
          when={(pages$.data?.length ?? 0) > 0}
        >
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <Input
                class="h-8 max-w-xs"
                placeholder={t(() => m.wiki_filter_placeholder())}
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
              <select
                class="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={kind()}
                onChange={(event) => setKind(event.currentTarget.value)}
              >
                <option value={KIND_ALL}>{t(() => m.wiki_filter_kind_all())}</option>
                <For each={kinds()}>
                  {(item) => (
                    <option value={item.kind}>
                      {item.kind} ({item.count})
                    </option>
                  )}
                </For>
              </select>
            </div>

            <p class="text-xs text-muted-foreground">{t(() => m.wiki_note_history())}</p>

            <Show
              fallback={
                <EmptyState
                  body={t(() => m.tree_filter_empty_body())}
                  title={t(() => m.tree_filter_empty_title())}
                />
              }
              when={filtered().length > 0}
            >
              <WikiTable pages={filtered()} scope={scope()} />
            </Show>
          </div>
        </Show>
      </Show>
    </Shell>
  );
}

function WikiTable(props: { pages: PageSummary[]; scope: { project: string; workspace: string } }) {
  return (
    <div class="overflow-x-auto rounded-lg border border-hairline">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-left text-xs text-muted-foreground">
            <th class="w-56 px-2 py-1.5 font-medium">{t(() => m.wiki_col_path())}</th>
            <th class="min-w-0 px-2 py-1.5 font-medium">{t(() => m.wiki_col_title())}</th>
            <th class="w-24 px-2 py-1.5 font-medium">{t(() => m.wiki_col_kind())}</th>
            <th class="w-28 px-2 py-1.5 font-medium">{t(() => m.wiki_col_tier())}</th>
            <th class="w-32 px-2 py-1.5 font-medium">{t(() => m.wiki_col_updated())}</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.pages}>
            {(page) => {
              const params = {
                _splat: page.path,
                project: props.scope.project,
                workspace: props.scope.workspace,
              };
              return (
                <tr class="border-b border-hairline last:border-0 hover:bg-active-item">
                  <td class="px-2 py-1.5">
                    <Link
                      class="block truncate font-mono text-xs text-foreground hover:text-primary"
                      to="/s/$workspace/$project/pages/$"
                      params={params}
                    >
                      {page.path}
                    </Link>
                  </td>
                  <td class="min-w-0 px-2 py-1.5">
                    <Link
                      class="block truncate hover:text-primary"
                      to="/s/$workspace/$project/pages/$"
                      params={params}
                    >
                      {page.title}
                    </Link>
                  </td>
                  <td class="px-2 py-1.5">
                    <KindBadge kind={page.kind} />
                  </td>
                  <td class="px-2 py-1.5 text-muted-foreground">{page.tier}</td>
                  <td class="px-2 py-1.5 text-muted-foreground">{formatDateShort(page.updated_at)}</td>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
