import path from "node:path";

import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// Config dedicada aos testes unitários (lib/* puros + componentes Solid).
// Separada do vite.config.ts de propósito: não carrega tailwind/router/paraglide,
// que são irrelevantes p/ os testes de unidade e só adicionam custo/ruído.
// Os e2e (Playwright, e2e/*.spec.ts) são excluídos — rodam via `npm run test:e2e`.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: { "~": path.resolve(__dirname, "./src") },
    // build de desenvolvimento do solid-js → reatividade correta sob jsdom
    conditions: ["development", "browser"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
