import { createFileRoute } from "@tanstack/solid-router";

import { ScopeMessagesScreen } from "~/screens/scope-messages";

function Screen() {
  const params = Route.useParams();
  return <ScopeMessagesScreen project={params().project} workspace={params().workspace} />;
}

export const Route = createFileRoute("/s/$workspace/$project/messages")({
  component: Screen,
});
