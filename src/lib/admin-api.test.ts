import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  adminActivityByClient,
  adminExpireUser,
  adminReviveUser,
  adminRotateUserToken,
  adminApprovePendingWrite,
  adminAuditContamination,
  adminAuditLog,
  adminBackup,
  adminCheckpoints,
  adminCreateUser,
  adminOpenSessions,
  adminPendingWrites,
  adminPurgeProject,
  adminRejectPendingWrite,
  adminReorg,
  adminRestorePage,
  adminSessionsByAgent,
  adminStatus,
  adminUsers,
} from "~/lib/admin-api";

function response(
  data: unknown,
  init: { status?: number; text?: string; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: status < 400,
    status,
    statusText: "",
    headers: new Headers(init.headers ?? {}),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(init.text ?? JSON.stringify(data)),
    blob: () => Promise.resolve(new Blob(["tar"])),
  } as unknown as Response;
}

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(response({}));
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function lastUrl(): string {
  return fetchMock.mock.calls.at(-1)?.[0] as string;
}

function lastInit(): RequestInit {
  return (fetchMock.mock.calls.at(-1)?.[1] ?? {}) as RequestInit;
}

describe("montagem de URL", () => {
  it("pendura /admin na raiz do base path, fora de /api/v1", async () => {
    fetchMock.mockResolvedValueOnce(response({ version: "1.32.2" }));
    await adminStatus();
    expect(lastUrl()).toBe("/admin/status");
  });

  it("manda o limite de checkpoints", async () => {
    fetchMock.mockResolvedValueOnce(response([]));
    await adminCheckpoints(1);
    expect(lastUrl()).toBe("/admin/checkpoints?limit=1");
  });

  it("desembrulha { users } em array", async () => {
    fetchMock.mockResolvedValueOnce(response({ users: [{ username: "djalmajr" }] }));
    expect(await adminUsers()).toEqual([{ username: "djalmajr" }]);
  });

  it("desembrulha { by_client }", async () => {
    fetchMock.mockResolvedValueOnce(response({ by_client: [{ client: "omp" }] }));
    expect(await adminActivityByClient(7)).toEqual([{ client: "omp" }]);
    expect(lastUrl()).toBe("/admin/activity/by-client?since_days=7");
  });

  // by-agent é escopado: sem workspace+project o engine responde 400 do extractor.
  it("escopa sessions/by-agent", async () => {
    fetchMock.mockResolvedValueOnce(response({ by_agent: [] }));
    await adminSessionsByAgent({ workspace: "default", project: "scratch" }, 7);
    expect(lastUrl()).toBe(
      "/admin/sessions/by-agent?workspace=default&project=scratch&since_days=7",
    );
  });

  // open-sessions exige o agent exato, além do escopo.
  it("manda agent obrigatório em open-sessions", async () => {
    fetchMock.mockResolvedValueOnce(response({ sessions: [] }));
    await adminOpenSessions({ workspace: "w", project: "p" }, "claude-code");
    expect(lastUrl()).toBe(
      "/admin/open-sessions?workspace=w&project=p&agent=claude-code&all=true",
    );
  });

  it("omite escopo quando audit-contamination roda global", async () => {
    fetchMock.mockResolvedValueOnce(response({ summary: {}, findings: [] }));
    await adminAuditContamination();
    expect(lastUrl()).toBe("/admin/audit-contamination");
  });

  it("pending-writes carrega escopo obrigatório e limite", async () => {
    fetchMock.mockResolvedValueOnce(response([]));
    await adminPendingWrites({ workspace: "w", project: "p" }, { limit: 200 });
    expect(lastUrl()).toBe("/admin/pending-writes?workspace=w&project=p&limit=200");
  });
});

describe("corpos de request", () => {
  it("reorg não manda workspace (o engine usa default fixo)", async () => {
    await adminReorg(true);
    expect(JSON.parse(lastInit().body as string)).toEqual({ dry_run: true });
  });

  it("purge-project manda confirm=true (sem default no engine, senão 422)", async () => {
    await adminPurgeProject({ workspace: "w", project: "p" });
    expect(JSON.parse(lastInit().body as string)).toEqual({
      workspace: "w",
      project: "p",
      confirm: true,
      force: false,
    });
  });

  it("restore-page manda rev como revisão git", async () => {
    await adminRestorePage({ workspace: "w", project: "p" }, "notes/a.md", "abc123");
    expect(JSON.parse(lastInit().body as string)).toEqual({
      workspace: "w",
      project: "p",
      path: "notes/a.md",
      rev: "abc123",
    });
  });

  it("reject manda reason", async () => {
    fetchMock.mockResolvedValueOnce(response({ status: "rejected" }));
    await adminRejectPendingWrite({ workspace: "w", project: "p" }, "id-1", "não procede");
    expect(JSON.parse(lastInit().body as string)).toEqual({ reason: "não procede" });
  });

  it("create user manda só o que foi preenchido", async () => {
    fetchMock.mockResolvedValueOnce(response({ user: {}, token: "t" }));
    await adminCreateUser({ username: "maria" });
    expect(JSON.parse(lastInit().body as string)).toEqual({ username: "maria" });
  });
});

