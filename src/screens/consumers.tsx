import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Checkbox } from "~/components/checkbox";
import { Input } from "~/components/input";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { Chip, EmptyState } from "~/components/ui-bits";
import { ApiError } from "~/lib/api";
import { canMutate, tier } from "~/lib/auth";
import { formatRelative, fromUnixSeconds } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import {
  createKey,
  listKeys,
  revokeKey,
  whoami,
  type ConsumerKey,
  type KeyOwner,
} from "~/lib/keys-api";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Tela `/consumers` (B7). Inventário vem do sidecar mcp-auth, não do engine.
// No deploy atual `/keys*` não é roteável: 404/rede → banner + tabela vazia,
// nunca linhas inventadas. Responsável é derivado de `GET /keys/whoami`
// (sessão de quem emite) — o campo é somente leitura e o submit fecha se
// não houver identidade (`can_issue`).

type ScopeName = "read" | "write" | "admin";
const SCOPES: ScopeName[] = ["read", "write", "admin"];
const ID_PATTERN = /^[a-z0-9-]{2,64}$/;

type Dialog =
  | { kind: "create" }
  | { kind: "revoke"; key: ConsumerKey }
  | { kind: "rotate"; key: ConsumerKey }
  | { kind: "secret"; id: string; token: string; source: "create" | "rotate"; revokeWarning?: string };

export function ConsumersScreen() {
  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_consumers())}</span>}
      actions={<span>{t(() => m.consumers_subtitle())}</span>}
    >
      <ConsumersBody />
    </Shell>
  );
}

function isUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 404);
}

