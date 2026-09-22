import { Link, useLocation, useNavigate } from "@tanstack/solid-router";
import {
  Activity,
  Archive,
  BookOpen,
  Brain,
  Cable,
  ChevronLeft,
  CircleHelp,
  Clock,
  Database,
  KeyRound,
  LayoutGrid,
  Mail,
  Menu,
  Layers,
  Lock,
  LogOut,
  PanelLeft,
  PencilLine,
  Repeat2,
  Rows3,
  Search,
  Settings2,
  User as UserIcon,
  Waypoints,
  X,
} from "~/components/icons";
import { For, Show, createMemo, createSignal, onCleanup, onSettled } from "solid-js";
import { Portal, type JSX } from "@solidjs/web";

import { adminStatus } from "~/lib/admin-api";
import { Button } from "~/components/button";
import { useQuery } from "~/lib/query";
import { ScrollArea } from "~/components/scroll-area";
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
//   [Sidebar 220px | conteúdo encostado, header com borda, body p-4]
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
  /** Linha sob o título, no mesmo bloco do header. */
  description?: JSX.Element;
  /** Slot direito do header: status e ações. */
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
      icon: Mail,
      label: () => m.nav_messages(),
      to: "/s/$workspace/$project/messages",
      params,
    });
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

function NavRow(props: { collapsed?: boolean; item: NavItem; onNavigate?: () => void }) {
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
        "flex items-center rounded-md text-sm outline-none transition",
        props.collapsed ? "justify-center p-1.5" : "gap-2 px-2 py-1.5",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active()
          ? "bg-active-item font-medium text-foreground"
          : "text-foreground hover:bg-hover",
      )}
      aria-current={active() ? "page" : undefined}
      aria-label={props.collapsed ? t(props.item.label) : undefined}
      title={props.collapsed ? t(props.item.label) : undefined}
      onClick={props.onNavigate}
    >
      {props.item.icon({ size: 16, class: "shrink-0" })}
      <Show when={!props.collapsed}>
        <span class="min-w-0 flex-1 truncate">{t(props.item.label)}</span>
      </Show>
      <Show when={!props.collapsed && props.item.badge?.()}>
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
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        type="button"
        aria-label={label()}
        title={label()}
        onClick={() => setOpen((value) => !value)}
      >
        <span class="grid size-8 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
          {initials()}
        </span>
      </button>
      <Show when={open()}>
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute top-full right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-hairline bg-popover p-1 text-popover-foreground shadow-xl">
          <div class="flex items-center gap-3 px-2 py-1.5">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
              {initials()}
            </span>
            <span class="flex min-w-0 flex-col leading-tight">
              <span class="truncate text-sm font-medium">{label()}</span>
              <span class="truncate text-xs text-muted-foreground">{t(() => roleLabel(tier()))}</span>
            </span>
          </div>
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

