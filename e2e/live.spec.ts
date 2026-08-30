import { expect, test } from "@playwright/test";

import { app } from "./app-path";

// Smoke contra um engine ai-memory REAL. Opt-in: sem as variáveis abaixo a
// suíte inteira é ignorada, então `npm run test:e2e` continua determinístico em
// modo fixtures.
//   E2E_BASE_URL=http://127.0.0.1:49374/web \
//   E2E_ROOT_USER=root \
//   E2E_ROOT_PASSWORD=<senha do root> \
//   E2E_SCOPE_PATH=/s/default/scratch \
//   npx playwright test e2e/live.spec.ts
//
// Credenciais NUNCA ficam no arquivo: senhas literais comitadas vazam no
// histórico do git e são descobertas pela suíte default sem ninguém pedir.
const ROOT_USER = process.env.E2E_ROOT_USER ?? "root";
const ROOT_PASSWORD = process.env.E2E_ROOT_PASSWORD ?? "";
const USER_NAME = process.env.E2E_USER_NAME ?? "";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const SCOPE_PATH = process.env.E2E_SCOPE_PATH ?? "/s/default/scratch";

test.describe("engine real", () => {
  test.skip(
    !process.env.E2E_BASE_URL || !ROOT_PASSWORD,
    "precisa de E2E_BASE_URL + E2E_ROOT_PASSWORD",
  );

  test("root vê contagens, workspaces e usuários reais", async ({ page }) => {
    await page.goto(app("/login"));
    await page.getByTestId("login-username").fill(ROOT_USER);
    await page.getByTestId("login-password").fill(ROOT_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page).not.toHaveURL(/\/login\/?$/);

    await page.goto(app("/"));
    await expect(page.getByRole("navigation").getByRole("link", { name: /Users|Usuários/ })).toBeVisible();

    await page.goto(app("/workspaces"));
    await expect(page.getByRole("table").or(page.getByRole("list")).first()).toBeVisible();

    await page.goto(app("/config"));
    // A versão vem de /admin/status — só aparece se o engine respondeu.
    await expect(page.getByText(/\d+\.\d+\.\d+/).first()).toBeVisible();
  });

  test("escopo lista páginas e abre o leitor", async ({ page }) => {
    await page.goto(app("/login"));
    await page.getByTestId("login-username").fill(ROOT_USER);
    await page.getByTestId("login-password").fill(ROOT_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page).not.toHaveURL(/\/login\/?$/);

    await page.goto(app(SCOPE_PATH));
    const firstPage = page.getByRole("link").filter({ hasText: ".md" }).first();
    await expect(firstPage).toBeVisible();
    await firstPage.click();
    // O corpo vem como markdown renderizado; título + bloco de frontmatter
    // provam que o leitor montou com dados reais do engine.
    await expect(page.getByText(/Frontmatter/i).first()).toBeVisible();
  });

  test("usuário comum não recebe área de administração de usuários", async ({ page }) => {
    test.skip(!USER_PASSWORD, "precisa de E2E_USER_PASSWORD");
    await page.goto(app("/login"));
    await page.getByTestId("login-username").fill(USER_NAME || "user");
    await page.getByTestId("login-password").fill(USER_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page).not.toHaveURL(/\/login\/?$/);

    await page.goto(app("/"));
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: /^Users$|^Usuários$/ })).toHaveCount(0);
  });

  test("sem sessão vê o AuthFrame de login", async ({ page }) => {
    await page.goto(app("/ops"));

    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(page.getByTestId("login-username")).toBeVisible();
    await expect(page.getByTestId("login-password")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeDisabled();
  });
});
