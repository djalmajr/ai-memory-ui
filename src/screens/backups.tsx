import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import { adminBackup, adminCheckpoints } from "~/lib/admin-api";
import { ApiError } from "~/lib/api";
import { canMutate, tier } from "~/lib/auth";
import { formatDateTime, fromUnixSeconds } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Backups (B9). A lista é `GET /admin/checkpoints` — commits git do wiki, não
// dumps do SQLite. Restore completo NÃO tem rota: o botão só explica o CLI.

function failMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function BackupsScreen() {
  const q = useQuery(() => ({
    queryFn: () => adminCheckpoints(100),
    queryKey: ["admin", "checkpoints", 100],
  }));

  const [downloading, setDownloading] = createSignal(false);
  const [downloadError, setDownloadError] = createSignal<string | null>(null);
  const [downloadedAs, setDownloadedAs] = createSignal<string | null>(null);
  const [restoreOpen, setRestoreOpen] = createSignal(false);

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await adminBackup();
      saveBlob(blob, filename);
      setDownloadedAs(filename);
    } catch (error) {
      setDownloadError(failMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const items = () => q.data ?? [];

  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_backups())}</span>}
      actions={
        <div class="flex items-center gap-2">
          <Button
            disabled={downloading() || !canMutate(tier())}
            size="sm"
            type="button"
            onClick={() => void download()}
          >
            {downloading() ? t(() => m.backups_downloading()) : t(() => m.backups_download())}
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={() => setRestoreOpen(true)}>
            {t(() => m.backups_restore())}
          </Button>
        </div>
      }
    >
      <p class="text-xs text-muted-foreground">{t(() => m.backups_subtitle())}</p>
      <Show when={downloadError()}>
        {(message) => (
          <p class="text-sm text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={downloadedAs()}>
        {(name) => (
          <p class="font-mono text-sm text-muted-foreground">
            {t(() => m.backups_saved({ filename: name() }))}
          </p>
        )}
      </Show>
      <Show when={q.isPending}>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-4 w-3/4 rounded-md" />
          <Skeleton class="h-4 w-1/2 rounded-md" />
          <Skeleton class="h-24 w-full rounded-md" />
        </div>
      </Show>
      <Show when={q.isError}>
        <div class="flex flex-col items-start gap-2" role="alert">
          <p class="text-sm font-medium">{t(() => m.state_error_title())}</p>
          <p class="text-sm text-destructive">{failMessage(q.error)}</p>
          <Button size="sm" type="button" variant="outline" onClick={() => void q.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>
      <Show when={!q.isPending && !q.isError}>
        <div class="flex flex-col gap-4">
          <p class="text-xs text-muted-foreground">{t(() => m.backups_git_note())}</p>
          <Show
            when={items().length === 0}
            fallback={
              <div class="overflow-x-auto rounded-lg border border-hairline">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-hairline text-left text-xs text-muted-foreground">
                      <th class="w-28 px-3 py-2 font-medium">{t(() => m.backups_col_oid())}</th>
                      <th class="px-3 py-2 font-medium">{t(() => m.backups_col_summary())}</th>
                      <th class="w-40 px-3 py-2 font-medium">{t(() => m.backups_col_time())}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={items()}>
                      {(row) => (
                        <tr class="border-b border-hairline last:border-0">
                          <td class="px-3 py-2 font-mono text-xs">{row.short_oid}</td>
                          <td class="px-3 py-2">{row.summary}</td>
                          <td class="px-3 py-2 text-muted-foreground">
                            {formatDateTime(fromUnixSeconds(row.time))}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            }
          >
            <EmptyState body={t(() => m.backups_empty_body())} title={t(() => m.state_empty_title())} />
          </Show>
          <p class="text-sm text-muted-foreground">{t(() => m.backups_lifecycle())}</p>
        </div>
      </Show>

      <Show when={restoreOpen()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
          onClick={() => setRestoreOpen(false)}
        >
          <div
            aria-modal="true"
            class="flex w-full max-w-md flex-col gap-4 rounded-lg border border-hairline bg-content-bg p-4 shadow-card"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 class="text-sm font-medium">{t(() => m.backups_restore_title())}</h2>
            <p class="text-sm text-muted-foreground">{t(() => m.backups_restore_body())}</p>
            <pre class="overflow-x-auto rounded-md border border-hairline bg-sidebar-bg p-4 font-mono text-xs">
              ai-memory restore
            </pre>
            <div class="flex justify-end">
              <Button size="sm" type="button" variant="outline" onClick={() => setRestoreOpen(false)}>
                {t(() => m.backups_restore_close())}
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </Shell>
  );
}
