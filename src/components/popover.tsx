import { autoUpdate, computePosition, flip, offset, shift, type Placement } from "@floating-ui/dom";
import type { JSX } from "@solidjs/web";
import { Portal as SolidPortal } from "@solidjs/web";
import { Show, createContext, createEffect, createSignal, createUniqueId, omit, useContext } from "solid-js";

import { cn } from "~/lib/utils";

// Hand-rolled popover (anchored floating panel) on `@floating-ui/dom`.
// `@kobalte/core@2.0.0-alpha.1` was tried first: under Solid 2 its Popover
// never opened from a plain Trigger and, when it did open, rendered at (0,0)
// because its popper positioner ref is written without `ownedWrite`. The
// surface below is the subset the app used from Kobalte: controlled `open`,
// `placement`, `gutter`, a Trigger button, a body Portal and a Content panel
// that closes on outside pointer-down and Escape and hands focus back to the
// trigger. Content unmounts on close. Enter animations stay off: `animate-in`
// writes `transform`, which is also how the panel is positioned, so the open
// motion slides the menu in from the origin.

interface PopoverContextValue {
  contentId: string;
  gutter: () => number;
  open: () => boolean;
  placement: () => Placement;
  setContent: (el: HTMLDivElement | undefined) => void;
  setOpen: (open: boolean) => void;
  setTrigger: (el: HTMLButtonElement | undefined) => void;
}

const PopoverContext = createContext<PopoverContextValue>();

function usePopover(): PopoverContextValue {
  const context = useContext(PopoverContext);
  if (!context) throw new Error("Popover parts must be rendered inside <Popover.Root>");
  return context;
}

function Root(props: {
  children?: JSX.Element;
  gutter?: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  placement?: Placement;
}) {
  // Element signals are written from `ref` callbacks during render.
  const [trigger, setTrigger] = createSignal<HTMLButtonElement | undefined>(undefined, { ownedWrite: true });
  const [content, setContent] = createSignal<HTMLDivElement | undefined>(undefined, { ownedWrite: true });
  const contentId = createUniqueId();
  const open = () => props.open;

  createEffect(
    () => ({
      content: content(),
      gutter: props.gutter ?? 0,
      open: props.open,
      placement: props.placement ?? "bottom-start",
      trigger: trigger(),
    }),
    (next) => {
      const { content: panel, trigger: anchor } = next;
      if (!next.open || !panel || !anchor) return;

      const stopAutoUpdate = autoUpdate(anchor, panel, () => {
        void computePosition(anchor, panel, {
          middleware: [offset(next.gutter), flip({ padding: 8 }), shift({ padding: 8 })],
          placement: next.placement,
          strategy: "absolute",
        }).then(({ x, y }) => {
          Object.assign(panel.style, {
            left: "0",
            position: "absolute",
            top: "0",
            transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`,
          });
        });
      });

      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node;
        if (panel.contains(target) || anchor.contains(target)) return;
        props.onOpenChange(false);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        props.onOpenChange(false);
        anchor.focus();
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      panel.addEventListener("keydown", onKeyDown);

      (panel.querySelector<HTMLElement>("[autofocus]") ?? panel).focus({ preventScroll: true });

      return () => {
        stopAutoUpdate();
        document.removeEventListener("pointerdown", onPointerDown, true);
        panel.removeEventListener("keydown", onKeyDown);
        if (panel.contains(document.activeElement)) anchor.focus({ preventScroll: true });
      };
    },
  );

  const value: PopoverContextValue = {
    contentId,
    gutter: () => props.gutter ?? 0,
    open,
    placement: () => props.placement ?? "bottom-start",
    setContent,
    setOpen: (next) => props.onOpenChange(next),
    setTrigger,
  };
  return <PopoverContext value={value}>{props.children}</PopoverContext>;
}

function Trigger(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = usePopover();
  const others = omit(props, "onClick", "type");
  return (
    <button
      ref={context.setTrigger}
      aria-controls={context.open() ? context.contentId : undefined}
      aria-expanded={context.open() ? "true" : "false"}
      aria-haspopup="dialog"
      data-expanded={context.open() ? "" : undefined}
      type="button"
      onClick={(event) => {
        if (typeof props.onClick === "function") props.onClick(event);
        context.setOpen(!context.open());
      }}
      {...others}
    />
  );
}

function Portal(props: { children?: JSX.Element }) {
  const context = usePopover();
  return (
    <Show when={context.open()}>
      <SolidPortal>{props.children}</SolidPortal>
    </Show>
  );
}

// shadcn base-nova `popover-content` classes (appliance); call sites override
// width/padding through `cn` (tailwind-merge).
function Content(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const context = usePopover();
  const others = omit(props, "class");
  return (
    <div
      ref={context.setContent}
      class={cn(
        "z-50 flex w-72 flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden",
        props.class,
      )}
      data-expanded=""
      id={context.contentId}
      role="dialog"
      tabindex={-1}
      {...others}
    />
  );
}

export { Content, Portal, Root, Trigger };
