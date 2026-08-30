import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  adminActivityByClient,
  adminApiCredentials,
  adminAuditContamination,
  adminBackup,
  adminCheckpoints,
  adminCommit,
  adminCreateApiCredential,
  adminCreateUser,
  adminDisableUser,
  adminEnableUser,
  adminOpenSessions,
  adminPendingWrites,
  adminPurgeProject,
  adminReorg,
  adminResetUserPassword,
  adminRestorePage,
  adminRevokeApiCredential,
  adminRotateApiCredential,
  adminSessionsByAgent,
  adminStatus,
  adminUpdateUser,
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

  it("escopa sessions/by-agent", async () => {
    fetchMock.mockResolvedValueOnce(response({ by_agent: [] }));
    await adminSessionsByAgent({ workspace: "default", project: "scratch" }, 7);
    expect(lastUrl()).toBe(
      "/admin/sessions/by-agent?workspace=default&project=scratch&since_days=7",
    );
  });

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

describe("operações de usuários humanos", () => {
  it("adminCreateUser envia POST /admin/users com papel e dados", async () => {
    const mockUser = {
      user: {
        id: "u1",
        username: "alice",
        name: "Alice",
        email: "alice@example.com",
        role: "user",
        must_change_password: true,
        has_password: true,
        disabled_at: null,
        created_at: 1000000,
        last_used_at: null,
      },
      temporary_password: "temp_password_xyz_123456",
    };
    fetchMock.mockResolvedValueOnce(response(mockUser));

    const result = await adminCreateUser({
      username: "alice",
      name: "Alice",
      email: "alice@example.com",
      role: "user",
    });

    expect(result.temporary_password).toBe("temp_password_xyz_123456");
    expect(lastUrl()).toBe("/admin/users");
    expect(lastInit().method).toBe("POST");
    expect(JSON.parse(lastInit().body as string)).toEqual({
      username: "alice",
      name: "Alice",
      email: "alice@example.com",
      role: "user",
    });
  });

  it("adminResetUserPassword envia POST /admin/users/{username}/reset-password", async () => {
    fetchMock.mockResolvedValueOnce(response({ temporary_password: "new_temp_pass_456" }));
    const result = await adminResetUserPassword("alice");
    expect(result.temporary_password).toBe("new_temp_pass_456");
    expect(lastUrl()).toBe("/admin/users/alice/reset-password");
    expect(lastInit().method).toBe("POST");
  });

  it("adminEnableUser e adminDisableUser chamam seus endpoints respectivos", async () => {
    fetchMock.mockResolvedValueOnce(response({ user: { username: "alice", disabled_at: null } }));
    await adminEnableUser("alice");
    expect(lastUrl()).toBe("/admin/users/alice/enable");
    expect(lastInit().method).toBe("POST");

    fetchMock.mockResolvedValueOnce(response({ user: { username: "alice", disabled_at: 12345 } }));
    await adminDisableUser("alice");
    expect(lastUrl()).toBe("/admin/users/alice/disable");
    expect(lastInit().method).toBe("POST");
  });

  it("adminUpdateUser envia PATCH com campos editados", async () => {
    fetchMock.mockResolvedValueOnce(response({ user: { username: "alice", role: "root" } }));
    await adminUpdateUser("alice", { role: "root" });
    expect(lastUrl()).toBe("/admin/users/alice");
    expect(lastInit().method).toBe("PATCH");
    expect(JSON.parse(lastInit().body as string)).toEqual({ role: "root" });
  });
});

describe("operações de credenciais de API (aim_)", () => {
  it("adminApiCredentials lista as credenciais nativas", async () => {
    fetchMock.mockResolvedValueOnce(response({ credentials: [{ id: "c1", label: "agent-1" }] }));
    const creds = await adminApiCredentials();
    expect(creds).toEqual([{ id: "c1", label: "agent-1" }]);
    expect(lastUrl()).toBe("/admin/api-credentials");
  });

  it("adminCreateApiCredential envia username e label sem campos legados", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        credential: { id: "c1", label: "cli" },
        token: "aim_secret_token_12345",
      }),
    );

    const result = await adminCreateApiCredential({
      username: "alice",
      label: "cli",
    });

    expect(result.token).toBe("aim_secret_token_12345");
    expect(lastUrl()).toBe("/admin/api-credentials");
    expect(lastInit().method).toBe("POST");
    expect(JSON.parse(lastInit().body as string)).toEqual({
      username: "alice",
      label: "cli",
    });
  });

  it("adminRotateApiCredential chama /rotate", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        credential: { id: "c1", label: "cli" },
        token: "aim_rotated_token_67890",
      }),
    );
    const result = await adminRotateApiCredential("c1");
    expect(result.token).toBe("aim_rotated_token_67890");
    expect(lastUrl()).toBe("/admin/api-credentials/c1/rotate");
  });

  it("adminRevokeApiCredential chama /revoke", async () => {
    fetchMock.mockResolvedValueOnce(response({}));
    await adminRevokeApiCredential("c1");
    expect(lastUrl()).toBe("/admin/api-credentials/c1/revoke");
    expect(lastInit().method).toBe("POST");
  });
});

describe("corpos de request", () => {
  it("reorg não manda workspace (o engine usa default fixo)", async () => {
    await adminReorg(true);
    expect(JSON.parse(lastInit().body as string)).toEqual({ dry_run: true });
  });

  it("purge-project manda confirm=true (sem default no engine, senão 422)", async () => {
    await adminPurgeProject({ workspace: "w", project: "p" }, true);
    expect(JSON.parse(lastInit().body as string)).toEqual({
      workspace: "w",
      project: "p",
      confirm: true,
      force: true,
    });
  });

  it("restore-page monta scope, path e rev juntos", async () => {
    await adminRestorePage({ workspace: "w", project: "p" }, "a/b.md", "c0ffee");
    expect(JSON.parse(lastInit().body as string)).toEqual({
      workspace: "w",
      project: "p",
      path: "a/b.md",
      rev: "c0ffee",
    });
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
    expect(lastInit().credentials).toBe("include");
    expect(out.filename).toBe("backup.tar.gz");
    expect(out.blob).toBeInstanceOf(Blob);
  });
});

describe("autenticação e CSRF", () => {
  it("sempre usa credentials=include em todos os requests", async () => {
    fetchMock.mockResolvedValueOnce(response({}));
    await adminStatus();
    expect(lastInit().credentials).toBe("include");
  });

  it("nunca transmite header Authorization do browser", async () => {
    fetchMock.mockResolvedValueOnce(response({}));
    await adminStatus();
    expect((lastInit().headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("inclui X-CSRF-Token nas mutações quando cookie ai_memory_csrf está presente", async () => {
    document.cookie = "ai_memory_csrf=my_secure_csrf_token; path=/";
    fetchMock.mockResolvedValueOnce(response({ committed: true, oid: "123" }));
    await adminCommit("test commit");

    const headers = lastInit().headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("my_secure_csrf_token");
    expect(lastInit().credentials).toBe("include");
  });

  it("omite X-CSRF-Token em GETs", async () => {
    document.cookie = "ai_memory_csrf=my_secure_csrf_token; path=/";
    fetchMock.mockResolvedValueOnce(response({}));
    await adminStatus();

    const headers = lastInit().headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBeUndefined();
  });
});
