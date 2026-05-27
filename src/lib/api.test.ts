import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  briefing,
  listPages,
  listProjects,
  listProjectsForWorkspace,
  listWorkspaces,
  projectOverview,
  readPage,
  recentPages,
  searchPages,
  workspaceOverview,
} from "~/lib/api";

// Resposta tipo fetch. `ok` deriva do status quando não informado.
function jsonResponse(
  data: unknown,
  init: { ok?: boolean; status?: number; statusText?: string; nonJson?: boolean } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? status < 400,
    status,
    statusText: init.statusText ?? "",
    json: init.nonJson
      ? () => Promise.reject(new SyntaxError("not json"))
      : () => Promise.resolve(data),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// URL (1º arg) da última chamada ao fetch.
function lastUrl(): string {
  return fetchMock.mock.calls.at(-1)?.[0] as string;
}
function lastInit(): RequestInit {
  return (fetchMock.mock.calls.at(-1)?.[1] ?? {}) as RequestInit;
}

describe("requestJson — montagem de URL e headers", () => {
  it("prefixa /api/v1 e envia Accept: application/json", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ name: "p" }]));
    const out = await listProjects();
    expect(lastUrl()).toBe("/api/v1/projects");
    expect((lastInit().headers as Record<string, string>).Accept).toBe("application/json");
    expect(out).toEqual([{ name: "p" }]);
  });

  it("lista workspaces em /workspaces", async () => {
    await listWorkspaces();
    expect(lastUrl()).toBe("/api/v1/workspaces");
  });

  it("filtra projetos por workspace via querystring (codificada)", async () => {
    await listProjectsForWorkspace("acme corp");
    expect(lastUrl()).toBe("/api/v1/projects?workspace=acme+corp");
  });
});

describe("rotas escopadas a workspace/projeto", () => {
  it("workspaceOverview monta /workspaces/{ws}/overview e codifica o segmento", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ handoff: null }));
    await workspaceOverview("a/b");
    expect(lastUrl()).toBe("/api/v1/workspaces/a%2Fb/overview");
  });

  it("projectOverview inclui ?limit e codifica ws+projeto", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ handoff: null }));
    await projectOverview({ workspace: "ws", project: "pr" }, 5);
    expect(lastUrl()).toBe("/api/v1/workspaces/ws/projects/pr/overview?limit=5");
  });

  it("listPages monta a rota de páginas", async () => {
    await listPages({ workspace: "ws", project: "pr" });
    expect(lastUrl()).toBe("/api/v1/workspaces/ws/projects/pr/pages");
  });

  it("readPage codifica cada segmento do path preservando as barras", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ path: "x" }));
    await readPage({ workspace: "ws", project: "pr" }, "dir/sub item/READ ME.md");
    expect(lastUrl()).toBe(
      "/api/v1/workspaces/ws/projects/pr/pages/dir/sub%20item/READ%20ME.md",
    );
  });

  it("recentPages e briefing propagam o limit", async () => {
    await recentPages({ workspace: "ws", project: "pr" }, 3);
    expect(lastUrl()).toBe("/api/v1/workspaces/ws/projects/pr/recent?limit=3");
    await briefing({ workspace: "ws", project: "pr" }, 4);
    expect(lastUrl()).toBe("/api/v1/workspaces/ws/projects/pr/briefing?limit=4");
  });
});

describe("searchPages", () => {
  it("busca global é GET /search?q&limit", async () => {
    await searchPages("hello world", {}, 12);
    expect(lastUrl()).toBe("/api/v1/search?q=hello+world&limit=12");
    expect(lastInit().method).toBeUndefined();
  });

  it("com key vira GET escopado (workspace+project na query)", async () => {
    await searchPages("q", { key: { workspace: "ws", project: "pr" } }, 7);
    const url = new URL(lastUrl(), "http://x");
    expect(url.pathname).toBe("/api/v1/search");
    expect(url.searchParams.get("workspace")).toBe("ws");
    expect(url.searchParams.get("project")).toBe("pr");
    expect(url.searchParams.get("limit")).toBe("7");
  });

  it("com scopes vira POST /search com body JSON e Content-Type", async () => {
    await searchPages(
      "q",
      { scopes: [{ workspace: "w1", project: "p1" }, { workspace: "w2", project: "p2" }] },
      9,
    );
    expect(lastUrl()).toBe("/api/v1/search");
    const init = lastInit();
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      limit: 9,
      q: "q",
      scopes: [
        { project: "p1", workspace: "w1" },
        { project: "p2", workspace: "w2" },
      ],
    });
  });
});

describe("tratamento de erro", () => {
  it("erro com body JSON {error} propaga a mensagem e o status", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "boom" }, { status: 500, statusText: "Internal Server Error" }),
    );
    await expect(listProjects()).rejects.toMatchObject({ status: 500, message: "boom" });
  });

  it("erro com body não-JSON cai no fallback 'status statusText'", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(null, { status: 502, statusText: "Bad Gateway", nonJson: true }),
    );
    await expect(listProjects()).rejects.toMatchObject({
      status: 502,
      message: "502 Bad Gateway",
    });
  });

  it("workspaceOverview degrada para null quando a rota falha", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope" }, { status: 404 }));
    await expect(workspaceOverview("ws")).resolves.toBeNull();
  });

  it("projectOverview degrada para null quando a rota falha", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope" }, { status: 404 }));
    await expect(projectOverview({ workspace: "ws", project: "pr" })).resolves.toBeNull();
  });
});
