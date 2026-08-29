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
    vi.fn(() => Promise.reject(new Error("probeTier não deve chamar fetch em modo fixtures"))),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  localStorage.clear();
});

describe("modo fixtures", () => {
  // Sem chave o preview equivale a engine sem auth: as telas administrativas
  // existem. Devolver `unauthenticated` mandaria a suíte e2e toda pro login.
  it("sem chave => anonymous-admin, sem tocar a rede", async () => {
    const auth = await loadAuth(true);
    expect(await auth.probeTier()).toBe("anonymous-admin");
  });

  it("com chave => admin", async () => {
    const auth = await loadAuth(true);
    auth.setToken("amk_preview");
    expect(await auth.probeTier()).toBe("admin");
  });

  // Fora do preview o atalho não pode existir: a sonda tem de falar com o engine.
  it("fora do modo fixtures a sonda usa a rede", async () => {
    const auth = await loadAuth(false);
    await expect(auth.probeTier()).resolves.toBe("unreachable");
  });
});
