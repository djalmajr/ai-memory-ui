import { ApiError } from "~/lib/api";
import { csrfHeaders } from "~/lib/auth";
import { BASE_PATH } from "~/lib/base-path";
import type {
  AdminProjectSummary,
  AdminUser,
  AgentSessionCount,
  ApiCredential,
  Checkpoint,
  ClientActivityCount,
  CommitResult,
  ContaminationReport,
  CreatedApiCredential,
  CuratorReport,
  DecisionOutcome,
  EmbedReport,
  LintReport,
  OpenSessionEntry,
  ProposalDetail,
  ProposalDiff,
  ProposalStatus,
  ProposalSummary,
  StatusReport,
  SweepReport,
  UserWithPassword,
} from "~/lib/admin-types";

// Cliente de `/admin/*`. Diferente de `/api/v1`, estas rotas penduram na raiz
// do base path e exigem capability (Admin, ou UserManagement root-only).
//
// Dois detalhes do engine moldam o tratamento de erro:
// - query obrigatória ausente => 400 em `text/plain` do extractor do axum,
//   não `{error}`;
// - 401 do host => `text/plain` ("auth required\n").
// Por isso o parser de erro tenta JSON e cai para texto, nunca o contrário.

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const response = await fetch(`${BASE_PATH}/admin${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(isMutation ? csrfHeaders() : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
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
      // 400 do extractor e 401 do host são texto puro.
      return text.trim() || fallback;
    }
  } catch {
    return fallback;
  }
}

// Rotas ausentes (engine mais antigo que a UI) degradam para `null` em vez de
// derrubar a tela — o mesmo contrato que `api.ts` usa para overview/briefing.
async function adminOptional<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await adminRequest<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export interface ScopeArgs {
  workspace: string;
  project: string;
}

/* ---------- estado do servidor ---------- */

export function adminStatus(): Promise<StatusReport> {
  return adminRequest<StatusReport>("/status");
}

export function adminProjects(): Promise<AdminProjectSummary[]> {
  return adminRequest<{ projects: AdminProjectSummary[] }>("/projects").then((r) => r.projects);
}

/** `limit` default 20 no engine, clamp 1..100. `time` volta em segundos. */
export function adminCheckpoints(limit = 20): Promise<Checkpoint[]> {
  return adminRequest<Checkpoint[]>(`/checkpoints${query({ limit })}`);
}

/* ---------- monitoramento ---------- */

/** Server-wide. `since_days=0` (default do engine) = todo o histórico. */
export function adminActivityByClient(sinceDays = 0): Promise<ClientActivityCount[]> {
  return adminRequest<{ by_client: ClientActivityCount[] }>(
    `/activity/by-client${query({ since_days: sinceDays })}`,
  ).then((r) => r.by_client);
}

/** Escopado: não existe agregado server-wide de sessões por agente. */
export function adminSessionsByAgent(
  scope: ScopeArgs,
  sinceDays = 0,
): Promise<AgentSessionCount[]> {
  return adminRequest<{ by_agent: AgentSessionCount[] }>(
    `/sessions/by-agent${query({ ...scope, since_days: sinceDays })}`,
  ).then((r) => r.by_agent);
}

/** `agent` é obrigatório e precisa ser exatamente um `AgentKind::as_str`. */
export function adminOpenSessions(
  scope: ScopeArgs,
  agent: string,
  all = true,
): Promise<OpenSessionEntry[]> {
  return adminRequest<{ sessions: OpenSessionEntry[] }>(
    `/open-sessions${query({ ...scope, agent, all })}`,
  ).then((r) => r.sessions);
}

/** `workspace`+`project` só juntos; omitir ambos audita todos os projetos. */
export function adminAuditContamination(scope?: ScopeArgs): Promise<ContaminationReport> {
  return adminRequest<ContaminationReport>(`/audit-contamination${query({ ...scope })}`);
}

/** Não existe em engines anteriores ao PR do leitor: 404 => `null`. */
export function adminAuditLog(params: {
  workspace?: string;
  project?: string;
  op?: string;
  before_id?: number;
  limit?: number;
}): Promise<AuditEvent[] | null> {
  return adminOptional<{ events: AuditEvent[] }>(`/audit-log${query(params)}`).then(
    (r) => r?.events ?? null,
  );
}

/** `detail` é sempre `"{}"` hoje: a única inserção de `audit_log` grava
 *  literal. Exposto por fidelidade ao schema, não como payload útil. */
export interface AuditEvent {
  id: number;
  at: number;
  op: string;
  workspace: string | null;
  project: string | null;
  page_path: string | null;
  author_username: string | null;
  detail: string;
}

/* ---------- operações de servidor ---------- */

/** Sem body. Responde `application/gzip` com `Content-Disposition`. */
export async function adminBackup(): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${BASE_PATH}/admin/backup`, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ?? "backup.tar.gz" };
}

