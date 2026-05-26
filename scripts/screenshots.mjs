// Captura screenshots da UI para o README/docs.
// Uso: BASE=http://127.0.0.1:49374/web node scripts/screenshots.mjs
// Requer um ai-memory rodando com --enable-web --web-ui-dir <dist> e dados.
import { chromium } from "@playwright/test";

const BASE = (process.env.BASE ?? "http://127.0.0.1:49374/web").replace(/\/$/, "");
const OUT = "docs/screenshots";

const shots = [
  { path: "/", file: "home.png" },
  { path: "/projects/centralit", file: "workspace-overview.png" },
  { path: "/projects/centralit/smart-city", file: "project-overview.png" },
  { path: "/projects/centralit/smart-city/pages/README.md", file: "document.png" },
];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

for (const { path, file } of shots) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(`✓ ${file}`);
}

// paleta de busca aberta
await page.goto(`${BASE}/projects/centralit`, { waitUntil: "networkidle" });
await page.getByTestId("search-trigger").click();
await page.getByRole("textbox", { name: /Search memory/i }).waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/search.png` });
console.log("✓ search.png");

await browser.close();
