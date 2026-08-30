// Tipos de `/admin/*`, transcritos dos structs Rust (`crates/ai-memory-mcp/src/admin.rs`
// e os tipos que ele serializa). Regra: nome do campo = nome no fio; `| null`
// quando o Rust é `Option<T>` sem `skip_serializing_if`; `?` quando é omitido.
//
// As unidades de tempo divergem por rota e não podem ser inferidas:
// - `/api/v1`                                  → string RFC3339
// - `users.*_at`, `staged_at`, `decided_at`     → i64 MICROssegundos
// - `checkpoints.time`                          → i64 SEGUNDOS Unix
// Use os helpers de `~/lib/datetime`, nunca `new Date(number)` direto.

export interface StatusCounts {
  pages_latest: number;
  pages_all: number;
  sessions: number;
  observations: number;
}

export interface EmbeddingTripleCount {
  provider: string;
  model: string;
  dim: number;
  count: number;
}

/** Conferido contra o fio de um engine 1.32.2: os nomes NÃO são `pages_fts` /
 *  `links` / `embeddings` como o nome do struct sugere. */
export interface DerivedIndexStatus {
  pages_rows: number;
  pages_fts_rows: number;
  observations_rows: number;
  observations_fts_rows: number;
  latest_pages_missing_embeddings: number;
  embedding_rows: number;
  embedding_triples: EmbeddingTripleCount[];
  links_from_latest_pages: number;
  unresolved_links_from_latest_pages: number;
  stale_links_from_latest_pages: number;
}

export interface ProviderRoleHealthSnapshot {
  status: string;
  provider: string | null;
  model: string | null;
  dim: number | null;
}

export interface ProviderHealthSnapshot {
  llm: ProviderRoleHealthSnapshot;
  embedding: ProviderRoleHealthSnapshot;
}

/** `GET /admin/status`. Única fonte observável de versão/bind/data_dir — o
 *  engine não expõe configuração efetiva nem identidade do chamador. */
export interface StatusReport {
  version: string;
  data_dir: string;
  bind: string;
  db_path: string;
  counts: StatusCounts;
  derived: DerivedIndexStatus;
  providers: ProviderHealthSnapshot;
  ingest: Record<string, number>;
}

/** `GET /admin/projects` → `{ projects }`. */
export interface AdminProjectSummary {
  workspace_name: string;
  project_name: string;
  page_count: number;
  last_updated: string | null;
}

/** `GET /admin/open-sessions` → exige `workspace` + `project` + `agent` exato. */
export interface OpenSessionEntry {
  session_id: string;
  cwd: string | null;
}

/** `GET /admin/sessions/by-agent` → escopado a workspace+project. */
export interface AgentSessionCount {
  agent: string;
  sessions: number;
}

/** `GET /admin/activity/by-client` → server-wide. Não existe `observations`. */
export interface ClientActivityCount {
  client: string;
  reads: number;
  writes: number;
}

export interface ContaminationFinding {
  check: string;
  confidence: string;
  entity_kind: string;
  entity_id: string;
  landed_workspace: string;
  landed_project: string;
  expected_project?: string;
  cwd?: string;
}

export interface ContaminationReport {
  summary: { sessions_misbucketed: number };
  findings: ContaminationFinding[];
}

/** `GET /admin/checkpoints` → array. `time` em SEGUNDOS Unix. */
export interface Checkpoint {
  oid: string;
  short_oid: string;
  time: number;
  summary: string;
}

export type CommitResult = { committed: true; oid: string } | { committed: false; reason: string };

export interface LintFinding {
  kind: string;
  severity: string;
  message: string;
  pages: string[];
  detail: string | null;
}

export interface LintReport {
  findings: LintFinding[];
}

export interface EmbedReport {
  embedded: number;
  skipped: number;
  failed: number;
  would_embed: number;
  provider: string;
  model: string;
  dim: number;
}

export interface EvictedPage {
  id: string;
  path: string;
  retention: number;
  age_days: number;
  access_count: number;
  deleted: boolean;
}

export interface ExpiredPage {
  id: string;
  path: string;
  expired_at: string;
  deleted: boolean;
}

export interface SweepReport {
  dry_run: boolean;
  candidates_evaluated: number;
  evicted: EvictedPage[];
  expired: ExpiredPage[];
  hard_deleted: number;
}

export interface CuratorFinding {
  kind: string;
  severity: string;
  message: string;
  pages: string[];
  detail?: unknown;
}

export interface CuratorReport {
  workspace: string;
  project: string;
  generated_at: string;
  dry_run: boolean;
  summary: string;
  findings: CuratorFinding[];
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "conflict" | "failed";

/** Item de `GET /admin/pending-writes` (array puro, ordenado `staged_at DESC`).
 *  `staged_at`/`decided_at` em MICROssegundos. */
export interface ProposalSummary {
  id: string;
  run_id: string;
  workspace_id: string;
  project_id: string;
  status: ProposalStatus;
  operation: "create" | "update";
  target_path: string;
  kind: string;
  title: string;
  confidence: number;
  staged_at: number;
  decided_at: number | null;
}

/** `GET /admin/pending-writes/{id}`. O `flatten` do Rust não achata `summary`. */
export interface ProposalDetail {
  summary: ProposalSummary;
  rationale: string;
  body_markdown: string;
  artifact_path: string;
  edit_mode: string;
  decision_reason: string | null;
  checkpoint: string | null;
  staged_by_actor_user: string | null;
}

export interface ProposalDiff {
  proposal_id: string;
  diff: string;
}

/** `approve` → 200 `approved` ou **409** `conflict` (alvo pinned ou mudou
 *  desde o staging). `reject` → 200 `rejected`. */
export type DecisionOutcome =
  | { status: "approved"; page_id: string }
  | { status: "conflict" }
  | { status: "rejected" };

/** Tabela `users`: pessoas com papel root/user, senha e estado humano.
 *  Timestamps em MICROssegundos. */
export interface AdminUser {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  role: "root" | "user";
  must_change_password: boolean;
  has_password: boolean;
  disabled_at: number | null;
  created_at: number;
  last_used_at: number | null;
  last_seen_at?: number | null;
}

/** `POST /admin/users` e `.../reset-password`: senha temporária em claro **uma única vez**. */
export interface UserWithPassword {
  user: AdminUser;
  temporary_password?: string;
  password?: string;
}

export type UserWithToken = UserWithPassword;

/** Credencial programática nativa (`aim_`) do engine. */
export interface ApiCredential {
  id: string;
  user_id: string;
  label: string;
  preview: string | null;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked_at?: number | null;
}

/** `POST /admin/api-credentials` e `.../rotate`: segredo em claro (`aim_…`) **uma única vez**. */
export interface CreatedApiCredential {
  credential: ApiCredential;
  token: string;
}

/** `AgentKind::as_str` — o engine recusa apelidos (`claude`, `opencode`). */
export const AGENT_KINDS = [
  "claude-code",
  "codex",
  "open-code",
  "cursor",
  "gemini-cli",
  "claude-desktop",
  "openclaw",
  "antigravity-cli",
  "omp",
  "pi",
  "crush",
  "grok",
  "zero",
  "devin",
  "kimi-code",
  "kiro-cli",
  "command-code",
  "hermes",
  "pool",
  "other",
] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];
