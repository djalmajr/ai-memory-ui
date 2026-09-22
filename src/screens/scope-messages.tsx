import { useQuery } from "~/lib/query";
import { Show, createSignal } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { Input } from "~/components/input";
import { ScrollArea } from "~/components/scroll-area";
import { ScopeBreadcrumb, Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import {
  adminCancelMessage,
  adminMessages,
  adminPendingWrites,
  adminPopMessage,
  adminSendMessage,
  type AgentMessageView,
} from "~/lib/admin-api";
import { ApiError } from "~/lib/api";
import { canMutate, isAdminTier, tier } from "~/lib/auth";
import { formatDateTime, fromRfc3339 } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Inbox do escopo. GET /admin/messages?box=inbox|outbox só devolve pending.
// Pop consome um item da inbox. Cancel retrai a outbox. O corpo é entrada
// de outro projeto: a tela mostra o aviso, não executa o texto.

export function ScopeMessagesScreen(props: { project: string; workspace: string }) {
  const scope = () => ({ project: props.project, workspace: props.workspace });
  const [box, setBox] = createSignal<"inbox" | "outbox">("inbox");
  const [toWorkspace, setToWorkspace] = createSignal("");
  const [toProject, setToProject] = createSignal("");
  const [subject, setSubject] = createSignal("");
  const [body, setBody] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [popped, setPopped] = createSignal<AgentMessageView | null>(null);
  const [cancelled, setCancelled] = createSignal<number | null>(null);

  const pending$ = useQuery(() => ({
    enabled: isAdminTier(tier()),
    queryFn: () => adminPendingWrites(scope(), { limit: 200, status: "pending" }),
    queryKey: ["admin", "pending-writes", props.workspace, props.project, "pending", 200],
  }));

  const list$ = useQuery(() => ({
    queryFn: () => adminMessages(scope(), box()),
    queryKey: ["admin", "messages", props.workspace, props.project, box()],
  }));

  const fail = (caught: unknown) => {
    setError(caught instanceof ApiError ? caught.message : String(caught));
  };

  const send = async () => {
    const text = body().trim();
    const destWorkspace = toWorkspace().trim();
    const destProject = toProject().trim();
    if (!text || !destWorkspace || !destProject) return;
    setPending(true);
    setError(null);
    try {
      await adminSendMessage({
        body: text,
        from_project: props.project,
        from_workspace: props.workspace,
        subject: subject().trim() || undefined,
        to_project: destProject,
        to_workspace: destWorkspace,
      });
      setBody("");
      setSubject("");
      await list$.refetch();
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(false);
    }
  };

  const pop = async (id?: string) => {
    setPending(true);
    setError(null);
    try {
      const result = await adminPopMessage(scope(), id);
      setPopped(result.message);
      setNotice(result.security_notice ?? t(() => m.messages_untrusted()));
      await list$.refetch();
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(false);
    }
  };

  const cancel = async (id?: string) => {
    setPending(true);
    setError(null);
    try {
      const result = await adminCancelMessage(scope(), id);
      setCancelled(result.cancelled);
      await list$.refetch();
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <Shell
      heading={<ScopeBreadcrumb scope={scope()} screen={t(() => m.messages_title())} />}
      level="scope"
      pendingCount={pending$.data?.length}
      scope={scope()}
    >
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant={box() === "inbox" ? "default" : "outline"} onClick={() => setBox("inbox")}>
          {t(() => m.messages_inbox())}
        </Button>
        <Button type="button" variant={box() === "outbox" ? "default" : "outline"} onClick={() => setBox("outbox")}>
          {t(() => m.messages_outbox())}
        </Button>
      </div>

      <Show when={canMutate(tier())}>
        <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
          <div class="flex flex-wrap gap-2">
            <Input
              placeholder={t(() => m.messages_to_workspace())}
              value={toWorkspace()}
              onInput={(event) => setToWorkspace(event.currentTarget.value)}
            />
            <Input
              placeholder={t(() => m.messages_to_project())}
              value={toProject()}
              onInput={(event) => setToProject(event.currentTarget.value)}
            />
            <Input
              placeholder={t(() => m.messages_subject())}
              value={subject()}
              onInput={(event) => setSubject(event.currentTarget.value)}
            />
          </div>
          <textarea
            class="min-h-24 rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder={t(() => m.messages_body())}
            value={body()}
            onInput={(event) => setBody(event.currentTarget.value)}
          />
          <Button disabled={pending()} type="button" onClick={() => void send()}>
            {t(() => m.messages_send())}
          </Button>
        </section>
      </Show>

      <Show when={notice()}>
        {(text) => <p class="text-sm text-muted-foreground">{text()}</p>}
      </Show>
      <Show when={popped()}>
        {(message) => (
          <ScrollArea class="rounded-lg border border-hairline">
            <pre class="whitespace-pre-wrap p-4 font-mono text-xs">{message().body}</pre>
          </ScrollArea>
        )}
      </Show>
      <Show when={cancelled() !== null}>
        <p class="text-sm text-muted-foreground">{t(() => m.messages_cancelled_n({ n: cancelled() ?? 0 }))}</p>
      </Show>
      <Show when={error()}>
        {(message) => (
          <p class="text-sm text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>

      <Show when={list$.isPending}>
        <Skeleton class="h-24 w-full rounded-md" />
      </Show>
      <Show when={list$.isError}>
        <p class="text-sm text-destructive">{list$.error instanceof ApiError ? list$.error.message : String(list$.error)}</p>
      </Show>
      <Show when={!list$.isPending && !list$.isError}>
        <DataGrid
          empty={t(() => m.messages_empty())}
          items={list$.data ?? []}
          columns={[
            {
              id: "subject",
              label: t(() => m.messages_subject()),
              search: (row) => `${row.subject ?? ""} ${row.body} ${row.from_agent}`,
              sortValue: (row) => row.subject ?? "",
              filter: { label: t(() => m.messages_subject()), value: (row) => row.state },
              cell: (row) => (
                <>
                  <div class="font-medium">{row.subject ?? "—"}</div>
                  <div class="text-xs text-muted-foreground">
                    {row.from_agent}
                    {row.created_at ? ` · ${formatDateTime(fromRfc3339(row.created_at))}` : ""}
                  </div>
                  <Badge variant="secondary">{row.state}</Badge>
                </>
              ),
            },
            {
              id: "body",
              label: t(() => m.messages_body()),
              class: "max-w-md truncate text-sm",
              cell: (row) => row.body,
            },
            {
              id: "actions",
              label: "",
              class: "w-28",
              hideable: false,
              cell: (row) => (
                <>
                  <Show when={canMutate(tier()) && box() === "inbox"}>
                    <Button disabled={pending()} type="button" variant="outline" onClick={() => void pop(row.id)}>
                      {t(() => m.messages_pop())}
                    </Button>
                  </Show>
                  <Show when={canMutate(tier()) && box() === "outbox"}>
                    <Button disabled={pending()} type="button" variant="outline" onClick={() => void cancel(row.id)}>
                      {t(() => m.messages_cancel())}
                    </Button>
                  </Show>
                </>
              ),
            },
          ]}
        />
      </Show>
    </Shell>
  );
}
