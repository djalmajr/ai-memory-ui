import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from "@tanstack/virtual-core";
import type { PartialKeys, VirtualItem, VirtualizerOptions } from "@tanstack/virtual-core";
import { createEffect, createSignal, createStore, merge, onSettled, reconcile } from "solid-js";

export type { VirtualItem } from "@tanstack/virtual-core";

type Options<TScrollElement extends Element, TItemElement extends Element> = PartialKeys<
  VirtualizerOptions<TScrollElement, TItemElement>,
  "observeElementRect" | "observeElementOffset" | "scrollToFn"
>;

// Port of `@tanstack/solid-virtual` (3.13) to Solid 2. The upstream adapter
// still declares a `solid-js@^1` peer and leans on `createComputed`,
// `mergeProps` and `solid-js/store`, none of which survive in Solid 2.
//
// Reactivity contract (same as upstream, see the gotcha page
// `tanstack-solid-virtual-reactivity`): pass `count` as a getter and
// `getScrollElement` reading a signal. The compute phase below snapshots the
// options (evaluating every getter) and probes the scroll element, so both
// re-run the apply phase; upstream got that tracking for free from
// `createComputed`, which Solid 2 splits into compute + untracked apply.
export function createVirtualizer<TScrollElement extends Element, TItemElement extends Element>(
  options: Options<TScrollElement, TItemElement>,
): Virtualizer<TScrollElement, TItemElement> {
  const resolved = merge(
    { observeElementRect, observeElementOffset, scrollToFn: elementScroll },
    options,
  ) as VirtualizerOptions<TScrollElement, TItemElement>;

  const instance = new Virtualizer<TScrollElement, TItemElement>(resolved);
  const [items, setItems] = createStore<VirtualItem[]>(instance.getVirtualItems());
  const [totalSize, setTotalSize] = createSignal(instance.getTotalSize());

  const virtualizer = new Proxy(instance, {
    get(target, prop: keyof Virtualizer<TScrollElement, TItemElement>) {
      switch (prop) {
        case "getVirtualItems":
          return () => items;
        case "getTotalSize":
          return () => totalSize();
        default:
          return Reflect.get(target, prop);
      }
    },
  });
  virtualizer.setOptions(resolved);

  onSettled(() => {
    const cleanup = virtualizer._didMount();
    virtualizer._willUpdate();
    return cleanup;
  });

  createEffect(
    () => {
      const snapshot = { ...resolved };
      snapshot.getScrollElement();
      return snapshot;
    },
    (snapshot) => {
      virtualizer.setOptions({
        ...snapshot,
        onChange: (inst, sync) => {
          inst._willUpdate();
          setItems(reconcile(inst.getVirtualItems(), "index"));
          setTotalSize(inst.getTotalSize());
          options.onChange?.(inst, sync);
        },
      });
      virtualizer.measure();
    },
  );

  return virtualizer;
}
