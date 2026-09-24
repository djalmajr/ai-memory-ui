import { useQuery } from "~/lib/query";
import { Show, createSignal, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";

import { Badge } from "~/components/badge";
import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { CircleHelp } from "~/components/icons";
import { Input } from "~/components/input";
import { Select } from "~/components/select";
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
      description={<span>{t(() => m.access_subtitle())}</span>}
      heading={<span>{t(() => m.nav_access())}</span>}
      screen={t(() => m.nav_access())}
      help={<AccessHelp />}
      level="server"
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

function AccessHelp() {
  const [open, setOpen] = createSignal(false);
  const id = "access-help";
  return (
    <div class="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Button
        aria-describedby={id}
        aria-label={t(() => m.access_help())}
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
        <p>
          <span class="font-medium">{t(() => m.access_subtitle())}. </span>
          {t(() => m.access_note_external())}
        </p>
      </div>
    </div>
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

  const rows = () => credsQ.data ?? [];

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
          <Button variant="outline" onClick={() => void credsQ.refetch()}>
            {t(() => m.state_retry())}
          </Button>
        </div>
      </Show>

      <Show when={!credsQ.isPending && !credsQ.isError}>
        <DataGrid
          action={
            <Button
              disabled={!canMutate(tier())}
              onClick={() => {
                setRowError(null);
                setDialog({ kind: "create" });
              }}
            >
              {t(() => m.access_new())}
            </Button>
          }
          empty={t(() => m.access_empty())}
          items={rows()}
          columns={[
            { id: "label", label: t(() => m.access_col_label()), class: "w-[180px] font-medium", search: (cred) => cred.label, sortValue: (cred) => cred.label, cell: (cred) => cred.label },
            { id: "user", label: t(() => m.access_col_user()), class: "w-[150px]", sortValue: (cred) => userMap().get(cred.user_id) || cred.user_id, cell: (cred) => userMap().get(cred.user_id) || cred.user_id },
            { id: "preview", label: t(() => m.access_col_preview()), class: "w-[150px] font-mono text-xs", cell: (cred) => cred.preview || "aim_…••••" },
            { id: "created", label: t(() => m.access_col_created()), class: "w-[130px]", sortValue: (cred) => cred.created_at, cell: (cred) => formatDateTime(fromMicros(cred.created_at)) },
            { id: "used", label: t(() => m.access_col_last_used()), class: "w-[120px]", cell: (cred) => (cred.last_used_at != null ? formatRelative(fromMicros(cred.last_used_at)) : "—") },
            { id: "expires", label: t(() => m.access_col_expires()), class: "w-[120px]", cell: (cred) => (cred.expires_at != null ? formatDateTime(fromMicros(cred.expires_at)) : "—") },
            {
              id: "status",
              label: t(() => m.access_col_status()),
              class: "w-[100px]",
              filter: {
                label: t(() => m.access_col_status()),
                value: (cred) => (cred.revoked_at != null ? "revoked" : "active"),
                options: [
                  { label: t(() => m.access_status_active()), value: "active" },
                  { label: t(() => m.access_status_revoked()), value: "revoked" },
                ],
              },
              cell: (cred) => (
                <Badge variant={cred.revoked_at != null ? "error" : "success"}>
                  {cred.revoked_at != null ? t(() => m.access_status_revoked()) : t(() => m.access_status_active())}
                </Badge>
              ),
            },
            {
              id: "actions",
              label: "",
              class: "w-[150px]",
              hideable: false,
              cell: (cred) => (
                <Show when={cred.revoked_at == null}>
                  <div class="flex gap-1">
                    <Button variant="ghost" disabled={busy() === cred.id || !canMutate(tier())} onClick={() => setDialog({ kind: "rotate", credential: cred })}>
                      {t(() => m.access_action_rotate())}
                    </Button>
                    <Button variant="ghost" disabled={busy() === cred.id || !canMutate(tier())} onClick={() => setDialog({ kind: "revoke", credential: cred })}>
                      {t(() => m.access_action_revoke())}
                    </Button>
                  </div>
                </Show>
              ),
            },
          ]}
        />
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
  onSettled(() => {
    dialog.focus();
    return () => previousFocus?.focus();
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
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
          <span class="text-sm font-medium">
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
          <span class="text-sm font-medium">
            {t(() => m.access_field_user())}
          </span>
          <Select
            options={props.users.map((user) => ({
              label: user.name ? `${user.username} (${user.name})` : user.username,
              value: user.username,
            }))}
            value={username() || defaultUser()}
            onChange={setUsername}
          />
        </label>


        <Show when={formError()}>
          {(message) => (
            <p class="text-xs text-destructive" role="alert">
              {message()}
            </p>
          )}
        </Show>

        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={props.onClose}>
            {t(() => m.users_cancel())}
          </Button>
          <Button type="submit" disabled={pending() || label().trim().length === 0}>
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
  const [error, setError] = createSignal<string | null>(null);

  const submit = async () => {
    if (props.pending) return;
    setError(null);
    try {
      await props.onConfirm();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    }
  };

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <div class="flex flex-col gap-4">
        <p class="text-xs text-muted-foreground">{props.body}</p>
        <Show when={error()}>
          {(message) => (
            <p class="text-xs text-destructive" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={props.onClose}>
            {t(() => m.users_cancel())}
          </Button>
          <Button
            type="button"
            variant={props.destructive ? "destructive" : "default"}
            disabled={props.pending}
            onClick={() => void submit()}
          >
            {props.confirmLabel}
          </Button>
        </div>
      </div>
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
        <Button variant="outline" onClick={() => void copy()}>
          {copied() ? t(() => m.users_secret_copied()) : t(() => m.users_secret_copy())}
        </Button>
        <Button onClick={props.onClose}>
          {t(() => m.users_secret_done())}
        </Button>
      </div>
    </Modal>
  );
}
