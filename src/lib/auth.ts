import { createSignal } from "solid-js";
import { BASE_PATH } from "~/lib/base-path";

export interface AuthCapabilities {
  normal_read: boolean;
  normal_write: boolean;
  admin: boolean;
  user_management: boolean;
}

export interface AuthMe {
  username: string | null;
  name: string | null;
  role: "root" | "user" | null;
  must_change_password: boolean;
  via: "session" | "anonymous" | "bearer" | string;
  capabilities: AuthCapabilities;
}

export type Tier =
  | "root"
  | "user"
  | "anonymous"
  | "anonymous-admin"
  | "must-change-password"
  | "unauthenticated"
  | "unreachable";

/**
 * Lê o cookie CSRF legível (`ai_memory_csrf`) gravado pelo engine no mesmo domínio (Path=/).
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)ai_memory_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Headers CSRF para mutações autenticadas por cookie (`POST`, `PUT`, `PATCH`, `DELETE`).
 */
export function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export function clearLegacyCredential(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem("ai-memory-ui.token");
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

/**
 * Enxerga as telas administrativas (/admin/*).
 */
export function isAdminTier(current: Tier): boolean {
  return current === "root" || current === "anonymous-admin";
}

/**
 * Pode executar operações que mudam estado (mutações).
 * Com sessão web via cookie HttpOnly + CSRF, usuários autenticados têm capacidade real.
 */
export function canMutate(current: Tier): boolean {
  return current === "root" || current === "user" || current === "anonymous-admin";
}

/**
 * Capacidade UserManagement: somente root humano tem acesso a /admin/users.
 */
export function canManageUsers(current: Tier): boolean {
  return current === "root";
}

/**
 * Decisão do guard global de rota.
 */
export function shouldRedirectToLogin(current: Tier, pathname: string): boolean {
  const isLoginPage = pathname === "/login" || pathname === "/login/";
  if (current === "unauthenticated" || current === "must-change-password") {
    return !isLoginPage;
  }
  return false;
}

const [authMe, setAuthMe] = createSignal<AuthMe | null>(null);
const [tier, setTier] = createSignal<Tier>("unauthenticated");
const [tierResolved, setTierResolved] = createSignal(false);

export { authMe, setAuthMe, tier, tierResolved };

const USE_FIXTURES = import.meta.env.DEV && import.meta.env.VITE_FIXTURES === "1";
let fixtureAuthMeOverride: AuthMe | null | undefined = undefined;

function fixtureAuthUsesNetwork(): boolean {
  return (
    USE_FIXTURES &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("ai-memory-ui.fixture-auth-network") === "1"
  );
}

export function setFixtureAuthMe(override: AuthMe | null | undefined): void {
  fixtureAuthMeOverride = override;
}

export function deriveTierFromAuthMe(me: AuthMe | null): Tier {
  if (!me) return "unauthenticated";
  if (me.must_change_password) return "must-change-password";
  if (me.role === "root" || me.capabilities.user_management) return "root";
  if (me.role === "user") return "user";
  if (me.via === "anonymous") {
    return me.capabilities.admin ? "anonymous-admin" : "anonymous";
  }
  return me.capabilities.admin ? "root" : "user";
}

export async function fetchAuthMe(): Promise<AuthMe | null> {
  if (USE_FIXTURES && !fixtureAuthUsesNetwork()) {
    if (fixtureAuthMeOverride !== undefined) {
      return fixtureAuthMeOverride;
    }
    if (typeof window !== "undefined" && /\/login\/?$/.test(window.location.pathname)) {
      return null;
    }
    return {
      username: "root",
      name: "Root Operator",
      role: "root",
      must_change_password: false,
      via: "session",
      capabilities: {
        normal_read: true,
        normal_write: true,
        admin: true,
        user_management: true,
      },
    };
  }

  try {
    const res = await fetch(`${BASE_PATH}/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Auth check failed: ${res.status}`);
    }
    return (await res.json()) as AuthMe;
  } catch (err) {
    if (err instanceof Error && err.message.includes("401")) {
      return null;
    }
    throw err;
  }
}

export async function refreshTier(): Promise<Tier> {
  try {
    const me = await fetchAuthMe();
    setAuthMe(me);
    const next = deriveTierFromAuthMe(me);
    setTier(next);
    setTierResolved(true);
    return next;
  } catch {
    setAuthMe(null);
    setTier("unreachable");
    setTierResolved(true);
    return "unreachable";
  }
}

let inflight: Promise<Tier> | null = null;

export function ensureTier(): Promise<Tier> {
  if (tierResolved()) return Promise.resolve(tier());
  if (inflight) return inflight;
  inflight = refreshTier().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function signIn(username: string, password: string): Promise<Tier> {
  if (USE_FIXTURES && !fixtureAuthUsesNetwork()) {
    const isRoot = username === "root" || username === "admin";
    const me: AuthMe = {
      username,
      name: isRoot ? "Root Operator" : username,
      role: isRoot ? "root" : "user",
      must_change_password: false,
      via: "session",
      capabilities: {
        normal_read: true,
        normal_write: true,
        admin: isRoot,
        user_management: isRoot,
      },
    };
    setAuthMe(me);
    const next = deriveTierFromAuthMe(me);
    setTier(next);
    setTierResolved(true);
    return next;
  }

  const res = await fetch(`${BASE_PATH}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (res.status === 401) {
    setAuthMe(null);
    setTier("unauthenticated");
    return "unauthenticated";
  }
  if (res.status === 429) {
    throw new Error("429");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Login failed (${res.status})`);
  }

  const me = (await res.json()) as AuthMe;
  setAuthMe(me);
  const next = deriveTierFromAuthMe(me);
  setTier(next);
  setTierResolved(true);
  return next;
}

export async function changePassword(params: {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}): Promise<AuthMe> {
  if (USE_FIXTURES) {
    const current = authMe();
    const updated: AuthMe = {
      username: current?.username ?? "root",
      name: current?.name ?? "Root Operator",
      role: current?.role ?? "root",
      must_change_password: false,
      via: "session",
      capabilities: current?.capabilities ?? {
        normal_read: true,
        normal_write: true,
        admin: true,
        user_management: true,
      },
    };
    setAuthMe(updated);
    setTier(deriveTierFromAuthMe(updated));
    return updated;
  }

  const res = await fetch(`${BASE_PATH}/auth/password`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...csrfHeaders(),
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let msg = "Password change failed";
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      const text = await res.text();
      if (text) msg = text;
    }
    throw new Error(msg);
  }

  const me = await fetchAuthMe();
  setAuthMe(me);
  setTier(deriveTierFromAuthMe(me));
  return me!;
}

export async function recovery(params: {
  recovery_token: string;
  new_password: string;
  new_password_confirmation: string;
}): Promise<void> {
  if (USE_FIXTURES) {
    return;
  }

  const res = await fetch(`${BASE_PATH}/auth/recovery`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let msg = "Recovery failed";
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      const text = await res.text();
      if (text) msg = text;
    }
    throw new Error(msg);
  }
}

export async function signOut(): Promise<void> {
  if (!USE_FIXTURES) {
    try {
      await fetch(`${BASE_PATH}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...csrfHeaders(),
        },
      });
    } catch {
      // ignore
    }
  }
  setAuthMe(null);
  setTier("unauthenticated");
  setTierResolved(true);
}
