import { ApiError } from "~/lib/api";
import { csrfHeaders } from "~/lib/auth";
import { BASE_PATH } from "~/lib/base-path";

// Cliente do sidecar mcp-auth (issue ops #9). As rotas `/keys*` NÃO são
// roteáveis no deploy atual — mux, helm e o compose de produção não as
// mapeiam — então 404/rede é um estado esperado da tela, não um bug da UI.
//
// Ordem do base: meta `ai-memory-keys-base` (borda injeta), senão
// `VITE_KEYS_BASE` (dev), senão `${BASE_PATH}/keys` (mesmo origin).

export interface KeyOwner {
  kind: "subject" | "user";
  label: string;
  issuer?: string;
  subject?: string;
}

export interface ConsumerKey {
  id: string;
  preview: string;
  actor_user: string;
  scopes: ("read" | "write" | "admin")[];
  owner: KeyOwner;
  /** Unix segundos — não microssegundos de `/admin/users`. */
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
}

export interface KeysWhoami {
  identity: KeyOwner | null;
  can_issue: boolean;
}

function keysBase(): string {
  if (typeof document !== "undefined") {
    const meta = document
      .querySelector('meta[name="ai-memory-keys-base"]')
      ?.getAttribute("content")
      ?.replace(/\/+$/, "");
    if (meta) return meta;
  }
  const fromEnv = import.meta.env.VITE_KEYS_BASE;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `${BASE_PATH}/keys`;
}

async function errorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const payload = JSON.parse(text) as { error?: string };
      return payload.error ?? text;
    } catch {
      return text.trim() || fallback;
    }
  } catch {
    return fallback;
  }
}

async function keysRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const method = (init?.method ?? "GET").toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  try {
    response = await fetch(`${keysBase()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(isMutation ? csrfHeaders() : {}),
        ...init?.headers,
      },
    });
  } catch {
    // Falha de rede / CORS / sidecar fora: status 0 para a tela ramificar
    // no banner "backend indisponível" em vez de um erro genérico.
    throw new ApiError(0, "keys backend unavailable");
  }
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    // DELETE sem corpo é sucesso; GET/POST HTML (SPA catch-all quando
    // `/keys` não está na borda) conta como sidecar ausente.
    if (method === "DELETE") return undefined as T;
    throw new ApiError(404, "keys backend unavailable");
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(404, "keys backend unavailable");
  }
}

export function listKeys(): Promise<ConsumerKey[]> {
  return keysRequest<{ keys?: ConsumerKey[] }>("").then((body) => body.keys ?? []);
}

export function whoami(): Promise<KeysWhoami> {
  return keysRequest<KeysWhoami>("/whoami");
}

export function createKey(input: {
  id: string;
  actor_user: string;
  scopes: string[];
  expires_at?: number;
}): Promise<ConsumerKey & { key: string }> {
  const body: {
    id: string;
    actor_user: string;
    scopes: string[];
    expires_at?: number;
  } = {
    id: input.id,
    actor_user: input.actor_user,
    scopes: input.scopes,
  };
  // Owner NUNCA vai no corpo: o sidecar deriva de callerIdentity. Mandar
  // owner aqui seria 400 no backend e contradiria o fail-closed do protótipo.
  if (input.expires_at !== undefined) body.expires_at = input.expires_at;
  return keysRequest<ConsumerKey & { key: string }>("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function revokeKey(id: string): Promise<void> {
  return keysRequest<void>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
