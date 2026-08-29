import { createFileRoute } from "@tanstack/solid-router";

import { ScopeSessionsScreen } from "~/screens/scope-sessions";

function Screen() {
  const params = Route.useParams();
  return <ScopeSessionsScreen project={params().project} workspace={params().workspace} />;
}

export const Route = createFileRoute("/s/$workspace/$project/sessions")({
  component: Screen,
});