export function adminCommit(message: string): Promise<CommitResult> {
  return adminRequest<CommitResult>("/commit", json({ message }));
}

/** Não aceita workspace: o handler usa `"default"` fixo. */
export function adminReorg(dryRun: boolean): Promise<unknown> {
  return adminRequest<unknown>("/reorg", json({ dry_run: dryRun }));
}

/* ---------- operações de projeto ---------- */

export function adminLint(
  scope: ScopeArgs,
  options: { dry_run?: boolean; no_llm?: boolean } = {},
): Promise<LintReport> {
  return adminRequest<LintReport>("/lint", json({ ...scope, ...options }));
}

export function adminEmbed(
  scope: ScopeArgs,
  options: { reembed?: boolean; dry_run?: boolean; all_projects?: boolean } = {},
): Promise<EmbedReport> {
  return adminRequest<EmbedReport>("/embed", json({ ...scope, ...options }));
}

export function adminForgetSweep(scope: ScopeArgs, dryRun = false): Promise<SweepReport> {
  return adminRequest<SweepReport>("/forget-sweep", json({ ...scope, dry_run: dryRun }));
}

/** `session_id` é obrigatório — sem sessão o engine recusa o request. */
export function adminAutoImprove(
  scope: ScopeArgs,
  sessionId: string,
  options: { dry_run?: boolean } = {},
): Promise<unknown> {
  return adminRequest<unknown>(
    "/auto-improve",
    json({ ...scope, session_id: sessionId, ...options }),
  );
}

export function adminCurator(
  scope: ScopeArgs,
  options: { dry_run?: boolean; stage?: boolean } = {},
): Promise<CuratorReport> {
  return adminRequest<CuratorReport>("/curator", json({ ...scope, ...options }));
}

/* ---------- pending writes ---------- */

/** Array puro. `limit` default 50, clamp 1..200, sem cursor. */
export function adminPendingWrites(
  scope: ScopeArgs,
  options: { status?: ProposalStatus; limit?: number } = {},
): Promise<ProposalSummary[]> {
  return adminRequest<ProposalSummary[]>(`/pending-writes${query({ ...scope, ...options })}`);
}

export function adminPendingWrite(scope: ScopeArgs, id: string): Promise<ProposalDetail> {
  return adminRequest<ProposalDetail>(
    `/pending-writes/${encodeURIComponent(id)}${query({ ...scope })}`,
  );
}

export function adminPendingWriteDiff(scope: ScopeArgs, id: string): Promise<ProposalDiff> {
  return adminRequest<ProposalDiff>(
    `/pending-writes/${encodeURIComponent(id)}/diff${query({ ...scope })}`,
  );
}

/** 409 (`conflict`) é resposta de negócio, não falha: devolvida como valor. */
export async function adminApprovePendingWrite(
  scope: ScopeArgs,
  id: string,
): Promise<DecisionOutcome> {
  try {
    return await adminRequest<DecisionOutcome>(
      `/pending-writes/${encodeURIComponent(id)}/approve${query({ ...scope })}`,
      { method: "POST" },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { status: "conflict" };
    }
    throw error;
  }
}

export function adminRejectPendingWrite(
  scope: ScopeArgs,
  id: string,
  reason: string,
): Promise<DecisionOutcome> {
  return adminRequest<DecisionOutcome>(
    `/pending-writes/${encodeURIComponent(id)}/reject${query({ ...scope })}`,
    json({ reason }),
  );
}

