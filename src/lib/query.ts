import { useQuery as useSolidQuery } from "@tanstack/solid-query";
import { untrack } from "solid-js";

// `@tanstack/solid-query@6` (Solid 2) projects `result.data` through an async
// node: reading it before the first result SUSPENDS to the nearest `<Loading>`
// boundary, and reading it in an error state with no data THROWS. The screens
// here were written against the v5 contract (`data` is simply `undefined`
// while pending or errored, and `isPending`/`isError` drive the fallbacks),
// and every one of them reads `data` outside a boundary — headers, badges,
// counts. Rather than audit 90 call sites and sprinkle boundaries, this wrapper
// restores the v5 contract in one place: `data` is only read from the
// underlying result once the query settled successfully. Refetches keep the
// held value (status stays "success"), so `isFetching` still shows activity.
//
// `queryFn` runs from query-core's fetch, outside any tracking scope; every
// screen reads props/signals inside it (`queryFn: () => list(props.workspace)`).
// Solid 2 dev flags each such read as STRICT_READ_UNTRACKED. The reads are a
// deliberate snapshot — `queryKey` is what tracks and triggers refetches — so
// the wrapper says so once with `untrack`.
//
// Adopt `<Loading>`/`<Errored>` per screen by importing `useQuery` straight
// from `@tanstack/solid-query` there.
export const useQuery: typeof useSolidQuery = ((
  options: Parameters<typeof useSolidQuery>[0],
  queryClient?: Parameters<typeof useSolidQuery>[1],
) => {
  const query = useSolidQuery(() => {
    const resolved = options();
    const { queryFn } = resolved;
    if (typeof queryFn !== "function") return resolved;
    return { ...resolved, queryFn: (context) => untrack(() => queryFn(context)) };
  }, queryClient);
  return new Proxy(query, {
    get(target, key, receiver) {
      if (key === "data") return target.status === "success" ? target.data : undefined;
      return Reflect.get(target, key, receiver);
    },
  });
}) as typeof useSolidQuery;
