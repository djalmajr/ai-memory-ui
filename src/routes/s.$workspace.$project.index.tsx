import { createFileRoute } from "@tanstack/solid-router";

import { ScopeWikiScreen } from "~/screens/scope-wiki";

function Screen() {
  const params = Route.useParams();
  return <ScopeWikiScreen project={params().project} workspace={params().workspace} />;
}

export const Route = createFileRoute("/s/$workspace/$project/")({
  component: Screen,
});
