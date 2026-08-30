import { expect, test } from "@playwright/test";

import { app, appUrl } from "./app-path";

// A6 — shell da IA v2 contra dados de fixture (workspace "centralit").
//
// Substitui `overview.spec.ts`, que exercitava o chrome antigo (home hub,
// topbar com switcher, abas overview/documentos). Esse chrome foi removido no
// cutover: a navegação agora é a sidebar de dois níveis. Os fluxos que ainda
// fazem sentido (busca por paleta, navegar até um documento) foram preservados
// aqui em termos da IA nova.
//
// No modo fixtures a sonda de tier conclui como `root`, permitindo validar a
// navegação administrativa completa. A SPA carrega no baseLocale "en", então
// os seletores usam os textos ingleses.
//
// Os caminhos aqui NÃO levam o prefixo `/web`: o basepath do router vem do
// `<base href>` que o engine injeta, e o `vite dev` serve o index.html sem essa
// tag — em dev a app vive na raiz. Caminhos `/web/...` só casariam contra um
// engine real (E2E_BASE_URL), e em dev caem no notFound.

test("sidebar de servidor mostra os grupos e itens do protótipo", async ({ page }) => {
  await page.goto(app("/"));

  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Workspaces" })).toBeVisible();
  await expect(nav.getByText("Monitoring")).toBeVisible();
  await expect(nav.getByText("Administration")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Access" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Consumers" })).toBeVisible();
});

test("root oferece gerenciamento de Usuários", async ({ page }) => {
  await page.goto(app("/"));
  await expect(page.getByRole("link", { name: "Users", exact: true })).toBeVisible();
});

test("navega para uma tela administrativa pela sidebar", async ({ page }) => {
  await page.goto(app("/"));
  await page.getByRole("navigation").getByRole("link", { name: "Access" }).click();
  await expect(page).toHaveURL(appUrl("/access"));
});


test("menu de troca de senha abre o formulário autenticado", async ({ page }) => {
  await page.goto(app("/"));
  await page.getByRole("button", { name: /Root Operator/i }).click();
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(appUrl("/login"));
  await expect(page.getByLabel("Current password")).toBeVisible();
});

test("mobile oferece navegação por drawer e fecha com Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app("/"));

  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(nav).not.toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Access" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).not.toBeVisible();
});
test("entrar num escopo troca a sidebar e mostra a back row", async ({ page }) => {
  await page.goto(app("/s/centralit/smart-city"));

  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Wiki" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Handoffs" })).toBeVisible();
  // back row com o escopo ativo
  await expect(nav.getByText("centralit/smart-city")).toBeVisible();
  // breadcrumb no header do card
  await expect(page.getByRole("banner").getByText("smart-city")).toBeVisible();
});

test("o gatilho de busca abre a paleta", async ({ page }) => {
  await page.goto(app("/"));
  await page.getByTestId("search-trigger").click();
  await expect(page.getByRole("textbox", { name: /Search memory/i })).toBeVisible();
});

test("atalho de teclado abre a paleta de qualquer tela", async ({ page }) => {
  await page.goto(app("/access"));
  // O listener é global (window); o foco precisa estar na página para o
  // Playwright entregar a tecla ao documento e não ao chrome do browser.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+KeyK");
  await expect(page.getByRole("textbox", { name: /Search memory/i })).toBeVisible();
});

// Cutover: bookmarks da IA antiga continuam abrindo o alvo equivalente.
test("rota antiga de projeto redireciona para o escopo novo", async ({ page }) => {
  await page.goto(app("/projects/centralit/smart-city"));
  await expect(page).toHaveURL(/\/s\/centralit\/smart-city$/);
});

test("rota antiga de workspace redireciona para o detalhe do workspace", async ({ page }) => {
  await page.goto(app("/projects/centralit"));
  await expect(page).toHaveURL(/\/workspaces\/centralit$/);
});

test("rota antiga de página preserva o caminho do documento", async ({ page }) => {
  await page.goto(app("/projects/centralit/smart-city/pages/README.md"));
  await expect(page).toHaveURL(/\/s\/centralit\/smart-city\/pages\/README\.md$/);
});

// O router já decodifica params wildcard, então o redirect não pode decodificar
// de novo: um `%` solto estouraria `decodeURIComponent`. Um `%2F` literal não é
// testável aqui porque caminho de página é caminho de arquivo — nome de arquivo
// não contém `/` — mas `%20` e `%` solto chegam de bookmarks reais.
test("redirect preserva espaço codificado no caminho", async ({ page }) => {
  await page.goto(app("/projects/centralit/smart-city/pages/notes/a%20b.md"));
  await expect(page).toHaveURL(/\/s\/centralit\/smart-city\/pages\/notes\/a(%20|\s)b\.md$/);
});

test("redirect não estoura com percent solto no caminho", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app("/projects/centralit/smart-city/pages/notes/100%25.md"));
  await expect(page).toHaveURL(/\/s\/centralit\/smart-city\/pages\/notes\//);
  expect(errors).toEqual([]);
});
