import { vi } from "vitest";

// Node 26 expõe `localStorage` como getter que devolve undefined sem
// `--localstorage-file`. Esse getter também cobre `window.localStorage`,
// então o storage do jsdom não chega a existir: `localStorage.clear()` e o
// Paraglide (`getItem` no import) quebram antes de qualquer teste. O setup
// roda antes dos imports de tela.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
  };
}

const storage = memoryStorage();
for (const target of [globalThis, window]) {
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: storage,
  });
}

// jsdom não implementa matchMedia; theme.ts o invoca no momento do import
// (initialTheme → prefers-color-scheme). Stub default = "light".
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
