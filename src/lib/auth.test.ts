import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  shouldRedirectToLogin,
  authHeaders,
  canManageUsers,
  canMutate,
  clearToken,
  getToken,
  isAdminTier,
  maskedToken,
  probeTier,
  setToken,
  type Tier,
} from "~/lib/auth";

// O 401 do host vem como text/plain ("auth required\n"), então a sonda só pode
// olhar o status — `json()` aqui rejeita de propósito, pra garantir que nenhum
// caminho tente desserializar o corpo.
function statusResponse(status: number): Response {
  return {
    ok: status < 400,
    status,
    statusText: "",
    json: () => Promise.reject(new SyntaxError("401 body is text/plain")),
    text: () => Promise.resolve("auth required\n"),
  } as unknown as Response;
}

let fetchMock: Mock;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// Roteia por URL + header. A sonda usa três requests: /admin/status,
// /api/v1/workspaces sem bearer, e /api/v1/workspaces com um bearer inválido
// (discriminador de "auth configurada"). `junk` default = `read`, que é o que
// um engine SEM auth faz: ignora o header e responde igual.
function route(statuses: { admin: number; read: number; junk?: number }): void {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const auth = headers.Authorization ?? "";
    if (auth.includes("ai-memory-ui-probe-invalid")) {
      return Promise.resolve(statusResponse(statuses.junk ?? statuses.read));
    }
    return Promise.resolve(
      statusResponse(url.includes("/admin/status") ? statuses.admin : statuses.read),
    );
  });
}

describe("token no localStorage", () => {
  it("guarda, lê e limpa", () => {
    expect(getToken()).toBeNull();
    setToken("  amk_abcdef  ");
    expect(getToken()).toBe("amk_abcdef");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("trata chave em branco como ausente", () => {
    localStorage.setItem("ai-memory-ui.token", "   ");
    expect(getToken()).toBeNull();
  });

  it("só manda Authorization quando há chave", () => {
    expect(authHeaders()).toEqual({});
    setToken("amk_1");
    expect(authHeaders()).toEqual({ Authorization: "Bearer amk_1" });
  });

  it("mascara a chave preservando os 4 últimos", () => {
    expect(maskedToken()).toBeNull();
    setToken("amk_0123456789abcd");
    expect(maskedToken()).toBe("••••abcd");
    setToken("ab");
    expect(maskedToken()).toBe("••••");
  });
});

describe("probeTier", () => {
  const cases: {
    name: string;
    token: string | null;
    admin: number;
    read: number;
    junk?: number;
    expected: Tier;
    tokenKept: boolean;
  }[] = [
    {
      name: "chave aceita em /admin/status => admin",
      token: "root",
      admin: 200,
      read: 200,
      expected: "admin",
      tokenKept: true,
    },
    {
      name: "chave recusada no admin mas aceita na leitura => user",
      token: "userkey",
      admin: 403,
      read: 200,
      expected: "user",
      tokenKept: true,
    },
    {
      name: "chave recusada com 401 => unauthenticated e chave descartada",
      token: "stale",
      admin: 401,
      read: 401,
      expected: "unauthenticated",
      tokenKept: false,
    },
    {
      // Um 500 não é veredito sobre a credencial: descartá-la aqui perderia
      // uma chave válida por causa de uma falha do servidor.
      name: "engine com 500 => unreachable e chave preservada",
      token: "good",
      admin: 500,
      read: 500,
      expected: "unreachable",
      tokenKept: true,
    },
    {
      name: "403 inesperado na leitura => unreachable e chave preservada",
      token: "good",
      admin: 403,
      read: 403,
      expected: "unreachable",
      tokenKept: true,
    },
    {
      name: "sem chave, engine sem auth => anonymous-admin",
      token: null,
      admin: 200,
      read: 200,
      expected: "anonymous-admin",
      tokenKept: true,
    },
    {
      name: "sem chave, admin fechado => anonymous",
      token: null,
      admin: 401,
      read: 200,
      expected: "anonymous",
      tokenKept: true,
    },
    {
      name: "sem chave, leitura 401 => unauthenticated",
      token: null,
      admin: 401,
      read: 401,
      expected: "unauthenticated",
      tokenKept: true,
    },
    {
      // Leitura pública ok mas degrau admin indeterminado: assume fechado.
      name: "sem chave, admin com 500 => anonymous",
      token: null,
      admin: 500,
      read: 200,
      expected: "anonymous",
      tokenKept: true,
    },
    {
      // Engine COM auth: o `/web` fica atrás dela, então chegar aqui já implica
      // sessão autenticada por cookie. Chamar de anônimo seria mentira — e o
      // cookie só vale em GET, daí um degrau próprio sem mutação.
      name: "sem chave, auth configurada e cookie de operador => cookie-admin",
      token: null,
      admin: 200,
      read: 200,
      junk: 401,
      expected: "cookie-admin",
      tokenKept: true,
    },
    {
      name: "sem chave, auth configurada e cookie de usuário do banco => user",
      token: null,
      admin: 403,
      read: 200,
      junk: 401,
      expected: "user",
      tokenKept: true,
    },
    {
      name: "sem chave, auth configurada e nada autenticado => unauthenticated",
      token: null,
      admin: 401,
      read: 401,
      junk: 401,
      expected: "unauthenticated",
      tokenKept: true,
    },
    {
      name: "sem chave, discriminador inalcançável => unreachable",
      token: null,
      admin: 200,
      read: 200,
      junk: 0,
      expected: "unreachable",
      tokenKept: true,
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      if (c.token) setToken(c.token);
      route({ admin: c.admin, junk: c.junk, read: c.read });

      expect(await probeTier()).toBe(c.expected);
      expect(getToken()).toBe(c.token !== null && c.tokenKept ? c.token : null);
    });
  }

  it("fetch estourando => unreachable, sem descartar a chave", async () => {
    setToken("amk_valid");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await probeTier()).toBe("unreachable");
    expect(getToken()).toBe("amk_valid");
  });

  it("manda Bearer na sonda quando há chave", async () => {
    setToken("amk_probe");
    route({ admin: 200, read: 200 });
    await probeTier();
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer amk_probe");
  });

  // Sem chave, o único Authorization que a sonda envia é o bearer deliberadamente
  // inválido do discriminador — nunca uma credencial real.
  it("sem chave, só manda o bearer inválido do discriminador", async () => {
    route({ admin: 401, read: 200 });
    await probeTier();

    const sent = fetchMock.mock.calls
      .map((call) => ((call[1] as RequestInit).headers as Record<string, string>).Authorization)
      .filter(Boolean);

    expect(sent).toEqual(["Bearer ai-memory-ui-probe-invalid"]);
  });
});