/* ---------- usuários ---------- */

export function adminUsers(): Promise<AdminUser[]> {
  return adminRequest<{ users: AdminUser[] }>("/users").then((r) => r.users);
}

/** 200 com a senha temporária em claro gerada pelo servidor; revelada uma única vez. */
export function adminCreateUser(input: {
  username: string;
  name?: string;
  email?: string;
  role?: "root" | "user";
}): Promise<UserWithPassword> {
  return adminRequest<UserWithPassword>("/users", json(input));
}

export function adminResetUserPassword(username: string): Promise<UserWithPassword> {
  return adminRequest<UserWithPassword>(`/users/${encodeURIComponent(username)}/reset-password`, {
    method: "POST",
  });
}

export function adminEnableUser(username: string): Promise<AdminUser> {
  return adminRequest<{ user: AdminUser }>(`/users/${encodeURIComponent(username)}/enable`, {
    method: "POST",
  }).then((r) => r.user);
}

export function adminDisableUser(username: string): Promise<AdminUser> {
  return adminRequest<{ user: AdminUser }>(`/users/${encodeURIComponent(username)}/disable`, {
    method: "POST",
  }).then((r) => r.user);
}

export function adminUpdateUser(
  username: string,
  input: { name?: string | null; email?: string | null; role?: "root" | "user" },
): Promise<AdminUser> {
  return adminRequest<{ user: AdminUser }>(`/users/${encodeURIComponent(username)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((r) => r.user);
}

/* ---------- credenciais programáticas nativas (aim_) ---------- */

export function adminApiCredentials(): Promise<ApiCredential[]> {
  return adminRequest<{ credentials: ApiCredential[] }>("/api-credentials").then(
    (r) => r.credentials ?? [],
  );
}

export function adminCreateApiCredential(input: {
  username: string;
  label: string;
}): Promise<CreatedApiCredential> {
  return adminRequest<CreatedApiCredential>("/api-credentials", json(input));
}

export function adminRotateApiCredential(id: string): Promise<CreatedApiCredential> {
  return adminRequest<CreatedApiCredential>(
    `/api-credentials/${encodeURIComponent(id)}/rotate`,
    { method: "POST" },
  );
}

export function adminRevokeApiCredential(id: string): Promise<void> {
  return adminRequest<void>(`/api-credentials/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
  });
}

/* ---------- páginas e escopos ---------- */

/** `rev` é uma revisão git (commit OID). Não existe histórico por página: o
 *  seletor vem de `adminCheckpoints`. */
export function adminRestorePage(
  scope: ScopeArgs,
  path: string,
  rev: string,
): Promise<unknown> {
  return adminRequest<unknown>("/restore-page", json({ ...scope, path, rev }));
}

export function adminRenameWorkspace(from: string, to: string): Promise<unknown> {
  return adminRequest<unknown>("/rename-workspace", json({ from, to }));
}

export function adminMergeWorkspace(
  from: string,
  to: string,
  options: { force?: boolean; on_conflict?: "block" | "overwrite" | "duplicate" } = {},
): Promise<unknown> {
  return adminRequest<unknown>(
    "/merge-workspace",
    json({ from, to, confirm: true, ...options }),
  );
}

export function adminDeleteWorkspace(workspace: string, force = false): Promise<unknown> {
  return adminRequest<unknown>("/delete-workspace", json({ workspace, force }));
}

export function adminRenameProject(
  workspace: string,
  from: string,
  to: string,
): Promise<unknown> {
  return adminRequest<unknown>("/rename-project", json({ workspace, from, to }));
}

/** `confirm` não tem default no engine: omitir dá 422. */
export function adminPurgeProject(scope: ScopeArgs, force = false): Promise<unknown> {
  return adminRequest<unknown>("/purge-project", json({ ...scope, confirm: true, force }));
}

export function adminMoveProject(input: {
  from_workspace: string;
  project: string;
  to_workspace: string;
  force?: boolean;
  on_conflict?: "block" | "overwrite" | "duplicate";
}): Promise<unknown> {
  return adminRequest<unknown>("/move-project", json({ ...input, confirm: true }));
}
