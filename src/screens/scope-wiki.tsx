import { useQuery } from "~/lib/query";
import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";

import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { KindBadge } from "~/components/ui-bits";
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

export function ScopeWikiScreen(props: { project: string; workspace: string }) {
  const scope = () => ({ project: props.project, workspace: props.workspace });

  const pages$ = useQuery(() => ({
    queryFn: () => listPages({ project: props.project, workspace: props.workspace }),
    queryKey: ["pages", props.workspace, props.project],
  }));

  const pending$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { limit: 200, status: "pending" }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  const showBanner = () => {
    const current = tier();
    return current === "user" || current === "anonymous";
  };

  return (
    <Shell
      description={<span>{t(() => m.wiki_subtitle())}</span>}
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
          <Button type="button" variant="outline" onClick={() => void pages$.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>

      <Show when={!pages$.isPending && !pages$.isError}>
          <div class="flex flex-col gap-4">
            <p class="text-xs text-muted-foreground">{t(() => m.wiki_note_history())}</p>
            <WikiTable empty={t(() => m.wiki_empty_body())} pages={pages$.data ?? []} scope={scope()} />
          </div>
      </Show>
    </Shell>
  );
}

function WikiTable(props: {
  empty: string;
  pages: PageSummary[];
  scope: { project: string; workspace: string };
}) {
  return (
    <DataGrid
      empty={props.empty}
      items={props.pages}
      tableClass="table-fixed"
      columns={[
        {
          id: "path",
          label: t(() => m.wiki_col_path()),
          class: "w-56",
          search: (page) => `${page.path} ${page.title}`,
          sortValue: (page) => page.path,
          cell: (page) => (
            <Link
              class="block truncate font-mono text-xs text-foreground hover:text-primary"
              to="/s/$workspace/$project/pages/$"
              params={{ _splat: page.path, project: props.scope.project, workspace: props.scope.workspace }}
            >
              {page.path}
            </Link>
          ),
        },
        {
          id: "title",
          label: t(() => m.wiki_col_title()),
          class: "min-w-0",
          sortValue: (page) => page.title,
          cell: (page) => (
            <Link
              class="block truncate hover:text-primary"
              to="/s/$workspace/$project/pages/$"
              params={{ _splat: page.path, project: props.scope.project, workspace: props.scope.workspace }}
            >
              {page.title}
            </Link>
          ),
        },
        {
          id: "kind",
          label: t(() => m.wiki_col_kind()),
          class: "w-24",
          filter: { label: t(() => m.wiki_col_kind()), value: (page) => page.kind },
          sortValue: (page) => page.kind,
          cell: (page) => <KindBadge kind={page.kind} />,
        },
        {
          id: "tier",
          label: t(() => m.wiki_col_tier()),
          class: "w-28 text-muted-foreground",
          sortValue: (page) => page.tier,
          cell: (page) => page.tier,
        },
        {
          id: "updated",
          label: t(() => m.wiki_col_updated()),
          class: "w-32 text-muted-foreground",
          sortValue: (page) => page.updated_at,
          cell: (page) => formatDateShort(page.updated_at),
        },
      ]}
    />
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