function ConsumersBody() {
  const listQ = useQuery(() => ({
    queryKey: ["admin", "consumers"],
    queryFn: listKeys,
    retry: false,
  }));

  const whoQ = useQuery(() => ({
    queryKey: ["admin", "keys-whoami"],
    queryFn: whoami,
    retry: false,
  }));

  const [dialog, setDialog] = createSignal<Dialog | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [rowError, setRowError] = createSignal<string | null>(null);

  const unavailable = () => listQ.isError && isUnavailable(listQ.error);
  const close = () => setDialog(null);

  return (
    <div class="flex flex-col gap-4">
      <Show when={unavailable()}>
        <div
          class="flex flex-col gap-1 rounded-lg border border-hairline bg-accent p-4 text-accent-foreground"
          role="status"
        >
          <strong class="text-sm font-medium">{t(() => m.consumers_unavailable_title())}</strong>
          <p class="text-xs">{t(() => m.consumers_unavailable_body())}</p>
        </div>
      </Show>

      <div class="flex items-center justify-end">
        <Button size="sm" disabled={unavailable() || !canMutate(tier())} onClick={() => setDialog({ kind: "create" })}>
          {t(() => m.consumers_new())}
        </Button>
      </div>

      <Show when={rowError()}>
        {(message) => (
          <p class="text-xs text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>

      <Show when={listQ.isPending}>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-4 w-1/3 rounded-md" />
          <Skeleton class="h-8 w-full rounded-md" />
          <Skeleton class="h-8 w-full rounded-md" />
        </div>
      </Show>

      <Show when={listQ.isError && !unavailable() && !listQ.isPending}>
        <div class="flex flex-col items-center gap-2">
          <EmptyState
            title={t(() => m.state_error_title())}
            body={listQ.error instanceof ApiError ? listQ.error.message : t(() => m.state_error_title())}
          />
          <Button size="sm" variant="outline" onClick={() => void listQ.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>

      <Show when={!listQ.isPending && (unavailable() || !listQ.isError)}>
        <Show
          when={(listQ.data ?? []).length > 0}
          fallback={
            <EmptyState
              title={t(() => m.state_empty_title())}
              body={
                unavailable()
                  ? t(() => m.consumers_unavailable_empty())
                  : t(() => m.consumers_empty_body())
              }
            />
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-muted-foreground">
                  <th class="w-[140px] px-2 py-1.5 font-medium">{t(() => m.consumers_col_id())}</th>
                  <th class="w-[140px] px-2 py-1.5 font-medium">{t(() => m.consumers_col_preview())}</th>
                  <th class="w-[140px] px-2 py-1.5 font-medium">{t(() => m.consumers_col_actor())}</th>
                  <th class="w-[200px] px-2 py-1.5 font-medium">{t(() => m.consumers_col_owner())}</th>
                  <th class="w-[160px] px-2 py-1.5 font-medium">{t(() => m.consumers_col_scopes())}</th>
                  <th class="w-[100px] px-2 py-1.5 font-medium">{t(() => m.consumers_col_state())}</th>
                  <th class="w-[140px] px-2 py-1.5 font-medium">{t(() => m.consumers_col_last_used())}</th>
                  <th class="w-[180px] px-2 py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                <For each={listQ.data}>
                  {(row) => (
                    <tr class="border-t border-hairline">
                      <td class="px-2 py-1.5 font-mono">{row.id}</td>
                      <td class="px-2 py-1.5 font-mono text-xs">{row.preview}</td>
                      <td class="px-2 py-1.5 font-mono">{row.actor_user}</td>
                      <td class="px-2 py-1.5">
                        <OwnerCell owner={row.owner} />
                      </td>
                      <td class="px-2 py-1.5">
                        <div class="flex flex-wrap gap-1">
                          <For each={row.scopes}>{(scope) => <ScopeChip scope={scope} />}</For>
                        </div>
                      </td>
                      <td class="px-2 py-1.5">
                        <StateBadge row={row} />
                      </td>
                      <td class="px-2 py-1.5 text-muted-foreground">
                        {row.last_used_at === null
                          ? "—"
                          : formatRelative(fromUnixSeconds(row.last_used_at))}
                      </td>
                      <td class="px-2 py-1.5">
                        <div class="flex flex-wrap justify-end gap-1">
                          <Show when={row.revoked_at === null || row.revoked_at === undefined}>
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7"
                              disabled={busy() === row.id || !canMutate(tier())}
                              onClick={() => setDialog({ kind: "rotate", key: row })}
                            >
                              {t(() => m.consumers_action_rotate())}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7"
                              disabled={busy() === row.id || !canMutate(tier())}
                              onClick={() => setDialog({ kind: "revoke", key: row })}
                            >
                              {t(() => m.consumers_action_revoke())}
                            </Button>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>

      <Show when={dialog()?.kind === "create"}>
        <CreateKeyDialog
          whoPending={whoQ.isPending}
          identity={whoQ.data?.identity ?? null}
          canIssue={!!whoQ.data?.identity && !!whoQ.data?.can_issue}
          onClose={close}
          onCreated={(id, token) => {
            void listQ.refetch();
            setDialog({ kind: "secret", id, token, source: "create" });
          }}
        />
      </Show>

      <Show when={dialog()?.kind === "revoke" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "revoke" }>;
          return (
            <ConfirmNameDialog
              title={t(() => m.consumers_action_revoke())}
              body={t(() => m.consumers_confirm_revoke_body({ name: d.key.id }))}
              target={d.key.id}
              confirmLabel={t(() => m.consumers_action_revoke())}
              destructive
              pending={busy() === d.key.id}
              onClose={close}
              onConfirm={async () => {
                setBusy(d.key.id);
                setRowError(null);
                try {
                  await revokeKey(d.key.id);
                  await listQ.refetch();
                  close();
                } catch (error) {
                  setRowError(error instanceof ApiError ? error.message : String(error));
                  throw error;
                } finally {
                  setBusy(null);
                }
              }}
            />
          );
        }}
      </Show>

      <Show when={dialog()?.kind === "rotate" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "rotate" }>;
          return (
            <RotateKeyDialog
              source={d.key}
              pending={busy() === d.key.id}
              onClose={close}
              onRotated={async (created, revokeError) => {
                await listQ.refetch();
                setDialog({
                  kind: "secret",
                  id: created.id,
                  token: created.key,
                  source: "rotate",
                  revokeWarning: revokeError,
                });
              }}
            />
          );
        }}
      </Show>

      <Show when={dialog()?.kind === "secret" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "secret" }>;
          return (
            <SecretDialog
              id={d.id}
              token={d.token}
              source={d.source}
              revokeWarning={d.revokeWarning}
              onClose={close}
            />
          );
        }}
      </Show>
    </div>
  );
}

