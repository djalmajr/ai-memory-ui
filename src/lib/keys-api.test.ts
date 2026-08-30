import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { createKey, listKeys, revokeKey, whoami } from "~/lib/keys-api";

function response(
  data: unknown,
  init: { status?: number; text?: string; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: status < 400,
    status,
    statusText: "",
    headers: new Headers({ "content-type": "application/json", ...init.headers }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(init.text ?? JSON.stringify(data)),
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

describe("keys-api", () => {
  it("listKeys usa GET e credentials=include sem Authorization", async () => {
    fetchMock.mockResolvedValueOnce(response({ keys: [{ id: "consumer-1" }] }));
    const keys = await listKeys();
    expect(keys).toEqual([{ id: "consumer-1" }]);
    expect(lastInit().method ?? "GET").toBe("GET");
    expect(lastInit().credentials).toBe("include");
    expect((lastInit().headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("whoami usa GET e credentials=include", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        can_issue: true,
        identity: { kind: "user", label: "root" },
      }),
    );
    const info = await whoami();
    expect(info.can_issue).toBe(true);
    expect(info.identity?.label).toBe("root");
    expect(lastInit().credentials).toBe("include");
  });

  it("createKey manda POST com credentials=include e X-CSRF-Token", async () => {
    document.cookie = "ai_memory_csrf=csrf_secret_987; path=/";
    fetchMock.mockResolvedValueOnce(
      response({
        id: "new-agent",
        key: "amk_full_secret_revealed_once",
      }),
    );

    const result = await createKey({
      id: "new-agent",
      actor_user: "root",
      scopes: ["read", "write"],
    });

    expect(result.key).toBe("amk_full_secret_revealed_once");
    expect(lastInit().method).toBe("POST");
    expect(lastInit().credentials).toBe("include");
    const headers = lastInit().headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("csrf_secret_987");
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(lastInit().body as string)).toEqual({
      id: "new-agent",
      actor_user: "root",
      scopes: ["read", "write"],
    });
  });

  it("revokeKey manda DELETE com credentials=include e X-CSRF-Token", async () => {
    document.cookie = "ai_memory_csrf=csrf_secret_987; path=/";
    fetchMock.mockResolvedValueOnce(response({}, { status: 204 }));

    await revokeKey("old-agent");
    expect(lastInit().method).toBe("DELETE");
    expect(lastInit().credentials).toBe("include");
    const headers = lastInit().headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("csrf_secret_987");
    expect(headers.Authorization).toBeUndefined();
    expect(lastUrl()).toContain("/old-agent");
  });
});