// Conteúdo da sidebar, compartilhado entre o painel fixo (desktop) e o
// overlay móvel — mesma navegação, dois contêineres.
function SidebarContent(props: {
  /** Modo ícones (painel desktop colapsado): esconde rótulos e grupos. */
  collapsed?: boolean;
  groups: NavGroup[];
  level: ShellProps["level"];
  scope?: ScopeRef;
  /** Sufixo do testid da busca — a cópia móvel usa um id próprio para não colidir com a do painel desktop. */
  searchTestId: string;
  onSearch: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div class={cn("flex items-center gap-2 px-1", props.collapsed && "justify-center px-0")}>
        <Brain class="shrink-0 text-foreground" size={22} />
        <Show when={!props.collapsed}>
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-semibold leading-tight">{t(() => m.brand_name())}</span>
            <span class="truncate text-xs leading-tight text-muted-foreground">{t(() => m.brand_subtitle())}</span>
          </div>
          <button
            class="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={props.searchTestId}
            type="button"
            aria-label={t(() => m.search_placeholder())}
            title={t(() => m.search_placeholder())}
            onClick={() => props.onSearch()}
          >
            <Search size={16} />
          </button>
        </Show>
      </div>
      <Show when={props.collapsed}>
        <button
          class="grid size-7 place-items-center self-center rounded-md text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={props.searchTestId}
          type="button"
          aria-label={t(() => m.search_placeholder())}
          title={t(() => m.search_placeholder())}
          onClick={() => props.onSearch()}
        >
          <Search size={16} />
        </button>
      </Show>

      <Show when={props.level === "scope" && props.scope}>
        {(scope) => (
          <Link
            to={isAdminTier(tier()) ? "/workspaces" : "/"}
            class={cn(
              "flex items-center rounded-md py-1 text-xs text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              props.collapsed ? "justify-center px-0" : "gap-1.5 px-2",
            )}
            aria-label={props.collapsed ? `${scope().workspace}/${scope().project}` : undefined}
            title={props.collapsed ? `${scope().workspace}/${scope().project}` : undefined}
          >
            <ChevronLeft class="shrink-0" size={13} />
            <Show when={!props.collapsed}>
              <span class="min-w-0 truncate font-mono">
                {scope().workspace}/{scope().project}
              </span>
            </Show>
          </Link>
        )}
      </Show>

      <ScrollArea fill class="min-h-0 flex-1">
        <div class="flex flex-col gap-4">
        <For each={props.groups}>
          {(group) => (
            <div class="flex flex-col gap-0.5">
              <Show when={group.title && !props.collapsed}>
                {(_) => (
                  <span class="px-2 pb-1 text-[11px] font-normal uppercase tracking-wide text-muted-foreground/60">
                    {t(group.title!)}
                  </span>
                )}
              </Show>
              <For each={group.items}>
                {(item) => <NavRow collapsed={props.collapsed} item={item} onNavigate={props.onNavigate} />}
              </For>
            </div>
          )}
        </For>
        </div>
      </ScrollArea>

      <div class={cn("flex", props.collapsed ? "justify-center" : "justify-end")}>
        <AboutButton />
      </div>
    </>
  );
}

function AboutButton() {
  const [open, setOpen] = createSignal(false);
  const status = useQuery(() => ({
    queryKey: ["admin", "status"],
    queryFn: adminStatus,
    enabled: open(),
  }));

  return (
    <>
      <Button
        aria-label={t(() => m.about_label())}
        class="text-muted-foreground"
        size="icon-sm"
        title={t(() => m.about_label())}
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        <CircleHelp />
      </Button>
      <Show when={open()}>
        <AboutDialog version={status.data?.version} onClose={() => setOpen(false)} />
      </Show>
    </>
  );
}

function AboutDialog(props: { version?: string; onClose: () => void }) {
  let dialog!: HTMLDivElement;
  const previousFocus =
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);
  onSettled(() => {
    dialog.focus();
    return () => previousFocus?.focus();
  });

  return (
    <Portal>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={props.onClose}
      >
        <div
          ref={dialog}
          class="relative flex w-full max-w-sm flex-col items-center gap-3 rounded-lg border border-hairline bg-content-bg p-6 text-center shadow-card outline-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-dialog-title"
          tabindex="-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") props.onClose();
          }}
        >
          <Button
            aria-label={t(() => m.about_close())}
            class="absolute top-2 right-2"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={props.onClose}
          >
            <X />
          </Button>
          <Brain class="text-foreground" size={32} />
          <div class="flex flex-col gap-1">
            <h2 id="about-dialog-title" class="text-sm font-semibold">
              {t(() => m.brand_name())}
            </h2>
            <p class="text-sm text-muted-foreground">{t(() => m.brand_subtitle())}</p>
          </div>
          <span
            class="cursor-default rounded-full border border-hairline px-2.5 py-0.5 font-mono text-xs text-muted-foreground"
            title={t(() => m.overview_engine_status_hint())}
          >
            <Show when={props.version} fallback="—">
              {(version) => t(() => m.overview_engine_status({ version: version() }))}
            </Show>
          </span>
          <p class="text-sm text-muted-foreground">{t(() => m.about_description())}</p>
        </div>
      </div>
    </Portal>
  );
}

