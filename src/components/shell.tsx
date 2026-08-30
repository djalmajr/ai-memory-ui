import { Link, useLocation, useNavigate } from "@tanstack/solid-router";
import {
  Activity,
  Archive,
  BookOpen,
  Cable,
  ChevronLeft,
  Clock,
  Database,
  KeyRound,
  LayoutGrid,
  Menu,
  Layers,
  Lock,
  LogOut,
  PencilLine,
  Repeat2,
  Rows3,
  Search,
  Settings2,
  User as UserIcon,
  Waypoints,
} from "lucide-solid";
import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";

import { useShellSearch } from "~/components/shell-search";
import { LanguageSwitcher, ThemeToggle, userInitials } from "~/components/user-menu";
import {
  authMe,
  canManageUsers,
  isAdminTier,
  signOut,
  tier,
  type Tier,
} from "~/lib/auth";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Shell da área administrativa (protótipo Paper, IA de dois níveis).
//
// Estrutura fixa do artboard:
//   [Sidebar 220px] [Inset 8px [ Card [ Page Header 48px, Body p-4 ] ] ]
//
// O nível NÃO vem de dropdown: a sidebar de escopo aparece porque a rota é de
// escopo (`/s/{ws}/{proj}/...`). Foi decisão de design — um seletor de escopo
// competindo com a navegação foi descartado.

export interface NavItem {
  icon: (props: { size?: number; class?: string }) => JSX.Element;
  label: () => string;
  to: string;
  params?: Record<string, string>;
  badge?: () => number | undefined;
}

export interface NavGroup {
  title?: () => string;
  items: NavItem[];
}

export interface ScopeRef {
  workspace: string;
  project: string;
}

interface ShellProps {
  /** `server` = sidebar global; `scope` = sidebar do workspace/projeto ativo. */
  level: "server" | "scope";
  scope?: ScopeRef;
  /** Slot esquerdo do header: título (servidor) ou breadcrumb (escopo). */
  heading: JSX.Element;
  /** Slot direito do header: subtítulo, status, ações. */
  actions?: JSX.Element;
  /** Contagem da fila de pending writes, quando conhecida. */
  pendingCount?: number;
  children: JSX.Element;
}

export function serverGroups(current: Tier): NavGroup[] {
  const admin = isAdminTier(current);
  const groups: NavGroup[] = [
    {
      items: [
        { icon: LayoutGrid, label: () => m.nav_overview(), to: "/" },
        { icon: Layers, label: () => m.nav_workspaces(), to: "/workspaces" },
      ],
    },
  ];

  // Sessões/Atividade/Auditoria são `/admin/*`: sem capability Admin o engine
  // responde 401, então não podem aparecer. O Grafo sai de `/api/v1/graph`
  // (leitura pública) e fica para todos os degraus.
  const monitoring: NavItem[] = [];
  if (admin) {
    monitoring.push(
      { icon: Clock, label: () => m.nav_sessions(), to: "/sessions" },
      { icon: Activity, label: () => m.nav_activity(), to: "/activity" },
      { icon: Rows3, label: () => m.nav_audit(), to: "/audit" },
    );
  }
  monitoring.push({ icon: Waypoints, label: () => m.nav_graph(), to: "/graph" });
  groups.push({ title: () => m.nav_group_monitoring(), items: monitoring });

  // O grupo Administração inteiro depende de Admin. Para `user`, `anonymous`
  // e degraus indeterminados ele nem é montado.
  if (admin) {
    const administration: NavItem[] = [];
    // `UserManagement` é root-only inclusive no modo anônimo.
    if (canManageUsers(current)) {
      administration.push(
        { icon: Lock, label: () => m.nav_access(), to: "/access" },
        { icon: UserIcon, label: () => m.nav_users(), to: "/users" },
      );
    }
    administration.push(
      { icon: Cable, label: () => m.nav_consumers(), to: "/consumers" },
      { icon: Settings2, label: () => m.nav_ops(), to: "/ops" },
      { icon: Archive, label: () => m.nav_backups(), to: "/backups" },
      { icon: Database, label: () => m.nav_config(), to: "/config" },
    );
    groups.push({ title: () => m.nav_group_admin(), items: administration });
  }

  return groups;
}

