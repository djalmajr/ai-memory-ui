import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado de módulo (signal + efeito no <html>): cópia fresca por teste. O
// `flush` vem do mesmo registro de módulos: Solid 2 enfileira escritas de
// signal e só as expõe ao leitor depois de drenar a fila.
async function freshTheme() {
  vi.resetModules();
  const [mod, { flush }] = await Promise.all([import("~/lib/theme"), import("solid-js")]);
  return { ...mod, flush };
}

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  stubMatchMedia(false);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("tema inicial", () => {
  it("sem preferência salva, segue o prefers-color-scheme (light)", async () => {
    stubMatchMedia(false);
    const { theme } = await freshTheme();
    expect(theme()).toBe("light");
  });

  it("sem preferência salva, segue o prefers-color-scheme (dark)", async () => {
    stubMatchMedia(true);
    const { theme } = await freshTheme();
    expect(theme()).toBe("dark");
  });

  it("respeita o valor salvo no localStorage", async () => {
    localStorage.setItem("ai-memory-ui-theme", "dark");
    const { theme } = await freshTheme();
    expect(theme()).toBe("dark");
  });
});

describe("setTheme / toggleTheme", () => {
  it("setTheme atualiza o signal, persiste e aplica a classe no <html>", async () => {
    const { flush, theme, setTheme } = await freshTheme();
    setTheme("dark");
    flush();
    expect(theme()).toBe("dark");
    expect(localStorage.getItem("ai-memory-ui-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("toggleTheme alterna entre dark e light", async () => {
    const { flush, theme, toggleTheme } = await freshTheme();
    const start = theme();
    toggleTheme();
    flush();
    expect(theme()).not.toBe(start);
    toggleTheme();
    flush();
    expect(theme()).toBe(start);
  });
});
