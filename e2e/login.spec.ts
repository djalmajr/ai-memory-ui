import { expect, test } from "@playwright/test";

import { app, appUrl } from "./app-path";

// A5 — tela de login por chave.
//
// A suíte padrão sobe o Vite em modo fixtures (VITE_FIXTURES=1), onde a sonda de
// tier conclui sem engine: chave presente => admin. É o que permite exercitar o
// caminho de sucesso offline. O caminho de recusa (401) é coberto por unidade em
// `src/lib/auth.test.ts`, já que sem engine não existe 401 para reproduzir aqui.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("renderiza o card de chave com microcopy e divisor", async ({ page }) => {
  await page.goto(app("/login"));

  await expect(page.getByTestId("login-key")).toBeVisible();
  await expect(page.getByTestId("login-key")).toHaveAttribute("placeholder", "amk_…");
  // A chave é segredo: o campo não pode expor o valor digitado.
  await expect(page.getByTestId("login-key")).toHaveAttribute("type", "password");
  await expect(page.getByTestId("login-submit")).toBeDisabled();
  await expect(page.getByText(/only|apenas|solo/i).first()).toBeVisible();
});

test("habilita entrar só com chave preenchida", async ({ page }) => {
  await page.goto(app("/login"));

  await expect(page.getByTestId("login-submit")).toBeDisabled();
  await page.getByTestId("login-key").fill("   ");
  await expect(page.getByTestId("login-submit")).toBeDisabled();
  await page.getByTestId("login-key").fill("amk_teste");
  await expect(page.getByTestId("login-submit")).toBeEnabled();
});

test("entra e guarda a chave só no browser", async ({ page }) => {
  await page.goto(app("/login"));
  await page.getByTestId("login-key").fill("amk_teste");
  await page.getByTestId("login-submit").click();

  await expect(page).not.toHaveURL(appUrl("/login"));
  const stored = await page.evaluate(() => window.localStorage.getItem("ai-memory-ui.token"));
  expect(stored).toBe("amk_teste");
});
