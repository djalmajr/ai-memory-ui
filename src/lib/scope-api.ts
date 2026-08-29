import { ApiError } from "~/lib/api";
import { authHeaders } from "~/lib/auth";
import { API_ROOT } from "~/lib/base-path";

// Cliente de `/api/v1/.../sessions` e `/handoffs`. `api.ts` não cobre essas
// rotas — o browser antigo era só wiki. Espelha o estilo de `requestJson`
// (Bearer quando houver chave; 401/400 em texto puro não passam por JSON.parse).
//
// Timestamps destas rotas são RFC3339. Identidades (`actor_user`, `owner`,
// `accepted_by`) são chaves de armazenamento (`user:…` / `oidc:…`), nunca nomes.

const USE_FIXTURES = import.meta.env.DEV && import.meta.env.VITE_FIXTURES === "1";

export const SESSION_LIST_DEFAULT = 20;
export const SESSION_LIST_MAX = 100;
export const OBSERVATION_LIST_DEFAULT = 50;
export const OBSERVATION_LIST_MAX = 200;
export const OBSERVATION_BODY_DEFAULT = 4000;
export const OBSERVATION_BODY_MIN = 200;
export const OBSERVATION_BODY_MAX = 16384;
export const HANDOFF_LIST_DEFAULT = 50;
export const HANDOFF_LIST_MAX = 200;

/** `ObservationKind::as_str` — kind desconhecido no filtro → 400. */
export const OBSERVATION_KINDS = [
  "session-start",
  "user-prompt",
  "pre-tool-use",
  "post-tool-use",
  "pre-compact",
  "post-compaction",
  "notification",
  "stop",
  "session-end",
  "other",
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export type ObservationOrder = "asc" | "desc";

export type HandoffState = "open" | "accepted" | "expired";

export const HANDOFF_STATES: readonly HandoffState[] = ["open", "accepted", "expired"];

export interface SessionSummary {
  session_id: string;
  cwd: string | null;
  agent_kind: string;
  started_at: string;
  ended_at: string | null;
  observation_count: number;
  actor_user: string | null;
}

export interface ObservationRecord {
  id: string;
  session_id: string;
  kind: string;
  title: string;
  body: string;
  importance: number;
  created_at: string;
  extension: string | null;
  source_event: string | null;
}

export interface SessionListResponse {
  sessions: SessionSummary[];
}

export interface SessionObservationsResponse {
  session: SessionSummary;
  observations: ObservationRecord[];
  total: number;
  offset: number;
  limit: number;
  order: ObservationOrder;
  elided_other_scope: number;
  body_max_chars: number;
}

export interface ListSessionsOptions {
  limit?: number;
  offset?: number;
  include_open?: boolean;
}

export interface ListObservationsOptions {
  limit?: number;
  offset?: number;
  order?: ObservationOrder;
  kinds?: string;
  q?: string;
  body_max_chars?: number;
}

/** Campos com `?` são omitidos pelo servidor (`skip_serializing_if`), não null. */
export interface ApiHandoffEntry {
  id: string;
  agent: string;
  at: string;
  state: string;
  summary?: string;
  open_questions?: string[];
  next_steps?: string[];
  redacted: boolean;
  files_touched: string[];
  cwd?: string;
  owner?: string;
  accepted_by?: string;
  accepted_at?: string;
}

export interface HandoffListResponse {
  handoffs: ApiHandoffEntry[];
}

export interface ListHandoffsOptions {
  state?: HandoffState;
  limit?: number;
  all_owners?: boolean;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...authHeaders(), ...init?.headers },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }

  return (await response.json()) as T;
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
      // 401 do host e 400 do extractor do axum chegam como text/plain.
      return text.trim() || fallback;
    }
  } catch {
    return fallback;
  }
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scopePath(workspace: string, project: string): string {
  return `/workspaces/${segment(workspace)}/projects/${segment(project)}`;
}

/** Chave de identidade (`user:…` / `oidc:…`) → rótulo + sufixo mascarado. */
export function labelIdentityKey(key: string | null | undefined): string {
  if (!key) return "—";
  const colon = key.indexOf(":");
  if (colon <= 0) return maskTail(key);
  return `${key.slice(0, colon)} · ${maskTail(key.slice(colon + 1))}`;
}

function maskTail(value: string): string {
  const compact = value.replace(/[^a-zA-Z0-9]/g, "");
  if (!compact) return "…";
  if (compact.length <= 6) return compact;
  return `…${compact.slice(-6)}`;
}

export function listSessions(
  workspace: string,
  project: string,
  options: ListSessionsOptions = {},
): Promise<SessionListResponse> {
  const limit = clamp(options.limit ?? SESSION_LIST_DEFAULT, 1, SESSION_LIST_MAX);
  const offset = Math.max(0, options.offset ?? 0);
  const include_open = options.include_open ?? false;
  if (USE_FIXTURES) {
    const sessions = fixtureSessions
      .filter((row) => include_open || row.ended_at !== null)
      .slice(offset, offset + limit);
    return Promise.resolve({ sessions });
  }
  return requestJson<SessionListResponse>(
    `${scopePath(workspace, project)}/sessions${query({ limit, offset, include_open })}`,
  );
}

