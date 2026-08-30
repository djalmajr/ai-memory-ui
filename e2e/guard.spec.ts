import { expect, test } from "@playwright/test";

import { app, appUrl } from "./app-path";

// Sentinela do teste de flash, escrita no browser pelo `addInitScript`.
declare global {
  interface Window {
    __sawShell?: boolean;
  }
}

// A5 — proteção de rota. O preview com fixtures continua usando requests reais
// de `/auth/me` quando o teste ativa `fixture-auth-network`, permitindo que o
// Playwright cubra 401/500 sem depender de um engine externo.
test.describe("guard", () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem("ai-memory-ui.fixture-auth-network", "1");
    });
    await page.route("**/auth/me", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
    );
  });

  test("rota protegida sem credencial cai no login", async ({ page }) => {
    await page.goto(app("/workspaces"));
    await expect(page).toHaveURL(appUrl("/login"));
    await expect(page.getByTestId("login-username")).toBeVisible();
  });

  test("raiz sem credencial cai no login", async ({ page }) => {
    await page.goto(app("/"));
    await expect(page).toHaveURL(appUrl("/login"));
  });

  test("o próprio login não entra em loop de redirect", async ({ page }) => {
    await page.goto(app("/login"));
    await expect(page.getByTestId("login-username")).toBeVisible();
    await expect(page).toHaveURL(appUrl("/login"));
  });

  // Um 500 não é veredito sobre a credencial: o operador não é expulso para o login
  // e cada tela pode apresentar seu erro.
  test("engine com 500 não expulsa para o login", async ({ page }) => {
    await page.route("**/auth/me", (route) =>
      route.fulfill({ status: 500, contentType: "text/plain", body: "boom" }),
    );

    await page.goto(app("/workspaces"));
    await expect(page).not.toHaveURL(appUrl("/login"));
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
    await expect(page.getByTestId("login-username")).toBeVisible();

    const flashed = await page.evaluate(() => window.__sawShell);
    expect(flashed).toBe(false);
  });

  test("falha 5xx no login aparece como engine indisponível", async ({ page }) => {
    await page.route("**/auth/login", (route) =>
      route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" }),
    );
    await page.goto(app("/login"));
    await page.getByTestId("login-username").fill("root");
    await page.getByTestId("login-password").fill("correct_password_123");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toContainText(/Could not reach the server/i);
  });
});
