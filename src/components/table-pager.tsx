import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "~/components/icons";
import { Button } from "~/components/button";
import { ScrollArea } from "~/components/scroll-area";
import { Select } from "~/components/select";
import { t } from "~/lib/i18n";
import { PAGE_SIZE_OPTIONS, clampPage, pageCount, type PageSize } from "~/lib/pagination";
import * as m from "~/paraglide/messages";

/** Footer from the appliance data table: page status, first/prev/next/last, rows per page. */
export function TablePager(props: {
  leading?: JSX.Element;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
  page: number;
  pageSize: number;
  total: number;
}) {
  const count = () => pageCount(props.total, props.pageSize);
  const current = () => clampPage(props.page, props.total, props.pageSize);
  const canPrev = () => current() > 1;
  const canNext = () => current() < count();

  return (
    <ScrollArea class="w-full">
    <div class="flex w-full flex-wrap items-center justify-end gap-3 p-1 sm:gap-4">
      <Show when={props.leading}>
        {(leading) => <div class="mr-auto self-start text-sm text-muted-foreground">{leading()}</div>}
      </Show>
      <div class="text-sm font-medium">
        {t(() => m.table_page_status({ page: current(), total: count() }))}
      </div>
      <div class="flex items-center gap-2">
        <Button
          aria-label={t(() => m.table_first_page())}
          class="hidden lg:inline-flex"
          disabled={!canPrev()}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => props.onPage(1)}
        >
          <ChevronsLeft />
        </Button>
        <Button
          aria-label={t(() => m.table_previous_page())}
          disabled={!canPrev()}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => props.onPage(current() - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          aria-label={t(() => m.table_next_page())}
          disabled={!canNext()}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => props.onPage(current() + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          aria-label={t(() => m.table_last_page())}
          class="hidden lg:inline-flex"
          disabled={!canNext()}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => props.onPage(count())}
        >
          <ChevronsRight />
        </Button>
      </div>
      <Select
        class="w-20"
        options={PAGE_SIZE_OPTIONS.map((size) => ({ label: String(size), value: String(size) }))}
        value={String(props.pageSize)}
        onChange={(value) => props.onPageSize(Number(value) as PageSize)}
      />
    </div>
    </ScrollArea>
  );
}