export function listSessionObservations(
  workspace: string,
  project: string,
  sessionId: string,
  options: ListObservationsOptions = {},
): Promise<SessionObservationsResponse> {
  const limit = clamp(options.limit ?? OBSERVATION_LIST_DEFAULT, 1, OBSERVATION_LIST_MAX);
  const offset = Math.max(0, options.offset ?? 0);
  const order: ObservationOrder = options.order === "desc" ? "desc" : "asc";
  const body_max_chars = clamp(
    options.body_max_chars ?? OBSERVATION_BODY_DEFAULT,
    OBSERVATION_BODY_MIN,
    OBSERVATION_BODY_MAX,
  );
  if (USE_FIXTURES) {
    return Promise.resolve(fixtureObservations(sessionId, { limit, offset, order, body_max_chars }));
  }
  return requestJson<SessionObservationsResponse>(
    `${scopePath(workspace, project)}/sessions/${segment(sessionId)}/observations${query({
      limit,
      offset,
      order,
      kinds: options.kinds,
      q: options.q,
      body_max_chars,
    })}`,
  );
}

export function listHandoffs(
  workspace: string,
  project: string,
  options: ListHandoffsOptions = {},
): Promise<HandoffListResponse> {
  const limit = clamp(options.limit ?? HANDOFF_LIST_DEFAULT, 1, HANDOFF_LIST_MAX);
  if (USE_FIXTURES) {
    const state = options.state;
    const handoffs = fixtureHandoffs
      .filter((row) => (state ? row.state === state : true))
      .slice(0, limit);
    return Promise.resolve({ handoffs });
  }
  return requestJson<HandoffListResponse>(
    `${scopePath(workspace, project)}/handoffs${query({
      state: options.state,
      limit,
      all_owners: options.all_owners ? true : undefined,
    })}`,
  );
}

const fixtureSessions: SessionSummary[] = [
  {
    session_id: "11111111-1111-4111-8111-111111111111",
    cwd: "/src",
    agent_kind: "claude-code",
    started_at: "2026-08-28T10:00:00Z",
    ended_at: "2026-08-28T12:00:00Z",
    observation_count: 3,
    actor_user: "user:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  },
  {
    session_id: "22222222-2222-4222-8222-222222222222",
    cwd: null,
    agent_kind: "cursor",
    started_at: "2026-08-29T09:15:00Z",
    ended_at: null,
    observation_count: 2,
    actor_user: "oidc:https://idp.example/realms/memory|sub-xyz",
  },
];

const fixtureObservationRows: ObservationRecord[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    session_id: "11111111-1111-4111-8111-111111111111",
    kind: "session-start",
    title: "início",
    body: "sessão aberta em /src",
    importance: 3,
    created_at: "2026-08-28T10:00:00Z",
    extension: null,
    source_event: null,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    session_id: "11111111-1111-4111-8111-111111111111",
    kind: "user-prompt",
    title: "pedido",
    body: "implementar as telas de escopo\n[body truncated; 12 chars omitted]",
    importance: 5,
    created_at: "2026-08-28T10:05:00Z",
    extension: null,
    source_event: null,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    session_id: "11111111-1111-4111-8111-111111111111",
    kind: "session-end",
    title: "fim",
    body: "sessão encerrada",
    importance: 2,
    created_at: "2026-08-28T12:00:00Z",
    extension: null,
    source_event: null,
  },
];

function fixtureObservations(
  sessionId: string,
  opts: { limit: number; offset: number; order: ObservationOrder; body_max_chars: number },
): SessionObservationsResponse {
  const session = fixtureSessions.find((row) => row.session_id === sessionId) ?? fixtureSessions[0];
  const rows = fixtureObservationRows.filter((row) => row.session_id === sessionId);
  const ordered = opts.order === "desc" ? [...rows].reverse() : rows;
  return {
    session,
    observations: ordered.slice(opts.offset, opts.offset + opts.limit),
    total: ordered.length,
    offset: opts.offset,
    limit: opts.limit,
    order: opts.order,
    elided_other_scope: sessionId.startsWith("1111") ? 2 : 0,
    body_max_chars: opts.body_max_chars,
  };
}

const fixtureHandoffs: ApiHandoffEntry[] = [
  {
    id: "66666666-6666-4666-8666-666666666666",
    agent: "claude-code",
    at: "2026-08-28T12:01:00Z",
    state: "open",
    summary: "Telas de escopo a implementar.",
    open_questions: ["Qual o limite de pending writes?"],
    next_steps: ["Escrever as quatro rotas de escopo"],
    redacted: false,
    files_touched: ["src/screens/scope-sessions.tsx"],
    cwd: "/src",
    owner: "user:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    agent: "cursor",
    at: "2026-08-27T18:00:00Z",
    state: "accepted",
    redacted: true,
    files_touched: [],
    owner: "oidc:https://idp.example/realms/memory|sub-xyz",
    accepted_by: "user:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    accepted_at: "2026-08-27T18:30:00Z",
  },
];
