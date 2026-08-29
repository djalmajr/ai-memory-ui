import {
  Activity,
  Calendar,
  ChevronRight,
  Hash,
  Layers,
  Link2,
  List,
  Tag,
  Type,
  Users,
} from "lucide-solid";
import { For, Show, createMemo, createSignal } from "solid-js";

import { Markdown, stripFrontmatter } from "~/components/markdown";
import { Chip, KindBadge } from "~/components/ui-bits";
import { formatDateShort } from "~/lib/datetime";
import { t } from "~/lib/i18n";
import type { ApiPage, RelatedPage } from "~/lib/types";
import * as m from "~/paraglide/messages";

export function PageReader(props: { page: ApiPage; onNavigate: (path: string) => void }) {
  // Soft-nav for same-project wikilinks; cross-project links fall through to
  // their href (full navigation), which already carries the correct basepath.
  const handleWikilinkClick = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a.wikilink") as
      | HTMLAnchorElement
      | null;
    if (!anchor) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return; // allow open-in-new-tab / new-window
    }
    const ws = anchor.dataset.ws;
    const proj = anchor.dataset.proj;
    const path = anchor.dataset.path;
    if (!ws || !proj || path == null) return;
    if (ws === props.page.workspace && proj === props.page.project) {
      event.preventDefault();
      props.onNavigate(path);
    }
  };
  return (
    <article class="min-w-0" data-testid="page-reader">
      <header class="border-b p-6">
        <nav aria-label="breadcrumb" class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span class="truncate">{props.page.workspace}</span>
          <span class="opacity-40">/</span>
          <span class="truncate">{props.page.project}</span>
          <For each={props.page.path.split("/")}>
            {(segment, index) => (
              <>
                <span class="opacity-40">/</span>
                <span
                  class="truncate"
                  classList={{
                    "font-medium text-foreground": index() === props.page.path.split("/").length - 1,
                  }}
                >
                  {segment}
                </span>
              </>
            )}
          </For>
        </nav>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <h3 class="text-2xl font-semibold tracking-normal">{props.page.title}</h3>
          <KindBadge kind={props.page.kind} />
          <Chip class="bg-muted text-muted-foreground">{props.page.tier}</Chip>
          <Show when={props.page.pinned}>
            <Chip class="bg-primary/15 text-primary">{t(() => m.reader_pinned())}</Chip>
          </Show>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          {t(() => m.reader_updated())} {formatDateShort(props.page.updated_at)}
          <Show when={props.page.supersedes}>
            {(supersedes) => (
              <>
                {" · "}
                {t(() => m.reader_supersedes())} {supersedes()}
              </>
            )}
          </Show>
        </p>
      </header>
      <Show when={Object.keys(props.page.frontmatter ?? {}).length > 0}>
        <Frontmatter frontmatter={props.page.frontmatter} />
      </Show>
      <div class="min-w-0 p-6">
        <Markdown
          onClick={handleWikilinkClick}
          pagePath={props.page.path}
          project={props.page.project}
          source={stripFrontmatter(props.page.body_markdown)}
          workspace={props.page.workspace}
        />
      </div>
      <Show when={props.page.links.length > 0 || props.page.backlinks.length > 0}>
        <footer class="grid gap-6 border-t p-6 sm:grid-cols-2" data-testid="page-relations">
          <RelatedList items={props.page.links} onNavigate={props.onNavigate} title={t(() => m.reader_links())} />
          <RelatedList items={props.page.backlinks} onNavigate={props.onNavigate} title={t(() => m.reader_backlinks())} />
        </footer>
      </Show>
    </article>
  );
}

