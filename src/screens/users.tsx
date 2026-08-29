import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal, type JSX } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Input } from "~/components/input";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import {
  adminCreateUser,
  adminExpireUser,
  adminReviveUser,
  adminRotateUserToken,
  adminUsers,
} from "~/lib/admin-api";
import type { AdminUser, UserWithToken } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { canManageUsers, tier } from "~/lib/auth";
import { formatDateTime, formatRelative, fromMicros } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Tela `/users` (B6). Fonte: GET `/admin/users` → `{users}` já desembrulhado
// por `adminUsers()`. Timestamps em MICROssegundos. O token em claro só existe
// nas respostas de create/rotate e vive num signal local — nunca no cache da
// query, porque o engine não o devolve de novo.
//
// Colunas que o protótipo poderia sugerir (papel, workspace, versões de
// token) não existem no schema `users` e ficam de fora.

type Dialog =
  | { kind: "create" }
  | { kind: "expire"; user: AdminUser }
  | { kind: "rotate"; user: AdminUser }
  | { kind: "secret"; username: string; token: string; source: "create" | "rotate" };

export function UsersScreen() {
  const allowed = () => canManageUsers(tier());

  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_users())}</span>}
      actions={
        <Show when={allowed()}>
          <span>{t(() => m.users_subtitle())}</span>
        </Show>
      }
    >
      <Show when={allowed()} fallback={<Forbidden />}>
        <UsersBody />
      </Show>
    </Shell>
  );
}

function Forbidden() {
  return (
    <div class="flex flex-col gap-4">
      <EmptyState title={t(() => m.users_forbidden_title())} body={t(() => m.users_forbidden_body())} />
      <InfoCards />
    </div>
  );
}

