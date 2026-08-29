import {
  Activity,
  Box,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  FileText,
  History,
  ShieldCheck,
} from "lucide-solid";
import { For, Show, createMemo, createSignal } from "solid-js";

import type { ProjectPages } from "~/components/file-tree";
import { KindBadge, Metric } from "~/components/ui-bits";
import { formatDateShort, formatRelative } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import type {
  BriefingSnapshot,
  HealthPage,
  MemoryHealth,
  PageSummary,
  ProjectKey,
  ProjectSummary,
  WorkspaceHandoff,
  WorkspaceOverview,
} from "~/lib/types";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

export function ProjectOverviewBody(props: {
  briefing: BriefingSnapshot | null;
  overview: WorkspaceOverview | null;
  onOpenDoc: (path: string) => void;
  recent: PageSummary[];
}) {
  // Project overview (when available) carry a project-scoped briefing; fall back
  // to the standalone briefing query that also feeds the documents inspector.
  const briefing = () => props.overview?.briefing ?? props.briefing;
  return (
    <div class="flex flex-col gap-6">
      <Show when={props.overview?.handoff}>{(h) => <HandoffCard handoff={h()} />}</Show>
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] gap-5 max-lg:grid-cols-1">
        <section class="min-w-0 rounded-lg border bg-card p-1.5">
          <div class="mb-1 flex items-center gap-2 px-2 pt-1.5 text-sm font-semibold">
            <Clock3 class="text-muted-foreground" size={15} />
            {t(() => m.inspector_recent())}
          </div>
          <div class="flex flex-col">
            <For each={props.recent}>
              {(item) => (
                <button
                  class="flex items-center gap-2 rounded-md p-2 text-left outline-none transition hover:bg-hover"
                  type="button"
                  onClick={() => props.onOpenDoc(item.path)}
                >
                  <FileText class="shrink-0 text-muted-foreground" size={15} />
                  <span class="flex min-w-0 flex-1 flex-col">
                    <strong class="truncate text-sm font-medium leading-tight">{item.title}</strong>
                    <small class="truncate text-xs text-muted-foreground">{item.path}</small>
                  </span>
                  <Show when={item.kind && item.kind.toLowerCase() !== "note"}>
                    <KindBadge kind={item.kind} />
                  </Show>
                  <small class="shrink-0 text-xs text-muted-foreground">{formatDateShort(item.updated_at)}</small>
                </button>
              )}
            </For>
          </div>
        </section>
        <aside class="flex min-w-0 flex-col gap-4">
          <div class="rounded-lg border bg-card p-4">
            <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck class="text-muted-foreground" size={15} />
              {t(() => m.inspector_briefing())}
            </div>
            <Show
              fallback={<small class="text-xs text-muted-foreground">{t(() => m.palette_searching())}</small>}
              when={briefing()}
            >
              {/* o handoff já aparece no card do topo quando há overview; evita duplicar o aviso */}
              {(snapshot) => <BriefingView briefing={snapshot()} hidePendingHandoff={Boolean(props.overview?.handoff)} />}
            </Show>
          </div>
          <Show when={props.overview?.health}>
            {(health) => <HealthCard health={health()} onOpenDoc={(_project, path) => props.onOpenDoc(path)} />}
          </Show>
        </aside>
      </div>
    </div>
  );
}

