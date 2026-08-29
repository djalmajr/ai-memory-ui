import { createFileRoute } from "@tanstack/solid-router";

import { ScopeOpsScreen } from "~/screens/scope-ops";

function Screen() {
  const params = Route.useParams();
  return <ScopeOpsScreen project={params().project} workspace={params().workspace} />;
}

export const Route = createFileRoute("/s/$workspace/$project/ops")({
  component: Screen,
});
