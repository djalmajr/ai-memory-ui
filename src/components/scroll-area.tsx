import type { JSX } from "@solidjs/web";
import { onSettled } from "solid-js";

import { cn } from "~/lib/utils";

// shadcn `ScrollArea` (new-york, radix viewport + thumb) without Radix.
// Radix is React-only, and a native `overflow: auto` bar is the system
// scrollbar. The viewport still scrolls natively — wheel, touch, keyboard —
// but its bar is hidden; the thumb is the shadcn track (`w-2.5`, `bg-border`,
// rounded-full) and shows while the pointer is over the region or it is scrolling.

const MIN_THUMB = 24;

type Axis = "x" | "y";

function axisMetrics(client: number, scroll: number, offset: number) {
  if (client <= 0 || scroll <= client + 1) return null;
  const size = Math.min(client, Math.max(MIN_THUMB, (client / scroll) * client));
  const max = scroll - client;
  const travel = Math.max(0, client - size);
  const pos = max === 0 || travel === 0 ? 0 : (offset / max) * travel;
  return { pos, size };
}

function attachScrollbars(root: HTMLElement, viewport: HTMLElement): () => void {
  const bars: Record<Axis, { bar: HTMLDivElement; thumb: HTMLDivElement }> = {
    x: makeBar("x"),
    y: makeBar("y"),
  };
  const corner = document.createElement("div");
  corner.dataset.slot = "scroll-area-corner";
  corner.className = "absolute right-0 bottom-0 z-10 size-2.5";
  corner.hidden = true;
  root.append(bars.y.bar, bars.x.bar, corner);

  let hover = false;
  let scrolling = false;
  let dragging = false;
  let hideTimer = 0;
  let frame = 0;

  // The viewport node can be replaced after this binds (Solid re-renders the
  // child). Measure whatever is in the root now, not the element from setup.
  const currentViewport = () =>
    root.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]") ?? viewport;

  const paint = () => {
    const current = currentViewport();
    const y = axisMetrics(current.clientHeight, current.scrollHeight, current.scrollTop);
    const x = axisMetrics(current.clientWidth, current.scrollWidth, current.scrollLeft);
    const visible = hover || scrolling || dragging;
    place(bars.y, "y", y, visible, Boolean(x));
    place(bars.x, "x", x, visible, Boolean(y));
    corner.hidden = !(x && y);
  };

  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(paint);
  };

  const onScroll = () => {
    scrolling = true;
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      scrolling = false;
      schedule();
    }, 750);
    schedule();
  };

  const onEnter = () => {
    hover = true;
    schedule();
  };
  const onLeave = () => {
    hover = false;
    schedule();
  };

  const stopY = bindDrag(bars.y, "y", currentViewport, () => {
    dragging = true;
    schedule();
  }, () => {
    dragging = false;
    schedule();
  });
  const stopX = bindDrag(bars.x, "x", currentViewport, () => {
    dragging = true;
    schedule();
  }, () => {
    dragging = false;
    schedule();
  });

  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  root.addEventListener("pointerenter", onEnter);
  root.addEventListener("pointerleave", onLeave);
  const observer = new ResizeObserver(schedule);
  const observed = new Set<Element>();
  const watch = (el: Element | null | undefined) => {
    if (!el || observed.has(el)) return;
    observed.add(el);
    observer.observe(el);
  };
  const syncWatch = () => {
    const current = currentViewport();
    watch(current);
    watch(current.firstElementChild);
  };
  const mutations = new MutationObserver(() => {
    syncWatch();
    schedule();
  });
  mutations.observe(root, { childList: true, subtree: true });
  watch(root);
  syncWatch();
  schedule();

  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(hideTimer);
    root.removeEventListener("scroll", onScroll, true);
    root.removeEventListener("pointerenter", onEnter);
    root.removeEventListener("pointerleave", onLeave);
    observer.disconnect();
    mutations.disconnect();
    stopY();
    stopX();
    bars.y.bar.remove();
    bars.x.bar.remove();
    corner.remove();
  };
}

function makeBar(axis: Axis): { bar: HTMLDivElement; thumb: HTMLDivElement } {
  const bar = document.createElement("div");
  bar.dataset.slot = "scroll-area-scrollbar";
  bar.dataset.orientation = axis === "y" ? "vertical" : "horizontal";
  bar.dataset.state = "hidden";
  bar.setAttribute("aria-hidden", "true");
  bar.className =
    axis === "y"
      ? "absolute top-0 right-0 z-10 w-2.5 touch-none select-none"
      : "absolute bottom-0 left-0 z-10 h-2.5 touch-none select-none";
  const thumb = document.createElement("div");
  thumb.dataset.slot = "scroll-area-thumb";
  thumb.className = "absolute rounded-full bg-border";
  bar.append(thumb);
  return { bar, thumb };
}

