import { describe, expect, it } from "vitest";

import { clampPage, pageCount, pageSlice } from "./pagination";

describe("pagination", () => {
  it("conta páginas de 15 em 15", () => {
    expect(pageCount(0, 15)).toBe(1);
    expect(pageCount(15, 15)).toBe(1);
    expect(pageCount(16, 15)).toBe(2);
    expect(pageCount(100, 15)).toBe(7);
  });

  it("recorta a página pedida e prende o índice", () => {
    const rows = Array.from({ length: 40 }, (_, i) => i);
    expect(pageSlice(rows, 1, 15)).toEqual(rows.slice(0, 15));
    expect(pageSlice(rows, 3, 15)).toEqual(rows.slice(30, 40));
    expect(clampPage(9, 40, 15)).toBe(3);
    expect(pageSlice(rows, 9, 15)).toEqual(rows.slice(30, 40));
  });
});
