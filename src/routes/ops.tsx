import { createFileRoute } from "@tanstack/solid-router";

import { ServerOpsScreen } from "~/screens/server-ops";

export const Route = createFileRoute("/ops")({
  component: ServerOpsScreen,
});
