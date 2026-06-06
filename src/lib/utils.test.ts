import { describe, expect, it } from "vitest";

import { cn, highlightSegments } from "~/lib/utils";

describe("cn", () => {
  it("junta nomes de classe", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignora valores falsy (condicionais)", () => {
    expect(cn("a", false && "x", null, undefined, "", "c")).toBe("a c");
  });

  it("resolve conflitos do tailwind mantendo a última classe", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("aceita arrays e objetos (api do clsx)", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});

describe("highlightSegments", () => {
  const marks = (q: string, t: string) =>
    highlightSegments(q, t)
      .filter((s) => s.match)
      .map((s) => s.text);

  it("highlights each query term independently across a path (the mcp-parity bug)", () => {
    // `mcp parity` is not a contiguous substring of the path, but both terms are.
    const segs = highlightSegments("mcp parity", "engine-cli-mcp-admin-parity.md");
    expect(marks("mcp parity", "engine-cli-mcp-admin-parity.md")).toEqual(["mcp", "parity"]);
    // Round-trips to the original text.
    expect(segs.map((s) => s.text).join("")).toBe("engine-cli-mcp-admin-parity.md");
  });

  it("is case-insensitive", () => {
    expect(marks("MCP", "the mcp surface")).toEqual(["mcp"]);
  });

  it("prefers the longer term when terms overlap", () => {
    expect(marks("ui ui-refresh", "ui-refresh-scroll")).toEqual(["ui-refresh"]);
  });

  it("returns the whole text as a single plain segment for an empty query", () => {
    expect(highlightSegments("   ", "abc")).toEqual([{ match: false, text: "abc" }]);
  });

  it("leaves non-matching text untouched", () => {
    expect(marks("zzz", "abc")).toEqual([]);
  });
});