export function scopeGroups(scope: ScopeRef, current: Tier, pending?: number): NavGroup[] {
  const params = { workspace: scope.workspace, project: scope.project };
  const admin = isAdminTier(current);
  const items: NavItem[] = [];

  // Modo usuário (protótipo `Wiki · Tier usuário`): sem as telas
  // administrativas, o escopo abre pela visão geral do projeto e oferece o
  // grafo — ambos leitura de `/api/v1`.
  if (!admin) {
    items.push({
      icon: LayoutGrid,
      label: () => m.nav_overview(),
      to: "/s/$workspace/$project/overview",
      params,
    });
  }

  items.push(
    { icon: BookOpen, label: () => m.nav_wiki(), to: "/s/$workspace/$project", params },
    {
      icon: Clock,
      label: () => m.nav_sessions(),
      to: "/s/$workspace/$project/sessions",
      params,
    },
    {
      icon: Repeat2,
      label: () => m.nav_handoffs(),
      to: "/s/$workspace/$project/handoffs",
      params,
    },
  );

  // Pending writes e Operações são `/admin/*`: um token de usuário do banco
  // recebe 401 nessas rotas, então elas não entram na sidebar dele.
  if (admin) {
    items.push({
      icon: PencilLine,
      label: () => m.nav_pending(),
      to: "/s/$workspace/$project/pending",
      params,
      badge: () => pending,
    });
  } else {
    items.push({ icon: Waypoints, label: () => m.nav_graph(), to: "/graph" });
  }

  const groups: NavGroup[] = [{ items }];

  if (admin) {
    groups.push({
      title: () => m.nav_group_maintenance(),
      items: [
        {
          icon: Settings2,
          label: () => m.nav_ops(),
          to: "/s/$workspace/$project/ops",
          params,
        },
      ],
    });
  }

  return groups;
}

function NavRow(props: { item: NavItem; onNavigate?: () => void }) {
  const location = useLocation();
  // Ativo = match exato. Prefixo marcaria a Wiki como ativa em toda subrota do
  // escopo (`/sessions`, `/pending`), que é justamente o que o protótipo evita.
  const href = createMemo(() => {
    let out: string = props.item.to;
    for (const [key, value] of Object.entries(props.item.params ?? {})) {
      out = out.replace(`$${key}`, encodeURIComponent(value));
    }
    return out;
  });
  const active = createMemo(() => decodeURIComponent(location().pathname) === decodeURIComponent(href()));

  return (
    <Link
      to={props.item.to}
      params={props.item.params}
      class={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active()
          ? "bg-active-item font-medium text-foreground"
          : "text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
      aria-current={active() ? "page" : undefined}
      onClick={props.onNavigate}
    >
      {props.item.icon({ size: 16, class: "shrink-0" })}
      <span class="min-w-0 flex-1 truncate">{t(props.item.label)}</span>
      <Show when={props.item.badge?.()}>
        {(count) => (
          <span class="shrink-0 rounded bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count()}
          </span>
        )}
      </Show>
    </Link>
  );
}

// Rodapé da sidebar. Mostra o papel humano e a identidade retornada por
// `/auth/me`; detalhes do mecanismo de autenticação ficam na tela Acesso.
function roleLabel(current: Tier): string {
  switch (current) {
    case "root":
      return m.role_root();
    case "anonymous-admin":
      return m.role_anonymous_admin();
    case "user":
      return m.role_user();
    default:
      return m.role_anonymous();
  }
}

function UserMenu() {
  const [open, setOpen] = createSignal(false);
  const navigate = useNavigate();

  const label = () => authMe()?.name || authMe()?.username || "—";
  const initials = () => {
    const l = label();
    return l !== "—" ? userInitials(l) : "?";
  };

  const doSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate({ to: "/login" });
  };
  return (
    <div class="relative">
      <button
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span class="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials()}
        </span>
        <span class="flex min-w-0 flex-1 flex-col leading-tight">
          <span class="truncate text-sm" title={label()}>
            {label()}
          </span>
          <span class="truncate text-xs text-muted-foreground">{t(() => roleLabel(tier()))}</span>
        </span>
      </button>
      <Show when={open()}>
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute bottom-full left-0 z-50 mb-1 w-52 overflow-hidden rounded-lg border border-hairline bg-popover p-1 text-popover-foreground shadow-xl">
          <button
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
            type="button"
            onClick={() => {
              setOpen(false);
              sessionStorage.setItem("ai-memory-ui.change-password", "1");
              navigate({ to: "/login" });
            }}
          >
            <KeyRound class="shrink-0 text-muted-foreground" size={15} />
            <span class="truncate">{t(() => m.user_menu_change_password())}</span>
          </button>
          <button
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover"
            type="button"
            onClick={() => void doSignOut()}
          >
            <LogOut class="shrink-0 text-muted-foreground" size={15} />
            <span class="truncate">{t(() => m.user_menu_signout())}</span>
          </button>
        </div>
      </Show>
    </div>
  );
}

