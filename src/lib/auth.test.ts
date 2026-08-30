import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  authMe,
  canManageUsers,
  clearLegacyCredential,
  canMutate,
  changePassword,
  csrfHeaders,
  deriveTierFromAuthMe,
  getCsrfToken,
  isAdminTier,
  recovery,
  shouldRedirectToLogin,
  signIn,
  signOut,
  tier,
  type AuthMe,
} from "~/lib/auth";

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 401 ? "Unauthorized" : "Error",
    headers: new Headers(headers),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

let fetchMock: Mock;
const rootCapabilities = {
  normal_read: true,
  normal_write: true,
  admin: true,
  user_management: true,
};
const userCapabilities = {
  normal_read: true,
  normal_write: true,
  admin: false,
  user_management: false,
};
const anonymousAdminCapabilities = {
  normal_read: true,
  normal_write: true,
  admin: true,
  user_management: false,
};
const anonymousReadCapabilities = {
  normal_read: true,
  normal_write: false,
  admin: false,
  user_management: false,
};


beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  if (typeof document !== "undefined") {
    document.cookie = "ai_memory_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  }
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  if (typeof document !== "undefined") {
    document.cookie = "ai_memory_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  }
});

describe("CSRF e segurança de cookie", () => {
  it("extrai cookie CSRF legível", () => {
    document.cookie = "ai_memory_csrf=test_csrf_secret_123; path=/";
    expect(getCsrfToken()).toBe("test_csrf_secret_123");
    expect(csrfHeaders()).toEqual({ "X-CSRF-Token": "test_csrf_secret_123" });
  });

  it("retorna objeto vazio quando cookie CSRF está ausente", () => {
    expect(getCsrfToken()).toBeNull();
    expect(csrfHeaders()).toEqual({});
  });

  it("limpa segredo legado ai-memory-ui.token no localStorage", () => {
    localStorage.setItem("ai-memory-ui.token", "amk_antiga");
    clearLegacyCredential();
    expect(localStorage.getItem("ai-memory-ui.token")).toBeNull();
  });
});

describe("derivação de tier a partir de auth/me", () => {
  it("null => unauthenticated", () => {
    expect(deriveTierFromAuthMe(null)).toBe("unauthenticated");
  });

  it("must_change_password => must-change-password", () => {
    const me: AuthMe = {
      username: "root",
      name: "Root",
      role: "root",
      must_change_password: true,
      via: "session",
      capabilities: rootCapabilities,
    };
    expect(deriveTierFromAuthMe(me)).toBe("must-change-password");
  });

  it("root com sessão => root", () => {
    const me: AuthMe = {
      username: "root",
      name: "Root Operator",
      role: "root",
      must_change_password: false,
      via: "session",
      capabilities: rootCapabilities,
    };
    expect(deriveTierFromAuthMe(me)).toBe("root");
  });

  it("user com sessão => user", () => {
    const me: AuthMe = {
      username: "alice",
      name: "Alice",
      role: "user",
      must_change_password: false,
      via: "session",
      capabilities: userCapabilities,
    };
    expect(deriveTierFromAuthMe(me)).toBe("user");
  });

  it("via anônima com Admin => anonymous-admin", () => {
    const me: AuthMe = {
      username: null,
      name: null,
      role: null,
      must_change_password: false,
      via: "anonymous",
      capabilities: anonymousAdminCapabilities,
    };
    expect(deriveTierFromAuthMe(me)).toBe("anonymous-admin");
  });

  it("via anônima somente leitura => anonymous", () => {
    const me: AuthMe = {
      username: null,
      name: null,
      role: null,
      must_change_password: false,
      via: "anonymous",
      capabilities: anonymousReadCapabilities,
    };
    expect(deriveTierFromAuthMe(me)).toBe("anonymous");
  });
});