export function RelatedList(props: { title: string; items: RelatedPage[]; onNavigate: (path: string) => void }) {
  return (
    <Show when={props.items.length > 0}>
      <section>
        <h3 class="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
          {props.title}
          <span class="font-normal lowercase">({props.items.length})</span>
        </h3>
        <ul class="flex flex-col gap-1">
          <For each={props.items}>
            {(item) => (
              <li>
                <button
                  class="flex w-full items-center gap-2 rounded-md p-1.5 text-left outline-none transition hover:bg-hover"
                  onClick={() => props.onNavigate(item.path)}
                  type="button"
                >
                  <KindBadge kind={item.kind} />
                  <span class="min-w-0 truncate text-sm">{item.title}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}

// Chaves cujo valor é renderizado como chip (mesmo visual de "tags").
const FM_CHIP_KEYS = new Set(["kind", "tier", "type", "status", "audience", "category", "labels", "tags"]);

// Ícone por chave conhecida; demais caem no genérico (List).
function frontmatterIcon(key: string) {
  switch (key.toLowerCase()) {
    case "title":
      return Type;
    case "kind":
    case "type":
      return Tag;
    case "tier":
      return Layers;
    case "tags":
    case "category":
    case "labels":
      return Hash;
    case "created":
    case "updated":
    case "date":
      return Calendar;
    case "status":
      return Activity;
    case "audience":
    case "owner":
      return Users;
    case "sources":
    case "related":
    case "links":
      return Link2;
    default:
      return List;
  }
}

// Returns the primitive items as strings IF every entry is primitive.
// Returns null for non-arrays AND for arrays whose entries are objects —
// those fall through to a richer renderer instead of stringifying to
// "[object Object]".
function frontmatterArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((item) => item !== null && typeof item === "object")) return null;
  return value.map((item) => (item == null ? "" : String(item))).filter((s) => s.length > 0);
}

// Heurística: tokens curtos sem espaço parecem tag → viram chip.
function looksLikeTag(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 32 && !/\s/.test(trimmed);
}

export function FrontmatterValue(props: { name: string; value: unknown }) {
  const chips = (items: string[]) => (
    <div class="flex flex-wrap gap-1.5">
      <For each={items}>{(item) => <Chip class="bg-muted text-muted-foreground">{item}</Chip>}</For>
    </div>
  );
  return (
    <Show fallback={<span class="text-sm text-muted-foreground">—</span>} when={props.value != null && props.value !== ""}>
      {(() => {
        const value = props.value;
        const arr = frontmatterArray(value);
        if (arr) {
          return arr.length > 0 ? chips(arr) : <span class="text-sm text-muted-foreground">—</span>;
        }
        if (Array.isArray(value)) {
          // Array of objects (e.g. `contributors`). Render each entry as a
          // mini key:value table so the user can actually read the data.
          return (
            <ul class="flex flex-col gap-2">
              <For each={value as Record<string, unknown>[]}>
                {(entry) => (
                  <li class="rounded-md border bg-muted/30 px-3 py-2">
                    <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                      <For each={Object.entries(entry ?? {})}>
                        {([k, v]) => (
                          <>
                            <dt class="font-medium text-muted-foreground">{k}</dt>
                            <dd class="min-w-0 break-words font-mono text-foreground/90">
                              {v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </dd>
                          </>
                        )}
                      </For>
                    </dl>
                  </li>
                )}
              </For>
            </ul>
          );
        }
        if (typeof value === "object") {
          return <span class="break-words font-mono text-xs text-foreground/80">{JSON.stringify(value)}</span>;
        }
        const str = String(value);
        if (/^https?:\/\//i.test(str.trim())) {
          return (
            <a class="break-all text-sm text-primary underline-offset-2 hover:underline" href={str.trim()} rel="noreferrer" target="_blank">
              {str}
            </a>
          );
        }
        if (FM_CHIP_KEYS.has(props.name.toLowerCase()) || looksLikeTag(str)) {
          return chips([str.trim()]);
        }
        return <span class="break-words text-sm text-foreground/90">{str}</span>;
      })()}
    </Show>
  );
}

export function Frontmatter(props: { frontmatter: Record<string, unknown> }) {
  const [open, setOpen] = createSignal(false);
  const entries = createMemo(() =>
    Object.entries(props.frontmatter ?? {}).filter(([, value]) => value != null && value !== ""),
  );
  return (
    <div class="px-6 pt-4">
      <details
        class="group/fm overflow-hidden rounded-lg border bg-card"
        data-testid="frontmatter"
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary class="flex cursor-pointer list-none items-center gap-2 border-b border-transparent bg-muted/40 px-4 py-2.5 text-xs font-semibold text-foreground outline-none transition hover:bg-muted/60 group-open/fm:border-border">
          <ChevronRight class="text-muted-foreground transition group-open/fm:rotate-90" size={14} />
          <span>{t(() => m.reader_frontmatter())}</span>
          <span class="font-normal text-muted-foreground">({entries().length})</span>
        </summary>
        <Show when={open()}>
          <dl class="flex flex-col py-2">
            <For each={entries()}>
              {([key, value]) => {
                const Icon = frontmatterIcon(key);
                return (
                  <div class="flex items-start gap-4 px-4 py-1.5 transition hover:bg-muted/30">
                    <dt class="flex w-32 shrink-0 items-center gap-2 pt-0.5 text-xs text-muted-foreground">
                      <Icon class="shrink-0" size={14} />
                      <span class="truncate">{key}</span>
                    </dt>
                    <dd class="min-w-0 flex-1">
                      <FrontmatterValue name={key} value={value} />
                    </dd>
                  </div>
                );
              }}
            </For>
          </dl>
        </Show>
      </details>
    </div>
  );
}
