import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { Loader2 } from "lucide-solid";
import { Show, createSignal, onMount } from "solid-js";

import { LanguageSwitcher, ThemeToggle } from "~/components/user-menu";
import { adminStatus } from "~/lib/admin-api";
import { signIn } from "~/lib/auth";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Login por chave (protótipo Paper). Não há fluxo de senha: a credencial é o
// bearer que o engine já entende (token raiz, token de usuário do banco, ou
// chave de consumidor emitida pelo mcp-auth).
//
// A chave é validada sondando o próprio engine — não existe endpoint de
// verificação. `signIn` guarda e reavalia o tier; recusa só é afirmada quando o
// engine responde 401, para não descartar uma chave boa num 5xx.
type Outcome = "idle" | "checking" | "invalid" | "unreachable";

function LoginScreen() {
  const navigate = useNavigate();
  const [key, setKey] = createSignal("");
  const [outcome, setOutcome] = createSignal<Outcome>("idle");
  // Versão só aparece quando foi realmente observada: quem chega aqui para
  // trocar de chave pode já ter uma credencial admin válida. Falha (sem chave,
  // chave de usuário, engine fechado) deixa o rodapé só com o host.
  const [version, setVersion] = createSignal<string | null>(null);

  onMount(() => {
    void adminStatus()
      .then((status) => setVersion(status.version))
      .catch(() => setVersion(null));
  });

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const value = key().trim();
    if (!value || outcome() === "checking") return;

    setOutcome("checking");
    const tier = await signIn(value);
    if (tier === "unauthenticated") {
      setOutcome("invalid");
      return;
    }
    if (tier === "unreachable") {
      setOutcome("unreachable");
      return;
    }
    navigate({ to: "/" });
  };

  const failed = () => outcome() === "invalid" || outcome() === "unreachable";

  return (
    <div class="flex min-h-screen flex-col bg-sidebar-bg text-foreground">
      <div class="flex justify-end gap-0.5 p-4">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div class="flex flex-1 items-center justify-center px-4">
        <form
          class="flex w-[400px] max-w-full flex-col gap-4 rounded-lg border border-hairline bg-content-bg p-4 shadow-card"
          onSubmit={(event) => void submit(event)}
        >
          <div class="flex flex-col gap-1">
            <h1 class="text-sm font-semibold">{t(() => m.login_title())}</h1>
            <p class="text-xs text-muted-foreground">{t(() => m.login_hint())}</p>
          </div>

          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-muted-foreground">
              {t(() => m.login_field_label())}
            </span>
            <input
              autofocus
              autocomplete="off"
              spellcheck={false}
              class={cn(
                "w-full rounded-md border bg-background px-2.5 py-1.5 font-mono text-sm outline-none transition",
                "placeholder:text-muted-foreground focus-visible:border-primary",
                failed() ? "border-destructive" : "border-hairline",
              )}
              data-testid="login-key"
              placeholder="amk_…"
              type="password"
              value={key()}
              onInput={(event) => {
                setKey(event.currentTarget.value);
                if (failed()) setOutcome("idle");
              }}
            />
          </label>

          <Show when={outcome() === "invalid"}>
            <p class="text-xs text-destructive" data-testid="login-error" role="alert">
              {t(() => m.login_invalid())}
            </p>
          </Show>
          <Show when={outcome() === "unreachable"}>
            <p class="text-xs text-destructive" data-testid="login-error" role="alert">
              {t(() => m.login_unreachable())}
            </p>
          </Show>

          <button
            class="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            data-testid="login-submit"
            disabled={outcome() === "checking" || key().trim().length === 0}
            type="submit"
          >
            <Show when={outcome() === "checking"}>
              <Loader2 class="animate-spin" size={15} />
            </Show>
            <span>
              {outcome() === "checking" ? t(() => m.login_validating()) : t(() => m.login_submit())}
            </span>
          </button>

          <div class="flex items-center gap-2 pt-1">
            <span class="h-px flex-1 bg-hairline" />
            <span class="text-xs font-medium tracking-wide text-muted-foreground">
              {t(() => m.login_no_key_divider())}
            </span>
            <span class="h-px flex-1 bg-hairline" />
          </div>
          <p class="text-xs text-muted-foreground">{t(() => m.login_no_key_body())}</p>
        </form>
      </div>

      <footer class="p-4 text-center text-xs text-muted-foreground" data-testid="login-footer">
        <span class="font-mono">{typeof location === "undefined" ? "" : location.host}</span>
        <Show when={version()}>
          {(value) => <span class="font-mono"> · v{value()}</span>}
        </Show>
      </footer>
    </div>
  );
}

export const Route = createFileRoute("/login")({
  component: LoginScreen,
});
