export interface ProjectSummary {
  workspace_name: string;
  project_name: string;
  page_count: number;
  last_updated: string | null;
}

export interface WorkspaceSummary {
  workspace_name: string;
  project_count: number;
  page_count: number;
  last_updated: string | null;
  current?: boolean;
}

/** A `WorkspaceSummary` with its `ProjectSummary[]` inline. Built by the
 *  UI on demand from `listWorkspaces()` + `listProjects()` (no extra API
 *  call needed). Used by the cascader switcher to render workspaces +
 *  their projects in one shot with search. */
export interface WorkspaceWithProjects extends WorkspaceSummary {
  projects: ProjectSummary[];
}

export interface PageSummary {
  path: string;
  title: string;
  kind: string;
  tier: string;
  updated_at: string;
}

export interface RelatedPage {
  path: string;
  title: string;
  kind: string;
}

export interface ApiPage {
  workspace: string;
  project: string;
  path: string;
  title: string;
  kind: string;
  tier: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  supersedes: string | null;
  frontmatter: Record<string, unknown>;
  body_markdown: string;
  links: RelatedPage[];
  backlinks: RelatedPage[];
}

export interface SearchHit {
  workspace: string;
  project: string;
  path: string;
  title: string;
  kind: string;
  snippet: string;
  rank: number;
}

export interface ActivityWindow {
  days: number;
  sessions: number;
  observations: number;
  pages_updated: number;
}

export interface BriefingPage {
  path: string;
  title: string;
  kind: string;
  updated_at: string;
}

export interface BriefingSnapshot {
  counts: {
    pages_latest: number;
    pages_all: number;
    sessions: number;
    observations: number;
  };
  activity_7d: ActivityWindow;
  activity_30d: ActivityWindow;
  last_observation_at: string | null;
  pending_handoff_count: number;
  rules: BriefingPage[];
  recent_pages: BriefingPage[];
}

export interface ProjectKey {
  workspace: string;
  project: string;
}

export interface SearchScope {
  workspace: string;
  project: string;
}

export interface WorkspaceHandoff {
  agent: string;
  at: string;
  project: string;
  summary: string;
  open_questions: string[];
  next_steps: string[];
}

export interface HealthPage {
  workspace: string;
  project: string;
  path: string;
  title: string;
  kind: string;
}

export interface MemoryHealth {
  stale: number;
  duplicates: number;
  contradictions: number;
  orphans: number;
  audited_at: string | null;
  stale_pages: HealthPage[];
  duplicate_pages: HealthPage[];
  orphan_pages: HealthPage[];
}

export interface WorkspaceOverview {
  handoff: WorkspaceHandoff | null;
  briefing: BriefingSnapshot;
  health: MemoryHealth;
}