// Sidebar de largura fixa: 220px expandida, rail de 52px no modo ícones (como
// no pinar). Redimensionar foi removido por decisão de design — só o estado
// colapsado persiste entre sessões.
const SIDEBAR_COLLAPSED_KEY = "ai-memory-ui.sidebar-collapsed";

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false; // storage indisponível — começa expandida
  }
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
  // Registered in the component body, not in `onSettled`: that hook waits for
  // the shell's queries to settle, and a keypress before then was lost.
  const closeMobileNav = (event: KeyboardEvent) => {
    if (event.key === "Escape") setMobileNavOpen(false);
  };
  window.addEventListener("keydown", closeMobileNav);
  onCleanup(() => window.removeEventListener("keydown", closeMobileNav));

  const [collapsed, setCollapsed] = createSignal(loadSidebarCollapsed());
  const toggleCollapsed = () => {
    const next = !collapsed();
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // storage indisponível — o estado vale só para a sessão
    }
  };

  return (
    <div class="flex h-screen min-h-0 w-full bg-sidebar-bg text-foreground">
      <Show when={mobileNavOpen()}>
        <button
          class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      </Show>

      {/* Sidebar móvel: overlay fixo por cima do conteúdo, sem redimensionar. */}
      <nav
        class={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[220px] min-h-0 flex-col gap-4 bg-sidebar-bg p-4 transition-transform lg:hidden",
          mobileNavOpen() ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
        aria-label="Primary navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") setMobileNavOpen(false);
        }}
      >
        <SidebarContent
          groups={groups()}
          level={props.level}
          scope={props.scope}
          searchTestId="search-trigger-mobile"
          onSearch={() => search.open()}
          onNavigate={() => setMobileNavOpen(false)}
        />
      </nav>

      {/* Sidebar desktop: largura fixa; o botão do header alterna o rail de ícones. */}
      <nav
        class={cn(
          "hidden min-h-0 shrink-0 flex-col gap-4 border-r border-hairline bg-sidebar-bg p-2 lg:flex",
          collapsed() ? "w-[52px]" : "w-[220px]",
        )}
        aria-label="Primary navigation"
      >
        <SidebarContent
          collapsed={collapsed()}
          groups={groups()}
          level={props.level}
          scope={props.scope}
          searchTestId="search-trigger"
          onSearch={() => search.open()}
        />
      </nav>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-content-bg">
        <header class="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2">
            <div class="flex min-w-0 items-center gap-2">
              <button
                class="-ml-1 rounded-md p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileNavOpen() ? "true" : "false"}
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu size={18} />
              </button>
              <button
                class="-ml-1 hidden rounded-md p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
                type="button"
                aria-expanded={!collapsed() ? "true" : "false"}
                aria-label={t(() => m.shell_toggle_sidebar())}
                title={t(() => m.shell_toggle_sidebar())}
                onClick={toggleCollapsed}
              >
                <PanelLeft size={17} />
              </button>
              <div class="flex min-w-0 flex-col">
                <div class="truncate text-sm font-medium leading-tight">{props.heading}</div>
                <Show when={props.description}>
                  <div class="truncate text-xs leading-tight text-muted-foreground">{props.description}</div>
                </Show>
              </div>
            </div>
            <div class="ml-auto flex shrink-0 items-center gap-2">
              <Show when={props.actions}>
                <div class="flex items-center gap-2 text-xs text-muted-foreground">{props.actions}</div>
              </Show>
              <div class="flex items-center gap-0.5">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
              <UserMenu />
            </div>
          </header>
        <ScrollArea fill class="min-h-0 flex-1">
          <div class="flex min-h-full flex-col gap-4 p-4">{props.children}</div>
        </ScrollArea>
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
