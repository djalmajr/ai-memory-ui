import { createFileRoute } from "@tanstack/solid-router";

import { SessionsByAgentScreen } from "~/screens/sessions-by-agent";

export const Route = createFileRoute("/sessions")({
  component: SessionsByAgentScreen,
});
