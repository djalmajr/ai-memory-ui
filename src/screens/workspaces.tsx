import { useQuery } from "~/lib/query";
import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";

import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { ApiError, listWorkspaces } from "~/lib/api";
import { formatDateShort } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import type { WorkspaceSummary } from "~/lib/types";
import * as m from "~/paraglide/messages";

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function WorkspacesScreen() {
  const workspacesQ = useQuery<WorkspaceSummary[]>(() => ({
    queryFn: listWorkspaces,
    queryKey: ["api", "workspaces"],
  }));

  return (
    <Shell heading={<span>{t(() => m.nav_workspaces())}</span>} level="server">
      <Show
        fallback={
          <div class="flex flex-col gap-3">
            <Skeleton class="h-4 w-1/3 rounded-md" />
            <Skeleton class="h-24 w-full rounded-md" />
          </div>
        }
        when={!workspacesQ.isPending}
      >
        <Show
          fallback={
            <div class="flex flex-col items-start gap-2" role="alert">
              <strong class="text-sm">{t(() => m.state_error_title())}</strong>
              <p class="text-sm text-destructive">{errorText(workspacesQ.error)}</p>
              <Button onClick={() => void workspacesQ.refetch()} type="button" variant="outline">
                {t(() => m.state_retry())}
              </Button>
            </div>
          }
          when={!workspacesQ.isError}
        >
          <DataGrid
            empty={t(() => m.workspaces_empty_body())}
            items={workspacesQ.data ?? []}
            tableClass="table-fixed"
            columns={[
              {
                id: "name",
                label: t(() => m.workspaces_col_name()),
                search: (row) => row.workspace_name,
                sortValue: (row) => row.workspace_name,
                cell: (row) => (
                  <Link
                    class="font-mono text-xs hover:underline"
                    to="/workspaces/$workspace"
                    params={{ workspace: row.workspace_name }}
                  >
                    {row.workspace_name}
                  </Link>
                ),
              },
              {
                id: "projects",
                label: t(() => m.workspaces_col_projects()),
                class: "w-24 tabular-nums",
                sortValue: (row) => row.project_count,
                cell: (row) => row.project_count,
              },
              {
                id: "pages",
                label: t(() => m.workspaces_col_pages()),
                class: "w-24 tabular-nums",
                sortValue: (row) => row.page_count,
                cell: (row) => row.page_count,
              },
              {
                id: "updated",
                label: t(() => m.workspaces_col_updated()),
                class: "w-36 text-xs text-muted-foreground",
                sortValue: (row) => row.last_updated ?? "",
                cell: (row) => formatDateShort(row.last_updated),
              },
            ]}
          />
        </Show>
      </Show>
    </Shell>
  );
}