describe("capacidades por tier", () => {
  it("isAdminTier verdadeiro para root e anonymous-admin", () => {
    expect(isAdminTier("root")).toBe(true);
    expect(isAdminTier("anonymous-admin")).toBe(true);
    expect(isAdminTier("user")).toBe(false);
    expect(isAdminTier("anonymous")).toBe(false);
    expect(isAdminTier("unauthenticated")).toBe(false);
    expect(isAdminTier("unreachable")).toBe(false);
  });

  it("canManageUsers é exclusivo do root", () => {
    expect(canManageUsers("root")).toBe(true);
    expect(canManageUsers("anonymous-admin")).toBe(false);
    expect(canManageUsers("user")).toBe(false);
    expect(canManageUsers("anonymous")).toBe(false);
    expect(canManageUsers("unauthenticated")).toBe(false);
  });

  it("canMutate permite sessões com cookie e CSRF", () => {
    expect(canMutate("root")).toBe(true);
    expect(canMutate("user")).toBe(true);
    expect(canMutate("anonymous-admin")).toBe(true);
    expect(canMutate("anonymous")).toBe(false);
    expect(canMutate("unauthenticated")).toBe(false);
  });
});

describe("guard de rota protegida", () => {
  it("manda unauthenticated para o login a partir de rotas protegidas", () => {
    expect(shouldRedirectToLogin("unauthenticated", "/")).toBe(true);
    expect(shouldRedirectToLogin("unauthenticated", "/workspaces")).toBe(true);
    expect(shouldRedirectToLogin("unauthenticated", "/s/default/scratch")).toBe(true);
  });

  it("não entra em loop se já estiver no login", () => {
    expect(shouldRedirectToLogin("unauthenticated", "/login")).toBe(false);
    expect(shouldRedirectToLogin("unauthenticated", "/login/")).toBe(false);
  });

  it("must-change-password redireciona para o login (onde a troca é renderizada)", () => {
    expect(shouldRedirectToLogin("must-change-password", "/")).toBe(true);
    expect(shouldRedirectToLogin("must-change-password", "/login")).toBe(false);
  });

  it("root e user autenticados navegam normalmente", () => {
    expect(shouldRedirectToLogin("root", "/")).toBe(false);
    expect(shouldRedirectToLogin("root", "/users")).toBe(false);
    expect(shouldRedirectToLogin("user", "/")).toBe(false);
    expect(shouldRedirectToLogin("anonymous-admin", "/")).toBe(false);
  });

  it("unreachable preserva a tela para mostrar erro sem expulsar para o login", () => {
    expect(shouldRedirectToLogin("unreachable", "/")).toBe(false);
    expect(shouldRedirectToLogin("unreachable", "/workspaces")).toBe(false);
  });
});

describe("operações de autenticação HTTP", () => {
  it("signIn manda POST /auth/login com credentials=include", async () => {
    const mockMe: AuthMe = {
      username: "root",
      name: "Root Operator",
      role: "root",
      must_change_password: false,
      via: "session",
      capabilities: rootCapabilities,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(mockMe));

    const result = await signIn("root", "correct_password_123");
    expect(result).toBe("root");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      username: "root",
      password: "correct_password_123",
    });
  });

  it("signIn devolve unauthenticated em 401", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Invalid credentials" }, 401));

    const result = await signIn("root", "wrong_password");
    expect(result).toBe("unauthenticated");
    expect(tier()).toBe("unauthenticated");
  });

  it("changePassword envia POST /auth/password com CSRF", async () => {
    document.cookie = "ai_memory_csrf=csrf_secret_abc; path=/";
    const mockMe: AuthMe = {
      username: "root",
      name: "Root Operator",
      role: "root",
      must_change_password: false,
      via: "session",
      capabilities: rootCapabilities,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    fetchMock.mockResolvedValueOnce(jsonResponse(mockMe));

    const updated = await changePassword({
      current_password: "old_password_123",
      new_password: "new_secure_password_456",
      new_password_confirmation: "new_secure_password_456",
    });

    expect(updated.must_change_password).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/auth/password");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers["X-CSRF-Token"]).toBe("csrf_secret_abc");
  });

  it("recovery envia POST /auth/recovery sem criar sessão", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await recovery({
      recovery_token: "server_recovery_secret_32_chars",
      new_password: "new_root_password_123",
      new_password_confirmation: "new_root_password_123",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/auth/recovery");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("signOut envia POST /auth/logout e limpa estado local", async () => {
    document.cookie = "ai_memory_csrf=csrf_val; path=/";
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await signOut();

    expect(tier()).toBe("unauthenticated");
    expect(authMe()).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/auth/logout");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers["X-CSRF-Token"]).toBe("csrf_val");
  });
});
