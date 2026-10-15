import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  adminActivityByClient,
  adminApiCredentials,
  adminAuditContamination,
  adminBackup,
  adminCancelMessage,
  adminCheckpoints,
  adminCommit,
  adminAuditLog,
  adminCompact,
  adminCompactStatus,
  adminCreateApiCredential,
  adminCreateUser,
  adminDeletePage,
  adminDisableUser,
  adminEnableUser,
  adminExpireHandoffs,
  adminExportOkf,
  adminMessages,
  adminMoveSession,
  adminOpenSessions,
  adminPendingWrites,
  adminPurgeProject,
  adminPurgeSession,
  adminReorg,
  adminResetUserPassword,
  adminRestorePage,
  adminRevokeApiCredential,
  adminRotateApiCredential,
  adminSendMessage,
  adminSessionsByAgent,
  adminStatus,
  adminUpdateUser,
  adminUsers,
  adminWritePage,
  createCompactPoll,
  elapsedSince,
  formatApproxDuration,
  formatElapsed,
  pollDisposed,
  pollFailed,
  pollJobDecided,
  pollRequested,
  pollStarted,
  pollSucceeded,
  shouldKeepPolling,
  type CompactJobStatus,
  type CompactPollState,
} from "~/lib/admin-api";
import { ApiError } from "~/lib/api";

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

  it("compact manda confirm=true e background=true", async () => {
    fetchMock.mockResolvedValueOnce(response(JOB_RUNNING, { status: 202 }));
    await adminCompact();
    expect(lastUrl()).toBe("/admin/compact");
    expect(lastInit().method).toBe("POST");
    expect(JSON.parse(lastInit().body as string)).toEqual({ confirm: true, background: true });
  });

  it("export-okf é POST com workspace e project na query", async () => {
    fetchMock.mockResolvedValueOnce(
      response(null, {
        headers: { "Content-Disposition": 'attachment; filename="okf-bundle.tar.gz"' },
      }),
    );
    const out = await adminExportOkf({ workspace: "w", project: "p" });
    expect(lastUrl()).toBe("/admin/export-okf?project=p&workspace=w");
    expect(lastInit().method).toBe("POST");
    expect(out.filename).toBe("okf-bundle.tar.gz");
  });

  it("expire handoffs manda confirm=true no escopo", async () => {
    fetchMock.mockResolvedValueOnce(response({ expired: 2 }));
    await adminExpireHandoffs({ workspace: "w", project: "p" });
    expect(JSON.parse(lastInit().body as string)).toEqual({
      workspace: "w",
      project: "p",
      confirm: true,
    });
  });

  it("purge-session manda o UUID e confirm=true", async () => {
    fetchMock.mockResolvedValueOnce(response({}));
    await adminPurgeSession({ workspace: "w", project: "p" }, "11111111-1111-1111-1111-111111111111");
    expect(JSON.parse(lastInit().body as string)).toEqual({
      workspace: "w",
      project: "p",
      session_id: "11111111-1111-1111-1111-111111111111",
      confirm: true,
    });
  });

  it("move-session repassa confirm sem forçar true", async () => {
    fetchMock.mockResolvedValueOnce(response({ dry_run: true }));
    await adminMoveSession({
      session_id: "11111111-1111-1111-1111-111111111111",
      project: "dest",
      confirm: false,
    });
    expect(JSON.parse(lastInit().body as string)).toEqual({
      session_id: "11111111-1111-1111-1111-111111111111",
      project: "dest",
      confirm: false,
    });
  });

  it("write-page e delete-page mandam o path", async () => {
    fetchMock.mockResolvedValueOnce(response({ page_id: "1", path: "notes/a.md" }));
    await adminWritePage({ workspace: "w", project: "p", path: "notes/a.md", body: "# A" });
    expect(JSON.parse(lastInit().body as string)).toMatchObject({
      workspace: "w",
      project: "p",
      path: "notes/a.md",
      body: "# A",
    });
    fetchMock.mockResolvedValueOnce(response({ deleted: true, path: "notes/a.md" }));
    await adminDeletePage({ workspace: "w", project: "p" }, "notes/a.md");
    expect(JSON.parse(lastInit().body as string)).toEqual({
      workspace: "w",
      project: "p",
      path: "notes/a.md",
    });
  });

  it("messages lista inbox e send carrega os dois escopos", async () => {
    fetchMock.mockResolvedValueOnce(response({ messages: [] }));
    await adminMessages({ workspace: "w", project: "p" }, "inbox", 20);
    expect(lastUrl()).toBe("/admin/messages?box=inbox&limit=20&project=p&workspace=w");
    fetchMock.mockResolvedValueOnce(response({ message_id: "m1" }));
    await adminSendMessage({
      from_workspace: "w",
      from_project: "p",
      to_workspace: "other",
      to_project: "q",
      body: "ping",
    });
    expect(JSON.parse(lastInit().body as string)).toEqual({
      from_workspace: "w",
      from_project: "p",
      to_workspace: "other",
      to_project: "q",
      body: "ping",
    });
    fetchMock.mockResolvedValueOnce(response({ cancelled: 1 }));
    await adminCancelMessage({ workspace: "w", project: "p" }, "11111111-1111-1111-1111-111111111111");
    expect(lastUrl()).toBe("/admin/messages/cancel");
  });
});

