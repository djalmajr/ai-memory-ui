// Captura screenshots da UI para o README/docs.
// Uso (fixtures):  BASE=http://localhost:5199/web node scripts/screenshots.mjs
//   (suba antes:   VITE_FIXTURES=1 npm run dev -- --port 5199 --strictPort)
// Uso (server real): BASE=http://127.0.0.1:49374/web node scripts/screenshots.mjs
//   requer um ai-memory rodando com --enable-web --web-ui-dir <dist> + dados.
import { chromium } from "@playwright/test";

const BASE = (process.env.BASE ?? "http://127.0.0.1:49374/web").replace(/\/$/, "");
const OUT = "docs/screenshots";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

async function shot(path, file, action) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  if (action) {
    await action();
  }
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(`✓ ${file}`);
}

// Home: lista de workspaces + faixa de stats.
await shot("/", "home.png");

// Workspace overview: handoff + projetos + briefing + saúde da memória.
await shot("/projects/centralit", "workspace-overview.png");

// Project overview: handoff + briefing + saúde escopados ao projeto.
await shot("/projects/centralit/smart-city", "project-overview.png");

// Documento: frontmatter (card) expandido + rodapé de referências/back-links.
await shot("/projects/centralit/smart-city/pages/README.md", "document.png", async () => {
  await page.locator('[data-testid="frontmatter"] summary').click();
  await page.waitForTimeout(200);
});

// Paleta de busca aberta.
await shot("/projects/centralit", "search.png", async () => {
  await page.getByTestId("search-trigger").click();
  await page.getByRole("textbox", { name: /Search memory/i }).waitFor();
  await page.waitForTimeout(300);
});

await browser.close();
