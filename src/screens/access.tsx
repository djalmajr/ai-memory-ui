import { For, Show } from "solid-js";

import { Badge } from "~/components/badge";
import { Shell } from "~/components/shell";
import { tier, type Tier } from "~/lib/auth";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Acesso (B11). Escada estática: o engine não tem whoami, então o degrau
// ativo sai só do `tier()` (sondas HTTP). Nunca afirmar identidade.

type RungId = "anon" | "bearer" | "oidc" | "user";
type RungMark = "idle" | "active" | "possible";

function rungMark(id: RungId, current: Tier): RungMark {
  switch (current) {
    case "anonymous":
    case "anonymous-admin":
      return id === "anon" ? "active" : "idle";
    case "user":
      return id === "user" ? "active" : "idle";
    case "admin":
      // 200 em /admin/status com token: bearer raiz *ou* token de usuário no
      // modo single-operator. Sem whoami os dois colapsam.
      return id === "bearer" || id === "user" ? "possible" : "idle";
    default:
      return "idle";
  }
}

interface Rung {
  cap: () => string;
  how: () => string;
  id: RungId;
  title: () => string;
  who: () => string;
}

const RUNGS: Rung[] = [
  {
    id: "anon",
    title: () => m.access_rung_anon(),
    who: () => m.access_rung_anon_who(),
    cap: () => m.access_rung_anon_cap(),
    how: () => m.access_rung_anon_how(),
  },
  {
    id: "bearer",
    title: () => m.access_rung_bearer(),
    who: () => m.access_rung_bearer_who(),
    cap: () => m.access_rung_bearer_cap(),
    how: () => m.access_rung_bearer_how(),
  },
  {
    id: "oidc",
    title: () => m.access_rung_oidc(),
    who: () => m.access_rung_oidc_who(),
    cap: () => m.access_rung_oidc_cap(),
    how: () => m.access_rung_oidc_how(),
  },
  {
    id: "user",
    title: () => m.access_rung_user(),
    who: () => m.access_rung_user_who(),
    cap: () => m.access_rung_user_cap(),
    how: () => m.access_rung_user_how(),
  },
];

function Field(props: { label: string; text: string }) {
  return (
    <div class="flex flex-col gap-0.5">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <p class="text-sm">{props.text}</p>
    </div>
  );
}

export function AccessScreen() {
  const current = () => tier();

  return (
    <Shell
      level="server"
      heading={<span>{t(() => m.nav_access())}</span>}
      actions={<span>{t(() => m.access_subtitle())}</span>}
    >
      <div class="flex flex-col gap-4">
        <Show when={current() === "admin"}>
          <p class="rounded-lg border border-hairline bg-accent p-4 text-sm text-accent-foreground">
            {t(() => m.access_admin_ambiguous())}
          </p>
        </Show>
        <Show when={current() === "anonymous"}>
          <p class="rounded-lg border border-hairline p-4 text-sm text-muted-foreground">
            {t(() => m.access_anon_readonly())}
          </p>
        </Show>
        <Show when={current() === "anonymous-admin"}>
          <section class="flex flex-col gap-2 rounded-lg border border-warning-foreground bg-warning p-4 text-warning-foreground" role="alert">
            <h2 class="text-sm font-medium">{t(() => m.access_sem_operador_title())}</h2>
            <p class="text-sm">{t(() => m.access_sem_operador_body())}</p>
            <p class="text-sm">{t(() => m.access_sem_operador_leave())}</p>
          </section>
        </Show>

        <For each={RUNGS}>
          {(rung) => {
            const mark = () => rungMark(rung.id, current());
            return (
              <section
                class={cn(
                  "flex flex-col gap-4 rounded-lg border p-4",
                  mark() === "active" && "border-primary bg-accent",
                  mark() === "possible" && "border-primary/50 bg-accent/40",
                  mark() === "idle" && "border-hairline",
                )}
              >
                <div class="flex items-center justify-between gap-2">
                  <h2 class="text-sm font-medium">{t(rung.title)}</h2>
                  <Show when={mark() === "active"}>
                    <Badge>{t(() => m.access_active())}</Badge>
                  </Show>
                  <Show when={mark() === "possible"}>
                    <Badge variant="outline">{t(() => m.access_possible())}</Badge>
                  </Show>
                </div>
                <Field label={t(() => m.access_who())} text={t(rung.who)} />
                <Field label={t(() => m.access_cap())} text={t(rung.cap)} />
                <Field label={t(() => m.access_how())} text={t(rung.how)} />
              </section>
            );
          }}
        </For>

        <section class="flex flex-col gap-2 rounded-lg border border-hairline p-4">
          <h2 class="text-sm font-medium">{t(() => m.access_defence_title())}</h2>
          <p class="text-sm text-muted-foreground">{t(() => m.access_defence_ambiguous())}</p>
          <p class="text-sm text-muted-foreground">{t(() => m.access_defence_partial())}</p>
          <p class="text-sm text-muted-foreground">{t(() => m.access_defence_discarded())}</p>
          <p class="text-sm">{t(() => m.access_authenticated_line())}</p>
        </section>
      </div>
    </Shell>
  );
}
