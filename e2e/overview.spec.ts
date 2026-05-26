import { expect, test } from "@playwright/test";

// Fluxo principal da SPA contra dados de fixture (workspace "centralit",
// projetos smart-city/front-manager/ops, handoff/briefing/health de exemplo).
// A SPA carrega no baseLocale "en", então os seletores usam os textos em inglês.

test("home lista o workspace e a faixa de stats", async ({ page }) => {
  await page.goto("/web/");
  // na home a busca é um botão hero (abre a paleta), não um input
  await expect(page.getByText(/Search all docs/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /centralit/i })).toBeVisible();
  await expect(page.getByText(/API connected/i)).toBeVisible();
});

test("workspace overview renderiza os cards do /extras (handoff, briefing, health)", async ({
  page,
}) => {
  await page.goto("/web/projects/centralit");

  await expect(page.getByText("Projects", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent documents", { exact: true })).toBeVisible();

  // handoff + aside (workspaceExtras): só existem se a API/fixture os fornece
  await expect(page.getByText("Continue where you left off")).toBeVisible();
  await expect(page.getByText("Briefing", { exact: true })).toBeVisible();
  await expect(page.getByText("Memory health")).toBeVisible();

  // projetos aparecem como linhas dentro do card
  await expect(page.getByText("smart-city").first()).toBeVisible();
});

test("navega da home para o overview ao clicar no workspace", async ({ page }) => {
  await page.goto("/web/");
  await page.getByRole("button", { name: /centralit/i }).click();
  await expect(page).toHaveURL(/\/projects\/centralit/);
  await expect(page.getByText("Briefing", { exact: true })).toBeVisible();
});

test("selecionar projeto no switcher navega para o overview do projeto", async ({ page }) => {
  await page.goto("/web/projects/centralit");
  await page.getByTestId("workspace-switcher").click();
  // item do projeto dentro do dropdown (popover)
  await page.locator(".bg-popover").getByText("smart-city", { exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/centralit\/smart-city/);
});

test("o gatilho de busca abre a paleta", async ({ page }) => {
  await page.goto("/web/projects/centralit");
  await page.getByTestId("search-trigger").click();
  // estado inicial da paleta: título "Ready" + input próprio
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /Search memory/i })).toBeVisible();
});
