import { expect, test, type Page } from "@playwright/test";

import { app } from "./app-path";

// Sidebar colapsável (modo ícones, padrão pinar): largura fixa de 220px, rail
// de 52px, estado em localStorage — o ciclo completo (colapsar → rail só de
// ícones → reload persiste → expandir restaura) é coberto aqui, incluindo o
// drawer mobile. O redimensionamento por alça foi removido por decisão de design.

const DESKTOP_NAV = 'nav[aria-label="Primary navigation"]:not(.fixed)';
const COLLAPSED = 52;

async function navWidth(page: Page): Promise<number> {
  const box = await page.locator(DESKTOP_NAV).boundingBox();
  return Math.round(box?.width ?? 0);
}

test("colapsa pelo trigger, persiste no reload e expande de volta", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(app("/"));

  const nav = page.locator(DESKTOP_NAV);
  await expect(nav.getByText("Monitoring")).toBeVisible();
  expect(await navWidth(page)).toBeGreaterThan(200);

  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect
    .poll(() => navWidth(page))
    .toBeLessThanOrEqual(COLLAPSED + 2);
  // Rail só de ícones: rótulos e grupos somem, mas o link segue nomeado.
  await expect(nav.getByText("Monitoring")).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("ai-memory-ui.sidebar-collapsed")))
    .toBe("1");

  await page.reload();
  await expect(page.locator(DESKTOP_NAV)).toBeVisible();
  await expect
    .poll(() => navWidth(page))
    .toBeLessThanOrEqual(COLLAPSED + 2);

  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect.poll(() => navWidth(page)).toBeGreaterThan(200);
  await expect(nav.getByText("Monitoring")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("ai-memory-ui.sidebar-collapsed")))
    .toBe("0");
});


test("drawer mobile continua completo mesmo com o desktop colapsado", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(app("/"));
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect.poll(() => navWidth(page)).toBeLessThanOrEqual(COLLAPSED + 2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(drawer.getByText("Monitoring")).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(drawer.getByText("Overview")).toBeVisible();
});
