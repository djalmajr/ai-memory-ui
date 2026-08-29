import { LogOut, Moon, Sun } from "lucide-solid";
import { For, Show, createSignal, onMount } from "solid-js";

import { Button } from "~/components/button";
import { buildLogoutUrl, fetchCurrentUser, type CurrentUser } from "~/lib/api";
import { locales, switchLocale, t, useLocale } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";
import { theme, toggleTheme } from "~/lib/theme";
import * as m from "~/paraglide/messages";

export const localeNames: Record<Locale, string> = {
  "en": "English",
  "es": "Español",
  "pt-BR": "Português",
};

export const localeFlags: Record<Locale, string> = {
  "en": "🇺🇸",
  "es": "🇪🇸",
  "pt-BR": "🇧🇷",
};

export function LanguageSwitcher() {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="relative">
      <button
        aria-label="Idioma"
        class="grid size-9 place-items-center rounded-md text-lg outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="language-switcher"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {localeFlags[useLocale()]}
      </button>
      <Show when={open()}>
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
          <For each={locales}>
            {(loc) => (
              <button
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover"
                classList={{ "bg-selected text-primary": useLocale() === loc }}
                type="button"
                onClick={() => {
                  switchLocale(loc);
                  setOpen(false);
                }}
              >
                <span class="text-base leading-none">{localeFlags[loc]}</span>
                <span class="truncate">{localeNames[loc]}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// Identidade do usuário logado (sessão oauth2-proxy), buscada UMA vez e
// compartilhada entre as instâncias do Avatar (header + home). `undefined`
// enquanto carrega; `null` quando não há sessão / backend sem oauth2-proxy.
const [currentUser, setCurrentUser] = createSignal<CurrentUser | null | undefined>(undefined);
export { currentUser };
let currentUserStarted = false;
export function ensureCurrentUser() {
  if (currentUserStarted) return;
  currentUserStarted = true;
  void fetchCurrentUser().then(setCurrentUser);
}

export function userDisplayName(user: CurrentUser | null | undefined): string {
  if (!user) return "";
  return user.preferredUsername || user.user || user.email || "";
}

// Iniciais (≤2 letras) do nome de exibição; ignora o domínio em e-mails.
export function userInitials(name: string): string {
  const local = name.includes("@") ? name.slice(0, name.indexOf("@")) : name;
  const parts = local.split(/[\s._+-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar() {
  const [open, setOpen] = createSignal(false);
  onMount(ensureCurrentUser);
  const name = () => userDisplayName(currentUser());
  const initials = () => {
    const user = currentUser();
    if (user === undefined) return ""; // ainda carregando
    const display = userDisplayName(user);
    return display ? userInitials(display) : "?";
  };
  const doLogout = async () => {
    setOpen(false);
    window.location.assign(await buildLogoutUrl());
  };
  return (
    <div class="relative">
      <button
        aria-label={name() || "Conta"}
        class="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        title={name() || undefined}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {initials()}
      </button>
      <Show when={open()}>
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
          <Show when={name()}>
            <div class="border-b px-2 py-1.5">
              <p class="truncate text-sm font-medium" title={name()}>
                {name()}
              </p>
              <Show when={currentUser()?.email && currentUser()?.email !== name()}>
                <p class="truncate text-xs text-muted-foreground" title={currentUser()?.email}>
                  {currentUser()?.email}
                </p>
              </Show>
            </div>
          </Show>
          <button
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
            type="button"
            onClick={() => void doLogout()}
          >
            <LogOut class="shrink-0 text-muted-foreground" size={15} />
            <span class="truncate">{t(() => m.logout())}</span>
          </button>
        </div>
      </Show>
    </div>
  );
}

export function ThemeToggle() {
  return (
    <Button
      aria-label="Toggle color theme"
      class="ml-auto size-9 shrink-0"
      data-testid="theme-toggle"
      size="icon"
      variant="ghost"
      onClick={toggleTheme}
    >
      <Show fallback={<Moon size={16} />} when={theme() === "dark"}>
        <Sun size={16} />
      </Show>
    </Button>
  );
}