export function kindCounts(pages: PageSummary[]): { count: number; kind: string }[] {
  const map = new Map<string, number>();
  for (const page of pages) {
    map.set(page.kind, (map.get(page.kind) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([kind, count]) => ({ count, kind }))
    .sort((a, b) => b.count - a.count);
}

export function workspaceRecentDocs(entries: ProjectPages[]): (PageSummary & { project: string })[] {
  return entries
    .flatMap((entry) => entry.pages.map((page) => ({ ...page, project: entry.project })))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 6);
}

export function HealthRow(props: {
  label: string;
  value: number;
  pages?: HealthPage[];
  onOpenDoc?: (project: string, path: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const expandable = () => (props.pages?.length ?? 0) > 0;
  return (
    <div>
      <button
        class="flex w-full items-center justify-between gap-2 text-left outline-none"
        disabled={!expandable()}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span class="flex items-center gap-1 text-muted-foreground">
          <ChevronRight
            class={cn("transition", expandable() ? "opacity-100" : "opacity-0")}
            classList={{ "rotate-90": open() }}
            size={13}
          />
          {props.label}
        </span>
        <span
          class={cn(
            "grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold",
            props.value > 0 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {props.value}
        </span>
      </button>
      <Show when={open() && expandable()}>
        <ul class="mt-1.5 flex flex-col gap-0.5 border-l pl-3" data-testid="health-detail">
          <For each={props.pages}>
            {(item) => (
              <li>
                <button
                  class="flex w-full items-center gap-2 rounded-md p-1 text-left text-xs outline-none transition hover:bg-hover"
                  onClick={() => props.onOpenDoc?.(item.project, item.path)}
                  type="button"
                >
                  <KindBadge kind={item.kind} />
                  <span class="min-w-0 truncate">{item.title}</span>
                  <span class="ml-auto shrink-0 truncate font-mono text-[10px] text-muted-foreground/70">
                    {item.project}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

export function HandoffCard(props: { handoff: WorkspaceHandoff }) {
  const copy = () => {
    const h = props.handoff;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(
        `${h.summary}\n\n${t(() => m.ws_handoff_questions())}:\n- ${h.open_questions.join("\n- ")}\n\n${t(() => m.ws_handoff_next())}:\n- ${h.next_steps.join("\n- ")}`,
      );
    }
  };
  return (
    <section class="rounded-xl border border-primary/30 bg-accent/40 p-5" data-testid="handoff-card">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <History class="shrink-0 text-primary" size={20} />
          <div>
            <h2 class="text-base font-semibold">{t(() => m.ws_handoff_title())}</h2>
            <p class="text-xs text-muted-foreground">
              handoff · {props.handoff.agent} · {formatRelative(props.handoff.at)} · {props.handoff.project}
            </p>
          </div>
        </div>
        <button
          class="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onClick={copy}
        >
          <Copy size={14} /> {t(() => m.ws_handoff_copy())}
        </button>
      </div>
      <p class="mt-3 text-sm">{props.handoff.summary}</p>
      <div class="mt-4 grid grid-cols-2 gap-5 max-sm:grid-cols-1">
        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-bold uppercase text-muted-foreground">
            {t(() => m.ws_handoff_questions())}
          </h3>
          <For each={props.handoff.open_questions}>
            {(q) => (
              <span class="flex items-start gap-2 text-sm">
                <CircleHelp class="mt-0.5 shrink-0 text-muted-foreground" size={14} /> {q}
              </span>
            )}
          </For>
        </div>
        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-bold uppercase text-muted-foreground">{t(() => m.ws_handoff_next())}</h3>
          <For each={props.handoff.next_steps}>
            {(s) => (
              <span class="flex items-start gap-2 text-sm">
                <Check class="mt-0.5 shrink-0 text-primary" size={14} /> {s}
              </span>
            )}
          </For>
        </div>
      </div>
      <p class="mt-4 text-xs text-muted-foreground">{t(() => m.ws_handoff_note())}</p>
    </section>
  );
}

export function HealthCard(props: { health: MemoryHealth; onOpenDoc: (project: string, path: string) => void }) {
  return (
    <div class="rounded-lg border bg-card p-4" data-testid="health-card">
      <div class="mb-3.5 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck class="text-muted-foreground" size={15} />
        {t(() => m.ws_health_title())}
      </div>
      <div class="flex flex-col gap-2 text-sm">
        <HealthRow
          label={t(() => m.health_stale())}
          onOpenDoc={props.onOpenDoc}
          pages={props.health.stale_pages}
          value={props.health.stale}
        />
        <HealthRow
          label={t(() => m.health_duplicates())}
          onOpenDoc={props.onOpenDoc}
          pages={props.health.duplicate_pages}
          value={props.health.duplicates}
        />
        <HealthRow label={t(() => m.health_contradictions())} value={props.health.contradictions} />
        <HealthRow
          label={t(() => m.health_orphans())}
          onOpenDoc={props.onOpenDoc}
          pages={props.health.orphan_pages}
          value={props.health.orphans}
        />
      </div>
      <p class="mt-3 font-mono text-xs text-muted-foreground">
        {">_ "}
        {t(() => m.health_audit())}
      </p>
    </div>
  );
}

export function WorkspaceOverviewBody(props: {
  overview: WorkspaceOverview | null;
  onOpenDoc: (project: string, path: string) => void;
  onOpenProject: (key: ProjectKey) => void;
  projects: ProjectSummary[];
  workspacePages: ProjectPages[];
}) {
  const pagesOf = (project: string) =>
    props.workspacePages.find((entry) => entry.project === project)?.pages ?? [];
  const recent = createMemo(() => workspaceRecentDocs(props.workspacePages));
  return (
    <div class="flex flex-col gap-6">
      <Show when={props.overview?.handoff}>{(h) => <HandoffCard handoff={h()} />}</Show>

      <div class="grid grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] gap-5 max-lg:grid-cols-1">
        <div class="flex min-w-0 flex-col gap-6">
          <section class="rounded-lg border bg-card p-1.5" data-testid="ws-projects">
            <div class="mb-3.5 flex items-center gap-2 px-2 pt-2.5 text-sm font-semibold">
              <Box class="text-muted-foreground" size={15} />
              {t(() => m.home_projects())}
            </div>
            <div class="flex flex-col">
              <For each={props.projects}>
                {(project) => {
                  const meta = () => {
                    const counts = kindCounts(pagesOf(project.project_name))
                      .map((kc) => `${kc.count} ${kc.kind}`)
                      .join(" · ");
                    const pages = t(() => m.count_pages({ count: project.page_count }));
                    return counts ? `${pages} · ${counts}` : pages;
                  };
                  return (
                    <button
                      class="flex items-center gap-3 rounded-md p-2 text-left outline-none transition hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                      onClick={() => props.onOpenProject(keyOf(project))}
                    >
                      <Box class="shrink-0 text-muted-foreground" size={16} />
                      <span class="flex min-w-0 flex-1 flex-col">
                        <strong class="truncate text-sm font-medium leading-tight">{project.project_name}</strong>
                        <small class="truncate text-xs text-muted-foreground">{meta()}</small>
                      </span>
                      <small class="shrink-0 text-xs text-muted-foreground">{formatRelative(project.last_updated)}</small>
                      <ChevronRight class="shrink-0 text-muted-foreground" size={15} />
                    </button>
                  );
                }}
              </For>
            </div>
          </section>

          <Show when={recent().length > 0}>
            <section class="rounded-lg border bg-card p-1.5">
              <div class="mb-3.5 flex items-center gap-2 px-2 pt-2.5 text-sm font-semibold">
                <FileText class="text-muted-foreground" size={15} />
                {t(() => m.ws_recent_docs())}
              </div>
              <div class="flex flex-col">
                <For each={recent()}>
                  {(item) => (
                    <button
                      class="flex items-center gap-2 rounded-md p-2 text-left outline-none transition hover:bg-hover"
                      type="button"
                      onClick={() => props.onOpenDoc(item.project, item.path)}
                    >
                      <FileText class="shrink-0 text-muted-foreground" size={15} />
                      <span class="flex min-w-0 flex-1 flex-col">
                        <strong class="truncate text-sm font-medium leading-tight">{item.title}</strong>
                        <small class="truncate text-xs text-muted-foreground">{item.project}</small>
                      </span>
                      <Show when={item.kind && item.kind.toLowerCase() !== "note"}>
                        <KindBadge kind={item.kind} />
                      </Show>
                      <small class="shrink-0 text-xs text-muted-foreground">{formatRelative(item.updated_at)}</small>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>
        </div>

        <aside class="flex min-w-0 flex-col gap-4">
          <Show when={props.overview?.briefing}>
            {(b) => (
              <div class="rounded-lg border bg-card p-4">
                <div class="mb-3.5 flex items-center gap-2 text-sm font-semibold">
                  <Activity class="text-muted-foreground" size={15} />
                  {t(() => m.inspector_briefing())}
                </div>
                <BriefingView briefing={b()} hidePendingHandoff />
              </div>
            )}
          </Show>
          <Show when={props.overview?.health}>
            {(health) => <HealthCard health={health()} onOpenDoc={props.onOpenDoc} />}
          </Show>
        </aside>
      </div>
    </div>
  );
}

export function BriefingView(props: { briefing: BriefingSnapshot; hidePendingHandoff?: boolean }) {
  return (
    <div class="flex flex-col gap-4" data-testid="briefing">
      <div class="grid grid-cols-3 gap-3">
        <Metric label={t(() => m.briefing_latest())} value={props.briefing.counts.pages_latest} />
        <Metric label={t(() => m.briefing_versions())} value={props.briefing.counts.pages_all} />
        <Metric label={t(() => m.briefing_sessions())} value={props.briefing.counts.sessions} />
        <Metric label={t(() => m.briefing_observations())} value={props.briefing.counts.observations} />
        <Metric label={t(() => m.briefing_pages_7d())} value={props.briefing.activity_7d.pages_updated} />
        <Metric label={t(() => m.briefing_pages_30d())} value={props.briefing.activity_30d.pages_updated} />
      </div>
      <Show when={!props.hidePendingHandoff && props.briefing.pending_handoff_count > 0}>
        <div class="flex items-center gap-2 rounded-lg border border-warning bg-warning/15 p-2.5 text-xs text-warning-foreground">
          <Clock3 size={14} />
          <span>
            {props.briefing.pending_handoff_count === 1
              ? t(() => m.briefing_pending_handoff({ count: props.briefing.pending_handoff_count }))
              : t(() => m.briefing_pending_handoffs({ count: props.briefing.pending_handoff_count }))}
          </span>
        </div>
      </Show>
      <Show when={props.briefing.last_observation_at}>
        {(at) => (
          <small class="text-xs text-muted-foreground">
            {t(() => m.briefing_last_observation({ date: formatDateShort(at()) }))}
          </small>
        )}
      </Show>
      <div class="flex flex-col gap-2">
        <Show
          fallback={<small class="text-muted-foreground">{t(() => m.briefing_no_rules())}</small>}
          when={props.briefing.rules.length > 0}
        >
          <div class="text-xs font-bold uppercase text-muted-foreground">{t(() => m.briefing_rules())}</div>
          <For each={props.briefing.rules}>
            {(rule) => (
              <div class="rounded-lg border bg-muted/40 p-3">
                <strong class="block truncate text-sm">{rule.title}</strong>
                <small class="block truncate text-xs text-muted-foreground">{rule.path}</small>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

export function keyOf(project: ProjectSummary): ProjectKey {
  return {
    project: project.project_name,
    workspace: project.workspace_name,
  };
}
