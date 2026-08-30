import { expect, test } from "@playwright/test";

import { app } from "./app-path";

// Smoke contra um engine ai-memory REAL. Opt-in: sem as variáveis abaixo a
// suíte inteira é ignorada, então `npm run test:e2e` continua determinístico em
// modo fixtures.
//   E2E_BASE_URL=http://127.0.0.1:49374/web \
//   E2E_ADMIN_TOKEN=<chave que abre /admin e /keys> \
//   E2E_USER_TOKEN=<chave de usuário, opcional> \
//   E2E_SCOPE_PATH=/s/default/scratch \
//   npx playwright test e2e/live.spec.ts
//
// Credenciais NUNCA ficam no arquivo: um bearer literal comitado vaza no
// histórico do git e é descoberto pela suíte default sem ninguém pedir.
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN ?? "";
const USER_TOKEN = process.env.E2E_USER_TOKEN ?? "";
const SCOPE_PATH = process.env.E2E_SCOPE_PATH ?? "/s/default/scratch";

test.describe("engine real", () => {
  test.skip(
    !process.env.E2E_BASE_URL || !ADMIN_TOKEN,
    "precisa de E2E_BASE_URL + E2E_ADMIN_TOKEN",
  );

  test("admin vê contagens, workspaces e usuários reais", async ({ page }) => {
    await page.addInitScript(
      ([token]) => window.localStorage.setItem("ai-memory-ui.token", token),
      [ADMIN_TOKEN],
    );

    await page.goto(app("/"));
    await expect(page.getByRole("navigation").getByRole("link", { name: /Users|Usuários/ })).toBeVisible();

    await page.goto(app("/workspaces"));
    await expect(page.getByRole("table").or(page.getByRole("list")).first()).toBeVisible();

    await page.goto(app("/config"));
    // A versão vem de /admin/status — só aparece se o engine respondeu.
    await expect(page.getByText(/\d+\.\d+\.\d+/).first()).toBeVisible();
  });

  test("escopo lista páginas e abre o leitor", async ({ page }) => {
    await page.addInitScript(
      ([token]) => window.localStorage.setItem("ai-memory-ui.token", token),
      [ADMIN_TOKEN],
    );

    await page.goto(app(SCOPE_PATH));
    const firstPage = page.getByRole("link").filter({ hasText: ".md" }).first();
    await expect(firstPage).toBeVisible();
    await firstPage.click();
    // O corpo vem como markdown renderizado; título + bloco de frontmatter
    // provam que o leitor montou com dados reais do engine.
    await expect(page.getByText(/Frontmatter/i).first()).toBeVisible();
  });

  test("token de usuário do banco não recebe área administrativa", async ({ page }) => {
    test.skip(!USER_TOKEN, "precisa de E2E_USER_TOKEN");
    await page.addInitScript(
      ([token]) => window.localStorage.setItem("ai-memory-ui.token", token),
      [USER_TOKEN],
    );

    await page.goto(app("/"));
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: /^Users$|^Usuários$/ })).toHaveCount(0);
    await expect(nav.getByText(/Administration|Administração/)).toHaveCount(0);
  });

  test("sem chave vê o login prototipado", async ({ page }) => {
    await page.goto(app("/ops"));

    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(
      page.getByRole("heading", { name: /Access key|Chave de acesso|Clave de acceso/ }),
    ).toBeVisible();
    await expect(page.getByTestId("login-key")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeDisabled();
  });
});
