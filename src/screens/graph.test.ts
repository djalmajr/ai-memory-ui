import { describe, expect, it } from "vitest";

import type { CrossProjectEdge } from "~/lib/types";

import { layout } from "./graph";

function edge(fromWs: string, fromProj: string, toWs: string, toProj: string): CrossProjectEdge {
  return {
    from_path: "notes/a.md",
    from_project: fromProj,
    from_workspace: fromWs,
    to_path: "notes/b.md",
    to_project: toProj,
    to_workspace: toWs,
  };
}

describe("graph layout", () => {
  // Regressão: a versão anterior agregava com `${from}${to}` e depois fazia
  // `k.split("")` — nomes multi-caractere viravam caracteres soltos e nenhum
  // link resolvia para um nó real.
  it("links reference real nodes for multi-character names", () => {
    const model = layout([
      edge("djalmajr", "infra", "zommehq", "buntime"),
      edge("zommehq", "buntime", "djalmajr", "infra"),
    ]);

    const keys = new Set(model.nodes.map((node) => node.key));
    expect(keys).toEqual(new Set(["djalmajr/infra", "zommehq/buntime"]));
    for (const link of model.links) {
      expect(keys).toContain(link.from);
      expect(keys).toContain(link.to);
    }
  });

  it("collapses page edges between the same projects into one weighted link", () => {
    const model = layout([
      edge("djalmajr", "infra", "zommehq", "buntime"),
      edge("djalmajr", "infra", "zommehq", "buntime"),
      edge("djalmajr", "infra", "zommehq", "buntime"),
    ]);

    expect(model.links).toHaveLength(1);
    expect(model.links[0]).toMatchObject({ from: "djalmajr/infra", to: "zommehq/buntime", weight: 3 });
  });

  it("keeps opposite directions as separate links and counts degrees", () => {
    const model = layout([
      edge("djalmajr", "infra", "zommehq", "buntime"),
      edge("zommehq", "buntime", "djalmajr", "infra"),
      edge("zommehq", "buntime", "djalmajr", "infra"),
    ]);

    expect(model.links).toHaveLength(2);
    const infra = model.nodes.find((node) => node.key === "djalmajr/infra")!;
    expect(infra.outbound).toBe(1);
    expect(infra.inbound).toBe(2);
  });
});
