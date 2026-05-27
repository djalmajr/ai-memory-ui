import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O módulo mantém estado (signal + localStorage) no nível do módulo: carrega
// uma cópia fresca por teste via resetModules + import dinâmico.
async function freshHistory() {
  vi.resetModules();
  return import("~/lib/history");
}

const KEY = "ai-memory-ui-history";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordVisit", () => {
  it("começa vazio e registra uma visita com timestamp", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const { history, recordVisit } = await freshHistory();
    expect(history()).toEqual([]);

    recordVisit({ workspace: "ws", project: "pr", path: "a.md", title: "A" });
    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({ path: "a.md", title: "A", at: 1000 });
  });

  it("deduplica a mesma (workspace, project, path) trazendo-a para o topo", async () => {
    const { history, recordVisit } = await freshHistory();
    recordVisit({ workspace: "ws", project: "pr", path: "a.md", title: "A" });
    recordVisit({ workspace: "ws", project: "pr", path: "b.md", title: "B" });
    recordVisit({ workspace: "ws", project: "pr", path: "a.md", title: "A2" });

    expect(history()).toHaveLength(2);
    expect(history()[0]).toMatchObject({ path: "a.md", title: "A2" });
    expect(history()[1]).toMatchObject({ path: "b.md" });
  });

  it("limita o histórico a 8 entradas (mais recentes primeiro)", async () => {
    const { history, recordVisit } = await freshHistory();
    for (let i = 0; i < 12; i++) {
      recordVisit({ workspace: "ws", project: "pr", path: `p${i}.md`, title: `T${i}` });
    }
    const h = history();
    expect(h).toHaveLength(8);
    expect(h[0].path).toBe("p11.md");
    expect(h[7].path).toBe("p4.md");
  });

  it("persiste no localStorage", async () => {
    const { recordVisit } = await freshHistory();
    recordVisit({ workspace: "ws", project: "pr", path: "a.md", title: "A" });
    const stored = JSON.parse(localStorage.getItem(KEY) as string);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ workspace: "ws", project: "pr", path: "a.md" });
  });

  it("hidrata o estado inicial a partir do localStorage", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([{ workspace: "ws", project: "pr", path: "x.md", title: "X", at: 5 }]),
    );
    const { history } = await freshHistory();
    expect(history()).toHaveLength(1);
    expect(history()[0].path).toBe("x.md");
  });

  it("tolera localStorage corrompido (cai para vazio)", async () => {
    localStorage.setItem(KEY, "{not json");
    const { history } = await freshHistory();
    expect(history()).toEqual([]);
  });
});
