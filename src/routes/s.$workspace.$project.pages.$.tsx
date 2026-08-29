import { createFileRoute } from "@tanstack/solid-router";

import { ScopePageScreen } from "~/screens/scope-page";

function Screen() {
  const params = Route.useParams();
  return (
    <ScopePageScreen
      path={params()._splat ?? ""}
      project={params().project}
      workspace={params().workspace}
    />
  );
}

export const Route = createFileRoute("/s/$workspace/$project/pages/$")({
  component: Screen,
});
