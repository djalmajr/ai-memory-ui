import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Input } from "~/components/input";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import {
  adminApiCredentials,
  adminCreateApiCredential,
  adminRevokeApiCredential,
  adminRotateApiCredential,
  adminUsers,
} from "~/lib/admin-api";
import type { AdminUser, ApiCredential, CreatedApiCredential } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { canManageUsers, canMutate, tier } from "~/lib/auth";
import { formatDateTime, formatRelative, fromMicros } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

type Dialog =
  | { kind: "create" }
  | { kind: "rotate"; credential: ApiCredential }
  | { kind: "revoke"; credential: ApiCredential }
  | { kind: "secret"; label: string; token: string; source: "create" | "rotate" };

export function AccessScreen() {
  const allowed = () => canManageUsers(tier());

  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_access())}</span>}
      actions={
        <Show when={allowed()}>
          <span>{t(() => m.access_subtitle())}</span>
        </Show>
      }
    >
      <Show
        when={allowed()}
        fallback={
          <EmptyState
            title={t(() => m.state_empty_title())}
            body={t(() => m.ops_admin_only())}
          />
        }
      >
        <AccessBody />
      </Show>
    </Shell>
  );
}

export function AccessBody() {
  const credsQ = useQuery(() => ({
    queryKey: ["admin", "api-credentials"],
    queryFn: adminApiCredentials,
  }));

  const usersQ = useQuery(() => ({
    queryKey: ["admin", "users"],
    queryFn: adminUsers,
  }));

  const [dialog, setDialog] = createSignal<Dialog | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [rowError, setRowError] = createSignal<string | null>(null);

  const close = () => setDialog(null);

  const userMap = () => {
    const map = new Map<string, string>();
    for (const u of usersQ.data ?? []) {
      map.set(u.id, u.username);
      map.set(u.username, u.username);
    }
    return map;
  };

  return (
    <div class="flex flex-col gap-4">
      {/* Banner explicativo sobre credenciais nativas vs consumidores externos */}
      <div class="flex flex-col gap-1 rounded-lg border border-hairline bg-accent/40 p-4 text-accent-foreground">
        <strong class="text-sm font-medium">{t(() => m.access_subtitle())}</strong>
        <p class="text-xs text-muted-foreground">{t(() => m.access_note_external())}</p>
      </div>

      <div class="flex items-center justify-end">
        <Button
          size="sm"
          disabled={!canMutate(tier())}
          onClick={() => {
            setRowError(null);
            setDialog({ kind: "create" });
          }}
        >
          {t(() => m.access_new())}
        </Button>
      </div>

      <Show when={rowError()}>
        {(message) => (
          <p class="text-xs text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>

      <Show when={credsQ.isPending}>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-4 w-1/3 rounded-md" />
          <Skeleton class="h-8 w-full rounded-md" />
          <Skeleton class="h-8 w-full rounded-md" />
        </div>
      </Show>

      <Show when={credsQ.isError && !credsQ.isPending}>
        <div class="flex flex-col items-center gap-2">
          <EmptyState
            title={t(() => m.state_error_title())}
            body={credsQ.error instanceof ApiError ? credsQ.error.message : t(() => m.state_error_title())}
          />
          <Button size="sm" variant="outline" onClick={() => void credsQ.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>

      <Show when={!credsQ.isPending && !credsQ.isError}>
        <Show
          when={(credsQ.data ?? []).length > 0}
          fallback={
            <EmptyState title={t(() => m.state_empty_title())} body={t(() => m.access_empty())} />
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-muted-foreground">
                  <th class="w-[180px] px-2 py-1.5 font-medium">{t(() => m.access_col_label())}</th>
                  <th class="w-[150px] px-2 py-1.5 font-medium">{t(() => m.access_col_user())}</th>
                  <th class="w-[150px] px-2 py-1.5 font-medium">{t(() => m.access_col_preview())}</th>
                  <th class="w-[130px] px-2 py-1.5 font-medium">{t(() => m.access_col_created())}</th>
                  <th class="w-[120px] px-2 py-1.5 font-medium">{t(() => m.access_col_last_used())}</th>
                  <th class="w-[120px] px-2 py-1.5 font-medium">{t(() => m.access_col_expires())}</th>
                  <th class="w-[100px] px-2 py-1.5 font-medium">{t(() => m.access_col_status())}</th>
                  <th class="w-[150px] px-2 py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                <For each={credsQ.data}>
                  {(cred) => {
                    const isRevoked = () => cred.revoked_at !== null && cred.revoked_at !== undefined;
                    const userName = () => userMap().get(cred.user_id) || cred.user_id;
                    return (
                      <tr class="border-t border-hairline">
                        <td class="px-2 py-1.5 font-medium">{cred.label}</td>
                        <td class="px-2 py-1.5 font-mono text-xs text-muted-foreground">{userName()}</td>
                        <td class="px-2 py-1.5 font-mono text-xs">
                          {cred.preview ? cred.preview : "aim_…••••"}
                        </td>
                        <td class="px-2 py-1.5 text-muted-foreground text-xs">
                          {formatDateTime(fromMicros(cred.created_at))}
                        </td>
                        <td class="px-2 py-1.5 text-muted-foreground text-xs">
                          {cred.last_used_at !== null && cred.last_used_at !== undefined
                            ? formatRelative(fromMicros(cred.last_used_at))
                            : "—"}
                        </td>
                        <td class="px-2 py-1.5 text-muted-foreground text-xs">
                          {cred.expires_at !== null && cred.expires_at !== undefined
                            ? formatDateTime(fromMicros(cred.expires_at))
                            : "—"}
                        </td>
                        <td class="px-2 py-1.5">
                          <Badge variant={isRevoked() ? "error" : "success"}>
                            {isRevoked() ? t(() => m.access_status_revoked()) : t(() => m.access_status_active())}
                          </Badge>
                        </td>
                        <td class="px-2 py-1.5">
                          <div class="flex flex-wrap justify-end gap-1">
                            <Show when={!isRevoked()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                class="h-7 text-xs"
                                disabled={busy() === cred.id || !canMutate(tier())}
                                onClick={() => setDialog({ kind: "rotate", credential: cred })}
                              >
                                {t(() => m.access_action_rotate())}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                class="h-7 text-xs"
                                disabled={busy() === cred.id || !canMutate(tier())}
                                onClick={() => setDialog({ kind: "revoke", credential: cred })}
                              >
                                {t(() => m.access_action_revoke())}
                              </Button>
                            </Show>
                          </div>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>

      <Show when={dialog()?.kind === "create"}>
        <CreateApiCredentialDialog
          users={usersQ.data ?? []}
          onClose={close}
          onCreated={(result) => {
            void credsQ.refetch();
            setDialog({
              kind: "secret",
              label: result.credential.label,
              token: result.token,
              source: "create",
            });
          }}
        />
      </Show>

      <Show when={dialog()?.kind === "rotate" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "rotate" }>;
          return (
            <ConfirmNameDialog
              title={t(() => m.access_action_rotate())}
              body={t(() => m.access_confirm_rotate_body({ name: d.credential.label }))}
              target={d.credential.label}
              confirmLabel={t(() => m.access_action_rotate())}
              pending={busy() === d.credential.id}
              onClose={close}
              onConfirm={async () => {
                setBusy(d.credential.id);
                try {
                  const result = await adminRotateApiCredential(d.credential.id);
                  await credsQ.refetch();
                  setDialog({
                    kind: "secret",
                    label: result.credential.label,
                    token: result.token,
                    source: "rotate",
                  });
                } finally {
                  setBusy(null);
                }
              }}
            />
          );
        }}
      </Show>

      <Show when={dialog()?.kind === "revoke" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "revoke" }>;
          return (
            <ConfirmNameDialog
              title={t(() => m.access_action_revoke())}
              body={t(() => m.access_confirm_revoke_body({ name: d.credential.label }))}
              target={d.credential.label}
              confirmLabel={t(() => m.access_action_revoke())}
              destructive
              pending={busy() === d.credential.id}
              onClose={close}
              onConfirm={async () => {
                setBusy(d.credential.id);
                try {
                  await adminRevokeApiCredential(d.credential.id);
                  await credsQ.refetch();
                  close();
                } finally {
                  setBusy(null);
                }
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
              label={d.label}
              token={d.token}
              source={d.source}
              onClose={close}
            />
          );
        }}
      </Show>
    </div>
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
        class="flex w-[420px] max-w-full flex-col gap-4 rounded-lg border border-hairline bg-content-bg p-4 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-dialog-title"
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
        <h2 id="access-dialog-title" class="text-sm font-semibold">
          {props.title}
        </h2>
        {props.children}
      </div>
    </div>
  );
}

function CreateApiCredentialDialog(props: {
  users: AdminUser[];
  onClose: () => void;
  onCreated: (result: CreatedApiCredential) => void;
}) {
  const [label, setLabel] = createSignal("");
  const defaultUser = () => props.users[0]?.username || "";
  const [username, setUsername] = createSignal(defaultUser());
  const [pending, setPending] = createSignal(false);
  const [formError, setFormError] = createSignal<string | null>(null);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const l = label().trim();
    const u = username() || defaultUser();
    if (!l || !u || pending()) return;

    setPending(true);
    setFormError(null);


    try {
      const result = await adminCreateApiCredential({
        username: u,
        label: l,
      });
      props.onCreated(result);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal title={t(() => m.access_create_title())} onClose={props.onClose}>
      <form class="flex flex-col gap-3.5" onSubmit={(event) => void submit(event)}>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.access_field_label())}
          </span>
          <Input
            autofocus
            autocomplete="off"
            placeholder="e.g. claude-code-local"
            value={label()}
            onInput={(event) => setLabel(event.currentTarget.value)}
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.access_field_user())}
          </span>
          <select
            class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 text-sm outline-none transition focus-visible:border-primary"
            value={username() || defaultUser()}
            onChange={(e) => setUsername(e.currentTarget.value)}
          >
            <For each={props.users}>
              {(u) => (
                <option value={u.username}>
                  {u.username} {u.name ? `(${u.name})` : ""}
                </option>
              )}
            </For>
          </select>
        </label>


        <Show when={formError()}>
          {(message) => (
            <p class="text-xs text-destructive" role="alert">
              {message()}
            </p>
          )}
        </Show>

        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
            {t(() => m.users_cancel())}
          </Button>
          <Button type="submit" size="sm" disabled={pending() || label().trim().length === 0}>
            {t(() => m.access_create_submit())}
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
            {t(() => m.users_cancel())}
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
  label: string;
  token: string;
  source: "create" | "rotate";
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
          ? t(() => m.access_secret_title({ name: props.label }))
          : t(() => m.access_secret_rotated_title({ name: props.label }))
      }
      onClose={props.onClose}
    >
      <p class="text-xs text-muted-foreground">{t(() => m.access_secret_warning())}</p>
      <code class="break-all rounded-md border border-hairline bg-active-item p-2 font-mono text-xs select-all">
        {props.token}
      </code>
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
