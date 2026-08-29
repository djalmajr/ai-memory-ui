import { createFileRoute } from "@tanstack/solid-router";

import { ScopeOverviewScreen } from "~/screens/scope-overview";

function Screen() {
  const params = Route.useParams();
  return <ScopeOverviewScreen project={params().project} workspace={params().workspace} />;
}

export const Route = createFileRoute("/s/$workspace/$project/overview")({
  component: Screen,
});