export function Shell(props: ShellProps) {
  const groups = createMemo(() =>
    props.level === "scope" && props.scope
      ? scopeGroups(props.scope, tier(), props.pendingCount)
      : serverGroups(tier()),
  );
  // A busca vive no shell: um único estado para o gatilho da sidebar e para o
  // atalho ⌘K, em vez de cada tela montar a própria paleta.
  const search = useShellSearch();
  const [mobileNavOpen, setMobileNavOpen] = createSignal(false);
  onMount(() => {
    const closeMobileNav = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", closeMobileNav);
    onCleanup(() => window.removeEventListener("keydown", closeMobileNav));
  });


  return (
    <div class="flex h-screen min-h-0 bg-sidebar-bg text-foreground">
      <Show when={mobileNavOpen()}>
        <button
          class="fixed inset-0 z-40 bg-sidebar-bg/70 lg:hidden"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      </Show>
      <nav
        class={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[220px] shrink-0 flex-col gap-4 bg-sidebar-bg p-4 transition-transform lg:visible lg:static lg:translate-x-0",
          mobileNavOpen() ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
        aria-label="Primary navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") setMobileNavOpen(false);
        }}
      >
        <div class="flex items-center justify-between gap-2">
          {/* A marca não navega: é rótulo do produto, não botão de início. */}
          <span class="text-sm font-semibold">{t(() => m.brand_name())}</span>
          <div class="flex items-center gap-0.5">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <button
          class="flex items-center gap-2 rounded-md border border-hairline bg-content-bg px-2 py-1.5 text-left text-sm text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="search-trigger"
          type="button"
          onClick={() => search.open()}
        >
          <Search class="shrink-0" size={15} />
          <span class="min-w-0 flex-1 truncate">{t(() => m.search_placeholder())}</span>
        </button>

        <Show when={props.level === "scope" && props.scope}>
          {(scope) => (
            <Link
              to={isAdminTier(tier()) ? "/workspaces" : "/"}
              class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft class="shrink-0" size={13} />
              <span class="min-w-0 truncate font-mono">
                {scope().workspace}/{scope().project}
              </span>
            </Link>
          )}
        </Show>

        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <For each={groups()}>
            {(group) => (
              <div class="flex flex-col gap-0.5">
                <Show when={group.title}>
                  {(title) => (
                    <span class="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t(title())}
                    </span>
                  )}
                </Show>
                <For each={group.items}>
                  {(item) => <NavRow item={item} onNavigate={() => setMobileNavOpen(false)} />}
                </For>
              </div>
            )}
          </For>
        </div>

        <UserMenu />
      </nav>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col p-2">
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-hairline bg-content-bg shadow-card">
          <header class="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
            <div class="flex min-w-0 items-center gap-2 text-sm font-medium">
              <button
                class="-ml-1 rounded-md p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileNavOpen()}
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu size={18} />
              </button>
              {props.heading}
            </div>
            <div class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {props.actions}
            </div>
          </header>
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">{props.children}</div>
        </div>
      </div>

      {/* Overlay: último filho do artboard, fora do card — como no protótipo. */}
      {search.palette()}
    </div>
  );
}

// Breadcrumb do nível escopo: `Workspaces / {ws} / {proj} / {tela}`.
export function ScopeBreadcrumb(props: { scope: ScopeRef; screen: string }) {
  return (
    <>
      <Link to="/workspaces" class="text-muted-foreground hover:text-foreground">
        {t(() => m.shell_back_to_workspaces())}
      </Link>
      <span class="text-muted-foreground">/</span>
      <span class="font-mono text-muted-foreground">{props.scope.workspace}</span>
      <span class="text-muted-foreground">/</span>
      <span class="font-mono">{props.scope.project}</span>
      <span class="text-muted-foreground">/</span>
      <span>{props.screen}</span>
    </>
  );
}
