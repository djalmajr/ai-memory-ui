import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact byte count for status figures. `null` is an unreadable filesystem. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export type HighlightSegment = { match: boolean; text: string };

/**
 * Split `text` into highlighted / plain segments for a search `query`.
 *
 * Highlights each whitespace-separated query TERM independently (like the
 * server's FTS5 per-token `<mark>`), case-insensitively — NOT the whole query
 * as one contiguous substring. That is what lets a multi-word query such as
 * `mcp parity` highlight a path like `engine-cli-mcp-admin-parity.md`, where
 * both terms are present but never adjacent. Longest term first so overlapping
 * terms prefer the longer match.
 */
export function highlightSegments(query: string, text: string): HighlightSegment[] {
  const q = query.trim();
  if (!q) return [{ match: false, text }];
  const needles = [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (needles.length === 0) return [{ match: false, text }];
  const lower = text.toLowerCase();
  const out: HighlightSegment[] = [];
  let i = 0;
  let plain = "";
  while (i < text.length) {
    const hit = needles.find((n) => lower.startsWith(n, i));
    if (hit) {
      if (plain) {
        out.push({ match: false, text: plain });
        plain = "";
      }
      out.push({ match: true, text: text.slice(i, i + hit.length) });
      i += hit.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) out.push({ match: false, text: plain });
  return out;
}
