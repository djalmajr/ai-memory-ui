/** Same contract as the appliance data table (`DEFAULT_PAGE_SIZE` / `PAGE_SIZE_OPTIONS`). */
export const DEFAULT_PAGE_SIZE = 15;
export const PAGE_SIZE_OPTIONS = [15, 30, 60, 100] as const;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function normalizePageSize(value: number): PageSize {
  return PAGE_SIZE_OPTIONS.includes(value as PageSize) ? (value as PageSize) : DEFAULT_PAGE_SIZE;
}

export function pageCount(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** 1-based page, clamped after the list or the page size shrinks. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const count = pageCount(total, pageSize);
  const safe = Math.max(1, Math.trunc(page) || 1);
  return Math.min(safe, count);
}

export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const current = clampPage(page, items.length, pageSize);
  const start = (current - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
