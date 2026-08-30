import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { BookOpen, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-solid";
import { Match, Show, Switch, createSignal, onMount } from "solid-js";

import { LanguageSwitcher, ThemeToggle } from "~/components/user-menu";
import { adminStatus } from "~/lib/admin-api";
import {
  authMe,
  changePassword,
  ensureTier,
  recovery,
  signIn,
  tierResolved,
} from "~/lib/auth";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

type LoginOutcome = "idle" | "checking" | "invalid" | "rate_limited" | "unreachable";
type AuthMode = "login" | "recovery";

function AuthFrame() {
  const navigate = useNavigate();

  const [mode, setMode] = createSignal<AuthMode>("login");
  const [voluntaryPasswordChange] = createSignal(
    typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem("ai-memory-ui.change-password") === "1",
  );
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [outcome, setOutcome] = createSignal<LoginOutcome>("idle");

  // Forced password change form signals
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [showCurrentPassword, setShowCurrentPassword] = createSignal(false);
  const [newPassword, setNewPassword] = createSignal("");
  const [showNewPassword, setShowNewPassword] = createSignal(false);
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [showConfirmPassword, setShowConfirmPassword] = createSignal(false);
  const [changeError, setChangeError] = createSignal<string | null>(null);
  const [changing, setChanging] = createSignal(false);

  // Recovery form signals
  const [recoveryToken, setRecoveryToken] = createSignal("");
  const [showRecoveryToken, setShowRecoveryToken] = createSignal(false);
  const [recoveryNewPassword, setRecoveryNewPassword] = createSignal("");
  const [showRecoveryNewPassword, setShowRecoveryNewPassword] = createSignal(false);
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = createSignal("");
  const [showRecoveryConfirmPassword, setShowRecoveryConfirmPassword] = createSignal(false);
  const [recoveryError, setRecoveryError] = createSignal<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = createSignal(false);
  const [recovering, setRecovering] = createSignal(false);

  const [version, setVersion] = createSignal<string | null>(null);

  onMount(() => {
    sessionStorage.removeItem("ai-memory-ui.change-password");
    void ensureTier().then((currentTier) => {
      if (
        !voluntaryPasswordChange() &&
        (currentTier === "root" ||
          currentTier === "user" ||
          currentTier === "anonymous-admin" ||
          currentTier === "anonymous")
      ) {
        navigate({ to: "/" });
      }
    });

    void adminStatus()
      .then((status) => setVersion(status.version))
      .catch(() => setVersion(null));
  });

  const showPasswordChange = () =>
    voluntaryPasswordChange() || authMe()?.must_change_password === true;

  const handleLoginSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const u = username().trim();
    const p = password();
    if (!u || !p || outcome() === "checking") return;

    setOutcome("checking");
    try {
      const resultTier = await signIn(u, p);
      if (resultTier === "unauthenticated") {
        setOutcome("invalid");
        return;
      }
      if (resultTier === "unreachable") {
        setOutcome("unreachable");
        return;
      }
      if (resultTier === "must-change-password") {
        // Render forced change state inside the card
        return;
      }
      navigate({ to: "/" });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("429")) {
        setOutcome("rate_limited");
      } else {
        setOutcome("unreachable");
      }
    }
  };

  const handlePasswordChangeSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const np = newPassword();
    const cp = confirmPassword();
    const curr = currentPassword();
    if (!curr) return;


    if (np.length < 12) {
      setChangeError(t(() => m.login_password_too_short()));
      return;
    }
    if (np !== cp) {
      setChangeError(t(() => m.login_password_mismatch()));
      return;
    }

    setChangeError(null);
    setChanging(true);

    try {
      await changePassword({
        current_password: curr,
        new_password: np,
        new_password_confirmation: cp,
      });
      navigate({ to: "/" });
    } catch (err: unknown) {
      setChangeError(err instanceof Error ? err.message : String(err));
    } finally {
      setChanging(false);
    }
  };

  const handleRecoverySubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const token = recoveryToken().trim();
    const np = recoveryNewPassword();
    const cp = recoveryConfirmPassword();

    if (!token) {
      return;
    }
    if (np.length < 12) {
      setRecoveryError(t(() => m.login_password_too_short()));
      return;
    }
    if (np !== cp) {
      setRecoveryError(t(() => m.login_password_mismatch()));
      return;
    }

    setRecoveryError(null);
    setRecovering(true);

    try {
      await recovery({
        recovery_token: token,
        new_password: np,
        new_password_confirmation: cp,
      });
      setRecoverySuccess(true);
      setRecoveryToken("");
      setRecoveryNewPassword("");
      setRecoveryConfirmPassword("");
      setMode("login");
    } catch (err: unknown) {
      setRecoveryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecovering(false);
    }
  };

  const subtitleText = () => {
    if (showPasswordChange()) return t(() => m.login_must_change_desc());
    if (mode() === "recovery") return t(() => m.login_recovery_desc());
    return t(() => m.login_subtitle());
  };

  const titleText = () => {
    if (showPasswordChange()) return t(() => m.login_must_change_title());
    if (mode() === "recovery") return t(() => m.login_recovery_title());
    return t(() => m.brand_name());
  };

  return (
    <div class="flex min-h-dvh flex-col justify-center items-center p-4 py-8 bg-sidebar-bg text-foreground overflow-y-auto">
      <div class="w-full max-w-md my-auto">
        <div class="rounded-md border border-hairline bg-content-bg p-5 shadow-card">
          {/* Card Header com marca + título e controles de idioma/tema embutidos */}
          <div class="flex items-start justify-between gap-3 border-b border-hairline pb-4">
            <div class="flex items-center gap-3 min-w-0">
              <div class="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <BookOpen size={20} />
              </div>
              <div class="flex flex-col min-w-0">
                <h1 class="truncate text-sm font-semibold">{titleText()}</h1>
                <p class="truncate text-xs text-muted-foreground">{subtitleText()}</p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>

          {/* Card Body */}
          <div class="mt-5">
            <Switch>
              {/* Estado de carregamento do auth/me */}
              <Match when={!tierResolved()}>
                <div class="flex flex-col items-center justify-center gap-3 py-8" role="status">
                  <Loader2 class="animate-spin text-muted-foreground" size={24} />
                  <span class="text-xs text-muted-foreground">{t(() => m.state_loading())}</span>
                </div>
              </Match>

              {/* Estado de troca obrigatória de senha */}
              <Match when={showPasswordChange()}>
                <form class="flex flex-col gap-3.5" onSubmit={(e) => void handlePasswordChangeSubmit(e)}>
                  <label class="flex flex-col gap-1.5" for="password-change-current">
                    <span class="text-xs font-medium text-muted-foreground">
                      {t(() => m.login_field_current_password())}
                    </span>
                    <div class="relative flex items-center">
                      <input
                        id="password-change-current"
                        autocomplete="current-password"
                        class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 pr-9 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-primary"
                        type={showCurrentPassword() ? "text" : "password"}
                        value={currentPassword()}
                        onInput={(e) => {
                          setCurrentPassword(e.currentTarget.value);
                          setChangeError(null);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showCurrentPassword() ? t(() => m.login_toggle_password_hide()) : t(() => m.login_toggle_password_show())}
                        class="absolute right-2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setShowCurrentPassword((v) => !v)}
                      >
                        <Show when={showCurrentPassword()} fallback={<Eye size={16} />}>
                          <EyeOff size={16} />
                        </Show>
                      </button>
                    </div>
                  </label>

                  <label class="flex flex-col gap-1.5" for="password-change-new">
                    <span class="text-xs font-medium text-muted-foreground">
                      {t(() => m.login_field_new_password())}
                    </span>
                    <div class="relative flex items-center">
                      <input
                        id="password-change-new"
                        autocomplete="new-password"
                        class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 pr-9 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-primary"
                        type={showNewPassword() ? "text" : "password"}
                        value={newPassword()}
                        onInput={(e) => {
                          setNewPassword(e.currentTarget.value);
                          setChangeError(null);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showNewPassword() ? t(() => m.login_toggle_password_hide()) : t(() => m.login_toggle_password_show())}
                        class="absolute right-2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setShowNewPassword((v) => !v)}
                      >
                        <Show when={showNewPassword()} fallback={<Eye size={16} />}>
                          <EyeOff size={16} />
                        </Show>
                      </button>
                    </div>
                  </label>

                  <label class="flex flex-col gap-1.5" for="password-change-confirm">
                    <span class="text-xs font-medium text-muted-foreground">
                      {t(() => m.login_field_confirm_password())}
                    </span>
                    <div class="relative flex items-center">
                      <input
                        id="password-change-confirm"
                        autocomplete="new-password"
                        class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 pr-9 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-primary"
                        type={showConfirmPassword() ? "text" : "password"}
                        value={confirmPassword()}
                        onInput={(e) => {
                          setConfirmPassword(e.currentTarget.value);
                          setChangeError(null);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showConfirmPassword() ? t(() => m.login_toggle_password_hide()) : t(() => m.login_toggle_password_show())}
                        class="absolute right-2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                      >
                        <Show when={showConfirmPassword()} fallback={<Eye size={16} />}>
                          <EyeOff size={16} />
                        </Show>
                      </button>
                    </div>
                  </label>

                  <Show when={changeError()}>
                    {(err) => (
                      <p class="text-xs text-destructive" role="alert">
                        {err()}
                      </p>
                    )}
                  </Show>

                  <button
                    class="mt-2 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    disabled={
                      changing() ||
                      currentPassword().length === 0 ||
                      newPassword().length < 12 ||
                      confirmPassword().length < 12
                    }
                    type="submit"
                  >
                    <Show when={changing()}>
                      <Loader2 class="animate-spin" size={16} />
                    </Show>
                    <span>
                      {changing() ? t(() => m.login_must_change_submitting()) : t(() => m.login_must_change_submit())}
                    </span>
                  </button>
                </form>
              </Match>

              {/* Estado de recuperação break-glass */}
              <Match when={mode() === "recovery"}>
                <form class="flex flex-col gap-3.5" onSubmit={(e) => void handleRecoverySubmit(e)}>
                  <label class="flex flex-col gap-1.5" for="recovery-token">
                    <span class="text-xs font-medium text-muted-foreground">
                      {t(() => m.login_recovery_token_label())}
                    </span>
                    <div class="relative flex items-center">
                      <input
                        id="recovery-token"
                        autofocus
                        autocomplete="off"
                        spellcheck={false}
                        data-testid="recovery-token"
                        placeholder={t(() => m.login_recovery_token_placeholder())}
                        class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 pr-9 font-mono text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-primary"
                        type={showRecoveryToken() ? "text" : "password"}
                        value={recoveryToken()}
                        onInput={(e) => {
                          setRecoveryToken(e.currentTarget.value);
                          setRecoveryError(null);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showRecoveryToken() ? t(() => m.login_toggle_password_hide()) : t(() => m.login_toggle_password_show())}
                        class="absolute right-2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setShowRecoveryToken((v) => !v)}
                      >
                        <Show when={showRecoveryToken()} fallback={<Eye size={16} />}>
                          <EyeOff size={16} />
                        </Show>
                      </button>
                    </div>
                  </label>

                  <label class="flex flex-col gap-1.5" for="recovery-new-password">
                    <span class="text-xs font-medium text-muted-foreground">
                      {t(() => m.login_field_new_password())}
                    </span>
                    <div class="relative flex items-center">
                      <input
                        id="recovery-new-password"
                        autocomplete="new-password"
                        data-testid="recovery-new-password"
                        class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 pr-9 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-primary"
                        type={showRecoveryNewPassword() ? "text" : "password"}
                        value={recoveryNewPassword()}
                        onInput={(e) => {
                          setRecoveryNewPassword(e.currentTarget.value);
                          setRecoveryError(null);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showRecoveryNewPassword() ? t(() => m.login_toggle_password_hide()) : t(() => m.login_toggle_password_show())}
                        class="absolute right-2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setShowRecoveryNewPassword((v) => !v)}
                      >
                        <Show when={showRecoveryNewPassword()} fallback={<Eye size={16} />}>
                          <EyeOff size={16} />
                        </Show>
                      </button>
                    </div>
                  </label>

                  <label class="flex flex-col gap-1.5" for="recovery-confirm-password">
                    <span class="text-xs font-medium text-muted-foreground">
                      {t(() => m.login_field_confirm_password())}
                    </span>
                    <div class="relative flex items-center">
                      <input
                        id="recovery-confirm-password"
                        autocomplete="new-password"
                        data-testid="recovery-confirm-password"
                        class="w-full rounded-md border border-hairline bg-background px-2.5 py-1.5 pr-9 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-primary"
                        type={showRecoveryConfirmPassword() ? "text" : "password"}
                        value={recoveryConfirmPassword()}
                        onInput={(e) => {
                          setRecoveryConfirmPassword(e.currentTarget.value);
                          setRecoveryError(null);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showRecoveryConfirmPassword() ? t(() => m.login_toggle_password_hide()) : t(() => m.login_toggle_password_show())}
                        class="absolute right-2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setShowRecoveryConfirmPassword((v) => !v)}
                      >
                        <Show when={showRecoveryConfirmPassword()} fallback={<Eye size={16} />}>
                          <EyeOff size={16} />
                        </Show>
                      </button>
                    </div>
                  </label>

                  <Show when={recoveryError()}>
                    {(err) => (
                      <p class="text-xs text-destructive" role="alert">
                        {err()}
                      </p>
                    )}
                  </Show>

                  <button
                    class="mt-2 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    data-testid="recovery-submit"
                    disabled={recovering() || !recoveryToken().trim() || recoveryNewPassword().length < 12 || recoveryConfirmPassword().length < 12}
                    type="submit"
                  >
                    <Show when={recovering()}>
                      <Loader2 class="animate-spin" size={16} />
                    </Show>
                    <span>
                      {recovering() ? t(() => m.login_recovery_submitting()) : t(() => m.login_recovery_submit())}
                    </span>
                  </button>

                  <button
                    type="button"
                    class="mt-1 text-center text-xs text-muted-foreground transition hover:text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    data-testid="recovery-back"
                    onClick={() => {
                      setMode("login");
                      setRecoveryError(null);
                    }}
                  >
                    {t(() => m.login_recovery_back())}
                  </button>
                </form>
              </Match>

              {/* Estado normal de login por usuário/senha */}
              <Match when={mode() === "login"}>
                <form class="flex flex-col gap-3.5" onSubmit={(e) => void handleLoginSubmit(e)}>
                  <Show when={recoverySuccess()}>
                    <div class="flex items-center gap-2 rounded-md border border-hairline bg-primary/10 p-3 text-xs text-primary" role="status">
                      <CheckCircle2 size={16} class="shrink-0" />
                      <span>{t(() => m.login_recovery_success())}</span>
                    </div>
                  </Show>

                  <label class="flex flex-col gap-1.5" for="login-username">
                    <span class="text-xs font-medium text-muted-foreground">
                      {t(() => m.login_field_username())}
                    </span>
                    <input
                      id="login-username"
                      autofocus
                      autocomplete="username"
                      spellcheck={false}
                      data-testid="login-username"
                      class={cn(
                        "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-primary",
                        outcome() === "invalid" ? "border-destructive" : "border-hairline",
                      )}
                      type="text"
                      value={username()}
                      onInput={(e) => {
                        setUsername(e.currentTarget.value);
                        if (outcome() !== "idle") setOutcome("idle");
                      }}
                    />
                  </label>

                  <label class="flex flex-col gap-1.5" for="login-password">
                    <span class="text-xs font-medium text-muted-foreground">
                      {t(() => m.login_field_password())}
                    </span>
                    <div class="relative flex items-center">
                      <input
                        id="login-password"
                        autocomplete="current-password"
                        data-testid="login-password"
                        class={cn(
                          "w-full rounded-md border bg-background px-2.5 py-1.5 pr-9 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-primary",
                          outcome() === "invalid" ? "border-destructive" : "border-hairline",
                        )}
                        type={showPassword() ? "text" : "password"}
                        value={password()}
                        onInput={(e) => {
                          setPassword(e.currentTarget.value);
                          if (outcome() !== "idle") setOutcome("idle");
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showPassword() ? t(() => m.login_toggle_password_hide()) : t(() => m.login_toggle_password_show())}
                        class="absolute right-2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        <Show when={showPassword()} fallback={<Eye size={16} />}>
                          <EyeOff size={16} />
                        </Show>
                      </button>
                    </div>
                  </label>

                  <Show when={outcome() === "invalid"}>
                    <p class="text-xs text-destructive" data-testid="login-error" role="alert">
                      {t(() => m.login_invalid())}
                    </p>
                  </Show>
                  <Show when={outcome() === "rate_limited"}>
                    <p class="text-xs text-destructive" data-testid="login-error" role="alert">
                      {t(() => m.login_rate_limited())}
                    </p>
                  </Show>
                  <Show when={outcome() === "unreachable"}>
                    <p class="text-xs text-destructive" data-testid="login-error" role="alert">
                      {t(() => m.login_unreachable())}
                    </p>
                  </Show>

                  <button
                    class="mt-2 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    data-testid="login-submit"
                    disabled={outcome() === "checking" || !username().trim() || !password()}
                    type="submit"
                  >
                    <Show when={outcome() === "checking"}>
                      <Loader2 class="animate-spin" size={16} />
                    </Show>
                    <span>
                      {outcome() === "checking" ? t(() => m.login_validating()) : t(() => m.login_submit())}
                    </span>
                  </button>

                  <div class="flex items-center gap-2 pt-2">
                    <span class="h-px flex-1 bg-hairline" />
                    <span class="text-xs font-medium tracking-wide text-muted-foreground">
                      {t(() => m.login_recovery_divider())}
                    </span>
                    <span class="h-px flex-1 bg-hairline" />
                  </div>

                  <button
                    type="button"
                    class="text-center text-xs text-muted-foreground transition hover:text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    data-testid="recovery-trigger"
                    onClick={() => {
                      setMode("recovery");
                      setRecoverySuccess(false);
                    }}
                  >
                    {t(() => m.login_recovery_trigger())}
                  </button>
                </form>
              </Match>
            </Switch>
          </div>
        </div>

        {/* Rodapé sutil com host e versão */}
        <footer class="p-4 text-center text-xs text-muted-foreground" data-testid="login-footer">
          <span class="font-mono">{typeof location === "undefined" ? "" : location.host}</span>
          <Show when={version()}>
            {(v) => <span class="font-mono"> · v{v()}</span>}
          </Show>
        </footer>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/login")({
  component: AuthFrame,
});