function OwnerCell(props: { owner: KeyOwner }) {
  // `owner.label` é o rótulo humano (preferred_username). Nunca renderizar a
  // storage key `oidc:<username>` / `user:<username>` — se o sidecar vazar
  // nesse formato, mascaramos em vez de imprimir.
  const label = () => displayOwnerLabel(props.owner);
  return (
    <div class="flex flex-col gap-0.5">
      <div class="flex flex-wrap items-center gap-1">
        <span class="text-sm">{label()}</span>
        <Badge variant="secondary" class="w-fit">
          {props.owner.kind === "subject"
            ? t(() => m.consumers_owner_kind_oidc())
            : t(() => m.consumers_owner_kind_user())}
        </Badge>
      </div>
      <Show when={props.owner.kind === "subject" && props.owner.subject}>
        {(subject) => (
          <span class="font-mono text-xs text-muted-foreground">{maskSecret(subject())}</span>
        )}
      </Show>
    </div>
  );
}

function displayOwnerLabel(owner: KeyOwner): string {
  if (owner.label.startsWith("oidc:") || owner.label.startsWith("user:")) {
    return maskSecret(owner.subject ?? owner.label);
  }
  return owner.label;
}

function maskSecret(value: string): string {
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

function ScopeChip(props: { scope: string }) {
  return (
    <Chip
      class={
        props.scope === "admin"
          ? "bg-warning text-warning-foreground"
          : "bg-accent text-accent-foreground"
      }
    >
      {props.scope}
    </Chip>
  );
}

function StateBadge(props: { row: ConsumerKey }) {
  const state = () => {
    if (props.row.revoked_at !== null && props.row.revoked_at !== undefined) {
      return "revoked" as const;
    }
    if (props.row.expires_at !== null && props.row.expires_at !== undefined) {
      const expires = fromUnixSeconds(props.row.expires_at);
      if (expires && expires.valueOf() <= Date.now()) return "expired" as const;
    }
    return "active" as const;
  };
  const variant = () =>
    state() === "active" ? "success" : state() === "expired" ? "warning" : "secondary";
  const label = () =>
    state() === "active"
      ? t(() => m.consumers_state_active())
      : state() === "expired"
        ? t(() => m.consumers_state_expired())
        : t(() => m.consumers_state_revoked());
  return (
    <Badge variant={variant()} class="w-fit">
      {label()}
    </Badge>
  );
}

function Modal(props: { title: string; onClose: () => void; children: JSX.Element }) {
  let dialog!: HTMLDivElement;
  const previousFocus =
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);
  onMount(() => dialog.focus());
  onCleanup(() => previousFocus?.focus());

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-sidebar-bg/80 p-4"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        ref={dialog}
        class="flex w-[400px] max-w-full flex-col gap-4 rounded-lg border border-hairline bg-content-bg p-4 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consumers-dialog-title"
        tabindex="-1"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            props.onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (focusable.length === 0) {
            event.preventDefault();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="consumers-dialog-title" class="text-sm font-semibold">
          {props.title}
        </h2>
        {props.children}
      </div>
    </div>
  );
}

