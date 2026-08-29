// Prefixo servido pelo engine (`AI_MEMORY_BASE_PATH`), não o mount da web —
// então não sai do `<base href>`. O servidor injeta
// `<meta name="ai-memory-base-path">` com esse prefixo (vazio na raiz do host).
//
// Vive num módulo próprio porque `api.ts` (dados) e `auth.ts` (sessão/tier)
// precisam do mesmo prefixo: `api.ts` importa `authHeaders` de `auth.ts`, e se
// `auth.ts` importasse o prefixo de `api.ts` fecharia um ciclo de módulos.
export function readBasePath(): string {
  if (typeof document === "undefined") return "";
  return (
    document
      .querySelector('meta[name="ai-memory-base-path"]')
      ?.getAttribute("content")
      ?.replace(/\/+$/, "") ?? ""
  );
}

// Raiz do engine: `/admin/*` e `/oauth2/*` penduram aqui.
export const BASE_PATH = readBasePath();

// Raiz da API de leitura. Vazio => `/api/v1` (default inalterado).
export const API_ROOT = `${BASE_PATH}/api/v1`;