const JOB_RUNNING: CompactJobStatus = {
  job_id: "j1",
  state: "running",
  started_at: "2026-10-12T14:00:00Z",
  finished_at: null,
  elapsed_ms: 0,
  database_bytes_at_start: 1000,
  reclaimable_bytes_at_start: 400,
  previous_duration_ms: null,
  report: null,
  error: null,
};

const REPORT = { bytes_before: 10, bytes_after: 6, bytes_reclaimed: 4 };

const CLOUDFLARE_524 = {
  title: "Error 524: A timeout occurred",
  status: 524,
  detail: "Cloudflare timed out",
  cloudflare_error: true,
};

describe("compactação em segundo plano (POST)", () => {
  it("202 => started com o job", async () => {
    fetchMock.mockResolvedValueOnce(response(JOB_RUNNING, { status: 202 }));
    expect(await adminCompact()).toEqual({ kind: "started", job: JOB_RUNNING });
  });

  it("409 => running com o job em curso, sem lançar", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ error: "a compaction is already running", job: JOB_RUNNING }, { status: 409 }),
    );
    expect(await adminCompact()).toEqual({ kind: "running", job: JOB_RUNNING });
  });

  it("409 sem job legível => running com job null", async () => {
    const unreadable = response(null, { status: 409, text: "conflict" });
    unreadable.json = () => Promise.reject(new SyntaxError("Unexpected token c"));
    fetchMock.mockResolvedValueOnce(unreadable);
    expect(await adminCompact()).toEqual({ kind: "running", job: null });
  });

  it("200 => report (engine antigo rodou síncrono)", async () => {
    fetchMock.mockResolvedValueOnce(response(REPORT));
    expect(await adminCompact()).toEqual({ kind: "report", report: REPORT });
  });

  it.each([504, 524] as const)("%i do proxy => timeout, não erro", async (status) => {
    fetchMock.mockResolvedValueOnce(response({ ...CLOUDFLARE_524, status }, { status }));
    expect(await adminCompact()).toEqual({ kind: "timeout", status });
  });

  it("524 em HTML (página do Cloudflare) também é timeout", async () => {
    fetchMock.mockResolvedValueOnce(
      response(null, { status: 524, text: "<html>A timeout occurred</html>" }),
    );
    expect(await adminCompact()).toEqual({ kind: "timeout", status: 524 });
  });

  it("400 continua lançando ApiError com o texto do engine", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "confirm required" }, { status: 400 }));
    await expect(adminCompact()).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "confirm required",
    });
  });

  it("502 do proxy lança ApiError (só 504/524 são o timeout conhecido)", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ title: "Bad gateway", status: 502, cloudflare_error: true }, { status: 502 }),
    );
    await expect(adminCompact()).rejects.toMatchObject({ status: 502, message: "502 Bad gateway" });
  });
});

describe("estado da compactação (GET)", () => {
  it("devolve o job", async () => {
    fetchMock.mockResolvedValueOnce(response(JOB_RUNNING));
    expect(await adminCompactStatus()).toEqual(JOB_RUNNING);
    expect(lastUrl()).toBe("/admin/compact");
    expect(lastInit().method ?? "GET").toBe("GET");
  });

  it.each([404, 405])("%i (engine sem a rota) => null", async (status) => {
    fetchMock.mockResolvedValueOnce(response({ error: "nope" }, { status }));
    expect(await adminCompactStatus()).toBeNull();
  });

  it("500 não é rota ausente: lança", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "boom" }, { status: 500 }));
    await expect(adminCompactStatus()).rejects.toBeInstanceOf(ApiError);
  });

  it("o GET leva um teto de tempo (AbortSignal) para não ficar pendurado", async () => {
    fetchMock.mockResolvedValueOnce(response(JOB_RUNNING));
    await adminCompactStatus();
    const signal = lastInit().signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it("estourar o teto rejeita (vira erro de poll, não null)", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(adminCompactStatus()).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("405 em outra rota opcional continua sendo erro (só o compact degrada 405)", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "nope" }, { status: 405 }));
    await expect(adminAuditLog({})).rejects.toMatchObject({ status: 405 });
  });
});

