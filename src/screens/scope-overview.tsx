import { useNavigate } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { ShieldCheck } from "lucide-solid";
import { Show } from "solid-js";

import { Button } from "~/components/button";
import { HealthRow, ProjectOverviewBody } from "~/components/overview";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import { adminPendingWrites } from "~/lib/admin-api";
import { ApiError, briefing, projectOverview, recentPages } from "~/lib/api";
import { isAdminTier, tier } from "~/lib/auth";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Visão geral do projeto (tier user/anonymous abre o escopo por aqui).
// `GET .../overview` → `{handoff, briefing, health}`.
//
// `health.contradictions` é 0 hardcoded e `health.audited_at` é null
// hardcoded no engine — omitidos, não pintados como métrica. `HealthCard`
// sempre inclui a linha de contradictions, então montamos `HealthRow`
// só para stale/duplicates/orphans. `ProjectOverviewBody` recebe `health`
// omitido: HandoffCard e BriefingView ficam no layout, o card falso não.

export function ScopeOverviewScreen(props: { project: string; workspace: string }) {
  const navigate = useNavigate();
  const scope = () => ({ project: props.project, workspace: props.workspace });

  const overview$ = useQuery(() => ({
    queryFn: () => projectOverview({ project: props.project, workspace: props.workspace }),
    queryKey: ["project-overview", props.workspace, props.project],
  }));
  const recent$ = useQuery(() => ({
    queryFn: () => recentPages({ project: props.project, workspace: props.workspace }),
    queryKey: ["recent", props.workspace, props.project],
  }));
  const briefing$ = useQuery(() => ({
    queryFn: () => briefing({ project: props.project, workspace: props.workspace }),
    queryKey: ["briefing", props.workspace, props.project],
  }));
  const pending$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { limit: 200, status: "pending" }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  const isPending = () => overview$.isPending || recent$.isPending || briefing$.isPending;
  const isError = () => overview$.isError || recent$.isError || briefing$.isError;
  const error = () => overview$.error ?? recent$.error ?? briefing$.error;
  const refetchAll = () => {
    void overview$.refetch();
    void recent$.refetch();
    void briefing$.refetch();
  };

  const openDoc = (path: string, project = props.project) => {
    void navigate({
      params: {
        _splat: path,
        project,
        workspace: props.workspace,
      },
      to: "/s/$workspace/$project/pages/$",
    });
  };

  const empty = () =>
    !overview$.data && (recent$.data?.length ?? 0) === 0 && !briefing$.data;

  return (
    <Shell
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.nav_overview())} />}
      level="scope"
      pendingCount={pending$.data?.length}
      scope={scope()}
    >
      <Show when={isPending()}>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-20 w-full rounded-md" />
          <Skeleton class="h-32 w-full rounded-md" />
        </div>
      </Show>

      <Show when={isError() && !isPending()}>
        <div class="flex flex-col items-start gap-2 text-sm" role="alert">
          <strong>{t(() => m.state_error_title())}</strong>
          <span class="text-destructive">{errorText(error())}</span>
          <Button size="sm" type="button" variant="outline" onClick={refetchAll}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>

      <Show when={!isPending() && !isError()}>
        <Show
          fallback={<EmptyState body={t(() => m.overview_empty_body())} title={t(() => m.state_empty_title())} />}
          when={!empty()}
        >
          <div class="flex flex-col gap-4">
            <ProjectOverviewBody
              briefing={overview$.data?.briefing ?? briefing$.data ?? null}
              onOpenDoc={(path) => openDoc(path)}
              overview={
                overview$.data
                  ? {
                      briefing: overview$.data.briefing,
                      handoff: overview$.data.handoff,
                      // HealthCard pinta contradictions (0) e audited_at (null).
                      health: undefined as never,
                    }
                  : null
              }
              recent={recent$.data ?? []}
            />
            <Show when={overview$.data?.health}>
              {(health) => (
                <section class="rounded-lg border border-hairline p-4">
                  <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck class="text-muted-foreground" size={15} />
                    {t(() => m.ws_health_title())}
                  </div>
                  <div class="flex flex-col gap-2 text-sm">
                    <HealthRow
                      label={t(() => m.health_stale())}
                      onOpenDoc={(_project, path) => openDoc(path, _project)}
                      pages={health().stale_pages}
                      value={health().stale}
                    />
                    <HealthRow
                      label={t(() => m.health_duplicates())}
                      onOpenDoc={(_project, path) => openDoc(path, _project)}
                      pages={health().duplicate_pages}
                      value={health().duplicates}
                    />
                    <HealthRow
                      label={t(() => m.health_orphans())}
                      onOpenDoc={(_project, path) => openDoc(path, _project)}
                      pages={health().orphan_pages}
                      value={health().orphans}
                    />
                  </div>
                </section>
              )}
            </Show>
          </div>
        </Show>
      </Show>
    </Shell>
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