describe("usuários", () => {
  // expire/revive respondem { user }, rotate/create respondem { user, token }.
  // Devolver o envelope cru faria a tabela de Usuários renderizar undefined.
  it("expire desembrulha { user }", async () => {
    fetchMock.mockResolvedValueOnce(response({ user: { username: "maria" } }));
    expect(await adminExpireUser("maria")).toEqual({ username: "maria" });
    expect(lastUrl()).toBe("/admin/users/maria/expire");
    expect(lastInit().method).toBe("POST");
  });

  it("revive desembrulha { user }", async () => {
    fetchMock.mockResolvedValueOnce(response({ user: { username: "maria" } }));
    expect(await adminReviveUser("maria")).toEqual({ username: "maria" });
    expect(lastUrl()).toBe("/admin/users/maria/revive");
  });

  it("rotate-token mantém user + token (revelação única)", async () => {
    fetchMock.mockResolvedValueOnce(response({ user: { username: "maria" }, token: "amk_new" }));
    expect(await adminRotateUserToken("maria")).toEqual({
      user: { username: "maria" },
      token: "amk_new",
    });
    expect(lastUrl()).toBe("/admin/users/maria/rotate-token");
  });

  it("escapa username na URL", async () => {
    fetchMock.mockResolvedValueOnce(response({ user: {} }));
    await adminExpireUser("a b/c");
    expect(lastUrl()).toBe("/admin/users/a%20b%2Fc/expire");
  });
});

describe("erros e degradação", () => {
  it("409 no approve volta como valor conflict, não exceção", async () => {
    fetchMock.mockResolvedValueOnce(response({ status: "conflict" }, { status: 409 }));
    expect(await adminApprovePendingWrite({ workspace: "w", project: "p" }, "id")).toEqual({
      status: "conflict",
    });
  });

  it("approve 200 devolve page_id", async () => {
    fetchMock.mockResolvedValueOnce(response({ status: "approved", page_id: "pg-1" }));
    expect(await adminApprovePendingWrite({ workspace: "w", project: "p" }, "id")).toEqual({
      status: "approved",
      page_id: "pg-1",
    });
  });

  // 400 do extractor do axum é text/plain — o parser não pode assumir JSON.
  it("propaga 400 em texto puro do extractor", async () => {
    fetchMock.mockResolvedValueOnce(
      response(null, {
        status: 400,
        text: "Failed to deserialize query string: missing field `workspace`",
      }),
    );
    await expect(adminPendingWrites({ workspace: "", project: "" })).rejects.toThrow(
      /missing field `workspace`/,
    );
  });

  it("prefere a mensagem de {error} quando o corpo é JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      response(null, { status: 404, text: JSON.stringify({ error: "project 'x' not found" }) }),
    );
    await expect(adminStatus()).rejects.toThrow("project 'x' not found");
  });

  // Rota inexistente em engine antigo: a trilha some da tela em vez de quebrar.
  it("audit-log 404 degrada para null", async () => {
    fetchMock.mockResolvedValueOnce(response(null, { status: 404, text: "" }));
    expect(await adminAuditLog({ limit: 50 })).toBeNull();
  });

  it("500 no audit-log ainda estoura", async () => {
    fetchMock.mockResolvedValueOnce(response(null, { status: 500, text: "boom" }));
    await expect(adminAuditLog({})).rejects.toThrow("boom");
  });
});

describe("backup", () => {
  it("usa POST e tira o nome do Content-Disposition", async () => {
    fetchMock.mockResolvedValueOnce(
      response(null, {
        headers: { "Content-Disposition": 'attachment; filename="backup.tar.gz"' },
      }),
    );
    const out = await adminBackup();
    expect(lastInit().method).toBe("POST");
    expect(out.filename).toBe("backup.tar.gz");
    expect(out.blob).toBeInstanceOf(Blob);
  });
});

describe("autenticação", () => {
  it("manda Bearer quando há chave", async () => {
    localStorage.setItem("ai-memory-ui.token", "amk_x");
    fetchMock.mockResolvedValueOnce(response({}));
    await adminStatus();
    expect((lastInit().headers as Record<string, string>).Authorization).toBe("Bearer amk_x");
  });

  it("não manda Authorization sem chave", async () => {
    fetchMock.mockResolvedValueOnce(response({}));
    await adminStatus();
    expect((lastInit().headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
