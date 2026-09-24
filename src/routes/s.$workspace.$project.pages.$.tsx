import { createFileRoute } from "@tanstack/solid-router";

import { ScopePageScreen } from "~/screens/scope-page";

function Screen() {
  const params = Route.useParams();
  const search = Route.useSearch();
  return (
    <ScopePageScreen
      editing={search().mode === "edit"}
      path={params()._splat ?? ""}
      project={params().project}
      workspace={params().workspace}
    />
  );
}

export const Route = createFileRoute("/s/$workspace/$project/pages/$")({
  component: Screen,
  validateSearch: (search: Record<string, unknown>): { mode?: "edit" } => ({
    mode: search.mode === "edit" ? "edit" : undefined,
  }),
});
