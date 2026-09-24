import { useQuery } from "~/lib/query";
import { Show, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { CircleHelp } from "~/components/icons";
import { DataGrid } from "~/components/data-grid";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { adminActivityByClient } from "~/lib/admin-api";
import { ApiError } from "~/lib/api";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Atividade por cliente (nível servidor, endpoint único).
//
// `GET /admin/activity/by-client?since_days=` devolve `{by_client:[{client,
// reads, writes}]}`. Não existe campo `observations`, nem timestamp de
// última atividade — o protótipo desenhava "61k obs · há 2 min" e um bloco
// "Sessões abertas": ambos omitidos. A coluna total é só reads+writes.
//
// A janela NÃO volta no corpo; o rótulo vem do seletor. `since_days=0` é o
// default do engine (= todo o histórico), não 7.

type SinceDays = 0 | 7 | 30;

function failMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function ActivityHelp() {
  const [open, setOpen] = createSignal(false);
  const id = "activity-help";
  return (
    <div class="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Button
        aria-describedby={id}
        aria-label={t(() => m.activity_help())}
        size="icon-xs"
        type="button"
        variant="ghost"
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      >
        <CircleHelp />
      </Button>
      <div
        class={
          open()
            ? "absolute top-full left-0 z-50 mt-1.5 w-80 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md"
            : "sr-only"
        }
        id={id}
        role="tooltip"
      >
        <p>{t(() => m.activity_note())}</p>
      </div>
    </div>
  );
}

export function ActivityScreen() {
  const [sinceDays, setSinceDays] = createSignal<SinceDays>(7);
  const q = useQuery(() => ({
    queryKey: ["admin", "activity-by-client", sinceDays()],
    queryFn: () => adminActivityByClient(sinceDays()),
  }));

  const rows = () => q.data ?? [];

  return (
    <Shell
      description={<span>{t(() => m.activity_subtitle())}</span>}
      heading={<span>{t(() => m.nav_activity())}</span>}
      screen={t(() => m.nav_activity())}
      help={<ActivityHelp />}
      level="server"
    >
      <Show when={!q.isPending} fallback={<LoadingBlock />}>
        <Show
          when={!(q.isError && q.data === undefined)}
          fallback={
            <ErrorBlock
              message={failMessage(q.error)}
              onRetry={() => void q.refetch()}
            />
          }
        >
          <DataGrid
            empty={t(() => m.activity_empty_body())}
            filters={[
              {
                label: t(() => m.activity_period_label()),
                value: String(sinceDays()),
                options: [
                  { label: t(() => m.activity_period_7()), value: "7" },
                  { label: t(() => m.activity_period_30()), value: "30" },
                  { label: t(() => m.activity_period_all()), value: "0" },
                ],
                onChange: (value) => setSinceDays(Number(value) as SinceDays),
              },
            ]}
            items={rows()}
            searchPlaceholder={t(() => m.activity_col_client())}
            columns={[
              {
                id: "client",
                label: t(() => m.activity_col_client()),
                class: "w-[220px]",
                search: (row) => row.client,
                sortValue: (row) => row.client,
                cell: (row) => row.client,
              },
              {
                id: "reads",
                label: t(() => m.activity_col_reads()),
                class: "w-[120px] tabular-nums",
                sortValue: (row) => row.reads,
                cell: (row) => row.reads,
              },
              {
                id: "writes",
                label: t(() => m.activity_col_writes()),
                class: "w-[120px] tabular-nums",
                sortValue: (row) => row.writes,
                cell: (row) => row.writes,
              },
              {
                id: "total",
                label: t(() => m.activity_col_total()),
                class: "w-[120px] tabular-nums",
                sortValue: (row) => row.reads + row.writes,
                cell: (row) => row.reads + row.writes,
              },
            ]}
          />
        </Show>
      </Show>
    </Shell>
  );
}

function LoadingBlock() {
  return (
    <div class="flex flex-col gap-3">
      <Skeleton class="h-4 w-3/4 rounded-md" />
      <Skeleton class="h-4 w-1/2 rounded-md" />
      <Skeleton class="h-20 w-full rounded-md" />
    </div>
  );
}

function ErrorBlock(props: { message: string; onRetry: () => void }) {
  return (
    <div
      class="flex flex-col items-center justify-center gap-2 rounded-lg border border-hairline p-4 text-center"
      role="alert"
    >
      <strong class="text-sm">{t(() => m.state_error_title())}</strong>
      <span class="max-w-md text-sm text-muted-foreground">{props.message}</span>
      <Button type="button" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}