function CreateKeyDialog(props: {
  identity: KeyOwner | null;
  canIssue: boolean;
  whoPending: boolean;
  onClose: () => void;
  onCreated: (id: string, token: string) => void;
}) {
  const [id, setId] = createSignal("");
  const [actor, setActor] = createSignal("");
  const [scopes, setScopes] = createSignal<ScopeName[]>(["read", "write"]);
  const [pending, setPending] = createSignal(false);
  const [duplicate, setDuplicate] = createSignal(false);
  const [formError, setFormError] = createSignal<string | null>(null);

  const blocked = () => props.whoPending || !props.canIssue;
  const idValid = () => ID_PATTERN.test(id().trim());
  const canSubmit = () =>
    !blocked() && idValid() && actor().trim().length > 0 && scopes().length > 0 && !pending();

  const toggle = (scope: ScopeName, on: boolean) => {
    setScopes((current) =>
      on ? (current.includes(scope) ? current : [...current, scope]) : current.filter((s) => s !== scope),
    );
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!canSubmit()) return;
    setPending(true);
    setDuplicate(false);
    setFormError(null);
    try {
      const created = await createKey({
        id: id().trim(),
        actor_user: actor().trim(),
        scopes: scopes(),
      });
      props.onCreated(created.id, created.key);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setDuplicate(true);
        return;
      }
      setFormError(error instanceof ApiError ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal title={t(() => m.consumers_create_title())} onClose={props.onClose}>
      <form class="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.consumers_field_id())}
          </span>
          <Input
            autofocus
            autocomplete="off"
            spellcheck={false}
            class={cn("font-mono", duplicate() && "border-destructive")}
            disabled={blocked()}
            value={id()}
            onInput={(event) => {
              setId(event.currentTarget.value);
              setDuplicate(false);
            }}
          />
          <Show when={id().length > 0 && !idValid()}>
            <p class="text-xs text-destructive">{t(() => m.consumers_id_hint())}</p>
          </Show>
          <Show when={duplicate()}>
            <p class="text-xs text-destructive" role="alert">
              {t(() => m.consumers_duplicate())}
            </p>
          </Show>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.consumers_field_actor())}
          </span>
          <Input
            autocomplete="off"
            spellcheck={false}
            class="font-mono"
            disabled={blocked()}
            value={actor()}
            onInput={(event) => setActor(event.currentTarget.value)}
          />
        </label>

        <fieldset class="flex flex-col gap-1.5" disabled={blocked()}>
          <legend class="text-xs font-medium text-muted-foreground">
            {t(() => m.consumers_field_scopes())}
          </legend>
          <For each={SCOPES}>
            {(scope) => (
              <label class="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={scopes().includes(scope)}
                  disabled={blocked()}
                  onChange={(on) => toggle(scope, on)}
                />
                <span class="flex flex-col">
                  <span>{scope}</span>
                  {/* O que cada escopo realmente entrega na borda. `read` não
                      cobre MCP: o `/mcp` é um JSON-RPC único onde leitura e
                      escrita compartilham método e caminho, então o forwardAuth
                      não consegue distinguir a tool e exige `write`. */}
                  <span class="text-xs text-muted-foreground">
                    {scope === "read"
                      ? t(() => m.consumers_scope_read_hint())
                      : scope === "write"
                        ? t(() => m.consumers_scope_write_hint())
                        : t(() => m.consumers_scope_admin_hint())}
                  </span>
                </span>
              </label>
            )}
          </For>
        </fieldset>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.consumers_owner_label())}
          </span>
          {/* Somente leitura: o sidecar recusa owner no corpo. Sem identidade
              o emitidor falha fechado — não há campo para digitar um responsável. */}
          <div class="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-active-item px-2.5 py-1.5">
            <Show
              when={!props.whoPending}
              fallback={
                <span class="text-xs text-muted-foreground">{t(() => m.state_loading())}</span>
              }
            >
              <Show
                when={props.canIssue && props.identity}
                fallback={
                  <>
                    <Badge variant="secondary">{t(() => m.consumers_owner_absent())}</Badge>
                    <span class="text-xs text-muted-foreground">
                      {t(() => m.consumers_owner_absent_body())}
                    </span>
                  </>
                }
              >
                {(owner) => (
                  <>
                    <span class="text-sm">{displayOwnerLabel(owner())}</span>
                    <Badge variant="secondary">
                      {owner().kind === "subject"
                        ? t(() => m.consumers_owner_kind_oidc())
                        : t(() => m.consumers_owner_kind_user())}
                    </Badge>
                    <Badge variant="success">{t(() => m.consumers_owner_captured())}</Badge>
                  </>
                )}
              </Show>
            </Show>
          </div>
        </div>

        <Show when={formError()}>
          {(message) => (
            <p class="text-xs text-destructive" role="alert">
              {message()}
            </p>
          )}
        </Show>

        <div class="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
            {t(() => m.consumers_cancel())}
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit()}>
            {t(() => m.consumers_create_submit())}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function nextConsumerId(id: string): string {
  // O sidecar trata `id` como PK: rotacionar o segredo exige um id novo.
  // Mantemos o prefixo e incrementamos um sufixo numérico.
  const match = /^(.*)-(\d+)$/.exec(id);
  const next = match ? `${match[1]}-${Number(match[2]) + 1}` : `${id}-2`;
  return next.length <= 64 ? next : next.slice(0, 64);
}

