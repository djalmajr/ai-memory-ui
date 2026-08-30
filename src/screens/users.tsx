import { useQuery } from "@tanstack/solid-query";
import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { Input } from "~/components/input";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { EmptyState } from "~/components/ui-bits";
import {
  adminCreateUser,
  adminDisableUser,
  adminEnableUser,
  adminResetUserPassword,
  adminUpdateUser,
  adminUsers,
} from "~/lib/admin-api";
import type { AdminUser, UserWithPassword } from "~/lib/admin-types";
import { ApiError } from "~/lib/api";
import { canManageUsers, tier } from "~/lib/auth";
import { formatDateTime, formatRelative, fromMicros } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; user: AdminUser }
  | { kind: "reset-password"; user: AdminUser }
  | { kind: "disable"; user: AdminUser }
  | { kind: "secret"; username: string; password: string };

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

function isLastActiveRoot(user: AdminUser, users: AdminUser[]): boolean {
  if (user.role !== "root" || user.disabled_at !== null || !user.has_password) {
    return false;
  }
  const activeRoots = users.filter(
    (u) => u.role === "root" && u.disabled_at === null && u.has_password,
  );
  return activeRoots.length <= 1;
}

function UsersBody() {
  const q = useQuery(() => ({
    queryKey: ["admin", "users"],
    queryFn: adminUsers,
  }));

  const [dialog, setDialog] = createSignal<Dialog | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [rowError, setRowError] = createSignal<string | null>(null);

  const close = () => setDialog(null);

  const enable = async (user: AdminUser) => {
    setBusy(user.username);
    setRowError(null);
    try {
      await adminEnableUser(user.username);
      await q.refetch();
    } catch (error) {
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
          onClick={() => {
            setRowError(null);
            setDialog({ kind: "create" });
          }}
        >
          {t(() => m.users_new())}
        </Button>
      </div>

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
                  <th class="w-[150px] px-2 py-1.5 font-medium">{t(() => m.users_col_name())}</th>
                  <th class="w-[180px] px-2 py-1.5 font-medium">{t(() => m.users_col_email())}</th>
                  <th class="w-[90px] px-2 py-1.5 font-medium">{t(() => m.users_col_role())}</th>
                  <th class="w-[120px] px-2 py-1.5 font-medium">{t(() => m.users_col_status())}</th>
                  <th class="w-[130px] px-2 py-1.5 font-medium">{t(() => m.users_col_created())}</th>
                  <th class="w-[120px] px-2 py-1.5 font-medium">{t(() => m.users_col_last_seen())}</th>
                  <th class="w-[200px] px-2 py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                <For each={q.data}>
                  {(user) => {
                    const isLastRoot = () => isLastActiveRoot(user, q.data ?? []);
                    const isDisabled = () => user.disabled_at !== null;
                    return (
                      <tr class="border-t border-hairline">
                        <td class="px-2 py-1.5 font-mono">{user.username}</td>
                        <td class="px-2 py-1.5">{user.name ?? "—"}</td>
                        <td class="px-2 py-1.5">{user.email ?? "—"}</td>
                        <td class="px-2 py-1.5">
                          <Badge variant={user.role === "root" ? "default" : "secondary"}>
                            {user.role === "root" ? t(() => m.users_role_root()) : t(() => m.users_role_user())}
                          </Badge>
                        </td>
                        <td class="px-2 py-1.5">
                          <StatusCell user={user} />
                        </td>
                        <td class="px-2 py-1.5 text-muted-foreground text-xs">
                          {formatDateTime(fromMicros(user.created_at))}
                        </td>
                        <td class="px-2 py-1.5 text-muted-foreground text-xs">
                          {user.last_used_at !== null && user.last_used_at !== undefined
                            ? formatRelative(fromMicros(user.last_used_at))
                            : user.last_seen_at !== null && user.last_seen_at !== undefined
                              ? formatRelative(fromMicros(user.last_seen_at))
                              : "—"}
                        </td>
                        <td class="px-2 py-1.5">
                          <div class="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7 text-xs"
                              disabled={busy() === user.username}
                              onClick={() => setDialog({ kind: "edit", user })}
                            >
                              {t(() => m.users_action_edit())}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7 text-xs"
                              disabled={busy() === user.username}
                              onClick={() => setDialog({ kind: "reset-password", user })}
                            >
                              {t(() => m.users_action_reset_password())}
                            </Button>
                            <Show when={!isDisabled()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                class="h-7 text-xs"
                                disabled={busy() === user.username || isLastRoot()}
                                title={isLastRoot() ? t(() => m.users_last_root_protected()) : undefined}
                                onClick={() => setDialog({ kind: "disable", user })}
                              >
                                {t(() => m.users_action_disable())}
                              </Button>
                            </Show>
                            <Show when={isDisabled()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                class="h-7 text-xs text-primary"
                                disabled={busy() === user.username}
                                onClick={() => void enable(user)}
                              >
                                {t(() => m.users_action_enable())}
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

      <InfoCards />

      <Show when={dialog()?.kind === "create"}>
        <CreateUserDialog
          onClose={close}
          onCreated={(result) => {
            void q.refetch();
            const pw = result.temporary_password || result.password || "";
            if (pw) {
              setDialog({
                kind: "secret",
                username: result.user.username,
                password: pw,
              });
            } else {
              close();
            }
          }}
        />
      </Show>

      <Show when={dialog()?.kind === "edit" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "edit" }>;
          const isLastRoot = () => isLastActiveRoot(d.user, q.data ?? []);
          return (
            <EditUserDialog
              user={d.user}
              isLastRoot={isLastRoot()}
              onClose={close}
              onUpdated={() => {
                void q.refetch();
                close();
              }}
            />
          );
        }}
      </Show>

      <Show when={dialog()?.kind === "reset-password" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "reset-password" }>;
          return (
            <ConfirmNameDialog
              title={t(() => m.users_action_reset_password())}
              body={t(() => m.users_confirm_reset_password_body({ name: d.user.username }))}
              target={d.user.username}
              confirmLabel={t(() => m.users_action_reset_password())}
              destructive
              pending={busy() === d.user.username}
              onClose={close}
              onConfirm={async () => {
                setBusy(d.user.username);
                try {
                  const result = await adminResetUserPassword(d.user.username);
                  await q.refetch();
                  const pw = result.temporary_password || result.password || "";
                  if (pw) {
                    setDialog({
                      kind: "secret",
                      username: d.user.username,
                      password: pw,
                    });
                  } else {
                    close();
                  }
                } finally {
                  setBusy(null);
                }
              }}
            />
          );
        }}
      </Show>

      <Show when={dialog()?.kind === "disable" ? dialog() : null}>
        {(current) => {
          const d = current() as Extract<Dialog, { kind: "disable" }>;
          return (
            <ConfirmNameDialog
              title={t(() => m.users_action_disable())}
              body={t(() => m.users_confirm_disable_body({ name: d.user.username }))}
              target={d.user.username}
              confirmLabel={t(() => m.users_action_disable())}
              destructive
              pending={busy() === d.user.username}
              onClose={close}
              onConfirm={async () => {
                setBusy(d.user.username);
                try {
                  await adminDisableUser(d.user.username);
                  await q.refetch();
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
              username={d.username}
              password={d.password}
              onClose={close}
            />
          );
        }}
      </Show>
    </div>
  );
}

function StatusCell(props: { user: AdminUser }) {
  if (props.user.disabled_at !== null && props.user.disabled_at !== undefined) {
    return (
      <Badge variant="error" class="w-fit">
        {t(() => m.users_status_disabled())}
      </Badge>
    );
  }
  if (!props.user.has_password) {
    return (
      <Badge variant="outline" class="w-fit">
        {t(() => m.users_status_api_only())}
      </Badge>
    );
  }
  if (props.user.must_change_password) {
    return (
      <Badge variant="secondary" class="w-fit border-warning-foreground text-warning-foreground">
        {t(() => m.users_status_must_change())}
      </Badge>
    );
  }
  return (
    <Badge variant="success" class="w-fit">
      {t(() => m.users_status_active())}
    </Badge>
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
        aria-labelledby="users-dialog-title"
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
        <h2 id="users-dialog-title" class="text-sm font-semibold">
          {props.title}
        </h2>
        {props.children}
      </div>
    </div>
  );
}

function CreateUserDialog(props: {
  onClose: () => void;
  onCreated: (result: UserWithPassword) => void;
}) {
  const [username, setUsername] = createSignal("");
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [role, setRole] = createSignal<"root" | "user">("user");
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
      const input: { username: string; name?: string; email?: string; role: "root" | "user" } = {
        username: value,
        role: role(),
      };
      const nameValue = name().trim();
      const emailValue = email().trim();
      if (nameValue) input.name = nameValue;
      if (emailValue) input.email = emailValue;
      const result = await adminCreateUser(input);
      props.onCreated(result);
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
    <Modal title={t(() => m.users_create_title())} onClose={props.onClose}>
      <form class="flex flex-col gap-3.5" onSubmit={(event) => void submit(event)}>
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
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.users_field_role())}
          </span>
          <select
            class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 text-sm outline-none transition focus-visible:border-primary"
            value={role()}
            onChange={(e) => setRole(e.currentTarget.value as "root" | "user")}
          >
            <option value="user">{t(() => m.users_role_user())}</option>
            <option value="root">{t(() => m.users_role_root())}</option>
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
          <Button type="submit" size="sm" disabled={pending() || username().trim().length === 0}>
            {t(() => m.users_create_submit())}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserDialog(props: {
  user: AdminUser;
  isLastRoot: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = createSignal(props.user.name ?? "");
  const [email, setEmail] = createSignal(props.user.email ?? "");
  const [role, setRole] = createSignal<"root" | "user">(props.user.role);
  const [pending, setPending] = createSignal(false);
  const [formError, setFormError] = createSignal<string | null>(null);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending()) return;
    setPending(true);
    setFormError(null);
    try {
      await adminUpdateUser(props.user.username, {
        name: name().trim() || null,
        email: email().trim() || null,
        role: role(),
      });
      props.onUpdated();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal title={t(() => m.users_edit_title({ name: props.user.username }))} onClose={props.onClose}>
      <form class="flex flex-col gap-3.5" onSubmit={(event) => void submit(event)}>
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
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">
            {t(() => m.users_field_role())}
          </span>
          <select
            class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 text-sm outline-none transition focus-visible:border-primary disabled:opacity-60"
            value={role()}
            disabled={props.isLastRoot}
            onChange={(e) => setRole(e.currentTarget.value as "root" | "user")}
          >
            <option value="user">{t(() => m.users_role_user())}</option>
            <option value="root">{t(() => m.users_role_root())}</option>
          </select>
          <Show when={props.isLastRoot}>
            <p class="text-xs text-muted-foreground">
              {t(() => m.users_last_root_protected())}
            </p>
          </Show>
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
          <Button type="submit" size="sm" disabled={pending()}>
            {t(() => m.users_edit_submit())}
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
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      title={t(() => m.users_secret_title({ name: props.username }))}
      onClose={props.onClose}
    >
      <p class="text-xs text-muted-foreground">{t(() => m.users_secret_warning())}</p>
      <code class="break-all rounded-md border border-hairline bg-active-item p-2 font-mono text-xs">
        {props.password}
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
