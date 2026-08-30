import { expect, test } from "@playwright/test";

import { app, appUrl } from "./app-path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("renderiza o AuthFrame com username, senha e controles no cabeçalho do card", async ({ page }) => {
  await page.goto(app("/login"));

  const usernameInput = page.getByTestId("login-username");
  const passwordInput = page.getByTestId("login-password");
  const submitBtn = page.getByTestId("login-submit");
  const recoveryTrigger = page.getByTestId("recovery-trigger");
  const langSwitcher = page.getByTestId("language-switcher");
  const themeToggle = page.getByTestId("theme-toggle");

  await expect(usernameInput).toBeVisible();
  await expect(usernameInput).toHaveAttribute("autocomplete", "username");

  await expect(passwordInput).toBeVisible();
  await expect(passwordInput).toHaveAttribute("type", "password");
  await expect(passwordInput).toHaveAttribute("autocomplete", "current-password");

  await expect(langSwitcher).toBeVisible();
  await expect(themeToggle).toBeVisible();

  await expect(submitBtn).toBeDisabled();
  await expect(recoveryTrigger).toBeVisible();
});

test("toggle de visibilidade da senha alterna entre password e text", async ({ page }) => {
  await page.goto(app("/login"));

  const passwordInput = page.getByTestId("login-password");
  await passwordInput.fill("minhasenha123");
  await expect(passwordInput).toHaveAttribute("type", "password");

  // Botão de toggle de senha
  const toggleBtn = page.getByRole("button", { name: /show password|mostrar senha|mostrar contraseña/i });
  await toggleBtn.click();
  await expect(passwordInput).toHaveAttribute("type", "text");

  const hideBtn = page.getByRole("button", { name: /hide password|ocultar senha|ocultar contraseña/i });
  await hideBtn.click();
  await expect(passwordInput).toHaveAttribute("type", "password");
});

test("habilita botão de entrar apenas com usuário e senha preenchidos", async ({ page }) => {
  await page.goto(app("/login"));

  const usernameInput = page.getByTestId("login-username");
  const passwordInput = page.getByTestId("login-password");
  const submitBtn = page.getByTestId("login-submit");

  await expect(submitBtn).toBeDisabled();
  await usernameInput.fill("root");
  await expect(submitBtn).toBeDisabled();
  await passwordInput.fill("password123");
  await expect(submitBtn).toBeEnabled();
});

test("login com usuário e senha não persiste segredo no localStorage", async ({ page }) => {
  await page.goto(app("/login"));

  await page.getByTestId("login-username").fill("root");
  await page.getByTestId("login-password").fill("senha_correta");
  await page.getByTestId("login-submit").click();

  await expect(page).not.toHaveURL(appUrl("/login"));
  const storedToken = await page.evaluate(() => window.localStorage.getItem("ai-memory-ui.token"));
  expect(storedToken).toBeNull();
});

test("transição para formulário de recuperação e retorno ao login", async ({ page }) => {
  await page.goto(app("/login"));

  await page.getByTestId("recovery-trigger").click();

  await expect(page.getByTestId("recovery-token")).toBeVisible();
  await expect(page.getByTestId("recovery-new-password")).toBeVisible();
  await expect(page.getByTestId("recovery-confirm-password")).toBeVisible();
  await expect(page.getByTestId("recovery-submit")).toBeDisabled();

  await page.getByTestId("recovery-back").click();

  await expect(page.getByTestId("login-username")).toBeVisible();
  await expect(page.getByTestId("login-password")).toBeVisible();
});

test("geometria responsiva sem overflow horizontal em 260x226, 390x844 e 1440x900", async ({ page }) => {
  // Teste em viewport ultra-compacta 260x226 (canvas / popup)
  await page.setViewportSize({ width: 260, height: 226 });
  await page.goto(app("/login"));

  const noHorizontalOverflow260 = await page.evaluate(() => {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  });
  expect(noHorizontalOverflow260).toBe(true);

  // Botões e inputs devem ser alcançáveis por scroll vertical
  await expect(page.getByTestId("login-username")).toBeVisible();
  await expect(page.getByTestId("login-password")).toBeVisible();

  // Teste em mobile 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  const noHorizontalOverflow390 = await page.evaluate(() => {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  });
  expect(noHorizontalOverflow390).toBe(true);

  // Teste em desktop 1440x900
  await page.setViewportSize({ width: 1440, height: 900 });
  const noHorizontalOverflow1440 = await page.evaluate(() => {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  });
  expect(noHorizontalOverflow1440).toBe(true);
});
