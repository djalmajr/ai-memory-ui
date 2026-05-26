import { createSignal } from "solid-js";

// Histórico local de documentos abertos (para a seção "Recentes" da home).
// Client-side (localStorage) — não depende da API.
export interface VisitEntry {
  at: number;
  kind?: string;
  path: string;
  project: string;
  title: string;
  workspace: string;
}

const KEY = "ai-memory-ui-history";
const MAX = 8;

function load(): VisitEntry[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VisitEntry[]) : [];
  } catch {
    return [];
  }
}

const [history, setHistory] = createSignal<VisitEntry[]>(load());

export { history };

export function recordVisit(entry: Omit<VisitEntry, "at">): void {
  setHistory((prev) => {
    const deduped = prev.filter(
      (e) => !(e.workspace === entry.workspace && e.project === entry.project && e.path === entry.path),
    );
    const next = [{ ...entry, at: Date.now() }, ...deduped].slice(0, MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // armazenamento indisponível — mantém só em memória
    }
    return next;
  });
}