function UsersBody() {
  const q = useQuery(() => ({
    queryKey: ["admin", "users"],
    queryFn: adminUsers,
  }));

  const [dialog, setDialog] = createSignal<Dialog | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [pepperOff, setPepperOff] = createSignal(false);
  const [rowError, setRowError] = createSignal<string | null>(null);

  const close = () => setDialog(null);

  const onPepper = () => {
    setPepperOff(true);
    close();
  };

  const revive = async (user: AdminUser) => {
    setBusy(user.username);
    setRowError(null);
    try {
      await adminReviveUser(user.username);
      await q.refetch();
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        onPepper();
        return;
      }
      setRowError(error instanceof ApiError ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-end">
        <Button
          size="sm"
          disabled={pepperOff()}
          onClick={() => {
            setPepperOff(false);
            setDialog({ kind: "create" });
          }}
        >
          {t(() => m.users_new())}
        </Button>
      </div>

      <Show when={pepperOff()}>
        <div
          class="flex flex-col gap-1 rounded-lg border border-hairline bg-accent p-4 text-accent-foreground"
          role="status"
        >
          <strong class="text-sm font-medium">{t(() => m.users_pepper_title())}</strong>
          <p class="text-xs">{t(() => m.users_pepper_body())}</p>
        </div>
      </Show>

      <Show when={rowError()}>
        {(message) => (
          <p class="text-xs text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>

      <Show when={q.isPending}>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-4 w-1/3 rounded-md" />
          <Skeleton class="h-8 w-full rounded-md" />
          <Skeleton class="h-8 w-full rounded-md" />
          <Skeleton class="h-8 w-full rounded-md" />
        </div>
      </Show>

      <Show when={q.isError && !q.isPending}>
        <div class="flex flex-col items-center gap-2">
          <EmptyState
            title={t(() => m.state_error_title())}
            body={q.error instanceof ApiError ? q.error.message : t(() => m.state_error_title())}
          />
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>

      <Show when={!q.isPending && !q.isError}>
        <Show
          when={(q.data ?? []).length > 0}
          fallback={
            <EmptyState title={t(() => m.state_empty_title())} body={t(() => m.users_empty_body())} />
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-muted-foreground">
                  <th class="w-[140px] px-2 py-1.5 font-medium">{t(() => m.users_col_username())}</th>
                  <th class="w-[160px] px-2 py-1.5 font-medium">{t(() => m.users_col_name())}</th>
                  <th class="w-[200px] px-2 py-1.5 font-medium">{t(() => m.users_col_email())}</th>
                  <th class="w-[140px] px-2 py-1.5 font-medium">{t(() => m.users_col_created())}</th>
                  <th class="w-[140px] px-2 py-1.5 font-medium">{t(() => m.users_col_last_seen())}</th>
                  <th class="w-[180px] px-2 py-1.5 font-medium">{t(() => m.users_col_token())}</th>
                  <th class="w-[220px] px-2 py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                <For each={q.data}>
                  {(user) => (
                    <tr class="border-t border-hairline">
                      <td class="px-2 py-1.5 font-mono">{user.username}</td>
                      <td class="px-2 py-1.5">{user.name ?? "—"}</td>
                      <td class="px-2 py-1.5">{user.email ?? "—"}</td>
                      <td class="px-2 py-1.5 text-muted-foreground">
                        {formatDateTime(fromMicros(user.created_at))}
                      </td>
                      <td class="px-2 py-1.5 text-muted-foreground">
                        {user.last_seen_at === null
                          ? "—"
                          : formatRelative(fromMicros(user.last_seen_at))}
                      </td>
                      <td class="px-2 py-1.5">
                        <TokenCell user={user} />
                      </td>
                      <td class="px-2 py-1.5">
                        <div class="flex flex-wrap justify-end gap-1">
                          <Show when={user.token_expired_at === null}>
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7"
                              disabled={busy() === user.username}
                              onClick={() => setDialog({ kind: "expire", user })}
                            >
                              {t(() => m.users_action_expire())}
                            </Button>
                          </Show>
                          <Show when={user.token_expired_at !== null}>
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7"
                              disabled={busy() === user.username}
                              onClick={() => void revive(user)}
                            >
                              {t(() => m.users_action_revive())}
                            </Button>
                          </Show>
                          <Button
                            size="sm"
                            variant="ghost"
                            class="h-7"
                            disabled={busy() === user.username || pepperOff()}
                            onClick={() => setDialog({ kind: "rotate", user })}
                          >
                            {t(() => m.users_action_rotate())}
                          </Button>
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

      <InfoCards />

      <Show when={dialog()?.kind === "create"}>
        <CreateUserDialog
          onClose={close}
          onPepper={onPepper}
          onCreated={(result) => {
            void q.refetch();
            setDialog({
              kind: "secret",
              username: result.user.username,
              token: result.token,
              source: "create",
            });
          }}
        />
      </Show>

      <Show when={dialog()?.kind === "expire" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "expire" }>;
          return (
            <ConfirmNameDialog
              title={t(() => m.users_action_expire())}
              body={t(() => m.users_confirm_expire_body({ name: d.user.username }))}
              target={d.user.username}
              confirmLabel={t(() => m.users_action_expire())}
              destructive
              pending={busy() === d.user.username}
              onClose={close}
              onConfirm={async () => {
                setBusy(d.user.username);
                try {
                  await adminExpireUser(d.user.username);
                  await q.refetch();
                  close();
                } catch (error) {
                  if (error instanceof ApiError && error.status === 503) {
                    onPepper();
                    return;
                  }
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
            <ConfirmNameDialog
              title={t(() => m.users_action_rotate())}
              body={t(() => m.users_confirm_rotate_body({ name: d.user.username }))}
              target={d.user.username}
              confirmLabel={t(() => m.users_action_rotate())}
              pending={busy() === d.user.username}
              onClose={close}
              onConfirm={async () => {
                setBusy(d.user.username);
                try {
                  const result = await adminRotateUserToken(d.user.username);
                  await q.refetch();
                  setDialog({
                    kind: "secret",
                    username: result.user.username,
                    token: result.token,
                    source: "rotate",
                  });
                } catch (error) {
                  if (error instanceof ApiError && error.status === 503) {
                    onPepper();
                    return;
                  }
                  throw error;
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
              username={d.username}
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

function TokenCell(props: { user: AdminUser }) {
  const active = () => props.user.token_expired_at === null;
  return (
    <div class="flex flex-col gap-0.5">
      <Badge variant={active() ? "success" : "secondary"} class="w-fit">
        {active() ? t(() => m.users_token_active()) : t(() => m.users_token_expired())}
      </Badge>
      <Show when={!active()}>
        <span class="text-xs text-muted-foreground">
          {formatDateTime(fromMicros(props.user.token_expired_at))}
        </span>
      </Show>
    </div>
  );
}

function InfoCards() {
  return (
    <div class="grid gap-4 md:grid-cols-2">
      <div class="flex flex-col gap-1 rounded-lg border border-hairline p-4">
        <h2 class="text-sm font-medium">{t(() => m.users_lifecycle_title())}</h2>
        <p class="text-xs text-muted-foreground">{t(() => m.users_lifecycle_body())}</p>
      </div>
      <div class="flex flex-col gap-1 rounded-lg border border-hairline p-4">
        <h2 class="text-sm font-medium">{t(() => m.users_not_operator_title())}</h2>
        <p class="text-xs text-muted-foreground">{t(() => m.users_not_operator_body())}</p>
      </div>
    </div>
  );
}

function Modal(props: { title: string; onClose: () => void; children: JSX.Element }) {
  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-sidebar-bg/80 p-4"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        class="flex w-[400px] max-w-full flex-col gap-4 rounded-lg border border-hairline bg-content-bg p-4 shadow-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 class="text-sm font-semibold">{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}

function CreateUserDialog(props: {
  onClose: () => void;
  onPepper: () => void;
  onCreated: (result: UserWithToken) => void;
}) {
  const [username, setUsername] = createSignal("");
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [duplicate, setDuplicate] = createSignal(false);
  const [formError, setFormError] = createSignal<string | null>(null);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const value = username().trim();
    if (!value || pending()) return;
    setPending(true);
    setDuplicate(false);
    setFormError(null);
    try {
      const input: { username: string; name?: string; email?: string } = { username: value };
      const nameValue = name().trim();
      const emailValue = email().trim();
      if (nameValue) input.name = nameValue;
      if (emailValue) input.email = emailValue;
      const result = await adminCreateUser(input);
      props.onCreated(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        props.onPepper();
        return;
      }
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
    <Modal title={t(() => m.users_create_title())} onClose={props.onClose}>
      <form class="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.users_field_username())}
          </span>
          <Input
            autofocus
            autocomplete="off"
            class={cn(duplicate() && "border-destructive")}
            value={username()}
            onInput={(event) => {
              setUsername(event.currentTarget.value);
              setDuplicate(false);
            }}
          />
          <Show when={duplicate()}>
            <p class="text-xs text-destructive" role="alert">
              {t(() => m.users_duplicate())}
            </p>
          </Show>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.users_field_name())}
          </span>
          <Input
            autocomplete="off"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.users_field_email())}
          </span>
          <Input
            type="email"
            autocomplete="off"
            value={email()}
            onInput={(event) => setEmail(event.currentTarget.value)}
          />
        </label>
        <Show when={formError()}>
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
          <Button type="submit" size="sm" disabled={pending() || username().trim().length === 0}>
            {t(() => m.users_create_submit())}
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
  username: string;
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
          ? t(() => m.users_secret_created({ name: props.username }))
          : t(() => m.users_secret_rotated({ name: props.username }))
      }
      onClose={props.onClose}
    >
      <p class="text-xs text-muted-foreground">{t(() => m.users_secret_warning())}</p>
      <code class="break-all rounded-md border border-hairline bg-active-item p-2 font-mono text-xs">
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