describe("errorMessage (corpos de erro)", () => {
  it("corpo do Cloudflare vira '<status> <title>' em qualquer chamada admin", async () => {
    fetchMock.mockResolvedValueOnce(response(CLOUDFLARE_524, { status: 524 }));
    await expect(adminStatus()).rejects.toMatchObject({
      status: 524,
      message: "524 Error 524: A timeout occurred",
    });
  });

  it("{ error } do engine segue igual", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ error: "a compaction is already running" }, { status: 409 }),
    );
    await expect(adminCommit("x")).rejects.toMatchObject({
      message: "a compaction is already running",
    });
  });

  it("texto puro (401 do host) segue igual", async () => {
    fetchMock.mockResolvedValueOnce(response(null, { status: 401, text: "auth required\n" }));
    await expect(adminStatus()).rejects.toMatchObject({ message: "auth required" });
  });

  it("JSON sem title/status e sem error devolve o texto cru", async () => {
    fetchMock.mockResolvedValueOnce(response({ detail: "x" }, { status: 500 }));
    await expect(adminStatus()).rejects.toMatchObject({ message: '{"detail":"x"}' });
  });

  it("title sem status não é tratado como proxy", async () => {
    fetchMock.mockResolvedValueOnce(response({ title: "x" }, { status: 500 }));
    await expect(adminStatus()).rejects.toMatchObject({ message: '{"title":"x"}' });
  });

  it("JSON null não derruba o parser", async () => {
    fetchMock.mockResolvedValueOnce(response(null, { status: 500, text: "null" }));
    await expect(adminStatus()).rejects.toMatchObject({ message: "null" });
  });
});

describe("helpers de tempo e polling da compactação", () => {
  it("formatElapsed em mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(999)).toBe("00:00");
    expect(formatElapsed(1_000)).toBe("00:01");
    expect(formatElapsed(65_000)).toBe("01:05");
    expect(formatElapsed(3_600_000)).toBe("60:00");
  });

  it("formatElapsed clampa negativo e não-finito a zero", () => {
    expect(formatElapsed(-5_000)).toBe("00:00");
    expect(formatElapsed(Number.NaN)).toBe("00:00");
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("00:00");
  });

  it("formatApproxDuration usa s abaixo de 1 min e min acima", () => {
    expect(formatApproxDuration(200)).toBe("1 s");
    expect(formatApproxDuration(45_000)).toBe("45 s");
    expect(formatApproxDuration(60_000)).toBe("1 min");
    expect(formatApproxDuration(14.4 * 60_000)).toBe("14 min");
  });

  it("elapsedSince conta a partir de started_at", () => {
    const now = Date.parse("2026-10-12T14:01:05Z");
    expect(elapsedSince(JOB_RUNNING, now)).toBe(65_000);
  });

  it("elapsedSince não fica negativo com o relógio do servidor à frente", () => {
    const now = Date.parse("2026-10-12T13:59:00Z");
    expect(elapsedSince(JOB_RUNNING, now)).toBe(0);
  });

  it("elapsedSince cai no elapsed_ms do poll sem started_at legível", () => {
    expect(elapsedSince({ ...JOB_RUNNING, started_at: null, elapsed_ms: 7_000 }, 1)).toBe(7_000);
    expect(elapsedSince({ ...JOB_RUNNING, started_at: "lixo", elapsed_ms: null }, 1)).toBe(0);
  });

  it("só 'running' mantém o polling", () => {
    expect(shouldKeepPolling(JOB_RUNNING)).toBe(true);
    for (const state of ["idle", "succeeded", "failed"] as const) {
      expect(shouldKeepPolling({ ...JOB_RUNNING, state })).toBe(false);
    }
    expect(shouldKeepPolling(null)).toBe(false);
  });
});

const JOB_SUCCEEDED: CompactJobStatus = {
  ...JOB_RUNNING,
  state: "succeeded",
  finished_at: "2026-10-12T14:05:00Z",
  report: REPORT,
};

// Dirige o agendador como o componente: pedido, partida, resultado.
function begin(state: CompactPollState) {
  const request = pollRequested(state);
  if (!request.run) return { ...request, token: -1 };
  const started = pollStarted(request.state);
  return { state: started.state, run: true, token: started.token };
}

