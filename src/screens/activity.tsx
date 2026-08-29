import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import { adminActivityByClient } from "~/lib/admin-api";
import { ApiError } from "~/lib/api";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
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

function windowLabel(days: SinceDays): string {
  if (days === 7) return t(() => m.activity_window_7());
  if (days === 30) return t(() => m.activity_window_30());
  return t(() => m.activity_window_all());
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
      level="server"
      heading={<span>{t(() => m.nav_activity())}</span>}
      actions={<span>{t(() => m.activity_subtitle())}</span>}
    >
      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">
          {t(() => m.activity_heading({ window: windowLabel(sinceDays()) }))}
        </h2>
        <p class="text-sm text-muted-foreground">{t(() => m.activity_note())}</p>
      </div>

      <PeriodToggle value={sinceDays()} onChange={setSinceDays} />

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
          <Show
            when={rows().length > 0}
            fallback={
              <EmptyState
                title={t(() => m.state_empty_title())}
                body={t(() => m.activity_empty_body())}
              />
            }
          >
            <div class="overflow-x-auto rounded-lg border border-hairline">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-hairline text-xs text-muted-foreground">
                    <th class="w-[220px] px-4 py-2 text-left font-medium">
                      {t(() => m.activity_col_client())}
                    </th>
                    <th class="w-[120px] px-4 py-2 text-right font-medium">
                      {t(() => m.activity_col_reads())}
                    </th>
                    <th class="w-[120px] px-4 py-2 text-right font-medium">
                      {t(() => m.activity_col_writes())}
                    </th>
                    <th class="w-[120px] px-4 py-2 text-right font-medium">
                      {t(() => m.activity_col_total())}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Ordem do array `by_client` — o endpoint não ordena no cliente. */}
                  <For each={rows()}>
                    {(row) => (
                      <tr class="border-b border-hairline last:border-0">
                        <td class="px-4 py-2 font-mono">{row.client}</td>
                        <td class="px-4 py-2 text-right tabular-nums">{row.reads}</td>
                        <td class="px-4 py-2 text-right tabular-nums">{row.writes}</td>
                        <td class="px-4 py-2 text-right tabular-nums">{row.reads + row.writes}</td>
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

function PeriodToggle(props: { value: SinceDays; onChange: (value: SinceDays) => void }) {
  const options: { days: SinceDays; label: () => string }[] = [
    { days: 7, label: () => m.activity_period_7() },
    { days: 30, label: () => m.activity_period_30() },
    { days: 0, label: () => m.activity_period_all() },
  ];
  return (
    <div class="flex flex-wrap gap-2" role="group" aria-label={t(() => m.activity_period_label())}>
      <For each={options}>
        {(option) => (
          <button
            type="button"
            aria-pressed={props.value === option.days}
            class={cn(
              "h-9 rounded-md border border-hairline px-3 text-sm outline-none transition",
              "focus-visible:ring-2 focus-visible:ring-ring",
              props.value === option.days
                ? "bg-active-item font-medium text-foreground"
                : "bg-content-bg text-muted-foreground hover:text-foreground",
            )}
            onClick={() => props.onChange(option.days)}
          >
            {t(option.label)}
          </button>
        )}
      </For>
    </div>
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
      <Button size="sm" type="button" onClick={props.onRetry}>
        {t(() => m.state_retry())}
      </Button>
    </div>
  );
}
