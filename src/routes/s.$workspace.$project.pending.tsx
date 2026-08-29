import { createFileRoute } from "@tanstack/solid-router";

import { ScopePendingScreen } from "~/screens/scope-pending";

function Screen() {
  const params = Route.useParams();
  return <ScopePendingScreen project={params().project} workspace={params().workspace} />;
}

export const Route = createFileRoute("/s/$workspace/$project/pending")({
  component: Screen,
});
