import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AuthModule from "~/lib/auth";

// `USE_FIXTURES` é avaliado no carregamento do módulo (`import.meta.env`), então
// cada caso precisa de env estampada + módulo recarregado. Sem isso o atalho de
// fixtures nunca é exercitado e o preview offline fica sem cobertura.
async function loadAuth(fixtures: boolean): Promise<typeof AuthModule> {
  vi.resetModules();
  if (fixtures) {
    vi.stubEnv("VITE_FIXTURES", "1");
  } else {
    vi.stubEnv("VITE_FIXTURES", "");
  }
  return import("~/lib/auth");
}

beforeEach(() => {
  localStorage.clear();
  // Qualquer fetch aqui seria erro: no modo fixtures a sonda não deve tocar rede.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("fetchAuthMe não deve chamar fetch em modo fixtures"))),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  localStorage.clear();
});

describe("modo fixtures", () => {
  it("modo fixtures retorna sessão root mock sem tocar a rede", async () => {
    const auth = await loadAuth(true);
    const me = await auth.fetchAuthMe();
    expect(me).not.toBeNull();
    expect(me?.role).toBe("root");
    expect(await auth.ensureTier()).toBe("root");
  });

  it("permite simular login de usuário em fixtures", async () => {
    const auth = await loadAuth(true);
    const tier = await auth.signIn("alice", "password123");
    expect(tier).toBe("user");
    expect(auth.authMe()?.username).toBe("alice");
  });

  it("permite customizar authMe de fixture via setFixtureAuthMe", async () => {
    const auth = await loadAuth(true);
    auth.setFixtureAuthMe({
      username: null,
      name: null,
      role: null,
      must_change_password: false,
      via: "anonymous",
      capabilities: {
        normal_read: true,
        normal_write: true,
        admin: true,
        user_management: false,
      },
    });
    expect(await auth.refreshTier()).toBe("anonymous-admin");
  });

  it("fora do modo fixtures a verificação de auth tenta usar a rede", async () => {
    const auth = await loadAuth(false);
    await expect(auth.refreshTier()).resolves.toBe("unreachable");
  });
});
