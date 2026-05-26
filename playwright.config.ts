import { defineConfig, devices } from "@playwright/test";

// E2E roda contra a SPA real no browser. Por padrão sobe o Vite dev em modo
// fixtures (VITE_FIXTURES=1) numa porta dedicada — determinístico e auto-contido.
// Para apontar para um ai-memory real (ex: o server local em /web), exporte
// E2E_BASE_URL=http://127.0.0.1:49374/web e o webServer é ignorado.
const PORT = 5199;
// origin only — os specs usam o prefixo /web/ explicitamente (a SPA roda sob /web).
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // channel "chrome" usa o Google Chrome instalado no sistema (evita baixar o
  // chromium do Playwright). Troque/remova se preferir o chromium gerenciado.
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `VITE_FIXTURES=1 npm run dev -- --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/web/`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
