import { describe, expect, it } from "vitest";

import { cn } from "~/lib/utils";

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