describe("agendador do polling da compactação", () => {
  it("mount que descobre 'running' continua o polling pelo job recebido", () => {
    // Bug do Solid 2: o sinal ainda é null aqui. O agendador só vê o recebido.
    const first = begin(createCompactPoll());
    expect(first.run).toBe(true);
    const settled = pollSucceeded(first.state, first.token, JOB_RUNNING);
    expect(settled.apply).toBe(true);
    expect(settled.next).toBe(true);
    expect(settled.state.running).toBe(true);
    expect(settled.state.inFlight).toBe(false);
  });

  it("'running' -> 'succeeded' para, sem poll extra", () => {
    const first = begin(createCompactPoll());
    const running = pollSucceeded(first.state, first.token, JOB_RUNNING);
    const second = begin(running.state);
    const done = pollSucceeded(second.state, second.token, JOB_SUCCEEDED);
    expect(done.apply).toBe(true);
    expect(done.next).toBe(false);
    expect(done.state.running).toBe(false);
  });

  it("'failed' também para", () => {
    const first = begin(pollSucceeded(begin(createCompactPoll()).state, 0, JOB_RUNNING).state);
    const done = pollSucceeded(first.state, first.token, { ...JOB_RUNNING, state: "failed" });
    expect(done.next).toBe(false);
  });

  it("engine sem a rota (null) não arma polling", () => {
    const first = begin(createCompactPoll());
    const settled = pollSucceeded(first.state, first.token, null);
    expect(settled.apply).toBe(true);
    expect(settled.next).toBe(false);
  });

  it("pedido durante um poll em voo fica na fila e roda depois", () => {
    const first = begin(createCompactPoll());
    const during = pollRequested(first.state);
    expect(during.run).toBe(false);
    expect(during.state.queued).toBe(true);
    // O resultado do ciclo em voo é terminal, mas a fila garante o próximo.
    const settled = pollSucceeded(during.state, first.token, JOB_SUCCEEDED);
    expect(settled.next).toBe(true);
    const again = begin(settled.state);
    expect(again.run).toBe(true);
    // Partir consome a fila: sem pedido novo, o resultado terminal encerra.
    expect(again.state.queued).toBe(false);
    expect(pollSucceeded(again.state, again.token, JOB_SUCCEEDED).next).toBe(false);
  });

  it("resultado de geração velha é descartado e o poll pedido pelo POST ainda roda", () => {
    // GET do mount em voo; o POST decide o estado; o timer de 3 s pede poll.
    const mount = begin(createCompactPoll());
    const decided = pollJobDecided(mount.state, JOB_RUNNING);
    expect(decided.generation).toBe(mount.state.generation + 1);
    const queued = pollRequested(decided);
    expect(queued.run).toBe(false);
    expect(queued.state.queued).toBe(true);
    // O GET velho volta dizendo 'idle': não pode apagar o 'running' do POST.
    const stale = pollSucceeded(queued.state, mount.token, { ...JOB_RUNNING, state: "idle" });
    expect(stale.apply).toBe(false);
    expect(stale.state.running).toBe(true);
    expect(stale.next).toBe(true);
    const rerun = begin(stale.state);
    expect(rerun.run).toBe(true);
    expect(rerun.token).toBe(decided.generation);
    expect(pollSucceeded(rerun.state, rerun.token, JOB_RUNNING).apply).toBe(true);
  });

  it("erro de geração velha não aparece, mas a fila continua", () => {
    const mount = begin(createCompactPoll());
    const queued = pollRequested(pollJobDecided(mount.state, JOB_RUNNING)).state;
    const failed = pollFailed(queued, mount.token);
    expect(failed.apply).toBe(false);
    expect(failed.next).toBe(true);
  });

  it("dispose para tudo: nada roda, nada é escrito, nada é agendado", () => {
    const first = begin(pollSucceeded(begin(createCompactPoll()).state, 0, JOB_RUNNING).state);
    const queued = pollRequested(first.state).state;
    const disposed = pollDisposed(queued);
    expect(disposed.queued).toBe(false);
    expect(pollRequested(disposed).run).toBe(false);
    const settled = pollSucceeded(disposed, first.token, JOB_RUNNING);
    expect(settled.apply).toBe(false);
    expect(settled.next).toBe(false);
    const failed = pollFailed(disposed, first.token);
    expect(failed.apply).toBe(false);
    expect(failed.next).toBe(false);
  });

  it("erro de poll com o job 'running' mostra o erro e continua", () => {
    const running = pollSucceeded(begin(createCompactPoll()).state, 0, JOB_RUNNING).state;
    const next = begin(running);
    const failed = pollFailed(next.state, next.token);
    expect(failed.apply).toBe(true);
    expect(failed.next).toBe(true);
    expect(failed.state.running).toBe(true);
    expect(failed.state.inFlight).toBe(false);
  });

  it("erro antes de haver job 'running' não arma polling", () => {
    const first = begin(createCompactPoll());
    const failed = pollFailed(first.state, first.token);
    expect(failed.apply).toBe(true);
    expect(failed.next).toBe(false);
  });

  it("POST sem job (report, timeout) zera 'running'", () => {
    const running = pollSucceeded(begin(createCompactPoll()).state, 0, JOB_RUNNING).state;
    expect(pollJobDecided(running, null).running).toBe(false);
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
