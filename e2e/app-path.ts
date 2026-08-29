// Caminho da app dentro do host sob teste.
//
// A SPA pode viver na raiz (vite dev, que serve index.html sem o `<base href>`
// injetado pelo engine) ou sob um prefixo (`/web`, `/wiki/web`, … num engine
// real via `E2E_BASE_URL`). O `baseURL` do Playwright resolve caminhos
// absolutos contra a ORIGEM: com `E2E_BASE_URL=http://host/web`, um
// `page.goto("/access")` iria para `http://host/access` e descartaria o
// prefixo. Este helper preserva o prefixo do base URL.
const base = process.env.E2E_BASE_URL ?? "";
const prefix = base ? new URL(base).pathname.replace(/\/+$/, "") : "";

export function app(path: string): string {
  return `${prefix}${path}`;
}

// Regex de URL esperada, ancorada no fim, já com o prefixo do deploy.
export function appUrl(pathPattern: string): RegExp {
  const escaped = `${prefix}${pathPattern}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}$`);
}
