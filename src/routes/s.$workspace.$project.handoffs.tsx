import { createFileRoute } from "@tanstack/solid-router";

import { ScopeHandoffsScreen } from "~/screens/scope-handoffs";

function Screen() {
  const params = Route.useParams();
  return <ScopeHandoffsScreen project={params().project} workspace={params().workspace} />;
}

export const Route = createFileRoute("/s/$workspace/$project/handoffs")({
  component: Screen,
});
