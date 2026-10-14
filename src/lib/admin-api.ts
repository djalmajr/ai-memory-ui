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

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  return fetch(`${BASE_PATH}/admin${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(isMutation ? csrfHeaders() : {}),
      ...init?.headers,
    },
  });
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await adminFetch(path, init);

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// Corpo de erro de proxy (Cloudflare: `cloudflare_error: true`, `title`,
// `status`). Sem isso o operador via o JSON cru como se fosse a resposta do
// engine. O engine devolve `{ error }`, nunca `title`+`status`, então não há
// colisão.
function proxyErrorText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { title, status } = payload as { title?: unknown; status?: unknown };
  if (typeof title !== "string" || title === "") return null;
  if (typeof status !== "number" && typeof status !== "string") return null;
  return `${status} ${title}`;
}

async function errorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const payload = JSON.parse(text) as unknown;
      return proxyErrorText(payload) ?? (payload as { error?: string } | null)?.error ?? text;
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
// `absentStatuses` cobre rota que existe só para outro método: o axum responde
// 405, não 404, a um GET numa rota só-POST.
async function adminOptional<T>(
  path: string,
  init?: RequestInit,
  absentStatuses: readonly number[] = [404],
): Promise<T | null> {
  try {
    return await adminRequest<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && absentStatuses.includes(error.status)) return null;
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

/** Existe no engine atual. 404 (engine sem o leitor) => `null`. */
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

/** `detail` é string. O writer guarda o literal `"{}"`; não é payload. */
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

export interface CompactReport {
  bytes_before: number;
  bytes_after: number;
  bytes_reclaimed: number;
}

export type CompactState = "idle" | "running" | "succeeded" | "failed";

/** `GET /admin/compact` e corpo do 202/409. Sem percentual: o SQLite não
 *  reporta progresso de VACUUM. */
export interface CompactJobStatus {
  job_id: string | null;
  state: CompactState;
  started_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
  database_bytes_at_start: number | null;
  reclaimable_bytes_at_start: number | null;
  previous_duration_ms: number | null;
  report: CompactReport | null;
  error: string | null;
}

/** Os desfechos de `POST /admin/compact` com `background: true`. */
export type CompactStart =
  | { kind: "started"; job: CompactJobStatus }
  | { kind: "running"; job: CompactJobStatus | null }
  | { kind: "report"; report: CompactReport }
  | { kind: "timeout"; status: 504 | 524 };

/** Lock exclusivo + VACUUM. `confirm` é obrigatório no engine. Com
 *  `background` o engine responde 202 na hora; um engine antigo ignora o campo
 *  e roda síncrono (200, ou 504/524 do proxy aos 120 s com o VACUUM ainda
 *  correndo). 409 e 504/524 são desfechos, não falhas: voltam como valor. */
export async function adminCompact(): Promise<CompactStart> {
  const response = await adminFetch("/compact", json({ confirm: true, background: true }));
  switch (response.status) {
    case 202:
      return { kind: "started", job: (await response.json()) as CompactJobStatus };
    case 200:
      return { kind: "report", report: (await response.json()) as CompactReport };
    case 409: {
      const body = (await response.json().catch(() => null)) as { job?: CompactJobStatus } | null;
      return { kind: "running", job: body?.job ?? null };
    }
    case 504:
    case 524:
      return { kind: "timeout", status: response.status };
    default:
      throw new ApiError(response.status, await errorMessage(response));
  }
}

/** Teto do GET de estado. Sem ele um fetch pendurado deixaria o poll "em voo"
 *  para sempre e a cadeia de polling nunca mais andaria. */
export const COMPACT_STATUS_TIMEOUT_MS = 10_000;

/** `GET /admin/compact`. 404 e 405 (engine sem a rota; o axum devolve 405 a um
 *  GET numa rota só-POST) => `null`: a tela cai no fluxo síncrono. Estourar o
 *  teto rejeita como qualquer outra falha de poll. */
export function adminCompactStatus(): Promise<CompactJobStatus | null> {
  return adminOptional<CompactJobStatus>(
    "/compact",
    { signal: AbortSignal.timeout(COMPACT_STATUS_TIMEOUT_MS) },
    [404, 405],
  );
}

// Helpers puros da contagem e do polling; ficam aqui (e não no componente) para
// os testes não carregarem a árvore de UI.
/** `mm:ss`. Minutos não truncam em 59: um VACUUM de 1 h mostra `60:00`. */
export function formatElapsed(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1_000) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Duração aproximada ("cerca de X"). `s` e `min` valem nos três idiomas. */
export function formatApproxDuration(ms: number): string {
  const seconds = Number.isFinite(ms) && ms > 0 ? ms / 1_000 : 0;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  return `${Math.round(seconds / 60)} min`;
}

/** Tempo decorrido a partir de `started_at`, para a contagem de 1 s entre os
 *  polls. Se o relógio do servidor estiver à frente, não passa de zero. Sem
 *  `started_at` legível, usa o `elapsed_ms` do último poll. */
export function elapsedSince(job: CompactJobStatus, nowMs: number): number {
  const started = job.started_at ? Date.parse(job.started_at) : Number.NaN;
  if (Number.isNaN(started)) return job.elapsed_ms ?? 0;
  return Math.max(0, nowMs - started);
}

/** Só o estado `running` mantém o polling vivo. */
export function shouldKeepPolling(job: CompactJobStatus | null): boolean {
  return job?.state === "running";
}

// Agendador do polling: máquina de estados pura sobre
// `{ inFlight, queued, generation, running, disposed }`. O componente só liga
// timers e fetch às transições. Duas regras vêm de bugs reais do Solid 2:
// - decide-se pelo job RECEBIDO, nunca por um sinal: a escrita só é visível
//   depois do flush em microtask;
// - um poll pedido enquanto outro está em voo vira `queued` e roda quando o
//   ciclo em voo termina, mesmo que o resultado dele seja descartado por
//   `generation`.
export interface CompactPollState {
  inFlight: boolean;
  queued: boolean;
  /** Sobe quando o POST decide o estado; resultados de GETs anteriores são velhos. */
  generation: number;
  /** Último estado conhecido do job era `running`. */
  running: boolean;
  disposed: boolean;
}

export function createCompactPoll(): CompactPollState {
  return { inFlight: false, queued: false, generation: 0, running: false, disposed: false };
}

/** Pedido de poll (mount, timer). Em voo: marca `queued` e não roda. */
export function pollRequested(s: CompactPollState): { state: CompactPollState; run: boolean } {
  if (s.disposed) return { state: s, run: false };
  if (s.inFlight) return { state: { ...s, queued: true }, run: false };
  return { state: s, run: true };
}

/** O GET sai. `token` identifica a geração em que ele partiu. */
export function pollStarted(s: CompactPollState): { state: CompactPollState; token: number } {
  return { state: { ...s, inFlight: true, queued: false }, token: s.generation };
}

export interface CompactPollSettled {
  state: CompactPollState;
  /** `false`: resultado de geração velha ou tela desmontada; não escrever. */
  apply: boolean;
  /** Agendar o próximo poll. */
  next: boolean;
}

/** GET respondeu. `job` null = engine sem a rota (404/405). */
export function pollSucceeded(
  s: CompactPollState,
  token: number,
  job: CompactJobStatus | null,
): CompactPollSettled {
  const apply = !s.disposed && token === s.generation;
  const running = apply ? shouldKeepPolling(job) : s.running;
  const state = { ...s, inFlight: false, running };
  return { state, apply, next: !s.disposed && (s.queued || running) };
}

/** GET falhou (rede, proxy, teto de tempo). Com job `running` a cadeia segue. */
export function pollFailed(s: CompactPollState, token: number): CompactPollSettled {
  const apply = !s.disposed && token === s.generation;
  const state = { ...s, inFlight: false };
  return { state, apply, next: !s.disposed && (s.queued || s.running) };
}

/** O POST decidiu o estado (`job` null: report, timeout ou 409 sem job). */
export function pollJobDecided(s: CompactPollState, job: CompactJobStatus | null): CompactPollState {
  return { ...s, generation: s.generation + 1, running: shouldKeepPolling(job) };
}

export function pollDisposed(s: CompactPollState): CompactPollState {
  return { ...s, disposed: true, queued: false };
}


/** `POST /admin/export-okf?workspace&project` — tarball gzip. */
export async function adminExportOkf(scope: ScopeArgs): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(
    `${BASE_PATH}/admin/export-okf${query({ project: scope.project, workspace: scope.workspace })}`,
    {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
    },
  );
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ?? "okf-bundle.tar.gz" };
}

export function adminExpireHandoffs(scope: ScopeArgs): Promise<{ expired: number }> {
  return adminRequest<{ expired: number }>("/handoffs/expire", json({ ...scope, confirm: true }));
}

export function adminPurgeSession(scope: ScopeArgs, sessionId: string): Promise<unknown> {
  return adminRequest<unknown>(
    "/purge-session",
    json({ ...scope, session_id: sessionId, confirm: true }),
  );
}

/** Sem `confirm` o engine devolve dry-run (`dry_run: true`) e não escreve. */
export function adminMoveSession(input: {
  session_id: string;
  project: string;
  workspace?: string;
  confirm: boolean;
}): Promise<unknown> {
  return adminRequest<unknown>("/move-session", json(input));
}

export function adminExpireUser(username: string): Promise<AdminUser> {
  return adminRequest<{ user: AdminUser }>(`/users/${encodeURIComponent(username)}/expire`, {
    method: "POST",
  }).then((r) => r.user);
}

export function adminReviveUser(username: string): Promise<AdminUser> {
  return adminRequest<{ user: AdminUser }>(`/users/${encodeURIComponent(username)}/revive`, {
    method: "POST",
  }).then((r) => r.user);
}

export function adminWritePage(input: {
  workspace: string;
  project: string;
  path: string;
  body: string;
  title?: string;
  kind?: string;
  tier?: string;
  tags?: string[];
  pinned?: boolean;
}): Promise<{ page_id: string; path: string }> {
  return adminRequest<{ page_id: string; path: string }>("/write-page", json(input));
}

export function adminDeletePage(
  scope: ScopeArgs,
  path: string,
): Promise<{ deleted: boolean; path: string }> {
  return adminRequest<{ deleted: boolean; path: string }>("/delete-page", json({ ...scope, path }));
}

export interface AgentMessageView {
  id: string;
  subject: string | null;
  body: string;
  state: "pending" | "claimed" | "cancelled";
  created_at: string;
  from_agent: string;
  from_owner_user: string | null;
  from_workspace_id: string;
  from_project_id: string;
}

export function adminMessages(
  scope: ScopeArgs,
  box: "inbox" | "outbox",
  limit = 50,
): Promise<AgentMessageView[]> {
  return adminRequest<{ messages: AgentMessageView[] }>(
    `/messages${query({ box, limit, project: scope.project, workspace: scope.workspace })}`,
  ).then((r) => r.messages);
}

export function adminSendMessage(input: {
  from_workspace: string;
  from_project: string;
  to_workspace: string;
  to_project: string;
  subject?: string;
  body: string;
}): Promise<{ message_id: string }> {
  return adminRequest<{ message_id: string }>("/messages/send", json(input));
}

export function adminPopMessage(
  scope: ScopeArgs,
  messageId?: string,
): Promise<{ message: AgentMessageView | null; security_notice?: string }> {
  return adminRequest("/messages/pop", json({ ...scope, message_id: messageId }));
}

export function adminCancelMessage(
  scope: ScopeArgs,
  messageId?: string,
): Promise<{ cancelled: number }> {
  return adminRequest("/messages/cancel", json({ ...scope, message_id: messageId }));
}