function place(
  parts: { bar: HTMLDivElement; thumb: HTMLDivElement },
  axis: Axis,
  metrics: { pos: number; size: number } | null,
  visible: boolean,
  other: boolean,
) {
  parts.bar.hidden = !metrics;
  parts.bar.dataset.state = visible && metrics ? "visible" : "hidden";
  if (!metrics) return;
  if (axis === "y") {
    parts.bar.style.bottom = other ? "10px" : "0";
    parts.thumb.style.left = "2px";
    parts.thumb.style.width = "calc(100% - 4px)";
    parts.thumb.style.height = `${metrics.size}px`;
    parts.thumb.style.transform = `translateY(${metrics.pos}px)`;
    return;
  }
  parts.bar.style.right = other ? "10px" : "0";
  parts.thumb.style.top = "2px";
  parts.thumb.style.height = "calc(100% - 4px)";
  parts.thumb.style.width = `${metrics.size}px`;
  parts.thumb.style.transform = `translateX(${metrics.pos}px)`;
}

function bindDrag(
  parts: { bar: HTMLDivElement; thumb: HTMLDivElement },
  axis: Axis,
  viewportOf: () => HTMLElement,
  onStart: () => void,
  onEnd: () => void,
): () => void {
  const onThumbDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportOf();
    onStart();
    const start = axis === "y" ? event.clientY : event.clientX;
    const startScroll = axis === "y" ? viewport.scrollTop : viewport.scrollLeft;
    const client = axis === "y" ? viewport.clientHeight : viewport.clientWidth;
    const scroll = axis === "y" ? viewport.scrollHeight : viewport.scrollWidth;
    const thumb = axisMetrics(client, scroll, startScroll);
    const travel = thumb ? Math.max(1, client - thumb.size) : 1;
    const max = Math.max(0, scroll - client);
    parts.thumb.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const delta = (axis === "y" ? ev.clientY : ev.clientX) - start;
      const next = startScroll + (delta / travel) * max;
      if (axis === "y") viewport.scrollTop = next;
      else viewport.scrollLeft = next;
    };
    const up = () => {
      parts.thumb.removeEventListener("pointermove", move);
      parts.thumb.removeEventListener("pointerup", up);
      onEnd();
    };
    parts.thumb.addEventListener("pointermove", move);
    parts.thumb.addEventListener("pointerup", up);
  };

  const onTrackDown = (event: PointerEvent) => {
    if (event.target !== parts.bar || event.button !== 0) return;
    const viewport = viewportOf();
    const rect = parts.bar.getBoundingClientRect();
    const client = axis === "y" ? viewport.clientHeight : viewport.clientWidth;
    const scroll = axis === "y" ? viewport.scrollHeight : viewport.scrollWidth;
    const thumb = axisMetrics(client, scroll, axis === "y" ? viewport.scrollTop : viewport.scrollLeft);
    if (!thumb) return;
    const click = (axis === "y" ? event.clientY - rect.top : event.clientX - rect.left) - thumb.size / 2;
    const travel = Math.max(1, client - thumb.size);
    const max = Math.max(0, scroll - client);
    const next = (click / travel) * max;
    if (axis === "y") viewport.scrollTop = next;
    else viewport.scrollLeft = next;
  };

  parts.thumb.addEventListener("pointerdown", onThumbDown);
  parts.bar.addEventListener("pointerdown", onTrackDown);
  return () => {
    parts.thumb.removeEventListener("pointerdown", onThumbDown);
    parts.bar.removeEventListener("pointerdown", onTrackDown);
  };
}

const viewportClass =
  "w-full overflow-auto overscroll-contain rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ScrollArea(props: {
  children?: JSX.Element;
  class?: string;
  /** Fill a definite-height parent (`flex-1 min-h-0`, `h-dvh`) and scroll inside it. */
  fill?: boolean;
  viewportRef?: (el: HTMLDivElement | null) => void;
}) {
  let root: HTMLDivElement | undefined;
  let viewport: HTMLDivElement | undefined;

  onSettled(() => {
    if (!root || !viewport) return;
    const stop = attachScrollbars(root, viewport);
    return () => {
      stop();
      props.viewportRef?.(null);
    };
  });

  return (
    <div
      ref={(el) => {
        root = el;
      }}
      class={cn("relative", props.fill && "min-h-0", props.fill && props.class)}
      data-slot="scroll-area"
    >
      <div
        ref={(el) => {
          viewport = el;
          props.viewportRef?.(el);
        }}
        class={cn(viewportClass, props.fill ? "absolute inset-0" : props.class)}
        data-slot="scroll-area-viewport"
        tabindex={0}
      >
        {props.children}
      </div>
    </div>
  );
}

/** Wrap markdown `pre` / `table` nodes so generated HTML uses the same thumb. */
export function bindProseScrollAreas(root: HTMLElement): () => void {
  const stops: Array<() => void> = [];
  for (const node of root.querySelectorAll("pre, table")) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest("[data-slot='scroll-area']")) continue;
    const frame = document.createElement("div");
    frame.dataset.slot = "scroll-area";
    frame.className = "relative max-w-full";
    const viewport = document.createElement("div");
    viewport.dataset.slot = "scroll-area-viewport";
    viewport.className = viewportClass;
    viewport.tabIndex = 0;
    node.replaceWith(frame);
    frame.append(viewport);
    viewport.append(node);
    stops.push(attachScrollbars(frame, viewport));
  }
  return () => {
    for (const stop of stops) stop();
  };
}
