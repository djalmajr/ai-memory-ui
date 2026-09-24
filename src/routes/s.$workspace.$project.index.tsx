import { createFileRoute } from "@tanstack/solid-router";

import { ScopeWikiScreen } from "~/screens/scope-wiki";

function Screen() {
  const params = Route.useParams();
  const search = Route.useSearch();
  return (
    <ScopeWikiScreen project={params().project} query={search().q} workspace={params().workspace} />
  );
}

export const Route = createFileRoute("/s/$workspace/$project/")({
  component: Screen,
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = search.q;
    return typeof q === "string" && q.length > 0 ? { q } : {};
  },
});
