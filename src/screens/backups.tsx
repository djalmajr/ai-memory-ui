import { useQuery } from "~/lib/query";
import { Show, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { CircleHelp } from "~/components/icons";
import { DataGrid } from "~/components/data-grid";
import { ScrollArea } from "~/components/scroll-area";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
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

function BackupsHelp() {
  const [open, setOpen] = createSignal(false);
  const id = "backups-help";
  return (
    <div class="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Button
        aria-describedby={id}
        aria-label={t(() => m.backups_help())}
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
            ? "absolute top-full left-0 z-50 mt-1.5 flex w-80 flex-col gap-2 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md"
            : "sr-only"
        }
        id={id}
        role="tooltip"
      >
        <p>{t(() => m.backups_git_note())}</p>
        <p>{t(() => m.backups_lifecycle())}</p>
      </div>
    </div>
  );
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

  const items = () => q.data ?? [];

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

  return (
    <Shell
      description={<span>{t(() => m.backups_subtitle())}</span>}
      heading={<span>{t(() => m.nav_backups())}</span>}
      screen={t(() => m.nav_backups())}
      help={<BackupsHelp />}
      level="server"
    >
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
          <Button type="button" variant="outline" onClick={() => void q.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>
      <Show when={!q.isPending && !q.isError}>
          <DataGrid
            action={
              <>
                <Button class="font-normal" type="button" variant="outline" onClick={() => setRestoreOpen(true)}>
                  {t(() => m.backups_restore())}
                </Button>
                <Button
                  disabled={downloading() || !canMutate(tier())}
                  type="button"
                  onClick={() => void download()}
                >
                  {downloading() ? t(() => m.backups_downloading()) : t(() => m.backups_download())}
                </Button>
              </>
            }
            empty={t(() => m.backups_empty_body())}
            items={items()}
            columns={[
              {
                id: "oid",
                label: t(() => m.backups_col_oid()),
                class: "w-28 font-mono text-xs",
                search: (row) => row.short_oid,
                sortValue: (row) => row.short_oid,
                cell: (row) => row.short_oid,
              },
              {
                id: "summary",
                label: t(() => m.backups_col_summary()),
                search: (row) => row.summary,
                sortValue: (row) => row.summary,
                cell: (row) => row.summary,
              },
              {
                id: "time",
                label: t(() => m.backups_col_time()),
                class: "w-40",
                sortValue: (row) => row.time,
                cell: (row) => formatDateTime(fromUnixSeconds(row.time)),
              },
            ]}
          />
      </Show>

      <Show when={restoreOpen()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
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
            <ScrollArea class="rounded-md border border-hairline bg-sidebar-bg">
              <pre class="p-4 font-mono text-xs">ai-memory restore</pre>
            </ScrollArea>
            <div class="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setRestoreOpen(false)}>
                {t(() => m.backups_restore_close())}
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </Shell>
  );
}