describe("capacidades por tier", () => {
  it("admin, cookie-admin e anonymous-admin veem a área administrativa", () => {
    expect(isAdminTier("admin")).toBe(true);
    expect(isAdminTier("cookie-admin")).toBe(true);
    expect(isAdminTier("anonymous-admin")).toBe(true);
    expect(isAdminTier("user")).toBe(false);
    expect(isAdminTier("anonymous")).toBe(false);
    expect(isAdminTier("unauthenticated")).toBe(false);
    expect(isAdminTier("unreachable")).toBe(false);
  });

  // O engine só lê o cookie de sessão em GET: toda mutação exige o header
  // Authorization. Oferecer purge/commit a uma sessão só-cookie seria oferecer
  // um botão que só sabe responder 401.
  it("sessão só-cookie enxerga mas não muta", () => {
    expect(canMutate("admin")).toBe(true);
    expect(canMutate("anonymous-admin")).toBe(true);
    expect(canMutate("cookie-admin")).toBe(false);
    expect(canMutate("user")).toBe(false);
    expect(canMutate("anonymous")).toBe(false);
    expect(canMutate("unauthenticated")).toBe(false);
    expect(canMutate("unreachable")).toBe(false);
  });

  // UserManagement é root-only: nem modo anônimo nem sessão só-cookie chegam lá.
  it("só o tier admin gerencia usuários", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("cookie-admin")).toBe(false);
    expect(canManageUsers("anonymous-admin")).toBe(false);
    expect(canManageUsers("user")).toBe(false);
  });
});

describe("guard de rota protegida", () => {
  // Só a recusa explícita (401) expulsa para o login. `unreachable` mantém a
  // chave e a rota: um 5xx do engine não é motivo para deslogar ninguém.
  const staying: Tier[] = ["admin", "anonymous-admin", "anonymous", "user", "unreachable"];
  for (const current of staying) {
    it(`${current} permanece na rota protegida`, () => {
      expect(shouldRedirectToLogin(current, "/workspaces")).toBe(false);
    });
  }

  it("unauthenticated em rota protegida vai para o login", () => {
    expect(shouldRedirectToLogin("unauthenticated", "/workspaces")).toBe(true);
    expect(shouldRedirectToLogin("unauthenticated", "/")).toBe(true);
    expect(shouldRedirectToLogin("unauthenticated", "/s/default/scratch/pending")).toBe(true);
  });

  // Sem esta exceção o guard entraria em loop de navegação no próprio login.
  it("unauthenticated já no login não redireciona", () => {
    expect(shouldRedirectToLogin("unauthenticated", "/login")).toBe(false);
    expect(shouldRedirectToLogin("unauthenticated", "/login/")).toBe(false);
  });

  // A SPA pode ser servida sob um base path (`/web`), então o teste não pode
  // assumir que o pathname começa em `/login`.
  it("respeita base path no login", () => {
    expect(shouldRedirectToLogin("unauthenticated", "/web/login")).toBe(false);
    expect(shouldRedirectToLogin("unauthenticated", "/web/workspaces")).toBe(true);
  });
});
