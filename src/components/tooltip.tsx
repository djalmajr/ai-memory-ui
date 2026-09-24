import { autoUpdate, computePosition, flip, offset, shift, type Placement } from "@floating-ui/dom";
import { Portal } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

// Substitui o `title` nativo. O painel vai num portal com posição fixa para
// não ser cortado por overflow da sidebar ou das tabelas.
export function Tooltip(props: {
  children: JSX.Element;
  class?: string;
  content?: string;
  side?: Placement;
}) {
  let anchor: HTMLSpanElement | undefined;
  const [open, setOpen] = createSignal(false);
  const [panel, setPanel] = createSignal<HTMLDivElement | undefined>(undefined, { ownedWrite: true });
  let timer: ReturnType<typeof setTimeout> | undefined;

  const show = () => {
    clearTimeout(timer);
    if (!props.content) return;
    timer = setTimeout(() => setOpen(true), 300);
  };
  const hide = () => {
    clearTimeout(timer);
    setOpen(false);
  };
  onCleanup(() => clearTimeout(timer));

  createEffect(
    () => ({ el: panel(), open: open(), side: props.side ?? "top" }),
    (next) => {
      const target = anchor;
      if (!next.open || !next.el || !target) return;
      return autoUpdate(target, next.el, () => {
        void computePosition(target, next.el!, {
          middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
          placement: next.side,
          strategy: "fixed",
        }).then(({ x, y }) => {
          Object.assign(next.el!.style, {
            left: "0",
            position: "fixed",
            top: "0",
            transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`,
          });
        });
      });
    },
  );

  return (
    <span
      ref={anchor}
      class={props.class ?? "inline-flex"}
      onFocusIn={show}
      onFocusOut={hide}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {props.children}
      <Show when={open() && props.content}>
        {(content) => (
          <Portal>
            <div
              ref={setPanel}
              class="pointer-events-none z-[80] w-max max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md"
              role="tooltip"
            >
              {content()}
            </div>
          </Portal>
        )}
      </Show>
    </span>
  );
}