function RotateKeyDialog(props: {
  source: ConsumerKey;
  pending: boolean;
  onClose: () => void;
  onRotated: (created: ConsumerKey & { key: string }, revokeError?: string) => Promise<void>;
}) {
  const [newId, setNewId] = createSignal(nextConsumerId(props.source.id));
  const [error, setError] = createSignal<string | null>(null);
  const [pending, setPending] = createSignal(false);
  const valid = () => ID_PATTERN.test(newId().trim()) && newId().trim() !== props.source.id;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!valid() || pending() || props.pending) return;
    setPending(true);
    setError(null);
    try {
      const created = await createKey({
        id: newId().trim(),
        actor_user: props.source.actor_user,
        scopes: props.source.scopes,
      });
      let revokeError: string | undefined;
      try {
        await revokeKey(props.source.id);
      } catch (caught) {
        // A chave nova já existe e o segredo só aparece agora: não esconder
        // o reveal se a revogação da antiga falhar.
        revokeError = caught instanceof ApiError ? caught.message : String(caught);
      }
      await props.onRotated(created, revokeError);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal title={t(() => m.consumers_action_rotate())} onClose={props.onClose}>
      <form class="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <p class="text-xs text-muted-foreground">{t(() => m.consumers_rotate_body())}</p>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.consumers_field_id())}
          </span>
          <Input
            autofocus
            autocomplete="off"
            spellcheck={false}
            class="font-mono"
            value={newId()}
            onInput={(event) => setNewId(event.currentTarget.value)}
          />
        </label>
        <Show when={error()}>
          {(message) => (
            <p class="text-xs text-destructive" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
            {t(() => m.consumers_cancel())}
          </Button>
          <Button type="submit" size="sm" disabled={!valid() || pending()}>
            {t(() => m.consumers_action_rotate())}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmNameDialog(props: {
  title: string;
  body: string;
  target: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const matches = () => typed() === props.target;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!matches() || props.pending) return;
    setError(null);
    try {
      await props.onConfirm();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    }
  };

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form class="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <p class="text-xs text-muted-foreground">{props.body}</p>
        <Input
          autofocus
          autocomplete="off"
          spellcheck={false}
          class="font-mono"
          value={typed()}
          onInput={(event) => setTyped(event.currentTarget.value)}
        />
        <Show when={error()}>
          {(message) => (
            <p class="text-xs text-destructive" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
            {t(() => m.consumers_cancel())}
          </Button>
          <Button
            type="submit"
            size="sm"
            variant={props.destructive ? "destructive" : "default"}
            disabled={!matches() || props.pending}
          >
            {props.confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SecretDialog(props: {
  id: string;
  token: string;
  source: "create" | "rotate";
  revokeWarning?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      title={
        props.source === "create"
          ? t(() => m.consumers_secret_created({ name: props.id }))
          : t(() => m.consumers_secret_rotated({ name: props.id }))
      }
      onClose={props.onClose}
    >
      <p class="text-xs text-muted-foreground">{t(() => m.users_secret_warning())}</p>
      <code class="break-all rounded-md border border-hairline bg-active-item p-2 font-mono text-xs">
        {props.token}
      </code>
      <Show when={props.revokeWarning}>
        {(message) => (
          <p class="text-xs text-destructive" role="alert">
            {t(() => m.consumers_rotate_revoke_failed({ error: message() }))}
          </p>
        )}
      </Show>
      <div class="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied() ? t(() => m.users_secret_copied()) : t(() => m.users_secret_copy())}
        </Button>
        <Button size="sm" onClick={props.onClose}>
          {t(() => m.users_secret_done())}
        </Button>
      </div>
    </Modal>
  );
}
