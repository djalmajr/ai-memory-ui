import { expect, test } from "@playwright/test";

import { app, appUrl } from "./app-path";

// Sentinela do teste de flash, escrita no browser pelo `addInitScript`.
declare global {
  interface Window {
    __sawShell?: boolean;
  }
}

// A5 — proteção de rota. Roda contra um dev server SEM fixtures
// (`E2E_BASE_URL=http://127.0.0.1:5210`), porque no modo fixtures a sonda de
// tier é curto-circuitada e nunca produz `unauthenticated`.
//
// As duas rotas que a sonda usa são interceptadas com 401 (em `text/plain`,
// como o engine responde de verdade) para reproduzir "chave recusada / ausente".
test.describe("guard", () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    "precisa de E2E_BASE_URL apontando para um dev server sem fixtures",
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.route("**/api/v1/workspaces", (route) =>
      route.fulfill({ status: 401, contentType: "text/plain", body: "auth required\n" }),
    );
    await page.route("**/admin/status", (route) =>
      route.fulfill({ status: 401, contentType: "text/plain", body: "auth required\n" }),
    );
  });

  test("rota protegida sem credencial cai no login", async ({ page }) => {
    await page.goto(app("/workspaces"));
    await expect(page).toHaveURL(appUrl("/login"));
    await expect(page.getByTestId("login-key")).toBeVisible();
  });

  test("raiz sem credencial cai no login", async ({ page }) => {
    await page.goto(app("/"));
    await expect(page).toHaveURL(appUrl("/login"));
  });

  test("o próprio login não entra em loop de redirect", async ({ page }) => {
    await page.goto(app("/login"));
    await expect(page.getByTestId("login-key")).toBeVisible();
    await expect(page).toHaveURL(appUrl("/login"));
  });

  // Um 500 não é veredito sobre a credencial: a chave é preservada e o operador
  // não é expulso da rota.
  test("engine com 500 não expulsa quem tem chave", async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem("ai-memory-ui.token", "amk_valida"),
    );
    await page.route("**/api/v1/workspaces", (route) =>
      route.fulfill({ status: 500, contentType: "text/plain", body: "boom" }),
    );
    await page.route("**/admin/status", (route) =>
      route.fulfill({ status: 500, contentType: "text/plain", body: "boom" }),
    );

    await page.goto(app("/workspaces"));
    await expect(page).not.toHaveURL(appUrl("/login"));
    const stored = await page.evaluate(() => window.localStorage.getItem("ai-memory-ui.token"));
    expect(stored).toBe("amk_valida");
  });

  // Um redirect que chega tarde ainda pinta a tela protegida por um instante e
  // dispara as queries dela. Checar só a URL final não pega isso, então um
  // MutationObserver instalado antes da navegação registra se o chrome
  // administrativo (gatilho de busca da sidebar) apareceu em algum momento.
  test("chrome protegido nunca monta em 401", async ({ page }) => {
    await page.addInitScript(() => {
      window.__sawShell = false;
      const seen = () => {
        if (document.querySelector('[data-testid="search-trigger"]')) {
          window.__sawShell = true;
        }
      };
      new MutationObserver(seen).observe(document, { childList: true, subtree: true });
      document.addEventListener("DOMContentLoaded", seen);
    });

    await page.goto(app("/workspaces"));
    await expect(page).toHaveURL(appUrl("/login"));
    await expect(page.getByTestId("login-key")).toBeVisible();

    const flashed = await page.evaluate(() => window.__sawShell);
    expect(flashed).toBe(false);
  });
});
