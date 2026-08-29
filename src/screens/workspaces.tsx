import { useQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { Button } from "~/components/button";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
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
    <Shell
      actions={
        <Show when={workspacesQ.data}>
          {(rows) => <span>{t(() => m.home_workspaces_count({ count: rows().length }))}</span>}
        </Show>
      }
      heading={<span>{t(() => m.nav_workspaces())}</span>}
      level="server"
    >
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
              <Button onClick={() => void workspacesQ.refetch()} size="sm" type="button" variant="outline">
                {t(() => m.state_retry())}
              </Button>
            </div>
          }
          when={!workspacesQ.isError}
        >
          <Show
            fallback={
              <EmptyState body={t(() => m.workspaces_empty_body())} title={t(() => m.state_empty_title())} />
            }
            when={(workspacesQ.data?.length ?? 0) > 0}
          >
            <div class="overflow-x-auto">
              <table class="w-full table-fixed text-sm">
                <thead class="text-xs text-muted-foreground">
                  <tr>
                    <th class="pb-2 text-left font-medium">{t(() => m.workspaces_col_name())}</th>
                    <th class="w-24 pb-2 text-right font-medium">{t(() => m.workspaces_col_projects())}</th>
                    <th class="w-24 pb-2 text-right font-medium">{t(() => m.workspaces_col_pages())}</th>
                    <th class="w-36 pb-2 text-left font-medium">{t(() => m.workspaces_col_updated())}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={workspacesQ.data}>
                    {(row) => (
                      <tr class="border-t border-hairline">
                        <td class="py-2">
                          <Link
                            class="font-mono text-xs hover:underline"
                            to="/workspaces/$workspace"
                            params={{ workspace: row.workspace_name }}
                          >
                            {row.workspace_name}
                          </Link>
                        </td>
                        <td class="py-2 text-right">{row.project_count}</td>
                        <td class="py-2 text-right">{row.page_count}</td>
                        <td class="py-2 text-xs text-muted-foreground">{formatDateShort(row.last_updated)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </Show>
    </Shell>
  );
}
